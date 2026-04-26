# Vibejobber — Cloud Functions (Python)

Firebase Cloud Functions Gen2 (Python 3.12) that power server-side job discovery, URL import, document generation, and the apply pipeline. Functions run with the project's service account via the Firebase Admin SDK and read/write Firestore and Cloud Storage directly.

There is no separate Cloud Run backend — all production traffic for these features uses HTTPS function URLs.

---

## How it fits together

```
Browser / Scheduler
       │
       ▼
  main.py  ──────────────────────────────────────────────────────┐
  (HTTP routing, auth, CORS, JSON responses)                      │
       │                                                           │
       ├── discovery.py       →  Firestore (users, jobs)          │
       │                      →  Serper API                       │
       │                                                           │
       ├── import_job_url.py  →  Firestore (jobs)                 │
       │                                                           │
       ├── document_agents.py →  Firestore (users, jobs)          │
       │                      →  Cloud Storage (source CV)         │
       │                      →  OpenAI                           │
       │                                                           │
       └── apply_runner.py    →  Firestore (users, jobs, runs)    │
                              →  Cloud Storage (artifacts)         │
                              →  OpenAI                           │
                              →  Cloud Logging                    │
```

**Auth model:** Browser-facing functions use `invoker="public"` at the IAM layer (required for CORS preflight to work), with Firebase ID token verification enforced inside each handler. Internal/cron callers use `X-Internal-Secret` instead.

---

## Repository layout

| Path | Role |
|------|------|
| `firebase.json` | Declares the Python 3.12 functions codebase (`source: functions`) |
| `.firebaserc` | Default Firebase project ID (`vibejobber`) |
| `functions/main.py` | HTTP entrypoints only — routing, auth, CORS, JSON responses |
| `functions/import_paths.py` | Fixes `sys.path` for local and deployed environments |
| `functions/discovery.py` | Reads user preferences → builds Serper queries → merges results into `jobs` |
| `functions/serper.py` | Serper Google Search API client |
| `functions/firestore_jobs.py` | Upserts Serper organic results into the global `jobs` collection |
| `functions/job_ids.py` | URL normalization and canonical 16-char job ID from posting URL |
| `functions/import_job_url.py` | Fetches a user-supplied URL, validates it's a job posting, upserts `jobs/{id}` |
| `functions/document_agents.py` | Generates tailored CV / cover letter text via OpenAI agents |
| `functions/apply_runner.py` | Full apply pipeline: load docs, build PDFs, run form-fill agent, upload artifacts, write run record |
| `functions/apply_trace.py` | Structured Cloud Logging lines for apply debugging |
| `functions/usage_helpers.py` | Merges LLM token usage across agent steps; optional USD cost estimate |
| `functions/requirements.txt` | Python dependencies |

Supporting modules (`artifacts.py`, `pipeline.py`, `store.py`, `vibe_agents.py`, `cv_source_loader.py`) are imported by the above.

---

## Functions reference

Function URLs follow the pattern:
```
https://<REGION>-<PROJECT_ID>.cloudfunctions.net/<function_name>
```
The default region is `us-central1`. The web app builds these URLs from `VITE_FIREBASE_FUNCTIONS_REGION` and `VITE_FIREBASE_PROJECT_ID`.

---

### `sync_job_openings`

Batch job discovery. Reads desired roles from all user profiles, runs Serper searches (up to 10 organic results per query), and merges results into the shared `jobs` collection with URL-based deduplication.

**Auth:** Not marked `invoker="public"`. If `INTERNAL_FUNCTION_SECRET` is set, every request must include `X-Internal-Secret: <value>` — otherwise the request is rejected. Typically called from a scheduler or admin tooling, not from the browser.

**Request:** `GET` or `POST` (no body required for standard discovery runs).

**Firestore reads:** `users` collection — `preferences.desiredRoles`, `profile.headline`, and job titles from linked applications.

**Firestore writes:** Upserts into `jobs` via `merge_jobs_from_serper_organic`.

**Requires:** `SERPER_API_KEY`.

**Response:**
```json
{
  "ok": true,
  "queries_run": 12,
  "organic_merged": 48,
  "skipped_links": 3,
  "queries": ["senior backend engineer london", "..."]
}
```

---

### `apply_to_job`

Runs the full apply pipeline for one user and one job. Loads the saved tailored CV and cover letter, builds PDFs, runs agents against the live job posting, uploads output artifacts to Storage, and records the run status on `users/{uid}/applicationRuns/{runId}`.

**Auth:**
- **User (browser):** `POST` with `Authorization: Bearer <Firebase ID token>`. The `uid` from the token must match the user whose documents are being used. Requires existing tailored CV and cover letter in Firestore for the given `jobId`.
- **Internal:** `X-Internal-Secret` header matching `INTERNAL_FUNCTION_SECRET`. Body must include `userId` and `jobId`. The pre-existing docs check is skipped for trusted automation.

**Limits:** `timeout_sec=3600`, `memory=512 MiB`.

