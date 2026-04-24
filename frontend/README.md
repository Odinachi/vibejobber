# Vibejobber — Frontend

Single-page application for **job search, matching, tailored documents, and apply workflows**. It talks to **Firebase** (Auth, Firestore, Storage) for data and auth, and to **Firebase Cloud Functions** (Gen2 HTTP) for server-side discovery import, document generation, and the apply pipeline.

---

## Tech stack

| Layer | Choice |
|--------|--------|
| Build / dev server | **Vite 5** (`vite`, `@vitejs/plugin-react-swc`) |
| UI | **React 18** + **TypeScript** |
| Routing | **React Router v6** (`BrowserRouter`, nested routes under `/app`) |
| Server cache (global) | **TanStack React Query** — `QueryClientProvider` wraps the app (available for future queries; much of the live data uses the custom Firestore store instead) |
| Styling | **Tailwind CSS** + **shadcn/ui**-style primitives (**Radix UI** primitives, `class-variance-authority`, `tailwind-merge`) |
| Forms | **react-hook-form** + **zod** (`@hookform/resolvers`) |
| Auth & backend SDK | **Firebase JS v11** — `firebase/app`, `auth`, `firestore`, `storage` |
| Markdown | **react-markdown** + **remark-gfm** / **remark-breaks** |
| PDFs (client) | **pdfjs-dist** (text extraction / page limits), **jspdf** (export where used) |
| Office | **mammoth** (`.docx` → HTML/text paths in CV import) |
| Tests | **Vitest** + **Testing Library** |

The project root under `src/` separates **pages**, **components** (app chrome + feature UI), **`components/ui`** (design system), **`contexts`**, **`hooks`**, and **`lib`** (Firebase, domain types, Firestore sync, HTTP helpers).

---

## Application bootstrap

```text
index.html
  └── main.tsx
        ├── import "@/lib/firebase"   ← side-effect: initializes Firebase once
        └── <App />
```

1. **`main.tsx`** mounts React on `#root` and imports **`@/lib/firebase`** before **`App`**. That import runs **`initFirebase()`** exactly once (safe under Vite HMR: reuses `getApp()` if already initialized).
2. **`App.tsx`** wraps the tree with **`QueryClientProvider`**, **`AuthProvider`**, **`TooltipProvider`**, toasters, and **`BrowserRouter`**, then declares all **routes**.

If `VITE_FIREBASE_*` variables are missing, `firebase.configured` is `false`; guarded routes show setup/login flows instead of touching Firestore.

---

## Routing and access control

Routes are defined in **`src/App.tsx`**.

| Path | Guard chain | Purpose |
|------|----------------|----------|
| `/` | None | Marketing / landing (`Index`). |
| `/firebase-setup` | None | Explains missing Firebase web config (`FirebaseSetupPage`). |
| `/login` | None | Google / Apple sign-in (`LoginPage`). |
| `/complete-profile` | `RequireFirebase` → `RequireAuth` | Multi-step onboarding until `profileSetup.completed` (`CompleteProfilePage`). |
| `/app/*` | `RequireFirebase` → `RequireAuth` → **`RequireProfileSetup`** | Main shell (`AppLayout`) with nested routes. |
| `/app` (index) | (same) | Dashboard. |
| `/app/jobs` | (same) | Job catalog (`JobsList`). |
| `/app/jobs/:id` | (same) | Single job + documents + apply (`JobDetail`). |
| `/app/applications` | (same) | Applications board. |
| `/app/documents` | (same) | Generated documents library. |
| `/app/profile` | (same) | Profile editor + CV upload. |
| `/app/preferences` | (same) | Search preferences (roles, locations, modes, salary). |
| `*` | — | 404 (`NotFound`). |

### Guard components

- **`RequireFirebase`** — Ensures Firebase web config is present; otherwise redirects to **`/firebase-setup`**.
- **`RequireAuth`** — Waits for auth to finish loading; if unauthenticated, redirects to **`/login`**.
- **`RequireProfileSetup`** — After Firestore has synced (`firestoreSynced`), if **`profileSetup.completed`** is false, redirects to **`/complete-profile`**. Otherwise renders children (main app).

