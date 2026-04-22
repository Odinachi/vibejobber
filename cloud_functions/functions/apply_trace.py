"""Single-line apply pipeline logs (runId, userId, jobId) for Cloud Logging."""

from __future__ import annotations

import logging
from typing import Any, Mapping

_LOG = logging.getLogger("vibjobber.apply")


def apply_trace(
    run_id: str,
    user_id: str,
    job_id: str,
    event: str,
    details: Mapping[str, Any] | None = None,
) -> None:
    """
    One structured line per event so you can filter in Cloud Logging on runId=… and follow the flow.
    Values are truncated to avoid log spam / accidental PII dumps in huge blobs.
    """
    parts: list[str] = [
        f"event={event}",
        f"runId={run_id}",
        f"userId={user_id}",
        f"jobId={job_id}",
    ]
    if details:
        for k, v in details.items():
            if v is None:
                continue
            s = str(v)
            if len(s) > 400:
                s = s[:400] + "…"
            parts.append(f"{k}={s}")
    _LOG.info("apply_trace %s", " ".join(parts))
