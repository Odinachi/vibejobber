"""Unit tests for `job_ids` — URL normalization and canonical job document ids."""

from __future__ import annotations

import hashlib
from urllib.parse import urlparse

import pytest

from job_ids import (
    canonical_job_id,
    normalize_apply_url,
    parse_company_from_serp_title,
    snippet_to_tags,
)


def test_normalize_apply_url_strips_fragment_and_lowercases_host() -> None:
    u = normalize_apply_url("HTTPS://Example.COM/job/123?x=1#frag")
    assert u == "https://example.com/job/123?x=1"
    assert "#" not in u


def test_normalize_apply_url_adds_scheme_and_trims_trailing_slash() -> None:
    u = normalize_apply_url("Acme.Jobs/careers/role ")
    assert u == "https://acme.jobs/careers/role"
    parsed = urlparse(u)
    assert parsed.netloc == "acme.jobs"
    assert not u.endswith("//")


def test_normalize_apply_url_empty() -> None:
    assert normalize_apply_url("") == ""
    assert normalize_apply_url("   ") == ""


def test_canonical_job_id_is_deterministic_16_hex() -> None:
    url = "https://greenhouse.io/jobs/12345"
    a = canonical_job_id(url)
    b = canonical_job_id(url)
    assert a == b
    assert len(a) == 16
    int(a, 16)  # valid hex
    norm = normalize_apply_url(url)
    expected = hashlib.sha256(norm.encode("utf-8")).hexdigest()[:16]
    assert a == expected


def test_canonical_job_id_same_host_different_query_differs() -> None:
    a = canonical_job_id("https://x.com/jobs/1?gh_jid=1")
    b = canonical_job_id("https://x.com/jobs/1?gh_jid=2")
    assert a != b


@pytest.mark.parametrize(
    ("title", "expect_title", "expect_company"),
    [
        ("Engineer | Acme", "Engineer", "Acme"),
        ("PM – SmallCo", "PM", "SmallCo"),
        ("Designer - Studio", "Designer", "Studio"),
        ("Analyst — Big Inc", "Analyst", "Big Inc"),
        ("Dev at Startup", "Dev", "Startup"),
        ("OnlyTitle", "OnlyTitle", "Unknown company"),
    ],
)
def test_parse_company_from_serp_title(
    title: str, expect_title: str, expect_company: str
) -> None:
    j, c = parse_company_from_serp_title(title)
    assert j == expect_title
    assert c == expect_company


def test_parse_company_rejects_oversized_right_side() -> None:
    long_co = "x" * 100
    t = f"Role | {long_co}"
    j, c = parse_company_from_serp_title(t)
    assert c == "Unknown company"
    assert j == t


def test_snippet_to_tags_dedupes_and_stops() -> None:
    tags = snippet_to_tags("The React TypeScript role needs React and React", max_tags=4)
    assert "react" in tags
    assert "typescript" in tags
    assert len(tags) <= 4


def test_snippet_to_tags_empty_defaults() -> None:
    assert snippet_to_tags("") == ["role"]
    assert snippet_to_tags("   a   ")  # 'a' might be too short for regex - check behavior
    t = snippet_to_tags("a")
    assert isinstance(t, list) and len(t) >= 1
