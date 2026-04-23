import { firebase } from "./firebase";
import type { InternalLlmUsage } from "./types";

/** Default Gen2 HTTP function URL for `apply_to_job` in the same project. */
export function getApplyToJobFunctionUrl(): string | null {
  const project = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  if (!project) return null;
  const region = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || "us-central1";
  return `https://${region}-${project}.cloudfunctions.net/apply_to_job`;
}

/**
 * Triggers the server-side apply pipeline. Requires a signed-in user and
 * a tailored CV + cover letter in Firestore for the job.
 */
export async function requestAgentApplyJob(jobId: string): Promise<{
  runId: string;
  ok: boolean;
  error?: string;
  /** Internal: aggregated tokens + est. cost for the apply run (page fetch + form plan). */
  internalLlm?: InternalLlmUsage;
}> {
  if (!firebase.auth) throw new Error("Auth not available");
  const u = firebase.auth.currentUser;
  if (!u) throw new Error("Sign in to use the apply agent");
  const token = await u.getIdToken();
  const url = getApplyToJobFunctionUrl();
  if (!url) throw new Error("Missing Firebase project id; cannot call apply function");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jobId }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    runId?: string;
    error?: string;
    internalLlm?: InternalLlmUsage;
  };
  if (!res.ok) {
    return { ok: false, runId: "", error: (data as { error?: string }).error || res.statusText };
  }
  return {
    ok: data.ok === true,
    runId: (data as { runId?: string }).runId ?? "",
    error: data.error,
    internalLlm: data.internalLlm,
  };
}