This guarantees: **configured Firebase → signed-in user → completed onboarding → app shell**.

---

## Firebase client (`src/lib/firebase.ts`)

- Reads **`import.meta.env.VITE_FIREBASE_*`** (see **Environment** below).
- If `apiKey`, `authDomain`, and `projectId` are missing, exports **`configured: false`** and null clients (no throw).
- **`initializeFirestore`** is called with **`experimentalForceLongPolling: true`** so Firestore avoids the default WebChannel transport, which some browser extensions block (`net::ERR_BLOCKED_BY_CLIENT` on listen channels).
- Exports a single **`firebase`** object: `{ configured, app, auth, db, storage }`.

---

## Authentication (`src/contexts/AuthContext.tsx`)

- Subscribes to **`onAuthStateChanged`** and exposes **`user`**, **`loading`**, **`configured`**, and **`signInWithGoogle` / `signInWithApple` / `signOut`**.
- After **Google** or **Apple** popup sign-in, calls **`ensureOAuthUserDoc`**: if **`users/{uid}`** does not exist, creates it with **`emptyProfile`**, **`emptyPreferences`**, empty **`applications`**, **`dismissedJobIds`**, and **`profileSetup: { completed: false, currentStep: 1 }`**.
- When **`user`** is set, starts **`subscribeUserData(uid)`** from **`store.ts`**; on sign-out or missing config, **`clearUserData()`** resets local state.

---

## Client data layer (`src/lib/store.ts`)

The app uses a **Firestore-backed external store** (not Redux) synchronized with React via **`useSyncExternalStore`**.

### Pattern

- **`useStore(selector)`** — subscribe to a slice of global **`State`** (profile, preferences, jobs, applications, documents, application runs, profile setup, `firestoreSynced`).
- **`subscribeUserData(uid)`** — registers **`onSnapshot`** listeners when the user logs in:
  - Top-level **`jobs`** collection → normalized **`Job[]`** via **`jobFromFirestore`** (`jobsFromFirestore.ts`), sorted by `postedAt`.
  - **`users/{uid}`** → profile, preferences, applications, dismissed IDs, profile setup; merges into state; may **`setDoc`** / **`updateDoc`** for edge cases (missing user doc, stripping legacy demo profile on step 1).
  - **`users/{uid}/documents`** → generated CV / cover letter docs used in the UI.
  - **`users/{uid}/applicationRuns`** → server apply pipeline runs; includes logic to advance application status when a run completes successfully.

Writes (save profile, save document, dismiss job, etc.) are implemented as exported functions in **`store.ts`** that update Firestore and rely on snapshots to refresh the UI.

### Why this design

- **One source of truth** in Firestore with **real-time updates** across tabs and after Cloud Functions write server-side fields.
- **Simple selectors** without boilerplate for every field; components stay thin.

Domain shapes live in **`src/lib/types.ts`** (`Profile`, `Job`, `Application`, `GeneratedDocument`, `ApplicationRun`, `InternalLlmUsage`, etc.).

---

## HTTP calls to Cloud Functions

The browser never holds service secrets. User-facing operations call Gen2 URLs built from env:

`https://<VITE_FIREBASE_FUNCTIONS_REGION>-<VITE_FIREBASE_PROJECT_ID>.cloudfunctions.net/<functionName>`

| Module | Function | Purpose |
|--------|----------|---------|
| **`lib/applyAgent.ts`** | `apply_to_job` | POST with **`Authorization: Bearer <ID token>`** and `{ jobId }` — runs server apply pipeline. |
| **`lib/documentAgent.ts`** | `generate_job_document` | POST with Bearer token and `{ jobId, kind: "cv" \| "cover_letter" }` — returns generated markdown/text + internal LLM usage; **client** persists to Firestore documents as designed. |
| **`lib/jobImport.ts`** | `import_job_from_url` | POST with Bearer token and `{ url }` — server fetches posting and upserts **`jobs/{id}`**; client uses session helpers for pending job UX. |

Discovery (**`sync_job_openings`**) is intended for cron/internal callers (secret header on the server), not typical SPA flows.

---

## Notable `lib/` modules

