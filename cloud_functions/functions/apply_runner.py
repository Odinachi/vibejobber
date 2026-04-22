"""
Apply pipeline for one user + job: fetch posting, use CV + cover text already saved in
Firestore (app-generated), build PDFs, run the form-fill agent, upload to Storage, and
persist status + paths on `users/{uid}/applicationRuns/{runId}`.
"""

from __future__ import annotations

import asyncio
import import_paths
import json
import os
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import_paths.setup()

from google.cloud.storage import Bucket

from agents import Runner  # noqa: E402  # openai-agents (PyPI: agents)

from artifacts import save_cover_letter_impl, save_cv_impl  # noqa: E402
from vibe_agents import build_agents  # noqa: E402
from apply_trace import apply_trace  # noqa: E402
from pipeline import job_excerpt  # noqa: E402
from store import JobStore  # noqa: E402


def _get_saved_job_document_texts(db: Any, user_id: str, job_id: str) -> tuple[str, str]:
    """
    Read tailored CV and cover text from `users/{uid}/documents` for this job.
    If multiple of a kind exist, pick the latest by `createdAt`.
    """
    col = db.collection("users").document(user_id).collection("documents")
    cvs: list[dict[str, Any]] = []
    covers: list[dict[str, Any]] = []
    for d in col.stream():
        data = d.to_dict() or {}
        if data.get("jobId") != job_id:
            continue
        t = data.get("type")
        if t == "cv":
            cvs.append(data)
        elif t == "cover_letter":
            covers.append(data)
    for bucket in (cvs, covers):
        bucket.sort(key=lambda x: str(x.get("createdAt") or ""), reverse=True)

    if not cvs or not covers:
        raise ValueError(
            "Generate and save both a tailored CV and a cover letter for this job in the app "
            "before using the apply agent."
        )
    cv_text = (cvs[0].get("content") or "").strip()
    cover_text = (covers[0].get("content") or "").strip()
    if not cv_text or not cover_text:
        raise ValueError("Your saved CV or cover letter for this job is empty. Edit it in the app, then try again.")
    return cv_text, cover_text


