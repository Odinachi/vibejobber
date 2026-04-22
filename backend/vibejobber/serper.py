import hashlib
import json
import os
from typing import Any

import requests

from .store import JobStore

JOB_BOARD_SITES = (
    "site:lever.co | site:greenhouse.io | site:jobs.ashbyhq.com | "
    "site:app.dover.io | site:workable.com | site:boards.greenhouse.io | "
    "site:jobs.lever.co | site:apply.workable.com | site:bamboohr.com | "
    "site:jobs.smartrecruiters.com | "
    "site:icims.com | site:taleo.net | site:recruitee.com | "
    "site:careers.jobvite.com | site:jobs.jobvite.com | "
    "site:pinpointhq.com | site:teamtailor.com | site:jobs.breezy.hr | "
    "site:welcometothejungle.com | site:angel.co/jobs | site:wellfound.com"
)


def short_job_id(url: str) -> str:
    return hashlib.sha256(url.encode("utf-8")).hexdigest()[:12]


def build_job_search_query(job_title: str, or_terms: list[str] | None = None) -> str:
    title = job_title.strip()
    if not title:
        raise ValueError("job_title must be non-empty")
    variants: list[str] = [title]
    lower = title.lower()
    if "developer" not in lower:
        variants.append(f"{title} developer")
    if "engineer" not in lower:
        variants.append(f"{title} engineer")
    if or_terms:
        for extra in or_terms:
            e = extra.strip()
            if e and e not in variants:
                variants.append(e)
    or_clause = " | ".join(variants)
    return f"{JOB_BOARD_SITES} ({or_clause})"


def search_jobs(
    job_title: str,
    *,
    num: int = 10,
    or_terms: list[str] | None = None,
    hl: str = "en",
    gl: str | None = None,
    past_week: bool = True,
) -> dict[str, Any]:
    api_key = os.getenv("SERPER_API_KEY")
    if not api_key:
        raise RuntimeError("SERPER_API_KEY is not set")

    q = build_job_search_query(job_title, or_terms=or_terms)
    payload: dict[str, Any] = {"q": q, "num": num, "hl": hl, "autocorrect": True}
    if gl:
        payload["gl"] = gl
    if past_week:
        payload["tbs"] = "qdr:w"

    resp = requests.post(
        "https://google.serper.dev/search",
        headers={"X-API-KEY": api_key, "Content-Type": "application/json"},
        data=json.dumps(payload),
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def ingest_serper_results(
    store: JobStore, data: dict[str, Any], *, replace: bool = True
) -> int:
    organic = data.get("organic") or []
    if replace:
        store.clear()
    added = 0
    for o in organic:
        link = (o.get("link") or "").strip()
        if not link:
            continue
        jid = short_job_id(link)
        row: dict[str, Any] = {
            "id": jid,
            "title": o.get("title") or "",
            "link": link,
            "snippet": o.get("snippet") or "",
            "page_text": None,
        }
        store.append(row)
        added += 1
    return added
