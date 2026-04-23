import { firebase } from "./firebase";
import type { InternalLlmUsage } from "./types";

export function getGenerateJobDocumentFunctionUrl(): string | null {
  const project = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  if (!project) return null;
  const region = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || "us-central1";
  return `https://${region}-${project}.cloudfunctions.net/generate_job_document`;
}

export type GenerateDocumentKind = "cv" | "cover_letter";

/**
 * Server-side agent generation for job-tailored CV or cover letter. Returns content + internal usage.
 */
export async function requestJobDocument(
  jobId: string,
  kind: GenerateDocumentKind,
): Promise<{
  ok: boolean;
  content?: string;
  title?: string;
  internalLlm?: InternalLlmUsage;
  error?: string;
}> {
  if (!firebase.auth) throw new Error("Auth not available");
  const u = firebase.auth.currentUser;
  if (!u) throw new Error("Sign in to generate documents");
  const token = await u.getIdToken();
  const url = getGenerateJobDocumentFunctionUrl();
  if (!url) throw new Error("Missing Firebase project id; cannot call generate function");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jobId, kind }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    content?: string;
    title?: string;
    internalLlm?: InternalLlmUsage;
    error?: string;
  };
  if (!res.ok) {
    return { ok: false, error: data.error || res.statusText };
  }
  if (data.ok !== true) {
    return { ok: false, error: data.error || "Generation failed" };
  }
  return {
    ok: true,
    content: data.content,
    title: data.title,
    internalLlm: data.internalLlm,
  };
}
