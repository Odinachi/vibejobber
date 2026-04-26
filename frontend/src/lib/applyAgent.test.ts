import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({
  firebase: {
    configured: true,
    auth: {
      currentUser: { getIdToken: async () => "test-token" },
    },
  },
}));

describe("applyAgent", () => {
  const original = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = original;
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.resetModules();
  });

  it("getApplyToJobFunctionUrl uses region and project from env", async () => {
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "testproj");
    vi.stubEnv("VITE_FIREBASE_FUNCTIONS_REGION", "europe-west1");
    const { getApplyToJobFunctionUrl } = await import("./applyAgent");
    expect(getApplyToJobFunctionUrl()).toBe(
      "https://europe-west1-testproj.cloudfunctions.net/apply_to_job",
    );
  });

  it("getApplyToJobFunctionUrl returns null without project", async () => {
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "");
    const { getApplyToJobFunctionUrl } = await import("./applyAgent");
    expect(getApplyToJobFunctionUrl()).toBeNull();
  });

  it("requestAgentApplyJob posts to apply endpoint and returns data", async () => {
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "p");
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, runId: "run-1" }),
    }) as unknown as typeof fetch;

    const { requestAgentApplyJob } = await import("./applyAgent");
    const out = await requestAgentApplyJob("job-1");
    expect(out.ok).toBe(true);
    expect(out.runId).toBe("run-1");
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain("apply_to_job");
  });
});
