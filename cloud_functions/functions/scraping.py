import json
import re
from typing import Any

import requests
from bs4 import BeautifulSoup

from .store import JobStore


def html_to_text(html: str, max_chars: int = 100_000) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()
    text = soup.get_text("\n", strip=True)
    text = re.sub(r"\n{3,}", "\n\n", text)
    if len(text) > max_chars:
        text = text[:max_chars] + "\n\n[truncated]"
    return text


def fetch_job_page_text(store: JobStore, job_index: int) -> dict[str, Any]:
    if job_index < 0 or job_index >= len(store):
        return {"error": "job_index out of range", "len": len(store)}

    job = store.postings[job_index]
    url = job["link"]
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml",
    }
    try:
        r = requests.get(url, headers=headers, timeout=35)
        r.raise_for_status()
        text = html_to_text(r.text)
        job["page_text"] = text
    except Exception as e:
        job["page_text"] = f"[fetch failed: {e}]"
        return {"ok": False, "job_id": job["id"], "error": str(e)}

    preview = text[:4000]
    return {
        "ok": True,
        "job_id": job["id"],
        "title": job["title"],
        "text_preview": preview,
    }