def _agent_step_timeout_sec() -> float:
    return float(os.environ.get("VIBJOBBER_AGENT_STEP_TIMEOUT_SEC", "300"))


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

    # Load before creating a run so we do not log a failed run for missing/empty app documents.
    cv_text, cover_text = _get_saved_job_document_texts(db, user_id, job_id)

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
                "requireUserJobDocs": require_user_job_docs,
                "cvAndCoverFrom": "app_firestore",
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
    apply_trace(
        run_id,
        user_id,
        job_id,
        "run_record_created",
        {"applyUrl": apply_url[:200], "title": (job.get("title") or "")[:120]},
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

    step_timeout = _agent_step_timeout_sec()

    async def _run_step(label: str, coro: Any) -> Any:
        try:
            return await asyncio.wait_for(coro, timeout=step_timeout)
        except asyncio.TimeoutError as e:
            raise TimeoutError(
                f"{label} timed out after {int(step_timeout)}s (set VIBJOBBER_AGENT_STEP_TIMEOUT_SEC to adjust)"
            ) from e

    try:
        _append_status(run_ref, status="fetching_page", message="Fetching posting HTML")
        apply_trace(run_id, user_id, job_id, "fetch_page_start", {})
        agents = build_agents(store, out_dir)

        r_fetch = await _run_step(
            "Fetch job page",
            Runner.run(
                agents["job_page_fetch"],
                "job_index=0. Fetch this job posting.",
            ),
        )

        excerpt = job_excerpt(store, 0)
        fetch_out = str(r_fetch.final_output) if r_fetch and r_fetch.final_output is not None else ""
        page_text = (store.postings[0].get("page_text") or "") if store.postings else ""
        apply_trace(
            run_id,
            user_id,
            job_id,
            "fetch_page_done",
            {
                "excerpt_chars": len(excerpt),
                "page_text_chars": len(page_text) if isinstance(page_text, str) else 0,
                "agent_reply_chars": len(fetch_out),
            },
        )

        # Use CV + cover already created in the app; do not re-run cover/CV LLM agents.
        _append_status(
            run_ref,
            status="using_app_documents",
            message="Building PDFs from your saved CV and cover letter",
        )
        apply_trace(
            run_id,
            user_id,
            job_id,
            "build_pdfs_from_app_text",
            {"cv_text_chars": len(cv_text), "cover_text_chars": len(cover_text)},
        )
        save_cv_impl(store, out_dir, 0, cv_text, "pdf")
        save_cover_letter_impl(store, out_dir, 0, cover_text, "pdf")
        posting0 = store.postings[0]
        cv_local = posting0.get("cv_path")
        cl_local = posting0.get("cover_letter_path")
        apply_trace(
            run_id,
            user_id,
            job_id,
            "pdfs_materialized",
            {
                "cv_path_suffix": (str(cv_local)[-80:] if cv_local else ""),
                "cover_path_suffix": (str(cl_local)[-80:] if cl_local else ""),
            },
        )

        _append_status(run_ref, status="planning_form", message="Agent: form fill plan")
        apply_trace(run_id, user_id, job_id, "form_plan_agent_start", {})
        r_form = await _run_step(
            "Form plan agent",
            Runner.run(
                agents["form_filler"],
                "job_index=0\n\ncandidate_profile:\n"
                f"{candidate}\n\njob_page_excerpt:\n{excerpt}\n",
            ),
        )
        form_agent_out = str(r_form.final_output) if r_form and r_form.final_output is not None else ""
        apply_trace(
            run_id,
            user_id,
            job_id,
            "form_plan_agent_done",
            {"agent_reply_chars": len(form_agent_out)},
        )

        posting = store.postings[0]
        cv_path = posting.get("cv_path")
        cover_path = posting.get("cover_letter_path")
        plan_path = posting.get("form_plan_path")
        form_json: str | None = None
        if plan_path and Path(str(plan_path)).is_file():
            form_json = Path(str(plan_path)).read_text(encoding="utf-8")
        form_fields_n = 0
        if form_json:
            try:
                parsed = json.loads(form_json)
                form_fields_n = len((parsed.get("fields") or []) if isinstance(parsed, dict) else [])
            except json.JSONDecodeError:
                form_fields_n = -1
        apply_trace(
            run_id,
            user_id,
            job_id,
            "form_plan_persisted",
            {
                "form_plan_path_set": bool(plan_path),
                "form_json_bytes": len(form_json) if form_json else 0,
                "form_fields": form_fields_n,
            },
        )

        cv_uri = None
        cover_uri = None
        if cv_path and Path(str(cv_path)).is_file():
            _append_status(run_ref, status="uploading", message="Uploading CV PDF")
            apply_trace(run_id, user_id, job_id, "upload_cv_start", {"dest": f"applicationRuns/{run_id}/cv.pdf"})
            cv_uri = _upload_file(
                bucket,
                Path(str(cv_path)),
                f"users/{user_id}/applicationRuns/{run_id}/cv.pdf",
                "application/pdf",
            )
            apply_trace(run_id, user_id, job_id, "upload_cv_done", {"gs_uri": cv_uri or ""})
        else:
            apply_trace(run_id, user_id, job_id, "upload_cv_skipped", {"reason": "no_local_pdf"})
        if cover_path and Path(str(cover_path)).is_file():
            _append_status(run_ref, status="uploading", message="Uploading cover PDF")
            apply_trace(
                run_id, user_id, job_id, "upload_cover_start", {"dest": f"applicationRuns/{run_id}/cover_letter.pdf"}
            )
            cover_uri = _upload_file(
                bucket,
                Path(str(cover_path)),
                f"users/{user_id}/applicationRuns/{run_id}/cover_letter.pdf",
                "application/pdf",
            )
            apply_trace(run_id, user_id, job_id, "upload_cover_done", {"gs_uri": cover_uri or ""})
        else:
            apply_trace(run_id, user_id, job_id, "upload_cover_skipped", {"reason": "no_local_pdf"})

        _append_status(run_ref, status="completed", message="Pipeline finished")
        apply_trace(
            run_id,
            user_id,
            job_id,
            "apply_pipeline_ok",
            {
                "message": "Form plan JSON stored; PDFs in Storage. (Browser submit not automated in this worker.)",
                "cv_gcs": bool(cv_uri),
                "cover_gcs": bool(cover_uri),
            },
        )
        run_ref.update(
            {
                "cvGsUri": cv_uri,
                "coverGsUri": cover_uri,
                "formPlanJson": form_json,
                "agentNotes": {
                    "fetch": str(r_fetch.final_output)[:4000],
                    "cover_letter": (f"(from app) {cover_text}")[:4000],
                    "cv": (f"(from app) {cv_text}")[:4000],
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
        apply_trace(
            run_id,
            user_id,
            job_id,
            "apply_pipeline_failed",
            {"error": str(e)[:500]},
        )
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
