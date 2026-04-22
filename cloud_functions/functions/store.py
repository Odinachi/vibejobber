from typing import Any

from models import JobPosting


class JobStore:
    """In-memory job list (same role as notebook ``JOB_POSTINGS``)."""

    def __init__(self) -> None:
        self._postings: list[dict[str, Any]] = []

    @property
    def postings(self) -> list[dict[str, Any]]:
        return self._postings

    def clear(self) -> None:
        self._postings.clear()

    def replace_all(self, rows: list[JobPosting]) -> None:
        self._postings = [dict(r) for r in rows]

    def append(self, row: JobPosting) -> None:
        self._postings.append(dict(row))

    def __len__(self) -> int:
        return len(self._postings)
