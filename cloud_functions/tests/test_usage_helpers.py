"""Tests for `usage_helpers` (uses `tests/stubs/agents` — see conftest)."""

from __future__ import annotations

import os
from types import SimpleNamespace
from unittest.mock import patch

from agents.result import RunResult  # noqa: E402
from agents.usage import Usage  # noqa: E402

from usage_helpers import (  # noqa: E402
    estimate_cost_usd,
    merge_usages,
    results_to_merged_dict,
    usage_from_result,
    usage_to_internal_dict,
)


def test_merge_usages_sums_tokens() -> None:
    a = Usage()
    a.input_tokens = 10
    a.output_tokens = 5
    a.total_tokens = 15
    b = Usage()
    b.input_tokens = 2
    b.output_tokens = 1
    b.total_tokens = 3
    m = merge_usages(a, b)
    assert m.input_tokens == 12
    assert m.output_tokens == 6
    assert m.total_tokens == 18


def test_usage_from_result_iterates_raw_responses() -> None:
    u1 = SimpleNamespace(input_tokens=1, output_tokens=2, total_tokens=3, requests=0)
    u2 = SimpleNamespace(input_tokens=10, output_tokens=0, total_tokens=10, requests=1)
    r = RunResult(
        raw_responses=[
            SimpleNamespace(usage=u1),
            SimpleNamespace(usage=u2),
        ]
    )
    u = usage_from_result(r)  # type: ignore[arg-type]
    assert u.input_tokens == 11
    assert u.output_tokens == 2
    assert u.total_tokens == 13
    assert u.requests == 1


def test_estimate_cost_default_pricing() -> None:
    u = Usage()
    u.input_tokens = 1_000_000
    u.output_tokens = 1_000_000
    u.total_tokens = 2_000_000
    cost = estimate_cost_usd("gpt-4o-mini", u)
    assert abs(cost - 0.75) < 1e-6


def test_estimate_cost_env_override() -> None:
    u = Usage()
    u.input_tokens = 1000
    u.output_tokens = 1000
    u.total_tokens = 2000
    with patch.dict(
        os.environ,
        {
            "VIBJOBBER_PRICE_IN_PER_TOKEN": "1e-6",
            "VIBJOBBER_PRICE_OUT_PER_TOKEN": "2e-6",
        },
    ):
        cost = estimate_cost_usd("x", u)
    assert cost == 1000 * 1e-6 + 1000 * 2e-6


def test_usage_to_internal_dict_shape() -> None:
    u = Usage()
    u.input_tokens = 1
    u.output_tokens = 2
    u.total_tokens = 3
    u.requests = 1
    d = usage_to_internal_dict(u, model="m", stage_breakdown=None)
    assert d["inputTokens"] == 1
    assert d["outputTokens"] == 2
    assert d["model"] == "m"
    assert "estimatedCostUsd" in d
    assert "recordedAt" in d


def test_results_to_merged_dict_stages() -> None:
    def _r(inp: int, out: int, tot: int) -> RunResult:
        s = SimpleNamespace(usage=SimpleNamespace(input_tokens=inp, output_tokens=out, total_tokens=tot, requests=1))
        return RunResult(raw_responses=[s])

    a = _r(5, 1, 6)
    b = _r(2, 2, 4)
    d = results_to_merged_dict(a, b, model="gpt-test", stage_names=["s1", "s2"])
    assert d["inputTokens"] == 7
    assert d["stages"] and len(d["stages"]) == 2
    assert d["stages"][0]["name"] == "s1"
