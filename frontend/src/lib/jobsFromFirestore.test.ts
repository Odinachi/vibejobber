import { describe, expect, it } from "vitest";
import { JOBS_COLLECTION, jobFromFirestore } from "./jobsFromFirestore";

describe("jobFromFirestore", () => {
  it("returns null when title or company missing", () => {
    expect(jobFromFirestore("x", { company: "A" } as Record<string, unknown>)).toBeNull();
    expect(jobFromFirestore("x", { title: "T" } as Record<string, unknown>)).toBeNull();
  });

  it("maps a minimal valid document", () => {
    const j = jobFromFirestore("abc123", {
      title: "Engineer",
      company: "Co",
      location: "Berlin",
      workMode: "hybrid",
      jobType: "full-time",
      salaryMin: 100,
      salaryMax: 200,
      salaryCurrency: "EUR",
      description: "Do things",
      requirements: ["a", 1, "b"],
      responsibilities: ["x"],
      applyUrl: "https://x.com/j",
      source: "serp",
      postedAt: "2025-01-01T00:00:00.000Z",
      tags: ["react", "ts"],
    });
    expect(j).not.toBeNull();
    expect(j!.id).toBe("abc123");
    expect(j!.requirements).toEqual(["a", "b"]);
    expect(j!.workMode).toBe("hybrid");
  });

  it("defaults invalid workMode and jobType", () => {
    const j = jobFromFirestore("id1", {
      title: "T",
      company: "C",
      workMode: "nope",
      jobType: "invalid",
    });
    expect(j!.workMode).toBe("remote");
    expect(j!.jobType).toBe("full-time");
  });

  it("maps niceToHave when array of strings", () => {
    const j = jobFromFirestore("id1", {
      title: "T",
      company: "C",
      niceToHave: ["a", 3, "b"],
    });
    expect(j!.niceToHave).toEqual(["a", "b"]);
  });
});

describe("JOBS_COLLECTION", () => {
  it("is the public jobs catalog name", () => {
    expect(JOBS_COLLECTION).toBe("jobs");
  });
});
