"""Unit tests for `serper` query helpers (no HTTP)."""

from __future__ import annotations

import pytest

from serper import build_job_search_query, short_job_id


def test_short_job_id_is_stable_12_hex() -> None:
    u = "https://greenhouse.io/jobs/1"
    a = short_job_id(u)
    b = short_job_id(u)
    assert a == b
    assert len(a) == 12
    int(a, 16)


def test_build_job_search_query_includes_title_and_board_sites() -> None:
    q = build_job_search_query("Product Manager", or_terms=["PM"])
    assert "site:lever.co" in q
    assert "Product Manager" in q
    assert " | " in q  # OR clause between variants


def test_build_job_search_query_empty_title_raises() -> None:
    with pytest.raises(ValueError, match="non-empty"):
        build_job_search_query("  ")


def test_build_job_search_query_adds_engineer_variant_when_missing() -> None:
    q = build_job_search_query("Nurse")
    assert "Nurse" in q
    assert "Nurse engineer" in q or "nurse engineer" in q.lower()
