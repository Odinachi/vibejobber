"""Stable Firestore job document ids from posting URLs (dedupe across users and runs)."""

from __future__ import annotations

import hashlib
import re
from urllib.parse import urlparse, urlunparse


def normalize_apply_url(url: str) -> str:
    """Normalize URL for hashing: strip fragment, lowercase host, trim trailing slash."""
    u = (url or "").strip()
    if not u:
        return ""
    if "://" not in u:
        u = f"https://{u}"
    parsed = urlparse(u)
    netloc = parsed.netloc.lower()
    path = parsed.path.rstrip("/") or "/"
    # Drop common tracking params (best-effort)
    clean = urlunparse(
        (parsed.scheme.lower() or "https", netloc, path, "", parsed.query, "")
    )
    return clean


def canonical_job_id(url: str) -> str:
    """16-char hex id — used as Firestore `jobs/{id}` document id."""
    norm = normalize_apply_url(url)
    return hashlib.sha256(norm.encode("utf-8")).hexdigest()[:16]


def parse_company_from_serp_title(title: str) -> tuple[str, str]:
    """
    Best-effort split of organic result title into (job_title, company).
    Falls back to full title / Unknown company.
    """
    t = (title or "").strip() or "Open role"
    for sep in (" | ", " – ", " - ", " — ", " at "):
        if sep in t:
            left, right = t.split(sep, 1)
            left, right = left.strip(), right.strip()
            if len(right) < 80 and len(right) > 1:
                return left, right
    return t, "Unknown company"


def snippet_to_tags(snippet: str, max_tags: int = 6) -> list[str]:
    words = re.findall(r"[A-Za-z][A-Za-z0-9+#.-]{2,}", (snippet or "").lower())
    seen: set[str] = set()
    out: list[str] = []
    for w in words:
        if w in seen or w in {"the", "and", "for", "with", "you", "our", "this", "that"}:
            continue
        seen.add(w)
        out.append(w[:24])
        if len(out) >= max_tags:
            break
    return out or ["role"]
