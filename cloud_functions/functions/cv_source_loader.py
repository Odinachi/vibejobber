"""Load user-uploaded source CV from GCS; enforce max page count for PDFs using pypdf."""

from __future__ import annotations

import io
from typing import Any

from google.cloud.storage import Bucket  # type: ignore

MAX_SOURCE_CV_PAGES = 3


def _is_pdf(data: bytes) -> bool:
    return len(data) >= 4 and data[:4] == b"%PDF"


def load_source_cv_text(
    bucket: Any,
    storage_path: str | None,
    *,
    max_pages: int = MAX_SOURCE_CV_PAGES,
    max_chars: int = 50_000,
) -> tuple[str, int, str]:
    """
    Returns (text, page_count, format_note).
    page_count: 0 if unknown, else PDF page count. Text files are treated as 1 page.
    """
    if not storage_path or not str(storage_path).strip():
        return "", 0, "no_upload"

    blob = bucket.blob(str(storage_path))
    if not blob.exists():
        return "", 0, "missing_blob"

    data: bytes = blob.download_as_bytes()
    lower = str(storage_path).lower()
    is_pdf = _is_pdf(data) or lower.endswith(".pdf")
    is_txt = lower.endswith(".txt")

    if is_txt:
        text = data.decode("utf-8", errors="replace").strip()
        return (text[:max_chars], 1, "txt")

    if is_pdf:
        from pypdf import PdfReader  # noqa: PLC0415

        reader = PdfReader(io.BytesIO(data))
        n = len(reader.pages)
        if n > max_pages:
            raise ValueError(
                f"Uploaded CV has {n} pages. Please upload a PDF of at most {max_pages} pages."
            )
        parts: list[str] = []
        for i in range(n):
            page = reader.pages[i]
            parts.append((page.extract_text() or "").strip())
        text = "\n\n".join(p for p in parts if p)
        return (text[:max_chars], n, f"pdf_pages={n}")

    return "", 0, f"unsupported_ext:{lower}"
