# Firebase Cloud Functions (Python)

All code lives under **`functions/`**, as required by the Firebase CLI (`firebase.json` → `"source": "functions"`).

## What gets deployed

| Function | Description |
|----------|-------------|
| `sync_job_openings` | HTTP: reads all users, aggregates search queries (desired roles, headline, job titles from saved applications), runs Serper (≤10 results per query), upserts into `jobs/{dedupeId}`. |
| `apply_to_job` | HTTP POST `{"userId","jobId"}`: runs the `vibejobber` agent pipeline, uploads PDFs to Storage, writes `users/{uid}/applicationRuns/{runId}`. |

## Vendoring `backend/vibejobber`

The deploy bundle only includes the **`functions/`** directory. The shared agent code must be copied in before deploy.

- **`prepush.sh`** (also wired as Firebase **`predeploy`**) runs:
  - `cp -R ../backend/vibejobber functions/vibejobber`
- The copy is **gitignored** — run `sh prepush.sh` locally before `firebase deploy` if you are not using `firebase deploy` (the CLI runs predeploy automatically).
- For local **unit imports** without copying, `main.py` / `discovery.py` / `apply_runner.py` fall back to `../../backend` on `sys.path` (repo layout: `cloud_functions/functions/*.py` → parent² = repository root).

## Environment (set in Firebase console or `firebase functions:config` legacy)

- `SERPER_API_KEY` — job discovery
- `OPENAI_API_KEY` — agents
- `VIBJOBBER_AGENT_MODEL` — optional, default `gpt-4o-mini`
- `INTERNAL_FUNCTION_SECRET` — if set, require header `X-Internal-Secret` on both HTTP functions

## Deploy

From the **`cloud_functions/`** directory (where `firebase.json` lives):

```bash
sh prepush.sh   # optional: firebase predeploy also runs this
firebase deploy --only functions
```

Runtime service account needs **Firestore** + **default Cloud Storage bucket** (PDF uploads).

## Relevant client rules

- `frontend/firestore.rules` — users can read `applicationRuns`, not write
- `frontend/storage.rules` — users can read their `users/{uid}/**` objects
