"""
Aggregate search intents from all Firestore users, run Serper (max 10 hits per intent),
and upsert into global `jobs` with URL-based dedupe (see `job_ids.canonical_job_id`).
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

# Monorepo fallback when `vibejobber` is not vendored into `functions/`
_FUN = Path(__file__).resolve().parent
if not (_FUN / "vibejobber").is_dir():
    _REPO = _FUN.parents[2]
    if str(_REPO / "backend") not in sys.path:
        sys.path.insert(0, str(_REPO / "backend"))

from google.cloud import firestore  # noqa: E402
from serper import search_jobs  # noqa: E402

from firestore_jobs import merge_jobs_from_serper_organic  # noqa: E402


def _norm_key(s: str) -> str:
    return " ".join((s or "").lower().split())


def collect_search_queries(db: firestore.Client, *, max_queries: int = 40) -> list[str]:
    """Unique role/title strings from preferences, application-linked jobs, and headlines."""
    seen: set[str] = set()
    ordered: list[str] = []

    def push(q: str) -> None:
        q = (q or "").strip()
        if len(q) < 2 or len(q) > 120:
            return
        k = _norm_key(q)
        if k in seen:
            return
        seen.add(k)
        ordered.append(q)

    for snap in db.collection("users").stream():
        if len(ordered) >= max_queries:
            break
        data = snap.to_dict() or {}
        prefs = data.get("preferences") or {}
        for r in prefs.get("desiredRoles") or []:
            push(str(r))
            if len(ordered) >= max_queries:
                return ordered
        profile = data.get("profile") or {}
        if isinstance(profile.get("headline"), str):
            push(profile["headline"])
            if len(ordered) >= max_queries:
                return ordered
        for app in data.get("applications") or []:
            if len(ordered) >= max_queries:
                return ordered
            if not isinstance(app, dict):
                continue
            jid = app.get("jobId")
            if not jid:
                continue
            job_snap = db.collection("jobs").document(str(jid)).get()
            if job_snap.exists:
                t = (job_snap.to_dict() or {}).get("title")
                if isinstance(t, str):
                    push(t)
    return ordered


def run_discovery_for_all_users(db: Any) -> dict[str, int | list[str]]:
    """For each aggregated query, request up to 10 organic results and merge into `jobs/`."""
    queries = collect_search_queries(db)
    if not queries:
        return {"queries_run": 0, "organic_merged": 0, "skipped_links": 0, "queries": []}

    total_merged = 0
    total_skipped = 0
    for q in queries:
        data = search_jobs(q, num=10, or_terms=None, past_week=False)
        organic = data.get("organic") or []
        merged, skipped = merge_jobs_from_serper_organic(db, organic)
        total_merged += merged
        total_skipped += skipped

    return {
        "queries_run": len(queries),
        "organic_merged": total_merged,
        "skipped_links": total_skipped,
        "queries": queries,
    }
