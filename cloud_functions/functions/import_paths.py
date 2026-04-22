"""
Put `vibejobber` on `sys.path`: same-directory vendor, or monorepo `backend/`.
In Cloud Run the bundle is only this folder under `/workspace` — then we add nothing.
"""

from __future__ import annotations

import sys
from pathlib import Path

_FUN = Path(__file__).resolve().parent


def setup() -> None:
    if (_FUN / "vibejobber").is_dir():
        s = str(_FUN)
        if s not in sys.path:
            sys.path.insert(0, s)
        return
    cur: Path = _FUN
    for _ in range(8):
        backend = cur / "backend"
        if (backend / "vibejobber").is_dir():
            s = str(backend)
            if s not in sys.path:
                sys.path.insert(0, s)
            return
        if cur == cur.parent:
            break
        cur = cur.parent