**Request body:**
```json
{ "jobId": "abc123def456" }
```
For internal calls: `{ "userId": "uid_here", "jobId": "abc123def456" }`

**Response:**
```json
{
  "ok": true,
  "runId": "...",
  "artifactUris": ["gs://..."],
  "internalLlm": { "input_tokens": 4200, "output_tokens": 810, "estimated_usd": 0.003 }
}
```

**Relevant env vars:**

| Variable | Default | Purpose |
|----------|---------|---------|
| `OPENAI_API_KEY` | — | Required |
| `VIBJOBBER_AGENT_MODEL` | `gpt-4o-mini` | Model used for agent steps |
| `VIBJOBBER_AGENT_STEP_TIMEOUT_SEC` | `300` | Timeout per agent step |

---

### `import_job_from_url`

User-initiated job import. Given a public job posting URL, the server fetches the page (using `curl_cffi` with Chrome TLS impersonation where available), validates that it looks like a single job posting, extracts structured fields (JSON-LD `JobPosting`, main content, section heuristics), and creates or skips `jobs/{canonical_job_id}`.

The job ID is derived from the normalized posting URL — the same scheme used by discovery — so importing a URL that was also found via search doesn't create a duplicate.

**Auth:** `Authorization: Bearer <Firebase ID token>` required. No anonymous imports.

**Request body:**
```json
{ "url": "https://jobs.example.com/posting/12345" }
```

**Firestore:** Reads `jobs/{id}` for existence; writes a new doc with `source: "user_link"` if not found.

**Response:**
```json
{ "ok": true, "jobId": "abc123def456", "existing": false }
```
On failure: `{ "error": "not a job page" }` or `{ "error": "fetch failed (403)" }`.

**Safety measures in `import_job_url.py`:**
- Host and IP denylist to prevent SSRF
- Redirect loop detection
- Visible-text phrase scoring, JSON-LD / `og:type` checks to reject non-job pages
- HTML-only acceptance (no PDFs, JSON feeds, etc.)
- Size limits on fetched content

---

### `generate_job_document`

Generates a tailored CV or cover letter for a specific job using OpenAI agents. Reads the user profile from Firestore and optionally loads a source CV from Cloud Storage, then streams the result back to the client. The client is responsible for saving the returned content into `users/{uid}/documents`.

**Auth:** `Authorization: Bearer <Firebase ID token>` required.

**Limits:** `timeout_sec=600`, `memory=512 MiB`.

**Request body:**
```json
{ "jobId": "abc123def456", "kind": "cv" }
```
`kind` is `"cv"` or `"cover_letter"`.

**Firestore reads:** `users/{uid}` (profile, `sourceCvStoragePath`) and `jobs/{jobId}`.

**Response:**
```json
{
  "ok": true,
  "content": "Generated CV text...",
  "title": "Senior Backend Engineer — Acme Corp",
  "internalLlm": { "input_tokens": 3100, "output_tokens": 920, "estimated_usd": 0.002 }
}
```

**Relevant env vars:**

| Variable | Default | Purpose |
|----------|---------|---------|
| `OPENAI_API_KEY` | — | Required |
| `VIBJOBBER_AGENT_MODEL` | `gpt-4o-mini` | Model for generation |
| `VIBJOBBER_DOC_AGENT_TIMEOUT_SEC` | `300` | Agent run timeout |
| `VIBJOBBER_PRICE_IN_PER_TOKEN` | — | Optional: override input token price for cost estimates |
| `VIBJOBBER_PRICE_OUT_PER_TOKEN` | — | Optional: override output token price for cost estimates |

---

## Firestore structure (overview)

| Collection / path | Written by | Notes |
|-------------------|-----------|-------|
| `jobs/{jobId}` | `sync_job_openings`, `import_job_from_url` | Global catalog; doc ID = canonical job ID from posting URL |
| `users/{uid}` | Client (profile, prefs, docs) | Functions read profile and `sourceCvStoragePath` |
| `users/{uid}/applicationRuns/{runId}` | `apply_to_job` | Run status, artifact metadata, timestamps |

Field names are defined by merge logic in `firestore_jobs.py`, `apply_runner.py`, and `import_job_url.py`.

---

## Environment variables and secrets

Set these in **Firebase Console → Functions → configuration** or via `firebase functions:secrets:set`. Never commit them to git.

| Variable | Required | Used by | Notes |
|----------|----------|---------|-------|
| `SERPER_API_KEY` | Yes (for discovery) | `serper.py` | Google Search via Serper |
| `OPENAI_API_KEY` | Yes (for LLM features) | OpenAI / agents | Apply pipeline, document generation |
| `INTERNAL_FUNCTION_SECRET` | Recommended in prod | `main.py` | Protects `sync_job_openings` and internal apply calls |
| `VIBJOBBER_AGENT_MODEL` | No | `apply_runner.py`, `document_agents.py` | Defaults to `gpt-4o-mini` |
| `VIBJOBBER_AGENT_STEP_TIMEOUT_SEC` | No | `apply_runner.py` | Defaults to `300` |
| `VIBJOBBER_DOC_AGENT_TIMEOUT_SEC` | No | `document_agents.py` | Defaults to `300` |
| `VIBJOBBER_PRICE_IN_PER_TOKEN` | No | `usage_helpers.py` | For internal cost estimates only |
| `VIBJOBBER_PRICE_OUT_PER_TOKEN` | No | `usage_helpers.py` | For internal cost estimates only |
| `OUTPUT_DIR` | No | `config.py` | Temp/output path override (mostly local) |

