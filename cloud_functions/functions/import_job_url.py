"""Verify a job posting URL and upsert into Firestore `jobs` (same id scheme as discovery)."""

from __future__ import annotations

import import_paths

import_paths.setup()

import ipaddress
import logging
import re
import socket
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup
from google.cloud import firestore

from job_ids import canonical_job_id, normalize_apply_url, parse_company_from_serp_title, snippet_to_tags

_LOG = logging.getLogger("vibjobber.import_job")

_USER_AGENT = (
    "Mozilla/5.0 (compatible; VibeJobberJobImport/1.0; +https://github.com/) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
_MAX_BODY = 900_000


def _public_hostname(host: str) -> bool:
    h = (host or "").lower().strip()
    if not h or h == "localhost":
        return False
    if h.endswith(".local") or h.endswith(".localhost"):
        return False
    if re.match(r"^(\d{1,3}\.){3}\d{1,3}$", h):
        try:
            return ipaddress.ip_address(h).is_global
        except ValueError:
            return False
    try:
        for _fam, _ty, _proto, _canon, sockaddr in socket.getaddrinfo(h, None, type=socket.SOCK_STREAM):
            addr = sockaddr[0]
            try:
                ip = ipaddress.ip_address(addr)
            except ValueError:
                continue
            if not ip.is_global:
                return False
    except OSError:
        return False
    return True


def _company_from_host(apply_url: str) -> str:
    host = (urlparse(apply_url).hostname or "").lower().replace("www.", "")
    if not host:
        return "Employer"
    part = host.split(".")[0] or "Employer"
    return part[:1].upper() + part[1:80]


def parse_job_listing_html(html: str, apply_url: str) -> tuple[str, str, str]:
    """Return (job_title, company, description) best-effort from HTML."""
    soup = BeautifulSoup(html[:_MAX_BODY], "html.parser")
    title = ""
    og = soup.find("meta", attrs={"property": "og:title"})
    if og and og.get("content"):
        title = str(og["content"]).strip()
    if not title and soup.title and soup.title.string:
        title = str(soup.title.string).strip()
    if not title:
        h1 = soup.find("h1")
        if h1:
            t = h1.get_text(strip=True)
            if t:
                title = t
    if not title:
        title = "Imported role"

    desc = ""
    ogd = soup.find("meta", attrs={"property": "og:description"})
    if ogd and ogd.get("content"):
        desc = str(ogd["content"]).strip()
    if not desc:
        md = soup.find("meta", attrs={"name": "description"})
        if md and md.get("content"):
            desc = str(md["content"]).strip()
    if not desc:
        desc = "Open the posting link for the full job description and requirements."

    job_title, company = parse_company_from_serp_title(title)
    if company == "Unknown company" or not company.strip():
        company = _company_from_host(apply_url)

    return job_title[:200], company[:120], desc[:8000]


def _build_job_doc(apply_url: str, jid: str, title: str, company: str, description: str) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    tags = snippet_to_tags(description)
    return {
        "id": jid,
        "title": title,
        "company": company,
        "location": "See posting",
        "workMode": "remote",
        "jobType": "full-time",
        "salaryMin": 0,
        "salaryMax": 0,
        "salaryCurrency": "USD",
        "description": description,
        "requirements": [],
        "responsibilities": [],
        "applyUrl": apply_url[:2048],
        "source": "user_link",
        "postedAt": now,
        "tags": tags,
        "canonicalApplyUrl": apply_url,
        "dedupeKey": jid,
    }


def import_job_from_user_url(db: firestore.Client, raw_url: str) -> dict[str, Any]:
    """
    Validate URL, fetch HTML, upsert jobs/{canonical_job_id(redirected_url)}.
    Returns { jobId, existing: bool }.
    """
    raw = (raw_url or "").strip()
    if len(raw) < 12 or len(raw) > 2048:
        raise ValueError("URL looks too short or too long")

    norm = normalize_apply_url(raw)
    if not norm.startswith(("http://", "https://")):
        raise ValueError("Only http(s) URLs are supported")

    parsed = urlparse(norm)
    host = parsed.hostname or ""
    if not _public_hostname(host):
        raise ValueError("That host is not allowed")

    try:
        r = requests.get(
            norm,
            timeout=25,
            allow_redirects=True,
            headers={"User-Agent": _USER_AGENT, "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8"},
        )
    except requests.RequestException as e:
        _LOG.warning("fetch failed url=%s err=%s", norm, e)
        raise ValueError("Could not reach that URL. Check the link and try again.") from e

    if r.status_code >= 400:
        raise ValueError(f"The page returned HTTP {r.status_code} — it may be private or removed.")

    final = normalize_apply_url(r.url)
    if not final.startswith(("http://", "https://")):
        raise ValueError("Invalid redirect target")

    final_host = urlparse(final).hostname or ""
    if not _public_hostname(final_host):
        raise ValueError("Redirect goes to a host that is not allowed")

    jid = canonical_job_id(final)
    ref = db.collection("jobs").document(jid)
    if ref.get().exists:
        _LOG.info("job already exists jobId=%s", jid)
        return {"ok": True, "jobId": jid, "existing": True}

    ctype = (r.headers.get("Content-Type") or "").lower()
    body = r.text or ""
    if len(body) > _MAX_BODY:
        body = body[:_MAX_BODY]

    looks_html = (
        "text/html" in ctype
        or body.lstrip().lower().startswith("<!doctype")
        or "<html" in body.lower()[:4000]
    )
    if not looks_html:
        raise ValueError("This URL does not look like a normal web page (HTML). Paste the full job posting URL.")

    title, company, desc = parse_job_listing_html(body, final)
    fields = _build_job_doc(final, jid, title, company, desc)
    ref.set(fields, merge=True)
    _LOG.info("imported job jobId=%s applyUrl=%s", jid, final[:120])
    return {"ok": True, "jobId": jid, "existing": False}
