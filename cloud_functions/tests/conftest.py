"""Pytest: stub `agents` (openai-agents) first, then add `functions/` to `sys.path`."""

from __future__ import annotations

import sys
from pathlib import Path

# Must precede site-packages: another top-level `agents` (e.g. legacy TF RL) can shadow openai-agents.
_STUB = Path(__file__).resolve().parent / "stubs"
if str(_STUB) not in sys.path:
    sys.path.insert(0, str(_STUB))

_FUN = Path(__file__).resolve().parent.parent / "functions"
if str(_FUN) not in sys.path:
    sys.path.insert(0, str(_FUN))

import import_paths  # noqa: E402

import_paths.setup()
