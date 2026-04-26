"""Tests for job-import validation and field extraction (no network)."""

from __future__ import annotations

import pytest

from import_job_url import assert_page_looks_like_job_posting, build_imported_job_fields


def _html_with_jobposting_ld(
    title: str = "Software Engineer",
    company: str = "Acme",
    desc: str = "We are hiring. Job description. Key responsibilities. Required qualifications.",
) -> str:
    return f"""<!doctype html><html><head>
<meta property="og:type" content="article"/>
<script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "JobPosting",
  "title": "{title}",
  "description": "<p>{desc}</p>",
  "hiringOrganization": {{"@type": "Organization", "name": "{company}"}}
}}
</script>
</head><body><main><h1>{title}</h1><p>{desc}</p></main></body></html>"""


def test_assert_accepts_json_ld_job_posting() -> None:
    html = _html_with_jobposting_ld()
    # Known ATS-style path boosts URL score; use a plausible job URL
    assert_page_looks_like_job_posting(
        html, "https://boards.greenhouse.io/test/jobs/123?gh_jid=abc"
    )


def test_assert_rejects_denylist_host() -> None:
    html = _html_with_jobposting_ld()
    with pytest.raises(ValueError, match="not accepted"):
        assert_page_looks_like_job_posting(html, "https://www.wikipedia.org/wiki/Job")


def test_assert_rejects_non_job_page_without_signals() -> None:
    html = """<!doctype html><html><head><title>My blog</title></head>
    <body><p>Just a personal update today.</p></body></html>"""
    with pytest.raises(ValueError, match="does not look like a single job posting"):
        assert_page_looks_like_job_posting(html, "https://example.com/blog/post-1")


def test_build_imported_job_fields_extracts_title_company() -> None:
    html = _html_with_jobposting_ld(title="Data Scientist", company="Contoso", desc="Do ML work.")
    fields = build_imported_job_fields(html, "https://example.com/careers/job/99")
    assert fields["title"]
    assert "Data" in fields["title"] or "Scientist" in fields["title"]
    assert fields["company"]
    assert len(fields["description"]) > 10
    assert fields["location"]  # may be "See posting" or from schema
    assert fields["workMode"] in ("remote", "hybrid", "onsite")
    assert fields["jobType"] in ("full-time", "part-time", "contract", "internship")
    assert isinstance(fields["requirements"], list)
    assert isinstance(fields["responsibilities"], list)
