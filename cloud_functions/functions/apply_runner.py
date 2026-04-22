"""
Run the existing agent pipeline for one user + job, upload PDFs to Cloud Storage,
and persist status + artifact paths on `users/{uid}/applicationRuns/{runId}`.
"""

from __future__ import annotations

import asyncio
import import_paths
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import_paths.setup()

from google.cloud.storage import Bucket

from agents import Runner  # noqa: E402  # openai-agents (PyPI: agents)

from vibe_agents import build_agents  # noqa: E402
from pipeline import job_excerpt  # noqa: E402
from store import JobStore  # noqa: E402


def _assert_user_has_job_documents(db: Any, user_id: str, job_id: str) -> None:
    """App stores tailored CV and cover in `users/{uid}/documents` with `jobId` and `type`."""
    col = db.collection("users").document(user_id).collection("documents")
    has_cv = False
    has_cover = False
    for d in col.stream():
        data = d.to_dict() or {}
        if data.get("jobId") != job_id:
            continue
        t = data.get("type")
        if t == "cv":
            has_cv = True
        elif t == "cover_letter":
            has_cover = True
    if not has_cv or not has_cover:
        raise ValueError(
            "Generate and save both a tailored CV and a cover letter for this job in the app "
            "before using the apply agent."
        )


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _append_status(
    run_ref: Any,
    *,
    status: str,
    message: str = "",
) -> None:
    snap = run_ref.get()
    data = snap.to_dict() or {}
    hist = list(data.get("statusHistory") or [])
    hist.append({"at": _now_iso(), "status": status, "message": message})
    run_ref.update(
        {
            "status": status,
            "statusHistory": hist,
            "updatedAt": _now_iso(),
        }
    )


def _profile_to_candidate_blob(profile: dict[str, Any]) -> str:
    parts = [
        f"Name: {profile.get('fullName', '')}",
        f"Email: {profile.get('email', '')}",
        f"Phone: {profile.get('phone', '')}",
        f"Location: {profile.get('city', '')}, {profile.get('country', '')}",
        f"Headline: {profile.get('headline', '')}",
        f"Summary:\n{profile.get('summary', '')}",
        f"Skills: {', '.join(profile.get('skills') or [])}",
    ]
    wh = profile.get("workHistory") or []
    if isinstance(wh, list) and wh:
        parts.append("Experience:")
        for w in wh[:6]:
            if isinstance(w, dict):
                parts.append(
                    f"- {w.get('role', '')} at {w.get('company', '')} "
                    f"({w.get('startDate', '')} – {w.get('endDate') or 'present'})"
                )
    return "\n".join(parts)


def _upload_file(bucket: Bucket, local_path: Path, dest_blob: str, content_type: str) -> str:
    blob = bucket.blob(dest_blob)
    blob.upload_from_filename(str(local_path), content_type=content_type)
    return f"gs://{bucket.name}/{dest_blob}"


