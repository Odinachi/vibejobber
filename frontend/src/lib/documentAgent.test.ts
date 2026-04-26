import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({
  firebase: {
    configured: true,
    auth: {
      currentUser: { getIdToken: async () => "tok" },
    },
  },
}));

describe("documentAgent", () => {
  const original = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = original;
    vi.unstubAllEnvs();
  });

  it("getGenerateJobDocumentFunctionUrl builds function URL", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "proj");
    vi.stubEnv("VITE_FIREBASE_FUNCTIONS_REGION", "us-central1");
    const { getGenerateJobDocumentFunctionUrl } = await import("./documentAgent");
    expect(getGenerateJobDocumentFunctionUrl()).toBe(
      "https://us-central1-proj.cloudfunctions.net/generate_job_document",
    );
  });

  it("requestJobDocument sends jobId and kind", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "proj");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, content: "# CV", title: "t" }),
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const { requestJobDocument } = await import("./documentAgent");
    const r = await requestJobDocument("jid", "cv");
    expect(r.ok).toBe(true);
    const [, init] = mockFetch.mock.calls[0];
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ jobId: "jid", kind: "cv" });
  });
});
