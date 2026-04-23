
from __future__ import annotations

import import_paths

import_paths.setup()

import logging
import os

import firebase_admin
from firebase_admin import auth, firestore, storage
from firebase_functions import https_fn, options
from flask import make_response, jsonify
from flask_cors import cross_origin

from apply_runner import run_apply_pipeline  # noqa: E402
from discovery import run_discovery_for_all_users  # noqa: E402
from apply_trace import apply_trace  # noqa: E402
from document_agents import run_generate_job_document_sync  # noqa: E402

_LOG_HTTP = logging.getLogger("vibjobber.apply.http")
_LOG_DOCS = logging.getLogger("vibjobber.documents.http")


def _ensure_app() -> None:
    if not firebase_admin._apps:
        firebase_admin.initialize_app()


def _require_internal_secret(request) -> tuple[bool, str]:
    expected = os.environ.get("INTERNAL_FUNCTION_SECRET")
    if not expected:
        return True, ""
    if request.headers.get("X-Internal-Secret", "") != expected:
        return False, "missing or invalid X-Internal-Secret"
    return True, ""


def _json(data: dict, status: int = 200):
    r = make_response(jsonify(data), status)
    # Do not set Access-Control-* here when the handler also uses @cross_origin — the browser
    # will see duplicate Allow-Origin values (e.g. "*, http://localhost:8080") and block the call.
    return r


@https_fn.on_request()
def sync_job_openings(request) -> object:
    """Aggregate user profiles → Serper (≤10 per query) → `jobs` collection (deduped by URL)."""
    ok, err = _require_internal_secret(request)
    if not ok:
        return _json({"error": err}, 403)
    if request.method == "OPTIONS":
        return make_response("", 204)

    _ensure_app()
    db = firestore.client()
    try:
        out = run_discovery_for_all_users(db)
        return _json({"ok": True, **out})
    except Exception as e:  # noqa: BLE001
        return _json({"ok": False, "error": str(e)}, 500)


@https_fn.on_request(
    # Gen2: browser preflight (OPTIONS) has no auth — must allow unauthenticated invoke.
    invoker="public",
    # Apply pipeline can run a long time; default 60s would cut off mid-step and return a
    # non-JSON / no-CORS error from the platform.
    timeout_sec=3600,
    # Default 256 MiB is too small for agents + PDF + dependencies (see Cloud Functions memory).
    memory=options.MemoryOption.MB_512,
)
@cross_origin(
    origins="*",
    methods=["GET", "POST", "HEAD", "OPTIONS"],
    allow_headers=[
        "Content-Type",
        "Authorization",
        "X-Internal-Secret",
        "X-Requested-With",
        "Accept",
    ],
    expose_headers=["Content-Type"],
    max_age=3600,
    supports_credentials=False,
)
def apply_to_job(request) -> object:
    """
    Authenticated: POST JSON { "jobId": "<jobs doc id>" } with
    `Authorization: Bearer <Firebase ID token>`. The caller uid must be the
    document owner. Requires a tailored CV + cover in Firestore for the job.

    Internal: POST with `X-Internal-Secret` and body { "userId", "jobId" } (no doc pre-check).
    """
    if request.method != "POST":
        return _json({"error": "POST only"}, 405)

    _ensure_app()
    db = firestore.client()
    bucket = storage.bucket()

    payload = request.get_json(silent=True) or {}
    job_id = (payload.get("jobId") or "").strip()
    if not job_id:
        return _json({"error": "jobId is required"}, 400)

    require_docs = True
    auth_header = (request.headers.get("Authorization") or "").strip()
    if auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()
        try:
            decoded = auth.verify_id_token(token)
        except Exception as e:  # noqa: BLE001
            return _json({"ok": False, "error": f"invalid id token: {e}"}, 401)
        user_id = (decoded.get("uid") or "").strip()
        if not user_id:
            return _json({"ok": False, "error": "token missing uid"}, 401)
        require_docs = True
    else:
        ok, err = _require_internal_secret(request)
        if not ok:
            return _json({"error": err}, 403)
        require_docs = False
        user_id = (payload.get("userId") or "").strip()
        if not user_id:
            return _json({"error": "userId and jobId are required for internal calls"}, 400)

    try:
        _LOG_HTTP.info("apply_to_job request jobId=%s userId=%s requireUserJobDocs=%s", job_id, user_id, require_docs)
        result = run_apply_pipeline(
            db, bucket, user_id=user_id, job_id=job_id, require_user_job_docs=require_docs
        )
        rid = (result or {}).get("runId")
        if rid:
            apply_trace(
                str(rid),
                user_id,
                job_id,
                "http_apply_response_ok",
                {
                    "ok": True,
                    "has_cv_uri": bool((result or {}).get("cvGsUri")),
                    "llmTotalTokens": ((result or {}).get("internalLlm") or {}).get("totalTokens"),
                },
            )
        _LOG_HTTP.info("apply_to_job ok jobId=%s userId=%s runId=%s", job_id, user_id, rid)
        return _json({"ok": True, **result})
    except Exception as e:  # noqa: BLE001
        _LOG_HTTP.exception("apply_to_job error jobId=%s userId=%s", job_id, user_id)
        return _json({"ok": False, "error": str(e)}, 500)


@https_fn.on_request(
    invoker="public",
    timeout_sec=600,
    memory=options.MemoryOption.MB_512,
)
@cross_origin(
    origins="*",
    methods=["GET", "POST", "HEAD", "OPTIONS"],
    allow_headers=[
        "Content-Type",
        "Authorization",
        "X-Internal-Secret",
        "X-Requested-With",
        "Accept",
    ],
    expose_headers=["Content-Type"],
    max_age=3600,
    supports_credentials=False,
)
def generate_job_document(request) -> object:
    """
    POST JSON { "jobId", "kind": "cv" | "cover_letter" } with Firebase ID token.
    Returns tailored content from server-side agents plus internalLlm (tokens + est. cost).
    """
    if request.method == "OPTIONS":
        return make_response("", 204)
    if request.method != "POST":
        return _json({"error": "POST only"}, 405)

    _ensure_app()
    db = firestore.client()
    bucket = storage.bucket()

    auth_header = (request.headers.get("Authorization") or "").strip()
    if not auth_header.lower().startswith("bearer "):
        return _json({"ok": False, "error": "Authorization Bearer token required"}, 401)
    token = auth_header.split(" ", 1)[1].strip()
    try:
        decoded = auth.verify_id_token(token)
    except Exception as e:  # noqa: BLE001
        return _json({"ok": False, "error": f"invalid id token: {e}"}, 401)
    user_id = (decoded.get("uid") or "").strip()
    if not user_id:
        return _json({"ok": False, "error": "token missing uid"}, 401)

    payload = request.get_json(silent=True) or {}
    job_id = (payload.get("jobId") or "").strip()
    kind = (payload.get("kind") or "").strip()
    if not job_id or kind not in ("cv", "cover_letter"):
        return _json({"ok": False, "error": "jobId and kind (cv|cover_letter) are required"}, 400)

    try:
        _LOG_DOCS.info("generate_job_document jobId=%s userId=%s kind=%s", job_id, user_id, kind)
        out = run_generate_job_document_sync(
            db,
            bucket,
            user_id=user_id,
            job_id=job_id,
            kind=kind,
        )
        return _json({"ok": True, **out})
    except Exception as e:  # noqa: BLE001
        _LOG_DOCS.exception("generate_job_document error")
        return _json({"ok": False, "error": str(e)}, 500)