async def run_apply_pipeline_async(
    db: Any,
    bucket: Bucket,
    *,
    user_id: str,
    job_id: str,
    require_user_job_docs: bool = False,
) -> dict[str, Any]:
    if require_user_job_docs:
        _assert_user_has_job_documents(db, user_id, job_id)
    user_ref = db.collection("users").document(user_id)
    user_snap = user_ref.get()
    if not user_snap.exists:
        raise ValueError(f"user not found: {user_id}")
    user_data = user_snap.to_dict() or {}
    profile = user_data.get("profile") or {}
    if not isinstance(profile, dict):
        raise ValueError("user profile missing")

    job_snap = db.collection("jobs").document(job_id).get()
    if not job_snap.exists:
        raise ValueError(f"job not found: {job_id}")
    job = job_snap.to_dict() or {}
    apply_url = (job.get("applyUrl") or "").strip()
    if not apply_url:
        raise ValueError("job has no applyUrl")

    run_id = str(uuid.uuid4())
    run_ref = user_ref.collection("applicationRuns").document(run_id)
    candidate = _profile_to_candidate_blob(profile)

    run_ref.set(
        {
            "runId": run_id,
            "userId": user_id,
            "jobId": job_id,
            "jobTitle": job.get("title", ""),
            "applyUrl": apply_url,
            "status": "queued",
            "statusHistory": [{"at": _now_iso(), "status": "queued", "message": "Run created"}],
            "details": {
                "profileEmail": profile.get("email"),
                "jobCompany": job.get("company"),
                "agentModelEnv": __import__("os").environ.get("VIBJOBBER_AGENT_MODEL", "gpt-4o-mini"),
            },
            "cvGsUri": None,
            "coverGsUri": None,
            "formPlanJson": None,
            "agentNotes": {},
            "error": None,
            "createdAt": _now_iso(),
            "updatedAt": _now_iso(),
        }
    )

    out_dir = Path(tempfile.mkdtemp(prefix="vjb_apply_"))
    store = JobStore()
    store.append(
        {
            "id": job_id,
            "title": str(job.get("title") or "Role"),
            "link": apply_url,
            "snippet": str(job.get("description") or "")[:900],
            "page_text": None,
        }
    )

    try:
        _append_status(run_ref, status="fetching_page", message="Fetching posting HTML")
        agents = build_agents(store, out_dir)

        r_fetch = await Runner.run(
            agents["job_page_fetch"],
            "job_index=0. Fetch this job posting.",
        )

        excerpt = job_excerpt(store, 0)
        _append_status(run_ref, status="generating_cover", message="Agent: cover letter")
        r_cover = await Runner.run(
            agents["cover_letter"],
            "job_index=0\n\ncandidate_profile:\n"
            f"{candidate}\n\njob_page_excerpt:\n{excerpt}\n",
        )

        _append_status(run_ref, status="generating_cv", message="Agent: CV")
        r_cv = await Runner.run(
            agents["cv"],
            "job_index=0\n\ncandidate_profile:\n"
            f"{candidate}\n\njob_page_excerpt:\n{excerpt}\n",
        )

        _append_status(run_ref, status="planning_form", message="Agent: form fill plan")
        r_form = await Runner.run(
            agents["form_filler"],
            "job_index=0\n\ncandidate_profile:\n"
            f"{candidate}\n\njob_page_excerpt:\n{excerpt}\n",
        )

        posting = store.postings[0]
        cv_path = posting.get("cv_path")
        cover_path = posting.get("cover_letter_path")
        plan_path = posting.get("form_plan_path")
        form_json: str | None = None
        if plan_path and Path(str(plan_path)).is_file():
            form_json = Path(str(plan_path)).read_text(encoding="utf-8")

        cv_uri = None
        cover_uri = None
        if cv_path and Path(str(cv_path)).is_file():
            _append_status(run_ref, status="uploading", message="Uploading CV PDF")
            cv_uri = _upload_file(
                bucket,
                Path(str(cv_path)),
                f"users/{user_id}/applicationRuns/{run_id}/cv.pdf",
                "application/pdf",
            )
        if cover_path and Path(str(cover_path)).is_file():
            _append_status(run_ref, status="uploading", message="Uploading cover PDF")
            cover_uri = _upload_file(
                bucket,
                Path(str(cover_path)),
                f"users/{user_id}/applicationRuns/{run_id}/cover_letter.pdf",
                "application/pdf",
            )

        _append_status(run_ref, status="completed", message="Pipeline finished")
        run_ref.update(
            {
                "cvGsUri": cv_uri,
                "coverGsUri": cover_uri,
                "formPlanJson": form_json,
                "agentNotes": {
                    "fetch": str(r_fetch.final_output)[:4000],
                    "cover_letter": str(r_cover.final_output)[:4000],
                    "cv": str(r_cv.final_output)[:4000],
                    "form_plan": str(r_form.final_output)[:4000],
                },
                "updatedAt": _now_iso(),
            }
        )

        return {
            "ok": True,
            "runId": run_id,
            "cvGsUri": cv_uri,
            "coverGsUri": cover_uri,
        }
    except Exception as e:  # noqa: BLE001
        _append_status(run_ref, status="failed", message=str(e)[:500])
        run_ref.update({"error": str(e)[:2000], "updatedAt": _now_iso()})
        raise


def run_apply_pipeline(
    db: Any,
    bucket: Bucket,
    *,
    user_id: str,
    job_id: str,
    require_user_job_docs: bool = False,
) -> dict[str, Any]:
    return asyncio.run(
        run_apply_pipeline_async(
            db, bucket, user_id=user_id, job_id=job_id, require_user_job_docs=require_user_job_docs
        )
    )
