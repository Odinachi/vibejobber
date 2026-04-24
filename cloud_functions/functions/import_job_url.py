"""Verify a job posting URL and upsert into Firestore `jobs` (same id scheme as discovery)."""

from __future__ import annotations

import import_paths

import_paths.setup()

import html
import ipaddress
import json
import logging
import re
import socket
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

from bs4.element import Tag

import requests
from bs4 import BeautifulSoup
from google.cloud import firestore

from job_ids import canonical_job_id, normalize_apply_url, parse_company_from_serp_title, snippet_to_tags

_LOG = logging.getLogger("vibjobber.import_job")

# Real desktop Chrome UA (some career sites 403 “bot” UAs or non-browser TLS fingerprints).
_CHROME_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)
_MAX_BODY = 900_000

# curl_cffi impersonate string — keep in sync with UA major version.
_CURL_IMPERSONATE = "chrome131"


def _browser_headers(referer: str | None) -> dict[str, str]:
    h: dict[str, str] = {
        "User-Agent": _CHROME_UA,
        "Accept": (
            "text/html,application/xhtml+xml,application/xml;q=0.9,"
            "image/avif,image/webp,image/apng,*/*;q=0.8"
        ),
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin" if referer else "none",
        "Sec-Fetch-User": "?1",
        "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
    }
    if referer:
        h["Referer"] = referer
    return h


def _warmup_urls(parsed) -> list[str]:
    """Same-origin paths to hit first so cookie / WAF flows see a normal navigation."""
    scheme = parsed.scheme or "https"
    netloc = parsed.netloc
    if not netloc:
        return []
    base = f"{scheme}://{netloc}"
    out: list[str] = []
    for u in (f"{base}/", base):
        if u not in out:
            out.append(u)
    path = parsed.path or ""
    low = path.lower()
    key_c = "/careers"
    if key_c in low:
        idx = low.find(key_c)
        stem = path[: idx + len(key_c)].rstrip("/") or key_c
        career_home = f"{base}{stem}/"
        if career_home not in out:
            out.insert(1, career_home)
    if "jobs" in low and "/jobs" in low:
        idx = low.find("/jobs")
        stem = path[: idx + len("/jobs")].rstrip("/")
        if stem:
            jh = f"{base}{stem}/"
            if jh not in out:
                out.append(jh)
    return out[:6]


def _fetch_with_requests_session(url: str) -> requests.Response:
    parsed = urlparse(url)
    session = requests.Session()
    warm = _warmup_urls(parsed)
    referer: str | None = None
    for w in warm:
        try:
            session.get(
                w,
                headers=_browser_headers(referer),
                timeout=12,
                allow_redirects=True,
            )
            referer = w
        except requests.RequestException:
            continue
    return session.get(
        url,
        headers=_browser_headers(referer or (f"{parsed.scheme}://{parsed.netloc}/")),
        timeout=28,
        allow_redirects=True,
    )


def _fetch_with_curl_cffi(url: str) -> Any:
    """TLS + HTTP/2 fingerprint closer to Chrome — helps ATS / career sites that 403 urllib."""
    from curl_cffi import requests as curl_req  # type: ignore[import-untyped]

    parsed = urlparse(url)
    session = curl_req.Session()
    warm = _warmup_urls(parsed)
    referer: str | None = None
    for w in warm:
        try:
            session.get(
                w,
                headers=_browser_headers(referer),
                impersonate=_CURL_IMPERSONATE,
                timeout=14,
                allow_redirects=True,
            )
            referer = w
        except Exception:
            continue
    return session.get(
        url,
        headers=_browser_headers(referer or (f"{parsed.scheme}://{parsed.netloc}/")),
        impersonate=_CURL_IMPERSONATE,
        timeout=30,
        allow_redirects=True,
    )


def _fetch_listing(url: str) -> Any:
    """Prefer curl_cffi (Chrome TLS); fall back to requests on failure or non-2xx."""
    try:
        r = _fetch_with_curl_cffi(url)
        if r.status_code < 400:
            return r
        _LOG.info("curl_cffi status=%s url=%s, trying requests fallback", r.status_code, url[:120])
    except Exception as e:
        _LOG.warning("curl_cffi error url=%s err=%s", url[:120], e)

    return _fetch_with_requests_session(url)

