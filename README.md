# Vibejobber

A job-search assistant that helps you maintain a profile, browse a shared job catalog, generate tailored CVs and cover letters using AI agents, and run automated apply pipelines against live postings.

**Stack:** React SPA · Firebase (Auth, Firestore, Storage, Hosting, Functions) · Python Gen2 Cloud Functions · OpenAI

---

## What it does

| Feature | Description |
|---------|-------------|
| **Job discovery** | Ingests postings via Serper (Google Search) and user-pasted URLs into a shared Firestore catalog |
| **Document generation** | LLM agents on Cloud Functions produce tailored CVs and cover letters per job, stored in Cloud Storage |
| **Apply pipeline** | Server-side runner fills forms on live job boards using generated documents and your profile data |
| **Real-time UI** | Firestore `onSnapshot` listeners push status updates live — no polling, no page refresh needed |

---

## Architecture

```
Browser (Vite + React)
  ├── Firebase JS SDK  →  Auth, Firestore, Cloud Storage
  └── fetch (ID token) →  Cloud Functions (Python Gen2)
                              ├── Firestore (read/write)
                              ├── Cloud Storage
                              ├── Serper (job search)
                              └── OpenAI (agents)
```

**Two request paths:**

- **Simple reads/writes** (profile, jobs, documents) go directly from the browser to Firestore via the SDK, with security rules enforcing user scope.
- **Heavy or privileged work** (fetching job URLs, running AI agents, filling forms, calling Serper) goes through a Cloud Function. The browser sends a Firebase ID token in the `Authorization` header; the function verifies it server-side.

---

## How an apply works

1. **Browser sends request** — User clicks "Apply." The SPA POSTs to `apply_to_job` with a Firebase ID token in the Authorization header.
2. **Function reads context** — The Cloud Function verifies the token, then reads the job details, user documents, and previous run history from Firestore.
3. **AI agent pipeline runs** — OpenAI agents generate or refine documents and produce a form-filling plan tailored to the specific job board.
4. **Status written back** — The function writes run status and results to Firestore. The browser's live `onSnapshot` listener updates the UI automatically.

---

## Repository layout

| Path | Responsibility |
|------|----------------|
| `frontend/` | Vite + React + TypeScript UI, Tailwind/shadcn-style components, Firebase client, real-time store |
| `cloud_functions/` | Python Gen2 HTTP handlers: discovery, import, document agents, apply runner |
| `.github/workflows/` | CI/CD — `deploy-main-fe.yml` and `deploy-main-cf.yml` |

The deployable function bundle lives under `cloud_functions/functions/`.

---

## Key design decisions

### Firebase as the integration hub

One platform covers auth, database, storage, hosting, and functions — fewer moving parts for a small team, with built-in real-time support and a CDN-backed SPA. No separate backend service to operate.

### Firestore for live state (`onSnapshot`)

The main app state — jobs, user profile, applications, documents, and apply runs — is synchronized from Firestore `onSnapshot` listeners rather than REST APIs. This means server-side writes (agent runs, status updates) appear in the UI instantly and sync across tabs without any extra plumbing.

### Client vs Function split

Simple CRUD that security rules can express stays in the browser. Functions own Serper calls, outbound HTTP to job boards, long AI agent runs, and form automation. This keeps secrets off the client, avoids CORS issues on third-party career sites, and allows long timeouts independent of browser tab lifetime.

### Stable job IDs from posting URLs

Job catalog documents use a stable ID derived from normalized posting URLs (`job_ids.py`). The same role discovered via search and via a user-pasted link is deduplicated automatically — no separate merge job needed.

### Public IAM + in-function auth

Gen2 Functions need public IAM invocation for CORS preflight to work. Firebase ID tokens are verified inside each handler, keeping one consistent auth pattern across all user-facing endpoints.

### Long-polling Firestore

`initializeFirestore` is configured with `experimentalForceLongPolling: true`. The default WebChannel connection is frequently blocked by privacy browser extensions, causing opaque listener failures. Long polling is the more reliable default for web clients.

---

## Trade-offs

**Firestore reads at scale** — The full job catalog streams to each client on load. This is simple at MVP scale but read costs grow with catalog size. Pagination, server-side filtered queries, or a search service like Algolia would reduce both cost and memory usage.

**Apply timeouts** — Long AI agent runs work on Cloud Functions, but are constrained by function timeout limits and cold-start overhead. Very heavy workloads may eventually need Cloud Run Jobs or a task queue for retries.

**Public function endpoints** — IAM-public URLs rely entirely on correct token verification inside the function. A misconfiguration is higher impact than IAM-only access would be.