| File | Role |
|------|------|
| **`jobsFromFirestore.ts`** | **`JOBS_COLLECTION`** name and **`jobFromFirestore`** — defensive mapping from raw Firestore documents to **`Job`**. |
| **`profileNormalize.ts`** | Coerces remote profile blobs into the **`Profile`** shape after reads. |
| **`userDefaults.ts`** | Empty profile / preferences templates for new users. |
| **`cvTextImport.ts`** | Client-side CV text extraction from uploads (plain text, PDF via pdf.js, docx via mammoth) with limits and sanitization. |
| **`cvFileImport.ts`** | File pick / upload helpers toward Storage + profile path updates. |
| **`pdfPages.ts`** | PDF page counting / limits for UX and validation. |
| **`markdownPreview.ts`** | Safe rendering helpers for document previews. |
| **`mockAI.ts`** | Local / dev placeholders where applicable (see usages in app). |

---

## UI structure

- **`components/AppLayout.tsx`** — Sidebar + outlet for nested `/app/*` routes.
- **`components/AppSidebar.tsx`** — Navigation links.
- **`pages/*.tsx`** — Route-level screens (data composition + layout).
- **`components/DocumentEditorDialog.tsx`** and other feature components — dialogs, editors, job actions.
- **`components/ui/*`** — Reusable primitives (Button, Dialog, Form, Table, …) aligned with Tailwind tokens in **`src/index.css`**.

---

## Environment variables (Vite)

Defined at **build time** via **`.env`**, **`.env.local`**, or **`.env.production`**. Prefix must be **`VITE_`** to be exposed to the client.

| Variable | Required | Purpose |
|----------|------------|---------|
| `VITE_FIREBASE_API_KEY` | Yes* | Firebase web app API key. |
| `VITE_FIREBASE_AUTH_DOMAIN` | Yes* | Auth domain. |
| `VITE_FIREBASE_PROJECT_ID` | Yes* | Project id (also used in Cloud Functions URL). |
| `VITE_FIREBASE_STORAGE_BUCKET` | Yes* | GCS bucket for uploads. |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Yes* | Sender id. |
| `VITE_FIREBASE_APP_ID` | Yes* | App id. |
| `VITE_FIREBASE_MEASUREMENT_ID` | No | Analytics (if enabled). |
| `VITE_FIREBASE_FUNCTIONS_REGION` | No | Defaults to **`us-central1`** in code if unset. |

\*Required for production behavior; missing values set `firebase.configured === false`.

Copy **`.env.example`** → **`.env`** and paste values from **Firebase Console → Project settings → Your apps → Web app**.

---

## Scripts

```bash
npm install
npm run dev          # Vite dev server (default port 8080 in vite.config)
npm run build        # Production bundle → dist/
npm run preview      # Serve dist locally
npm run lint         # ESLint
npm test             # Vitest
```

---

## Deploy (Firebase Hosting)

Hosting is configured in **`firebase.json`** (`public: "dist"`, SPA **`rewrites`** to `index.html`). **`.firebaserc`** pins the default Firebase project.

```bash
# Ensure .env (or CI secrets) has production VITE_* values, then:
npm run build
npx firebase-tools deploy --only hosting --project <your-project-id>
```

The live site must use the **same** Firebase project as Firestore rules and Cloud Functions so Auth tokens and data paths align.

For **Firestore / Storage rules** deploys from this folder:

```bash
npx firebase-tools deploy --only firestore:rules,storage
```

---

## Security notes (frontend)

- **Never** put Serper keys, OpenAI keys, or internal cron secrets in `VITE_*` — they would ship to every browser bundle.
- Only the **Firebase Web API key** is public by design; protect your project with **Firebase App Check**, **Auth domain restrictions**, and **Firestore/Storage rules** as appropriate.
- Cloud Function calls send the user’s **ID token**; the **server** verifies it and enforces authorization.

---

## Related documentation

- **Cloud Functions** (HTTP contracts, env, discovery, apply, import): [`../cloud_functions/README.md`](../cloud_functions/README.md)

---

## Legacy note

The repository was originally scaffolded with Lovable tooling (`lovable-tagger` in dev). Production behavior is defined by the architecture above, not the scaffold README.
