"""Aggregate OpenAI `Usage` from agent `RunResult`s and estimate USD cost (internal / ops)."""

from __future__ import annotations

import os
from typing import Any

from agents.result import RunResult
from agents.usage import Usage

# Default: gpt-4o-mini (USD per token, OpenAI list pricing — override via env if needed)
_DEFAULT_MODEL = "gpt-4o-mini"
# input $0.15 / 1M, output $0.60 / 1M
_DEFAULT_IN_PER_TOKEN = 0.15e-6
_DEFAULT_OUT_PER_TOKEN = 0.60e-6


def _price_per_token() -> tuple[float, float]:
    p_in = os.environ.get("VIBJOBBER_PRICE_IN_PER_TOKEN", "")
    p_out = os.environ.get("VIBJOBBER_PRICE_OUT_PER_TOKEN", "")
    try:
        if p_in and p_out:
            return float(p_in), float(p_out)
    except ValueError:
        pass
    return _DEFAULT_IN_PER_TOKEN, _DEFAULT_OUT_PER_TOKEN


def usage_from_result(result: RunResult) -> Usage:
    u = Usage()
    for raw in result.raw_responses:
        u.add(raw.usage)
    return u


def merge_usages(*usage_chunks: Usage) -> Usage:
    u = Usage()
    for c in usage_chunks:
        u.add(c)
    return u


def estimate_cost_usd(_model: str, u: Usage) -> float:
    """Rough cost; override rates with VIBJOBBER_PRICE_IN_PER_TOKEN / VIBJOBBER_PRICE_OUT_PER_TOKEN (per token)."""
    p_in, p_out = _price_per_token()
    it = u.input_tokens or 0
    ot = u.output_tokens or 0
    return it * p_in + ot * p_out


def usage_to_internal_dict(
    u: Usage,
    *,
    model: str,
    stage_breakdown: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    from datetime import datetime, timezone

    cost = estimate_cost_usd(model, u)
    return {
        "inputTokens": u.input_tokens,
        "outputTokens": u.output_tokens,
        "totalTokens": u.total_tokens,
        "requests": u.requests,
        "model": model,
        "estimatedCostUsd": round(cost, 6),
        "recordedAt": datetime.now(timezone.utc).isoformat(),
        "stages": stage_breakdown or None,
    }


def results_to_merged_dict(
    *results: RunResult,
    model: str,
    stage_names: list[str] | None = None,
) -> dict[str, Any]:
    chunks: list[Usage] = [usage_from_result(r) for r in results]
    u = merge_usages(*chunks)
    breakdown: list[dict[str, Any]] | None = None
    if stage_names and len(stage_names) == len(results):
        breakdown = []
        for name, r in zip(stage_names, results):
            uu = usage_from_result(r)
            breakdown.append(
                {
                    "name": name,
                    "inputTokens": uu.input_tokens,
                    "outputTokens": uu.output_tokens,
                    "totalTokens": uu.total_tokens,
                    "estimatedCostUsd": round(estimate_cost_usd(model, uu), 6),
                }
            )
    return usage_to_internal_dict(u, model=model, stage_breakdown=breakdown)
