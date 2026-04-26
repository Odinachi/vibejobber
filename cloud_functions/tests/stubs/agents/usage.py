"""
Minimal `Usage` compatible with `usage_helpers` (add / token fields).
Does not need to match the full openai-agents `Usage` implementation.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    requests: int = 0

    def add(self, other: Any) -> None:
        """Merge another Usage or any object with token int attributes (OpenAI usage-like)."""
        if isinstance(other, Usage):
            self.input_tokens += int(other.input_tokens or 0)
            self.output_tokens += int(other.output_tokens or 0)
            self.total_tokens += int(other.total_tokens or 0)
            self.requests += int(other.requests or 0)
        else:
            self.input_tokens += int(getattr(other, "input_tokens", 0) or 0)
            self.output_tokens += int(getattr(other, "output_tokens", 0) or 0)
            self.total_tokens += int(getattr(other, "total_tokens", 0) or 0)
            r = int(getattr(other, "requests", 0) or 0)
            if r:
                self.requests += r
