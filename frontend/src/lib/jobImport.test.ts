import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({
  firebase: {
    configured: true,
    auth: {
      currentUser: { getIdToken: async () => "tok" },
    },
  },
}));

describe("jobImport", () => {
  const original = globalThis.fetch;
  const originalSS = globalThis.sessionStorage;
  afterEach(() => {
    globalThis.fetch = original;
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.resetModules();
    (globalThis as unknown as { sessionStorage: Storage }).sessionStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    } as unknown as Storage;
  });

  afterEach(() => {
    (globalThis as unknown as { sessionStorage: Storage }).sessionStorage = originalSS;
  });

  it("getImportJobFromUrlFunctionUrl builds import URL", async () => {
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "p");
    vi.stubEnv("VITE_FIREBASE_FUNCTIONS_REGION", "asia-southeast1");
    const { getImportJobFromUrlFunctionUrl } = await import("./jobImport");
    expect(getImportJobFromUrlFunctionUrl()).toBe(
      "https://asia-southeast1-p.cloudfunctions.net/import_job_from_url",
    );
  });

  it("setPendingImportedJobId writes to sessionStorage", async () => {
    const { setPendingImportedJobId, getPendingImportedJobId } = await import("./jobImport");
    setPendingImportedJobId("j1");
    expect(sessionStorage.setItem).toHaveBeenCalledWith("vibjobber_pending_job", "j1");
  });

  it("requestImportJobFromUrl posts url to endpoint", async () => {
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "proj");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, jobId: "new1", existing: false }),
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    const { requestImportJobFromUrl } = await import("./jobImport");
    const r = await requestImportJobFromUrl("  https://jobs.example.com/x  ");
    expect(r.ok).toBe(true);
    expect(r.jobId).toBe("new1");
    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.url).toBe("https://jobs.example.com/x");
  });
});
