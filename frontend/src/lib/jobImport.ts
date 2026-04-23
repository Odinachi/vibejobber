import { firebase } from "./firebase";

export function getImportJobFromUrlFunctionUrl(): string | null {
  const project = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  if (!project) return null;
  const region = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || "us-central1";
  return `https://${region}-${project}.cloudfunctions.net/import_job_from_url`;
}

const PENDING_JOB_KEY = "vibjobber_pending_job";

/** Set before navigating to `/app/jobs/:id` so JobDetail can show a short loading state until Firestore syncs. */
export function setPendingImportedJobId(jobId: string): void {
  try {
    sessionStorage.setItem(PENDING_JOB_KEY, jobId);
  } catch {
    /* ignore */
  }
}

export function clearPendingImportedJobId(): void {
  try {
    sessionStorage.removeItem(PENDING_JOB_KEY);
  } catch {
    /* ignore */
  }
}

export function getPendingImportedJobId(): string | null {
  try {
    return sessionStorage.getItem(PENDING_JOB_KEY);
  } catch {
    return null;
  }
}

/**
 * Verifies the URL server-side (HTTP fetch + HTML check) and upserts into the global `jobs` collection.
 */
export async function requestImportJobFromUrl(url: string): Promise<{
  ok: boolean;
  jobId?: string;
  existing?: boolean;
  error?: string;
}> {
  if (!firebase.auth) throw new Error("Auth not available");
  const u = firebase.auth.currentUser;
  if (!u) throw new Error("Sign in to add a job");
  const token = await u.getIdToken();
  const endpoint = getImportJobFromUrlFunctionUrl();
  if (!endpoint) throw new Error("Missing Firebase project id; cannot call import function");

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ url: url.trim() }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    jobId?: string;
    existing?: boolean;
    error?: string;
  };
  if (!res.ok) {
    return { ok: false, error: data.error || res.statusText };
  }
  if (data.ok !== true) {
    return { ok: false, error: data.error || "Import failed" };
  }
  return {
    ok: true,
    jobId: data.jobId,
    existing: data.existing === true,
  };
}
