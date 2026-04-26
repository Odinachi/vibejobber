from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class RunResult:
    """Subset of `agents.result.RunResult` used by `usage_helpers.usage_from_result`."""

    raw_responses: list[Any] = field(default_factory=list)
