import { describe, expect, it } from "vitest";
import type { Application, Job, Profile } from "./types";
import { scoreJob, rankJobs, computeInsights } from "./mockAI";
import { emptyProfile, emptyPreferences } from "./userDefaults";

function baseJob(over: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    title: "Senior Frontend Engineer",
    company: "Acme",
    location: "Remote",
    workMode: "remote",
    jobType: "full-time",
    salaryMin: 100000,
    salaryMax: 150000,
    salaryCurrency: "USD",
    description: "We build product with React and care about design systems.",
    requirements: ["React", "TypeScript", "5 years experience"],
    responsibilities: ["Ship features", "Mentor juniors"],
    niceToHave: ["GraphQL"],
    applyUrl: "https://example.com",
    source: "test",
    postedAt: new Date().toISOString(),
    tags: ["react", "frontend"],
    ...over,
  };
}

function testProfile(over: Partial<Profile> = {}): Profile {
  return {
    ...emptyProfile("p@q.com"),
    fullName: "Test User",
    country: "US",
    city: "Austin",
    headline: "Engineer with React and TypeScript",
    summary: "I ship web apps.",
    skills: ["React", "TypeScript", "Jest"],
    workHistory: [
      {
        id: "w1",
        company: "Prev Co",
        role: "Engineer",
        startDate: "2020-01",
        endDate: null,
        achievements: ["Built a React app"],
      },
    ],
    education: [],
    ...over,
  };
}

describe("scoreJob", () => {
  it("returns a bounded score and jobId", () => {
    const prefs = emptyPreferences();
    prefs.workModes = ["remote"];
    prefs.locations = ["Remote"];
    prefs.salaryMin = 120000;
    const m = scoreJob(testProfile(), prefs, baseJob());
    expect(m.jobId).toBe("job-1");
    expect(m.score).toBeGreaterThanOrEqual(15);
    expect(m.score).toBeLessThanOrEqual(98);
    expect(m.reasoning.length).toBeGreaterThan(0);
  });

  it("ranks a closer skill match above a weak match", () => {
    const prefs = emptyPreferences();
    prefs.workModes = ["remote"];
    const strong = scoreJob(
      testProfile(),
      prefs,
      baseJob({ id: "strong", title: "React role", description: "Need React and TypeScript daily." }),
    );
    const weak = scoreJob(
      testProfile({ skills: ["Python", "Django"] }),
      prefs,
      baseJob({ id: "weak", title: "Python role", description: "Need React and TypeScript." }),
    );
    expect(strong.score).toBeGreaterThan(weak.score);
  });
});

describe("rankJobs", () => {
  it("orders jobs by score descending", () => {
    const prefs = emptyPreferences();
    prefs.workModes = ["remote"];
    const jobs: Job[] = [
      baseJob({ id: "a", title: "Unrelated" }),
      baseJob({
        id: "b",
        title: "React and TypeScript",
        description: "React " + "TypeScript ".repeat(3),
        requirements: ["React", "TypeScript"],
      }),
    ];
    const ranked = rankJobs(testProfile(), prefs, jobs);
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
  });
});

describe("computeInsights", () => {
  it("derives application counts and weekly series length", () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 2 * 86400000).toISOString();
    const apps: Application[] = [
      {
        id: "1",
        jobId: "j1",
        status: "saved",
        appliedAt: null,
        savedAt: recent,
        notes: "",
        cvDocId: null,
        coverDocId: null,
        timeline: [],
      },
      {
        id: "2",
        jobId: "j2",
        status: "applied",
        appliedAt: recent,
        savedAt: recent,
        notes: "",
        cvDocId: null,
        coverDocId: null,
        timeline: [],
      },
      {
        id: "3",
        jobId: "j3",
        status: "interview",
        appliedAt: recent,
        savedAt: recent,
        notes: "",
        cvDocId: null,
        coverDocId: null,
        timeline: [],
      },
    ];
    const s = computeInsights(apps);
    expect(s.totalApplications).toBe(2);
    expect(s.totalSaved).toBe(1);
    expect(s.weeklyActivity).toHaveLength(8);
  });
});
