
from __future__ import annotations

import import_paths

import_paths.setup()

import os

import firebase_admin
from firebase_admin import auth, firestore, storage
from firebase_functions import https_fn
from flask import make_response, jsonify

from apply_runner import run_apply_pipeline  # noqa: E402
from discovery import run_discovery_for_all_users  # noqa: E402


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
    r.headers["Access-Control-Allow-Origin"] = "*"
    r.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Internal-Secret"
    r.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    return r


def _cors_empty(status: int = 204) -> object:
    r = make_response("", status)
    r.headers["Access-Control-Allow-Origin"] = "*"
    r.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Internal-Secret"
    r.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
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


@https_fn.on_request()
def apply_to_job(request) -> object:
    """
    Authenticated: POST JSON { "jobId": "<jobs doc id>" } with
    `Authorization: Bearer <Firebase ID token>`. The caller uid must be the
    document owner. Requires a tailored CV + cover in Firestore for the job.

    Internal: POST with `X-Internal-Secret` and body { "userId", "jobId" } (no doc pre-check).
    """
    if request.method == "OPTIONS":
        return _cors_empty(204)
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
        result = run_apply_pipeline(
            db, bucket, user_id=user_id, job_id=job_id, require_user_job_docs=require_docs
        )
        return _json({"ok": True, **result})
    except Exception as e:  # noqa: BLE001
        return _json({"ok": False, "error": str(e)}, 500)
