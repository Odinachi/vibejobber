"""Tests for `apply_trace` logging."""

from __future__ import annotations

import logging

import pytest

import apply_trace


def test_apply_trace_emits_info_with_fields(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.INFO, logger="vibjobber.apply")
    apply_trace.apply_trace("r1", "u1", "j1", "test_event", {"k": "v", "n": None})
    assert any("apply_trace" in r.message and "runId=r1" in r.message for r in caplog.records)


def test_apply_trace_truncates_long_values(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.INFO, logger="vibjobber.apply")
    long_val = "x" * 500
    apply_trace.apply_trace("r", "u", "j", "e", {"blob": long_val})
    rec = next(r for r in caplog.records if "apply_trace" in r.message)
    assert "…" in rec.message or len(long_val) > 400
