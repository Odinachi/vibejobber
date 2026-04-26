# Vibejobber — Frontend

A single-page application for job search, document generation, and automated apply workflows. It talks to Firebase (Auth, Firestore, Storage) for data and real-time state, and to Firebase Cloud Functions for server-side work like discovery, document generation, and the apply pipeline.

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Build / dev server | Vite 5 + `@vitejs/plugin-react-swc` |
| UI | React 18 + TypeScript |
| Routing | React Router v6 (`BrowserRouter`, nested routes under `/app`) |
| Styling | Tailwind CSS + Radix UI primitives (`class-variance-authority`, `tailwind-merge`) |
| Forms | react-hook-form + zod |
| Firebase | Firebase JS v11 — Auth, Firestore, Storage |
| Data (global) | Custom Firestore-backed store (`useSyncExternalStore`) + TanStack React Query available for future use |
| Markdown | react-markdown + remark-gfm / remark-breaks |
| PDFs | pdfjs-dist (text extraction), jspdf (export) |
| Office docs | mammoth (`.docx` → text, used in CV import) |
| Tests | Vitest + Testing Library |

---

## How the app starts

```
index.html
  └── main.tsx
        ├── import "@/lib/firebase"   ← initializes Firebase once (safe under HMR)
        └── <App />
              ├── QueryClientProvider
              ├── AuthProvider
              ├── TooltipProvider + toasters
              └── BrowserRouter → routes
```

`main.tsx` imports `@/lib/firebase` before mounting `App`. This runs `initFirebase()` exactly once — under Vite HMR it reuses `getApp()` if Firebase is already initialized.

If any required `VITE_FIREBASE_*` variables are missing, `firebase.configured` is `false`. Guarded routes detect this and redirect to a setup page rather than crashing.

---

## Routing and access control

All routes are defined in `src/App.tsx`. Protected routes chain three guards in order — a user must pass all three to reach the main app.

| Path | Guard | Purpose |
|------|-------|---------|
| `/` | None | Landing page |
| `/firebase-setup` | None | Shown when Firebase config is missing |
| `/login` | None | Google / Apple sign-in |
| `/complete-profile` | Firebase + Auth | Multi-step onboarding |
| `/app/*` | Firebase + Auth + Profile | Main app shell (all feature routes) |
| `*` | — | 404 |

**Guard components:**

- **`RequireFirebase`** — Checks that Firebase is configured; redirects to `/firebase-setup` if not.
- **`RequireAuth`** — Waits for auth state to resolve; redirects unauthenticated users to `/login`.
- **`RequireProfileSetup`** — After Firestore syncs, checks `profileSetup.completed`; redirects to `/complete-profile` if onboarding is unfinished.

The chain guarantees: configured Firebase → signed-in user → completed onboarding → app shell.

**App routes (all under `/app/*`, all guarded):**

| Path | Screen |
|------|--------|
| `/app` | Dashboard |
| `/app/jobs` | Job catalog |
| `/app/jobs/:id` | Job detail — documents and apply |
| `/app/applications` | Applications board |
| `/app/documents` | Generated documents library |
| `/app/profile` | Profile editor + CV upload |
| `/app/preferences` | Search preferences (roles, locations, salary) |

---

## Firebase client (`src/lib/firebase.ts`)

Reads `VITE_FIREBASE_*` env vars at build time. If `apiKey`, `authDomain`, or `projectId` are missing, exports `configured: false` and null clients — no throw, so the app degrades gracefully.

Firestore is initialized with `experimentalForceLongPolling: true`. This bypasses the default WebChannel transport, which some browser extensions block with `net::ERR_BLOCKED_BY_CLIENT`. Long polling is more reliable for web clients.

Exports a single object: `{ configured, app, auth, db, storage }`.

---

## Authentication (`src/contexts/AuthContext.tsx`)

Subscribes to `onAuthStateChanged` and exposes `user`, `loading`, `configured`, `signInWithGoogle`, `signInWithApple`, and `signOut`.

After a successful sign-in, calls `ensureOAuthUserDoc`: if `users/{uid}` doesn't exist yet, creates it with an empty profile, empty preferences, empty applications, and `profileSetup: { completed: false, currentStep: 1 }`.

When `user` is set, starts `subscribeUserData(uid)` from `store.ts`. On sign-out or missing config, `clearUserData()` resets all local state.

---

## Data layer (`src/lib/store.ts`)

App state is held in a Firestore-backed external store synchronized with React via `useSyncExternalStore` — not Redux, not React Query for the live domains.

**Reading state:**

```ts
const jobs = useStore(s => s.jobs)
const profile = useStore(s => s.profile)
```

**`subscribeUserData(uid)`** registers `onSnapshot` listeners when the user logs in:

| Listener | What it does |
|----------|-------------|
| `jobs` collection | Normalizes raw Firestore docs to `Job[]` via `jobFromFirestore`, sorted by `postedAt` |
| `users/{uid}` | Syncs profile, preferences, applications, dismissed IDs, profile setup; handles edge cases (missing doc, stripping legacy demo data on step 1) |
| `users/{uid}/documents` | Generated CVs and cover letters shown in the UI |
| `users/{uid}/applicationRuns` | Apply pipeline runs; auto-advances application status when a run completes |

Writes (save profile, save document, dismiss job, etc.) are plain functions in `store.ts` that update Firestore and let snapshots refresh the UI.

**Why this over React Query for these domains:** Firestore snapshots are the source of truth. Cloud Functions write server-side fields (run status, artifacts) that the UI must reflect in real time — a polling or invalidation model would add latency and complexity. `onSnapshot` is the natural fit.

