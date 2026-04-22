"""
Firebase Functions (Python) — HTTP entrypoints for job discovery and apply pipeline.

Vendored package: `vibejobber/` is copied from `../../backend/vibejobber` on deploy
(see `firebase.json` `predeploy`). For local dev without copy, `sys.path` falls back
to the repo `backend/` folder.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import firebase_admin
from firebase_admin import firestore, storage
from firebase_functions import https_fn
from flask import make_response, jsonify

# --- import path: vendored `vibejobber` next to this file, or monorepo `backend/`
_FUN = Path(__file__).resolve().parent
if (_FUN / "vibejobber").is_dir():
    sys.path.insert(0, str(_FUN))
else:
    _REPO = _FUN.parents[2]
    sys.path.insert(0, str(_REPO / "backend"))

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
    return make_response(jsonify(data), status)


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
    POST JSON: { "userId": "<uid>", "jobId": "<jobs doc id>" }.
    Generates CV/cover PDFs, uploads to Storage, logs `applicationRuns` status.
    """
    ok, err = _require_internal_secret(request)
    if not ok:
        return _json({"error": err}, 403)
    if request.method != "POST":
        return _json({"error": "POST only"}, 405)

    _ensure_app()
    db = firestore.client()
    bucket = storage.bucket()

    payload = request.get_json(silent=True) or {}
    user_id = (payload.get("userId") or "").strip()
    job_id = (payload.get("jobId") or "").strip()
    if not user_id or not job_id:
        return _json({"error": "userId and jobId are required"}, 400)

    try:
        result = run_apply_pipeline(db, bucket, user_id=user_id, job_id=job_id)
        return _json({"ok": True, **result})
    except Exception as e:  # noqa: BLE001
        return _json({"ok": False, "error": str(e)}, 500)
