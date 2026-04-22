"""
Google Cloud Functions (Gen2) entry module.

Deploy from repository root with `--source=.` and e.g.:
  --entry-point=sync_job_openings
  --entry-point=apply_to_job

Implementation lives in `cloud_functions/gcf.py`.
"""

from cloud_functions.gcf import apply_to_job, sync_job_openings  # noqa: F401

__all__ = ["sync_job_openings", "apply_to_job"]