Domain types live in `src/lib/types.ts` — `Profile`, `Job`, `Application`, `GeneratedDocument`, `ApplicationRun`, `InternalLlmUsage`, etc.

---

## Cloud Function calls (`src/lib/`)

The browser never holds service secrets. User-facing operations POST to Gen2 HTTPS URLs built from env:

```
https://<VITE_FIREBASE_FUNCTIONS_REGION>-<VITE_FIREBASE_PROJECT_ID>.cloudfunctions.net/<functionName>
```

Every call includes `Authorization: Bearer <Firebase ID token>`. The server verifies the token and handles authorization.

| Module | Function called | What it does |
|--------|----------------|-------------|
| `applyAgent.ts` | `apply_to_job` | Runs the server-side apply pipeline for a given `jobId` |
| `documentAgent.ts` | `generate_job_document` | Generates a tailored CV or cover letter; returns content + LLM usage; the client saves the result to Firestore |
| `jobImport.ts` | `import_job_from_url` | Server fetches a job posting URL and upserts `jobs/{id}`; client manages the pending job UX with session helpers |

`sync_job_openings` (discovery) is an internal/cron endpoint and is not called from the SPA.

---

## Key `lib/` modules

| File | Purpose |
|------|---------|
| `jobsFromFirestore.ts` | `JOBS_COLLECTION` constant and `jobFromFirestore` — defensive mapping from raw Firestore docs to `Job` |
| `profileNormalize.ts` | Coerces remote profile blobs into the `Profile` shape after reads |
| `userDefaults.ts` | Empty profile / preferences templates for new user docs |
| `cvTextImport.ts` | Client-side CV text extraction from plain text, PDF (via pdf.js), and docx (via mammoth) with size limits and sanitization |
| `cvFileImport.ts` | File pick and upload helpers for Storage + profile path updates |
| `pdfPages.ts` | PDF page counting and limits for UX validation |
| `markdownPreview.ts` | Safe rendering helpers for document previews |
| `mockAI.ts` | Dev-only placeholders for AI responses |

---

## UI structure

```
src/
├── pages/            Route-level screens (data composition + layout)
├── components/
│   ├── AppLayout.tsx      Sidebar + outlet for /app/* routes
│   ├── AppSidebar.tsx     Navigation links
│   ├── DocumentEditorDialog.tsx  and other feature components
│   └── ui/            Reusable primitives (Button, Dialog, Form, Table, …)
├── contexts/          AuthContext
├── hooks/             Custom hooks
└── lib/               Firebase, types, store, HTTP helpers (see above)
```

`components/ui/` primitives are aligned with Tailwind tokens defined in `src/index.css`.

---

## Environment variables

Defined at build time via `.env`, `.env.local`, or `.env.production`. Must be prefixed `VITE_` to be included in the client bundle.

| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_FIREBASE_API_KEY` | Yes | Firebase web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Yes | Auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Yes | Project ID (also used in Cloud Functions URL) |
| `VITE_FIREBASE_STORAGE_BUCKET` | Yes | GCS bucket for uploads |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Yes | Sender ID |
| `VITE_FIREBASE_APP_ID` | Yes | App ID |
| `VITE_FIREBASE_MEASUREMENT_ID` | No | Analytics (if enabled) |
| `VITE_FIREBASE_FUNCTIONS_REGION` | No | Defaults to `us-central1` if unset |

Copy `.env.example` → `.env` and paste values from **Firebase Console → Project settings → Your apps → Web app**.

**Never** put Serper keys, OpenAI keys, or internal secrets in `VITE_*` variables — they ship to every browser bundle. Only the Firebase Web API key is public by design.

---

## Scripts

```bash
npm install
npm run dev       # Vite dev server (port 8080)
npm run build     # Production bundle → dist/
npm run preview   # Serve dist/ locally
npm run lint      # ESLint
npm test          # Vitest (all src/**/*.{test,spec}.{ts,tsx})
```

---

## Tests

Config is in `vitest.config.ts` — `environment: "jsdom"`, `@/` aliased to `src/`, setup in `src/test/setup.ts` (includes `matchMedia` stub and other browser API shims).

Tests cover pure and domain logic in `src/lib`:

- `jobsFromFirestore` — Firestore → `Job` mapping
- `userDefaults` and `profileNormalize` — profile shape coercion
- `applyAgent`, `documentAgent`, `jobImport` — URL builders and `fetch` calls (mocked Firebase + `globalThis.fetch`)
- `cvTextImport` — file extraction paths (text, PDF, docx)
- `markdownPreview` — safe rendering helpers

Run in watch mode during development: `npx vitest`

---

## Deploying

Firebase Hosting is configured in `firebase.json` (`public: "dist"`, SPA rewrite to `index.html`). `.firebaserc` pins the default project.

```bash
# Make sure .env (or CI secrets) has production VITE_* values, then:
npm run build
npx firebase-tools deploy --only hosting --project <your-project-id>
```

The deployed site must use the **same Firebase project** as Firestore rules and Cloud Functions — Auth tokens and data paths must align.

To deploy Firestore and Storage rules separately:

```bash
npx firebase-tools deploy --only firestore:rules,storage
```

The CI workflow (`.github/workflows/deploy-main-fe.yml`) handles this automatically on pushes to `main_fe`: it runs `npm test`, builds, and deploys hosting + rules using `FIREBASE_TOKEN` from GitHub environment secrets.

---

## Related documentation

- **Cloud Functions** (HTTP contracts, env vars, deploy): [`../cloud_functions/README.md`](../cloud_functions/README.md)
- **Project overview** (architecture, design decisions, trade-offs): [`../README.md`](../README.md)