# Hosts that are never accepted as a single job posting (user can still add jobs from ATS / employer sites).
_DENYLIST_HOST_SUFFIXES = (
    "youtube.com",
    "youtu.be",
    "reddit.com",
    "wikipedia.org",
    "wikimedia.org",
    "medium.com",
    "twitch.tv",
    "pinterest.com",
    "tiktok.com",
    "spotify.com",
    "netflix.com",
    "imdb.com",
    "amazon.com",  # product pages; careers subdomain handled separately if needed
)

# Strong URL signals (substring match on full normalized URL, lowercase).
_URL_JOB_MARKERS = (
    "boards.greenhouse.io",
    "greenhouse.io",
    "jobs.lever.co",
    "lever.co",
    "myworkdayjobs.com",
    "workday.com",
    "smartrecruiters.com",
    "icims.com",
    "ashbyhq.com",
    "ashby.so",
    "bamboohr.com",
    "jobvite.com",
    "taleo.net",
    "successfactors.com",
    "eightfold.ai",
    "linkedin.com/jobs",
    "linkedin.com/job",
    "indeed.com/viewjob",
    "indeed.com/rc/",
    "indeed.com/job",
    "glassdoor.com/job",
    "ziprecruiter.com",
    "monster.com",
    "builtin.com/job",
    "wellfound.com/jobs",
    "wellfound.com/l/",
    "jobs.google.com",
    "google.com/about/careers",
    "careers.microsoft.com",
    "apple.com/jobs",
    "meta.com/careers",
    "amazon.jobs",
    "revolut.com/careers",
)

# Path / query fragments that often appear on real postings (combined with content checks).
_URL_PATH_HINTS = (
    "/job/",
    "/jobs/",
    "/careers/",
    "/career/",
    "/positions/",
    "/position/",
    "/opening/",
    "/openings/",
    "/vacancy/",
    "/vacancies/",
    "/requisition",
    "/posting/",
    "/apply/",
    "job_id=",
    "jobid=",
    "gh_jid=",
    "req_id=",
    "requisitionid=",
    "positionid=",
    "postingid=",
    "jr=",
)

# Phrases common on real job descriptions (substring search on visible text).
_STRONG_JOB_PHRASES = (
    "job description",
    "about the role",
    "about this role",
    "role overview",
    "key responsibilities",
    "what you'll do",
    "what you will do",
    "what you’ll do",
    "required qualifications",
    "minimum qualifications",
    "preferred qualifications",
    "basic qualifications",
    "how to apply",
    "application process",
    "submit your application",
    "equal opportunity employer",
    "eeo statement",
    "visa sponsorship",
    "requisition id",
    "employment type",
    "years of experience",
    "benefits package",
    "compensation range",
    "salary range",
)


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


def _denylist_host(host: str) -> bool:
    h = (host or "").lower()
    return any(h == d or h.endswith("." + d) for d in _DENYLIST_HOST_SUFFIXES)


def _json_ld_job_posting_score(raw_html: str) -> int:
    """Detect schema.org JobPosting in raw HTML without fragile full JSON parse."""
    if not raw_html:
        return 0
    if re.search(r'"@type"\s*:\s*"\s*JobPosting\s*"', raw_html, re.IGNORECASE):
        return 10
    if re.search(r'"@type"\s*:\s*\[[^\]]*JobPosting', raw_html, re.IGNORECASE):
        return 10
    if re.search(r'"@type"\s*:\s*"\s*https?://schema\.org/JobPosting\s*"', raw_html, re.IGNORECASE):
        return 10
    return 0


def _json_ld_scripts_score(soup: BeautifulSoup) -> int:
    """Same as raw scan, but scoped to application/ld+json script bodies (minified pages)."""
    for script in soup.find_all("script"):
        t = (script.get("type") or "").lower()
        if "ld+json" not in t:
            continue
        s = script.string or script.get_text() or ""
        if re.search(r'"@type"\s*:\s*"\s*JobPosting\s*"', s, re.IGNORECASE):
            return 10
        if re.search(r'"@type"\s*:\s*\[[^\]]*JobPosting', s, re.IGNORECASE):
            return 10
    return 0


