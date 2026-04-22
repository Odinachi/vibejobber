import json
from pathlib import Path
from typing import Any

from .store import JobStore


def write_txt(path: Path, body: str) -> None:
    path.write_text(body, encoding="utf-8")


def write_pdf(path: Path, body: str) -> None:
    try:
        from fpdf import FPDF
    except ImportError as e:
        raise ImportError("Install PDF support: pip install fpdf2") from e

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    pdf.set_font("Helvetica", size=11)
    safe = body.encode("latin-1", errors="replace").decode("latin-1")
    for line in safe.splitlines():
        pdf.multi_cell(0, 6, line)
    pdf.output(str(path))


def save_cover_letter_impl(
    store: JobStore,
    output_dir: Path,
    job_index: int,
    letter_body: str,
    file_format: str,
) -> dict[str, Any]:
    if job_index < 0 or job_index >= len(store):
        return {"error": "bad job_index"}
    job = store.postings[job_index]
    fmt = file_format.lower().strip().lstrip(".")
    if fmt not in ("txt", "pdf"):
        fmt = "txt"
    path = output_dir / f"{job['id']}_cover_letter.{fmt}"
    if fmt == "txt":
        write_txt(path, letter_body)
    else:
        write_pdf(path, letter_body)
    job["cover_letter_path"] = str(path)
    job["cover_letter_format"] = fmt
    return {"saved": str(path), "format": fmt, "job_id": job["id"]}


def save_cv_impl(
    store: JobStore,
    output_dir: Path,
    job_index: int,
    cv_body: str,
    file_format: str,
) -> dict[str, Any]:
    if job_index < 0 or job_index >= len(store):
        return {"error": "bad job_index"}
    job = store.postings[job_index]
    fmt = file_format.lower().strip().lstrip(".")
    if fmt not in ("txt", "pdf"):
        fmt = "txt"
    path = output_dir / f"{job['id']}_cv.{fmt}"
    if fmt == "txt":
        write_txt(path, cv_body)
    else:
        write_pdf(path, cv_body)
    job["cv_path"] = str(path)
    job["cv_format"] = fmt
    return {"saved": str(path), "format": fmt, "job_id": job["id"]}


def save_form_fill_plan_impl(
    store: JobStore,
    output_dir: Path,
    job_index: int,
    plan_json: str,
) -> dict[str, Any]:
    if job_index < 0 or job_index >= len(store):
        return {"error": "bad job_index"}
    job = store.postings[job_index]
    try:
        plan = json.loads(plan_json)
    except json.JSONDecodeError as e:
        return {"error": f"invalid JSON: {e}"}

    fields = plan.get("fields") or []
    path = output_dir / f"{job['id']}_form_fill_plan.json"
    path.write_text(json.dumps(plan, indent=2), encoding="utf-8")
    job["form_plan_path"] = str(path)
    return {"saved": str(path), "job_id": job["id"], "field_count": len(fields)}