**URL fetch / SSRF** — Server-side URL import improves UX but requires ongoing hardening: host allowlists, size limits, and content-type validation. See `import_job_url.py`.

**Monolith functions codebase** — One shared Python package is easier to deploy but produces a larger cold-start artifact than isolated micro-functions per route.

**Custom store vs React Query** — The Firestore-centric store is explicit but bespoke. TanStack Query is available in the tree for incremental adoption if contributors prefer those patterns.

---

## Running tests

**Frontend**

```bash
cd frontend && npm test
```

Vitest + jsdom. Covers store helpers (`jobsFromFirestore`), agent logic, job import, CV import, and markdown preview.

**Cloud Functions**

```bash
cd cloud_functions
pip install -r functions/requirements.txt -r functions/requirements-dev.txt
python -m pytest
```

pytest suite under `cloud_functions/tests/`. Covers job IDs, Serper query builders, import heuristics, usage helpers, and apply traces. A `tests/stubs/agents` directory shadows the conflicting top-level `agents` PyPI package so `usage_helpers` imports stay stable.

---

## Agent quality evaluation

`cloud_functions/functions/evaluation.py` is an offline benchmarking tool — not a production endpoint. It uses a separate, stronger model (default `gpt-4o` via `VIBJOBBER_EVALUATOR_MODEL`) to score agent output against a static realistic benchmark (`SENIOR_BACKEND_BENCHMARK`). Production agents use `VIBJOBBER_AGENT_MODEL` (often `gpt-4o-mini`); the evaluator uses a different model so output isn't graded by the model that wrote it.

**Usage:**

```bash
cd cloud_functions/functions
python evaluation.py
# or: python evaluation.py --draft-file /path/to/output.txt --role cover_letter
```

The script prints a JSON report with scores, strengths, weaknesses, and a `benchmark_ready` flag. Set `OPENAI_API_KEY` in `cloud_functions/.env` before running.

---

## CI / Deploy

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| **Frontend + rules** | Push to `main_fe` or manual dispatch | `npm ci` → `npm test` → `npm run build` → deploys Hosting, Firestore rules, and Storage rules |
| **Cloud Functions** | Push to `main_cf` or manual dispatch | `pip install` → `pytest` → deploys all Python Gen2 functions |

Both workflows use the GitHub Environment **`first env`**. You need:

- `FIREBASE_TOKEN` — from `npx firebase-tools@latest login:ci`
- For the frontend workflow: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MEASUREMENT_ID`, `VITE_FIREBASE_FUNCTIONS_REGION`

`firebase.json` for Hosting lives under `frontend/`. Functions deploy from `cloud_functions/`. The functions workflow creates a throwaway `cloud_functions/venv` that is excluded from the deploy bundle.

---

## Local development

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

Copy `frontend/.env.example` to `frontend/.env` and fill in your Firebase project config.

**Cloud Functions**

```bash
cd cloud_functions
python -m venv venv && source venv/bin/activate
pip install -r functions/requirements.txt
```

Use the Firebase emulators for local testing, or point at a dev Firebase project. Set `OPENAI_API_KEY` (and optionally `SERPER_API_KEY`) in `cloud_functions/.env`.

Align your Firebase project ID, Auth providers (Google / Apple), and security rules with the console before doing end-to-end testing.

---

## Roadmap

1. **Paginated job queries** — Replace the full-catalog subscription with cursor-based or filtered queries; optionally add Algolia or Typesense for search.
2. **Firebase App Check** — Add reCAPTCHA Enterprise / Play Integrity to reduce abuse on callable endpoints and direct Firestore access.
3. **Apply pipeline resilience** — Return the HTTP response immediately and hand off apply work to Cloud Tasks or Pub/Sub for retries and better timeout handling.
4. **Observability** — Sentry or Firebase Performance dashboards, structured logging, and error budgets on the apply pipeline.
5. **Integration tests** — Extend the existing Vitest and pytest suites with tests against the Firebase Emulator Suite for security rules and end-to-end flows.
6. **Cost controls** — Per-user LLM budgets, model routing by tier, and caching of job excerpts where safe.
7. **Rules hardening** — Periodic security rules review, least-privilege Storage paths, and field-level write constraints.
8. **i18n & accessibility** — Internationalization and deeper a11y audits on Radix-based components.

---

## Quick links

| Doc | Content |
|-----|---------|
| [`frontend/README.md`](frontend/README.md) | SPA stack, routing guards, Firebase client, store, env vars, Hosting deploy |
| [`cloud_functions/README.md`](cloud_functions/README.md) | Python functions, endpoints, env secrets, Firestore/Storage touchpoints, deploy |
| [`.github/workflows/`](.github/workflows/) | CI/CD workflow files |