---

## Deploying

All deploy commands should be run from the **`cloud_functions/`** directory (the one containing `firebase.json`).

### Deploy everything

```bash
cd cloud_functions
npx --yes firebase-tools@latest deploy --only functions --project vibejobber --non-interactive
```

### Deploy a single function (faster for small changes)

```bash
npx --yes firebase-tools@latest deploy --only functions:apply_to_job --project vibejobber --non-interactive
```

If `vibejobber` is already the default project in `.firebaserc`, you can omit `--project vibejobber`.

After changing `functions/requirements.txt`, always redeploy so Cloud Build reinstalls dependencies.

**Runtime config (API keys, secrets, timeouts) is not part of the deploy command.** Set or rotate those in the Firebase console or via `firebase functions:secrets:set`.

### CI (GitHub Actions)

The workflow `.github/workflows/deploy-main-cf.yml` triggers on pushes to `main_cf` (and manual dispatch). It:

1. Creates a virtualenv, installs `requirements.txt` + `requirements-dev.txt`, and runs `pytest`.
2. Deploys using `FIREBASE_TOKEN`: `npx firebase-tools@latest deploy --only functions --project vibejobber --non-interactive`.

To enable CI deploys, generate a token and add it to your GitHub environment secrets:

```bash
npx --yes firebase-tools@latest login:ci
```

Paste the printed token into your repository or environment secrets as `FIREBASE_TOKEN`. Never commit it.

---

## Local development

```bash
cd cloud_functions
python -m venv venv && source venv/bin/activate
pip install -r functions/requirements.txt
```

For local HTTP testing, use the Firebase emulators:

```bash
firebase emulators:start
```

For Python-only checks, run with `PYTHONPATH=functions`. Some modules expect `import_paths.setup()` (called in `main.py`) to have run first.

Set `OPENAI_API_KEY` and optionally `SERPER_API_KEY` in `cloud_functions/.env` for local runs.

---

## Running tests

```bash
cd cloud_functions
pip install -r functions/requirements.txt -r functions/requirements-dev.txt
python -m pytest
```

**How the test suite is structured:**

The `tests/conftest.py` prepends `tests/stubs` to `sys.path` before anything else. This ensures a minimal `agents` stub (compatible with `openai-agents`) takes priority over any top-level `agents` package in your environment — keeping `usage_helpers` imports stable without needing a full OpenAI connection.

**Test files:**

| File | Covers |
|------|--------|
| `test_job_ids.py` | URL normalization, canonical ID generation, tag handling |
| `test_serper.py` | `short_job_id`, `build_job_search_query` |
| `test_import_job_url.py` | HTML validation, `build_imported_job_fields` (no network) |
| `test_import_job_url_more.py` | Section scoring, hostname/URL heuristics, org/location maps, merge helpers |
| `test_apply_trace.py` | Structured log line format |
| `test_usage_helpers.py` | Usage merge, cost calculation, internal dict shape |

**Optional coverage report:**

```bash
python -m pytest --cov=functions --cov-report=term-missing
```

---

## Observability

**Cloud Logging:** Filter by logger name to narrow down issues:
- `vibjobber.apply.http` — apply pipeline
- `vibjobber.import_job.http` — URL import
- `vibjobber.documents.http` — document generation
- Filter by `runId=<value>` for per-run apply traces

**Errors:** Handlers catch broadly and return `500` with a JSON `error` field. Check Cloud Logging for full stack traces.

---

## Security checklist

- **Verify ID tokens** on every user-facing call. `import_job_from_url`, `generate_job_document`, and the user path of `apply_to_job` all require a valid Firebase ID token — do not remove this check.
- **Set `INTERNAL_FUNCTION_SECRET`** in production to protect `sync_job_openings` and the internal apply path. Without it, anyone who knows the function URL can trigger discovery.
- **Rotate keys immediately** if `SERPER_API_KEY` or `OPENAI_API_KEY` is exposed. Scope IAM so only the Functions runtime service account can access attached secrets.
- **SSRF mitigations** in `import_job_url.py` (host/IP denylist, HTML-only, size limits, redirect checks) must be kept up to date as new job board patterns emerge.

---

## Frontend integration

The web app constructs function base URLs from two env vars:

```
https://<VITE_FIREBASE_FUNCTIONS_REGION>-<VITE_FIREBASE_PROJECT_ID>.cloudfunctions.net
```

Keep the region and project ID in sync with where these functions are deployed. Relevant frontend files: `src/lib/applyAgent.ts`, `jobImport.ts`, `documentAgent.ts`.