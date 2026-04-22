from typing import Any, TypedDict


class JobPosting(TypedDict, total=False):
    id: str
    title: str
    link: str
    snippet: str
    page_text: str | None
    cover_letter_path: str
    cover_letter_format: str
    cv_path: str
    cv_format: str
    form_plan_path: str


def job_to_public(job: dict[str, Any]) -> dict[str, Any]:
    """Strip large page_text for API responses."""
    out = {k: v for k, v in job.items() if k != "page_text"}
    pt = job.get("page_text")
    if isinstance(pt, str) and pt:
        out["page_text_preview"] = pt[:500] + ("…" if len(pt) > 500 else "")
        out["page_text_length"] = len(pt)
    return out