def _og_type_job_score(soup: BeautifulSoup) -> int:
    mt = soup.find("meta", attrs={"property": "og:type"})
    if not mt:
        return 0
    c = (mt.get("content") or "").lower().strip()
    if "job" in c and "post" in c.replace(" ", ""):  # job_posting variants
        return 8
    if c in ("jobposting", "job_posting"):
        return 8
    return 0


def _url_job_score(url_lower: str) -> int:
    score = 0
    for m in _URL_JOB_MARKERS:
        if m in url_lower:
            score = max(score, 8)
            break
    hints = sum(1 for h in _URL_PATH_HINTS if h in url_lower)
    score += min(4, hints * 2)
    return min(10, score)


def _visible_text_for_job_signals(soup: BeautifulSoup) -> str:
    """Prefer main/article to avoid nav chrome with the word 'Apply'."""
    for sel in (
        soup.find("main"),
        soup.find("article"),
        soup.find(id=re.compile(r"(job|posting|requisition|opening)", re.I)),
        soup.find(class_=re.compile(r"(job-description|posting-body|opening-body)", re.I)),
    ):
        if sel:
            t = sel.get_text(" ", strip=True).lower()
            if len(t) > 200:
                return t[:120_000]
    return soup.get_text(" ", strip=True).lower()[:120_000]


def _phrase_job_score(visible_lower: str) -> int:
    hits = sum(1 for p in _STRONG_JOB_PHRASES if p in visible_lower)
    return min(10, hits * 2)


def assert_page_looks_like_job_posting(html: str, final_url: str) -> None:
    """
    Reject generic pages (blogs, homepages) that are not single job postings.
    Uses URL shape, JSON-LD, og:type, and job-specific copy in main/article text.
    """
    parsed = urlparse(final_url)
    host = (parsed.hostname or "").lower()
    if _denylist_host(host):
        raise ValueError("That site is not accepted as a job posting link. Use the employer or ATS job URL.")

    url_l = final_url.lower()
    url_sc = _url_job_score(url_l)
    soup = BeautifulSoup(html[:_MAX_BODY], "html.parser")
    raw_ld = max(_json_ld_job_posting_score(html), _json_ld_scripts_score(soup))
    og_sc = _og_type_job_score(soup)
    phrase_sc = _phrase_job_score(_visible_text_for_job_signals(soup))

    # Strong structured data or known ATS / job URL → accept (still must be HTML page).
    if raw_ld >= 10 or og_sc >= 8 or url_sc >= 8:
        return

    # Medium: clear URL path to a job *and* substantive job-like copy.
    if url_sc >= 4 and phrase_sc >= 4:
        return
    if url_sc >= 2 and phrase_sc >= 6:
        return

    _LOG.info(
        "job_import_rejected url=%s url_sc=%s jsonld=%s og_sc=%s phrase_sc=%s",
        final_url[:160],
        url_sc,
        raw_ld,
        og_sc,
        phrase_sc,
    )
    raise ValueError(
        "This page does not look like a single job posting. "
        "Use the direct link from the employer site or an ATS (Greenhouse, Lever, Workday, LinkedIn Jobs, Indeed job view, etc.)."
    )


def _company_from_host(apply_url: str) -> str:
    host = (urlparse(apply_url).hostname or "").lower().replace("www.", "")
    if not host:
        return "Employer"
    part = host.split(".")[0] or "Employer"
    return part[:1].upper() + part[1:80]


def _iter_json_ld_for_job_postings(data: Any) -> list[dict[str, Any]]:
    """Recursively find schema.org JobPosting objects in parsed JSON-LD."""
    out: list[dict[str, Any]] = []
    if isinstance(data, dict):
        types = data.get("@type")
        if isinstance(types, str):
            type_list: list[str] = [types]
        elif isinstance(types, list):
            type_list = [str(x) for x in types]
        else:
            type_list = []
        if any("JobPosting" in t or t.endswith("JobPosting") for t in type_list):
            out.append(data)
        for v in data.values():
            out.extend(_iter_json_ld_for_job_postings(v))
    elif isinstance(data, list):
        for item in data:
            out.extend(_iter_json_ld_for_job_postings(item))
    return out


