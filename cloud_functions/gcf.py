"""
HTTP Cloud Functions (Gen2).

Deploy from repository root, e.g.:

  gcloud functions deploy sync_job_openings --gen2 --runtime=python312 --region=REGION \\
    --source=. --entry-point=sync_job_openings --trigger-http \\
    --set-env-vars=SERPER_API_KEY=...,OPENAI_API_KEY=...,VIBJOBBER_AGENT_MODEL=gpt-4o-mini \\
    --set-secrets=INTERNAL_FUNCTION_SECRET=...

  gcloud functions deploy apply_to_job --gen2 --runtime=python312 --region=REGION \\
    --source=. --entry-point=apply_to_job --trigger-http \\
    --set-env-vars=SERPER_API_KEY=...,OPENAI_API_KEY=... \\
    --set-secrets=INTERNAL_FUNCTION_SECRET=...

Entry points are the function names below. Use .gcloudignore to exclude node_modules and .venv.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import functions_framework
import firebase_admin
from firebase_admin import firestore, storage

_REPO = Path(__file__).resolve().parents[1]
if str(_REPO / "backend") not in sys.path:
    sys.path.insert(0, str(_REPO / "backend"))

from cloud_functions.apply_runner import run_apply_pipeline  # noqa: E402
from cloud_functions.discovery import run_discovery_for_all_users  # noqa: E402


def ensure_firebase_app() -> None:
    if not firebase_admin._apps:
        firebase_admin.initialize_app()


def _require_internal_secret(request) -> tuple[bool, str]:
    expected = os.environ.get("INTERNAL_FUNCTION_SECRET")
    if not expected:
        return True, ""
    got = request.headers.get("X-Internal-Secret", "")
    if got != expected:
        return False, "missing or invalid X-Internal-Secret"
    return True, ""


def _json(data: dict, status: int = 200):
    return (json.dumps(data), status, {"Content-Type": "application/json"})


@functions_framework.http
def sync_job_openings(request):
    """POST/GET: aggregate user intents → Serper (≤10 each) → merge into `jobs`."""
    ok, err = _require_internal_secret(request)
    if not ok:
        return _json({"error": err}, 403)

    if request.method == "OPTIONS":
        return ("", 204, {})

    ensure_firebase_app()
    db = firestore.client()
    try:
        out = run_discovery_for_all_users(db)
        return _json({"ok": True, **out})
    except Exception as e:  # noqa: BLE001
        return _json({"ok": False, "error": str(e)}, 500)


@functions_framework.http
def apply_to_job(request):
    """
    POST JSON: { "userId": "<uid>", "jobId": "<firestore jobs doc id>" }
    Runs agents, uploads PDFs to Storage under users/{uid}/applicationRuns/{runId}/,
    and logs status on users/{uid}/applicationRuns/{runId}.
    """
    ok, err = _require_internal_secret(request)
    if not ok:
        return _json({"error": err}, 403)

    if request.method != "POST":
        return _json({"error": "POST only"}, 405)

    ensure_firebase_app()
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
