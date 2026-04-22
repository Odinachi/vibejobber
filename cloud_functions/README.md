# Vibejobber Cloud Functions (Python, Gen2)

Two HTTP functions live in `gcf.py`:

| Entry point | Purpose |
|-------------|---------|
| `sync_job_openings` | Scans all `users/*` for `preferences.desiredRoles`, `profile.headline`, and titles from `applications[].jobId` → loads each `jobs/{jobId}` title. De-duplicates query strings, runs **Serper** (max **10** organic hits per query), upserts into global `jobs/{id}` with **`id = sha256(normalized_apply_url)[:16]`** so the same posting is never stored twice. |
| `apply_to_job` | **POST** JSON `{ "userId": "<uid>", "jobId": "<jobs doc id>" }`. Loads profile + job, runs the existing **OpenAI Agents** pipeline (`fetch` → cover → CV → form plan), uploads **PDFs** to **Storage** at `users/{uid}/applicationRuns/{runId}/cv.pdf` and `cover_letter.pdf`, and appends **status** transitions on `users/{uid}/applicationRuns/{runId}` (`status`, `statusHistory[]`, `agentNotes`, GCS URIs). |

## Environment variables

| Variable | Used by |
|----------|---------|
| `SERPER_API_KEY` | Serper Google search (required for discovery) |
| `OPENAI_API_KEY` | Agents SDK (required for apply) |
| `VIBJOBBER_AGENT_MODEL` | Optional, default `gpt-4o-mini` |
| `INTERNAL_FUNCTION_SECRET` | If set, callers must send header `X-Internal-Secret` with the same value |

## Deploy (repository root)

Python path must include `backend/` (already done in `gcf.py`). Deploy **from repo root** so both `cloud_functions/` and `backend/vibejobber/` are uploaded.

```bash
cd /path/to/vibejobber

gcloud functions deploy sync_job_openings \
  --gen2 --runtime=python312 --region=us-central1 --source=. \
  --entry-point=sync_job_openings --trigger-http \
  --run-service-account=YOUR_RUNTIME_SA@PROJECT.iam.gserviceaccount.com \
  --set-env-vars=SERPER_API_KEY=...,OPENAI_API_KEY=...,VIBJOBBER_AGENT_MODEL=gpt-4o-mini

gcloud functions deploy apply_to_job \
  --gen2 --runtime=python312 --region=us-central1 --source=. \
  --entry-point=apply_to_job --trigger-http \
  --set-env-vars=OPENAI_API_KEY=...,VIBJOBBER_AGENT_MODEL=gpt-4o-mini \
  --set-env-vars=SERPER_API_KEY=...
```

Grant the runtime service account:

- **Firestore**: `roles/datastore.user`
- **Storage** (default bucket): `roles/storage.objectAdmin` (or a tighter custom role for `users/**` uploads)

Use `.gcloudignore` at repo root to exclude `node_modules`, `.venv`, etc.

## Firestore / Storage rules

- `frontend/firestore.rules` — users may **read** their own `applicationRuns`; only the Admin SDK (this function) **writes**.
- `frontend/storage.rules` — users may **read** `users/{theirUid}/**`; writes are server-side only.

## Requirements file

`cloud_functions/requirements.txt` lists runtime deps. **Also** install everything from `backend/requirements.txt` that `vibejobber` imports, or merge both into one file used at deploy time. Minimum overlap is already covered in `cloud_functions/requirements.txt`; if imports fail, add missing packages from `backend/requirements.txt`.
