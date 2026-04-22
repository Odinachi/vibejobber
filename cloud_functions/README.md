# Firebase Cloud Functions (Python)

All code lives under **`functions/`**, as required by the Firebase CLI (`firebase.json` → `"source": "functions"`).

## What gets deployed

| Function | Description |
|----------|-------------|
| `sync_job_openings` | HTTP: reads all users, aggregates search queries (desired roles, headline, job titles from saved applications), runs Serper (≤10 results per query), upserts into `jobs/{dedupeId}`. |
| `apply_to_job` | HTTP POST `{"userId","jobId"}`: runs the `vibejobber` agent pipeline, uploads PDFs to Storage, writes `users/{uid}/applicationRuns/{runId}`. |

## Vendoring `backend/vibejobber`

The deploy bundle only includes the **`functions/`** directory. The shared agent code must be present as **`functions/vibejobber`** before deploy (that tree is **gitignored**). From the **`cloud_functions/`** directory you can sync with:

```bash
rm -rf functions/vibejobber
cp -R ../backend/vibejobber functions/vibejobber
```

For local **unit imports** without copying, `main.py` and related modules add the monorepo `backend/` path on `sys.path` so `vibejobber` can be imported from `../backend/vibejobber` when the vendored copy is absent.

## Environment (set in Firebase console or `firebase functions:config` legacy)

- `SERPER_API_KEY` — job discovery
- `OPENAI_API_KEY` — agents
- `VIBJOBBER_AGENT_MODEL` — optional, default `gpt-4o-mini`
- `INTERNAL_FUNCTION_SECRET` — if set, require header `X-Internal-Secret` on both HTTP functions

## Deploy

The Firebase CLI expects a Python **3.12** virtualenv at **`functions/venv`** (name matters: not `.venv`). One-time setup from `cloud_functions/functions/`:

```bash
python3.12 -m venv venv
./venv/bin/pip install -r requirements.txt
```

**macOS: keep Python’s venv the same “slice” as the `firebase` binary.** The deploy step runs local Python from `functions/venv`; `cryptography` / `cffi` must match that process’s arch (`x86_64` or `arm64`).

- **`ImportError: ... _cffi_backend ... have 'arm64', need 'x86_64'`** — the venv was built for **arm64**, but Firebase’s Python is **x86_64** (e.g. Rosetta). Recreate the venv as **x86_64** (use your `python3.12` path):

```bash
# from functions/
rm -rf venv
arch -x86_64 python3.12 -m venv venv
arch -x86_64 ./venv/bin/pip install -r requirements.txt
```

Then from **`cloud_functions/`** run a normal `firebase deploy --only functions` (no `arch` on `firebase` unless you know the CLI is universal).

- **`arch: ... firebase: Bad CPU type in executable` when you run `arch -arm64 firebase ...`** — your `firebase` CLI is **x86_64 only**, so you **must not** wrap it with `arch -arm64`. Use the **x86_64** venv above so deploy matches, **or** reinstall **firebase-tools** using an **arm64** Node and then you can use an **arm64** venv: `arch -arm64 python3.12 -m venv venv` (check with `file $(which firebase)` and `file $(which node)`).

Runtime service account needs **Firestore** + **default Cloud Storage bucket** (PDF uploads).

## Relevant client rules

- `frontend/firestore.rules` — users can read `applicationRuns`, not write
- `frontend/storage.rules` — users can read their `users/{uid}/**` objects