def _parse_all_json_ld(soup: BeautifulSoup) -> list[dict[str, Any]]:
    postings: list[dict[str, Any]] = []
    for script in soup.find_all("script"):
        t = (script.get("type") or "").lower()
        if "ld+json" not in t:
            continue
        raw = script.string or script.get_text() or ""
        if not raw.strip():
            continue
        try:
            data = json.loads(raw)
        except (json.JSONDecodeError, TypeError) as e:
            _LOG.debug("json-ld parse skip: %s", e)
            continue
        if isinstance(data, list):
            for chunk in data:
                postings.extend(_iter_json_ld_for_job_postings(chunk))
        else:
            postings.extend(_iter_json_ld_for_job_postings(data))
    return postings


def _pick_richest_job_posting(candidates: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not candidates:
        return None
    best: dict[str, Any] = candidates[0]
    best_len = len((best.get("description") or best.get("title") or ""))
    for c in candidates[1:]:
        d = c.get("description") or ""
        tl = c.get("title") or ""
        n = max(len(d) if isinstance(d, str) else 0, len(tl) if isinstance(tl, str) else 0)
        if n > best_len:
            best, best_len = c, n
    return best


def _org_name(organization: Any) -> str:
    if organization is None:
        return ""
    if isinstance(organization, str):
        s = organization.strip()
        return s
    if isinstance(organization, dict):
        n = (
            organization.get("name")
            or organization.get("legalName")
            or organization.get("url")
        )
        if isinstance(n, str) and n.strip():
            return n.strip()[:200]
    if isinstance(organization, list) and organization:
        return _org_name(organization[0])
    return ""


def _text_from_rich(s: str) -> str:
    s = (s or "").strip()
    if not s or "<" not in s:
        return html.unescape(" ".join(s.split()))
    frag = BeautifulSoup(s, "html.parser")
    return " ".join(frag.get_text(" ", strip=True).split())[:20_000]


def _place_address_text(addr: Any) -> str:
    if isinstance(addr, str):
        return " ".join(addr.split())[:200]
    if not isinstance(addr, dict):
        return ""
    if "streetAddress" in addr or "addressLocality" in addr:
        parts: list[str] = []
        for k in (
            "streetAddress",
            "addressLocality",
            "addressRegion",
            "postalCode",
            "addressCountry",
        ):
            v = addr.get(k)
            if isinstance(v, str) and v.strip():
                parts.append(v.strip())
        return ", ".join(parts)[:200]
    return (addr.get("name") and str(addr["name"])) or ""


def _location_str(job_location: Any) -> str:
    if not job_location:
        return ""
    if isinstance(job_location, str):
        return " ".join(job_location.split())[:200]
    if isinstance(job_location, list):
        acc: list[str] = []
        for j in job_location:
            t = _location_str(j)
            if t and t not in acc:
                acc.append(t)
        return ", ".join(acc)[:200] if acc else ""
    if isinstance(job_location, dict):
        t = (job_location.get("@type") or "") or ""
        if t == "VirtualLocation" or (job_location.get("url") and "remote" in str(t).lower()):
            return "Remote (listed)"
        if "name" in job_location and not job_location.get("address"):
            n = job_location.get("name")
            if isinstance(n, str) and n.strip():
                return n.strip()[:200]
        a = job_location.get("address")
        if a:
            ad = _place_address_text(a)
            if ad:
                return ad
    return ""


def _map_employment_type(et: Any) -> str | None:
    if not et:
        return None
    e = et[0] if isinstance(et, list) and et else et
    if isinstance(e, dict):
        e = e.get("name") or e.get("@value") or e.get("value")
    if not isinstance(e, (str, int, float)):
        return None
    s = str(e).lower()
    for needle, jt in (
        ("part", "part-time"),
        ("parttime", "part-time"),
        ("part-time", "part-time"),
        ("contractor", "contract"),
        ("contract", "contract"),
        ("temp", "contract"),
        ("intern", "internship"),
        ("internship", "internship"),
    ):
        if needle in s:
            return jt
    if "full" in s or s.endswith("fulltime") or s == "f":
        return "full-time"
    if "per diem" in s:
        return "contract"
    return None


def _map_job_location_type(jlt: Any) -> str | None:
    if not jlt or not isinstance(jlt, (str, int, float)):
        return None
    t = str(jlt).lower()
    if "telecommute" in t or t.endswith("remote") or "remote" in t:
        return "remote"
    if "on_site" in t or "onsite" in t or t.endswith("onsite") or t.endswith("on site"):
        return "onsite"
    return None


def _infer_work_mode_from_text(d: str) -> str | None:
    low = d.lower()[:12_000]
    if re.search(
        r"\bhybrid\b|hybrid (role|work|position|option)", low
    ) or re.search(
        r"\b\d+ days? (in )?the office\b", low
    ) or re.search(
        r"\b\d+ days? (a )?week in (the )?office\b", low
    ):
        return "hybrid"
    if re.search(
        r"\b(remote|wfh|work (from|at) home|fully distributed|100% remote)\b", low
    ) or re.search(
        r"\bremote( first| only)?( role| position| opportunity)?\b", low
    ) or re.search(
        r"\banywhere( in| across)?( the)? (u\.s\.|us|united states|world|country)\b", low
    ):
        return "remote"
    if re.search(r"\b(on-?site|in-?office|in person)\b", low) or re.search(
        r"\bmust be in\b.*\b(city|office|area)\b", low
    ):
        return "onsite"
    return None


def _root_content_element(soup: BeautifulSoup) -> Any:
    for el in (
        soup.find("main"),
        soup.find("article"),
        soup.find(
            "div", attrs={"role": re.compile(r"^main$", re.I)}
        ),
        soup.find(id=re.compile(r"(job[-_ ]?description|posting[-_ ]?body|opening[-_ ]?content)", re.I)),
        soup.find("body"),
    ):
        if el is not None:
            return el
    return None


def _rough_visible_text(soup: BeautifulSoup) -> str:
    s2 = BeautifulSoup(str(soup)[:_MAX_BODY], "html.parser")
    for t in s2.find_all(["script", "style", "noscript", "svg"]):
        t.decompose()
    for nav in s2.find_all(["nav", "header", "footer"]):
        t = nav.get_text(" ", strip=True) or ""
        if len(t) < 5_000:
            nav.decompose()
    main = _root_content_element(s2) or s2
    t = main.get_text("\n", strip=True)
    lines: list[str] = []
    for line in t.splitlines():
        line2 = " ".join(line.split())
        if not line2:
            continue
        if re.match(
            r"^(\d+\s*|\(Cookie|Skip to|We use cookies|Sign in|Log in|Subscribe)", line2, re.I
        ):
            continue
        if len(line2) < 2:
            continue
        lines.append(line2)
    return "\n".join(lines)[:32_000]


# Heading substrings (lowercased) → bucket
_RESP_TOKENS = (
    "responsibilit", "responsibilt", "key resp", "what you", "day to day", "role you",
    "in this role", "about the role", "in this job", "you will", "the role", "duties",
    "own", "outcomes",
)
_REQ_TOKENS = (
    "qualification", "requirement", "must have", "should have", "we look for", "we need", "we're looking",
    "looking for", "you have", "you bring", "skills and experience", "you are", "minimum", "expected",
    "our ideal", "prerequisite", "criteria", "educat", "experience in",
)
_NICE_TOKENS = (
    "nice to have", "preferred", "plus", "desirable", "optional", "bonus points", "a plus",
    "it would be great",
)


def _classify_section_heading(heading: str) -> str | None:
    h = heading.lower().strip()
    if not h or len(h) > 200:
        return None
    if any(t in h for t in _NICE_TOKENS) and " requirement" not in h[:40]:
        return "nice"
    if any(t in h for t in _REQ_TOKENS) and "not require" not in h:
        return "req"
    if any(t in h for t in _RESP_TOKENS) and "require" not in h and "qualif" not in h:
        return "resp"
    return None


def _add_bullets_for_sibling(ul: Tag) -> list[str]:
    out: list[str] = []
    for li in ul.find_all("li", recursive=False) or []:
        x = " ".join(li.get_text(" ", strip=True).split())
        if 2 < len(x) < 800:
            out.append(x)
    return out


def _collect_lists_after_heading(heading: Tag, max_sibs: int = 24) -> list[str]:
    out: list[str] = []
    sib: Any = heading
    for _ in range(max_sibs):
        sib = sib.find_next_sibling() if sib is not None else None
        if sib is None or not isinstance(sib, Tag):
            break
        if sib.name in ("h1", "h2", "h3", "h4"):
            break
        if sib.name in ("ul", "ol"):
            out.extend(_add_bullets_for_sibling(sib))
        elif sib.name in ("div", "section"):
            for u in sib.find_all(["ul", "ol"], recursive=True, limit=4):
                if isinstance(u, Tag):
                    out.extend(_add_bullets_for_sibling(u))
    return [x for x in out if x][:50]


def _section_lists_from_dom(soup: BeautifulSoup) -> tuple[list[str], list[str], list[str]]:
    respons: list[str] = []
    requir: list[str] = []
    nice: list[str] = []
    seen: set[str] = set()
    for tag in ("h1", "h2", "h3", "h4"):
        for h in soup.find_all(tag, limit=80):
            if not isinstance(h, Tag):
                continue
            title = h.get_text(" ", strip=True)
            bucket = _classify_section_heading(title)
            if not bucket:
                continue
            bullets = _collect_lists_after_heading(h)
            target = respons if bucket == "resp" else requir if bucket == "req" else nice
            for b in bullets:
                b2 = b.strip()
                if b2 in seen:
                    continue
                seen.add(b2)
                target.append(b2)
                if len(target) >= 45:
                    break
    return respons[:40], requir[:40], nice[:40]


def _merge_unique(base: list[str], extra: list[str], cap: int) -> list[str]:
    s = set()
    out: list[str] = []
    for x in base + extra:
        t = " ".join(x.split())
        if t and t not in s:
            s.add(t)
            out.append(t)
            if len(out) >= cap:
                break
    return out


def _fallback_bulks_from_text(full_text: str) -> tuple[list[str], list[str]]:
    """Heuristic when heading-based DOM parse finds nothing: heading + bullet block in visible text."""
    if len(full_text) < 120:
        return [], []
    out_r: list[str] = []
    out_q: list[str] = []
    for m2 in re.finditer(
        r"(?is)(?P<hdr>[^\n]{0,50}(responsibilities|key responsibilities|qualifications?|"
        r"requirements?|must-?have|nice to have)\b[^\n]*)(?P<blk>[\n\r]+[ \t]*"
        r"(?:(?:[•*·\-]|\d+[\).]|[a-z][\).])\s*[^\n]+\n?){2,})",
        full_text,
    ):
        hdr = (m2.group("hdr") or "").lower()
        block = m2.group("blk") or ""
        lines: list[str] = []
        for rline in re.findall(
            r"(?m)^[ \t]*(?:[•*·\-]|\d+[\).]|[a-z][\).]|[a-z][\).])\s*(.+?)\s*$", block
        ):
            rline = " ".join(rline.split())
            if 4 < len(rline) < 800:
                lines.append(rline)
        if "nice" in hdr or "preferred" in hdr or "desirable" in hdr:
            continue
        if "respon" in hdr and "require" not in hdr[:20] and not out_r:
            out_r = lines[:30]
        elif re.search(r"require|qualif|must have|we look|skills( and|$)", hdr) and not out_q:
            out_q = lines[:30]
    if not out_r and not out_q:
        _fallback_scan_lines(full_text, out_r, out_q)
    return out_r[:30], out_q[:30]


def _fallback_scan_lines(
    full_text: str, out_r: list[str], out_q: list[str]
) -> None:
    """One bullet line at a time after a known heading line (first pass empty)."""
    if out_r or out_q:
        return
    mode: str | None = None
    for ln in (ln0.rstrip() for ln0 in full_text.splitlines() if ln0.strip()):
        llow = ln.lower()
        if re.search(
            r"^(responsibilities|key responsibilities|what (you|we'll|we will|you'll)|in this role|role overview)\b",
            llow,
        ):
            mode = "r"
        elif re.search(
            r"^(requirements|qualifications|we look for|we need|we're looking|must-?haves?|"
            r"you have|you bring|minimum qualifications|our ideal|skills( and experience)?|education)\b",
            llow,
        ):
            mode = "q"
        elif re.match(
            r"^(\s*[\-•*·]|\d+[\).]|[a-z][\).])\s*\S", ln
        ) and mode:
            t = re.sub(
                r"^[\-•*·\s]+|^\d+[\).]\s*|^[a-z][\).]\s+", "", ln
            ).strip()
            if 5 < len(t) < 800:
                if mode == "r" and len(out_r) < 30:
                    out_r.append(t)
                elif mode == "q" and len(out_q) < 30:
                    out_q.append(t)


def _og_meta_description(soup: BeautifulSoup) -> str:
    d = ""
    ogd = soup.find("meta", attrs={"property": "og:description"})
    if ogd and ogd.get("content"):
        d = str(ogd["content"]).strip()
    if not d:
        md = soup.find("meta", attrs={"name": "description"})
        if md and md.get("content"):
            d = str(md["content"]).strip()
    return d


def _title_from_dom(soup: BeautifulSoup) -> str:
    title = ""
    og = soup.find("meta", attrs={"property": "og:title"})
    if og and og.get("content"):
        title = str(og["content"]).strip()
    if not title and soup.title and soup.title.string:
        title = str(soup.title.string).strip()
    if not title:
        h1 = soup.find("h1")
        if h1 and h1.get_text(strip=True):
            title = h1.get_text(strip=True) or ""
    if not title:
        title = "Imported role"
    return title


def _resolve_work_mode(
    job_posting: dict[str, Any] | None, location: str, description: str, visible: str
) -> str:
    wms: list[str] = []
    if job_posting:
        jm = _map_job_location_type(job_posting.get("jobLocationType"))
        if jm:
            wms.append(jm)
    tx = f"{location}\n{description}\n{visible}"
    inf = _infer_work_mode_from_text(tx)
    if inf:
        wms.append(inf)
    for w in wms:
        if w in ("hybrid", "onsite", "remote"):
            return w
    return "remote"


def _resolve_job_type(
    job_posting: dict[str, Any] | None, text_blob: str
) -> str:
    if job_posting:
        jt = _map_employment_type(job_posting.get("employmentType"))
        if jt in ("full-time", "part-time", "contract", "internship"):
            return jt
    lo = (text_blob or "")[:8000].lower()
    if re.search(r"\bpart[- ]?time\b", lo):
        return "part-time"
    if re.search(r"\bcontract(ual|or|s)?\b", lo) and "full-time" not in lo[:300]:
        return "contract"
    if re.search(r"\bintern(ship)?\b", lo):
        return "internship"
    if re.search(r"\bfull[- ]?time\b|(?<![a-z])fte\b", lo):
        return "full-time"
    return "full-time"


def build_imported_job_fields(raw_html: str, apply_url: str) -> dict[str, Any]:
    """Title, company, long description, requirements, responsibilities, location, workMode, jobType — best effort."""
    soup = BeautifulSoup(raw_html[:_MAX_BODY], "html.parser")
    jp = _pick_richest_job_posting(_parse_all_json_ld(soup))

    title = ""
    if jp:
        t = jp.get("title")
        if isinstance(t, str) and t.strip():
            title = t.strip()[:200]
    if not title:
        title = _title_from_dom(soup)[:200]

    company = ""
    if jp:
        company = _org_name(jp.get("hiringOrganization"))
    job_title, from_title = parse_company_from_serp_title(title)
    if job_title:
        title = str(job_title)[:200] or title
    if (not company or not company.strip()) and from_title and from_title != "Unknown company":
        company = from_title
    if not company or not company.strip():
        company = _company_from_host(apply_url)
    company = company[:120].strip() or "Employer"

    location = ""
    if jp:
        location = _location_str(jp.get("jobLocation")) or _location_str(
            jp.get("applicantLocationRequirements")
        )
    if not location:
        m = soup.find("meta", attrs={"property": "job:location"})  # some og variants
        if m and m.get("content"):
            location = str(m.get("content")).strip()[:200]  # type: ignore[union-attr]
    if not location:
        location = "See posting"
    else:
        location = location[:200].strip() or "See posting"

    visible = _rough_visible_text(soup)
    desc_jp = _text_from_rich(str(jp.get("description", "")) if jp else "")

    short = _og_meta_description(soup)
    if short:
        short = " ".join(short.split())[:2_000]

    candidates: list[str] = [c for c in (visible, desc_jp, short) if c and c.strip() and len(c) > 15]
    if not candidates:
        best_body = "Open the posting link for the full job description and requirements."
    else:
        # Prefer the longest text after stripping; JSON-LD description often has the full posting.
        best_body = max(candidates, key=lambda x: len(" ".join(x.split())))
    if len(best_body) < 200 and (visible or short):
        b2 = visible or short or best_body
        if len(" ".join(b2.split())) > len(" ".join(best_body.split())):
            best_body = b2
    if len(best_body) < 40:
        best_body = "Open the posting link for the full job description and requirements."
    description = best_body[:12_000]

    root = _root_content_element(soup)
    sdom = (
        BeautifulSoup(str(root)[:_MAX_BODY // 2], "html.parser")
        if root
        else BeautifulSoup(str(soup)[:_MAX_BODY // 2], "html.parser")
    )
    resp, req, nice = _section_lists_from_dom(sdom)
    if len(resp) + len(req) < 2:
        fr, fq = _fallback_bulks_from_text(visible)
        resp = _merge_unique(resp, fr, 40)
        req = _merge_unique(req, fq, 40)
    if (not resp or not req) and desc_jp and len(desc_jp) > 400:
        dfr, dfq = _fallback_bulks_from_text(desc_jp)
        resp = _merge_unique(resp, dfr, 40)
        req = _merge_unique(req, dfq, 40)
    nice = [x for x in nice if x][:20]

    j_type = str(jp.get("jobLocationType", "")) if jp else ""
    work_mode = _resolve_work_mode(
        jp,
        f"{location}\n{j_type}"[:400],
        description,
        visible,
    )
    job_type = _resolve_job_type(jp, f"{description}\n{visible}")

    return {
        "title": title,
        "company": company,
        "description": description,
        "requirements": req,
        "responsibilities": resp,
        "niceToHave": nice,
        "location": location,
        "workMode": work_mode,
        "jobType": job_type,
    }


def _build_job_doc(apply_url: str, jid: str, fields: dict[str, Any]) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    desc = (fields.get("description") or "").strip()
    tags = snippet_to_tags(desc)
    doc: dict[str, Any] = {
        "id": jid,
        "title": (fields.get("title") or "Role")[:200],
        "company": (fields.get("company") or "Employer")[:120],
        "location": (fields.get("location") or "See posting")[:200],
        "workMode": fields.get("workMode") or "remote",
        "jobType": fields.get("jobType") or "full-time",
        "salaryMin": 0,
        "salaryMax": 0,
        "salaryCurrency": "USD",
        "description": desc[:12_000],
        "requirements": [str(x) for x in (fields.get("requirements") or []) if x],
        "responsibilities": [str(x) for x in (fields.get("responsibilities") or []) if x],
        "applyUrl": apply_url[:2048],
        "source": "user_link",
        "postedAt": now,
        "tags": tags,
        "canonicalApplyUrl": apply_url,
        "dedupeKey": jid,
    }
    nice = [str(x) for x in (fields.get("niceToHave") or []) if x]
    if nice:
        doc["niceToHave"] = nice
    return doc


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
        r = _fetch_listing(norm)
    except Exception as e:
        _LOG.warning("fetch failed url=%s err=%s", norm, e)
        raise ValueError("Could not reach that URL. Check the link and try again.") from e

    if r.status_code >= 400:
        if r.status_code == 403:
            raise ValueError(
                "That page returned HTTP 403 to our servers (anti-bot). Deploy the latest "
                "`import_job_from_url` function (includes a Chrome-like TLS client). "
                "If it persists, use a mirror posting on LinkedIn Jobs or another ATS when available."
            )
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

    assert_page_looks_like_job_posting(body, final)

    imp = build_imported_job_fields(body, final)
    fields = _build_job_doc(final, jid, imp)
    ref.set(fields, merge=True)
    _LOG.info("imported job jobId=%s applyUrl=%s", jid, final[:120])
    return {"ok": True, "jobId": jid, "existing": False}
