"""More tests for `import_job_url` pure helpers (no network)."""

from __future__ import annotations

import pytest
from bs4 import BeautifulSoup

from import_job_url import (
    _classify_section_heading,
    _company_from_host,
    _denylist_host,
    _infer_work_mode_from_text,
    _json_ld_job_posting_score,
    _location_str,
    _map_employment_type,
    _map_job_location_type,
    _merge_unique,
    _og_type_job_score,
    _org_name,
    _phrase_job_score,
    _public_hostname,
    _text_from_rich,
    _url_job_score,
    _visible_text_for_job_signals,
)


@pytest.mark.parametrize(
    ("ip", "expected"),
    [
        ("10.0.0.1", False),  # private
        ("127.0.0.1", False),  # loopback
        ("8.8.8.8", True),  # public
    ],
)
def test_public_hostname_literal_ips(ip: str, expected: bool) -> None:
    assert _public_hostname(ip) is expected


def test_public_hostname_rejects_localhost() -> None:
    assert _public_hostname("localhost") is False
    assert _public_hostname("foo.local") is False


def test_denylist_host() -> None:
    assert _denylist_host("www.wikipedia.org") is True
    assert _denylist_host("jobs.example.com") is False


def test_url_job_score_greenhouse() -> None:
    s = _url_job_score("https://boards.greenhouse.io/acme/jobs/1".lower())
    assert s >= 8


def test_url_job_score_path_hints_add_points() -> None:
    s = _url_job_score("https://example.com/careers/role/".lower())
    assert s >= 2


def test_json_ld_score_detects_type() -> None:
    assert _json_ld_job_posting_score('{"@type": "JobPosting"}') == 10
    assert _json_ld_job_posting_score("no schema here") == 0


def test_og_type_job_score() -> None:
    html = '<head><meta property="og:type" content="article"/></head>'
    assert _og_type_job_score(BeautifulSoup(html, "html.parser")) == 0
    html2 = '<head><meta property="og:type" content="job_posting"/></head>'
    assert _og_type_job_score(BeautifulSoup(html2, "html.parser")) == 8


def test_phrase_job_score() -> None:
    low = "this role has key responsibilities and equal opportunity employer"
    assert _phrase_job_score(low) >= 4


def test_visible_text_prefers_main() -> None:
    html = "<html><body><main>" + ("word " * 100) + "job description</main></body></html>"
    t = _visible_text_for_job_signals(BeautifulSoup(html, "html.parser"))
    assert "job description" in t


def test_classify_section_heading() -> None:
    assert _classify_section_heading("Key responsibilities") == "resp"
    assert _classify_section_heading("Required qualifications") == "req"
    assert _classify_section_heading("Nice to have") == "nice"
    assert _classify_section_heading("Random") is None


def test_merge_unique_dedupes_and_caps() -> None:
    out = _merge_unique(["a", "b"], ["a", "c", "d"], 3)
    assert out == ["a", "b", "c"]


def test_company_from_host() -> None:
    assert _company_from_host("https://www.example.com/jobs/1") == "Example"
    assert _company_from_host("https://x.y.app") == "X"


def test_text_from_rich_strips_html() -> None:
    t = _text_from_rich("<p>Hello &amp; <b>world</b></p>")
    assert "Hello" in t
    assert "world" in t
    assert "<" not in t


def test_text_from_rich_plain() -> None:
    assert _text_from_rich("  plain  text  ") == "plain text"


@pytest.mark.parametrize(
    ("org", "expect"),
    [
        ("Acme", "Acme"),
        ({"name": "BigCo", "@type": "Organization"}, "BigCo"),
        ([{"name": "X"}], "X"),
        (None, ""),
    ],
)
def test_org_name(org: object, expect: str) -> None:
    assert _org_name(org) == expect


def test_location_str_places() -> None:
    assert "Berlin" in _location_str(
        {
            "@type": "Place",
            "address": {
                "addressLocality": "Berlin",
                "addressCountry": "DE",
            },
        }
    )
    assert _location_str("Remote only") == "Remote only"


@pytest.mark.parametrize(
    ("et", "expect"),
    [
        ("FULL_TIME", "full-time"),
        ("https://schema.org/PartTime", "part-time"),
        (["CONTRACTOR"], "contract"),
        ({"name": "INTERN"}, "internship"),
        (None, None),
    ],
)
def test_map_employment_type(et: object, expect: str | None) -> None:
    assert _map_employment_type(et) == expect


def test_map_job_location_type() -> None:
    assert _map_job_location_type("https://schema.org/TELECOMMUTE") == "remote"
    assert _map_job_location_type("https://schema.org/ONSITE") == "onsite"
    assert _map_job_location_type(None) is None


def test_infer_work_mode_from_text() -> None:
    assert _infer_work_mode_from_text("We are fully remote in the US") == "remote"
    assert _infer_work_mode_from_text("Hybrid role 3 days in the office") == "hybrid"
    assert _infer_work_mode_from_text("On-site in London office") == "onsite"
