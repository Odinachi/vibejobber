"""Write discovered openings to Firestore `jobs` collection (matches frontend `Job` shape)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from google.cloud import firestore

from job_ids import canonical_job_id, parse_company_from_serp_title, snippet_to_tags


def organic_to_job_fields(link: str, title: str, snippet: str) -> dict[str, Any]:
    job_title, company = parse_company_from_serp_title(title)
    jid = canonical_job_id(link)
    now = datetime.now(timezone.utc).isoformat()
    tags = snippet_to_tags(snippet)
    return {
        "id": jid,
        "title": job_title[:200],
        "company": company[:120],
        "location": "See posting",
        "workMode": "remote",
        "jobType": "full-time",
        "salaryMin": 0,
        "salaryMax": 0,
        "salaryCurrency": "USD",
        "description": (snippet or "")[:8000] or "See the original posting for details.",
        "requirements": [],
        "responsibilities": [],
        "applyUrl": link[:2048],
        "source": "serper",
        "postedAt": now,
        "tags": tags,
        "canonicalApplyUrl": link,
        "dedupeKey": jid,
    }


def merge_jobs_from_serper_organic(
    db: firestore.Client,
    organic: list[dict[str, Any]],
    *,
    max_writes: int = 500,
) -> tuple[int, int]:
    """
    Upsert each organic result into `jobs/{canonical_job_id}`.
    Returns (upserted_count, skipped_empty_link).
    """
    written = 0
    skipped = 0
    for o in organic[:max_writes]:
        link = (o.get("link") or "").strip()
        if not link:
            skipped += 1
            continue
        title = str(o.get("title") or "")
        snippet = str(o.get("snippet") or "")
        fields = organic_to_job_fields(link, title, snippet)
        jid = fields["id"]
        db.collection("jobs").document(jid).set(fields, merge=True)
        written += 1
    return written, skipped
