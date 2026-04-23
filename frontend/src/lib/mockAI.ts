// Mock AI helpers — pure deterministic functions that simulate AI output
// based on the user's profile and the target job.

import type { Application, GeneratedDocument, Job, JobMatch, Preferences, Profile } from "./types";
import { formatProfileLocation } from "./profileNormalize";
import { parseCvFromPlainText } from "./cvTextImport";

export { extractTextForProfileImport } from "./cvFileImport";
export { assessCvTextReadability, parseCvFromPlainText } from "./cvTextImport";

const lower = (s: string) => s.toLowerCase();

function tokenize(text: string): Set<string> {
  return new Set(
    lower(text)
      .replace(/[^a-z0-9+#./\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1),
  );
}

export function scoreJob(profile: Profile, prefs: Preferences, job: Job): JobMatch {
  const profileTokens = tokenize(
    [
      profile.headline,
      profile.summary,
      ...profile.skills,
      ...profile.workHistory.flatMap((w) => [w.role, ...w.achievements]),
    ].join(" "),
  );
  const jobTokens = tokenize(
    [job.title, job.description, ...job.requirements, ...(job.niceToHave ?? []), ...job.tags].join(" "),
  );

  // Skill overlap
  const matchedSkills = profile.skills.filter((s) => jobTokens.has(lower(s)));
  const requirementHits = job.requirements.filter((r) => {
    const rTokens = lower(r).split(/[\s,/]+/);
    return rTokens.some((t) => profileTokens.has(t));
  });

  let score = 30; // base
  score += Math.min(35, matchedSkills.length * 6);
  score += Math.min(20, requirementHits.length * 5);

  // Preference signals
  if (prefs.workModes.includes(job.workMode)) score += 6;
  if (prefs.jobTypes.includes(job.jobType)) score += 4;
  if (
    prefs.locations.some(
      (l) => lower(job.location).includes(lower(l)) || (l.toLowerCase().includes("remote") && job.workMode === "remote"),
    )
  )
    score += 5;
  if (job.salaryMax >= prefs.salaryMin) score += 4;

  // Title affinity
  if (prefs.desiredRoles.some((r) => lower(job.title).includes(lower(r.split(" ").slice(-2).join(" "))))) {
    score += 6;
  }

  score = Math.max(15, Math.min(98, score));

  const strengths: string[] = [];
  if (matchedSkills.length > 0) strengths.push(`${matchedSkills.length} skill matches: ${matchedSkills.slice(0, 4).join(", ")}`);
  if (prefs.workModes.includes(job.workMode)) strengths.push(`${job.workMode} matches your preference`);
  if (job.salaryMax >= prefs.salaryMin) strengths.push(`Salary range fits your minimum`);
  if (requirementHits.length >= 2) strengths.push(`Hits ${requirementHits.length} listed requirements`);

  const gaps: string[] = [];
  const missingReqs = job.requirements.filter((r) => !requirementHits.includes(r));
  if (missingReqs.length > 0) gaps.push(`Light coverage: ${missingReqs.slice(0, 2).join(", ")}`);
  if (!prefs.workModes.includes(job.workMode)) gaps.push(`${job.workMode} not in your preferred modes`);
  if (job.salaryMax < prefs.salaryMin) gaps.push(`Salary below your minimum (${prefs.salaryMin.toLocaleString()})`);

  const verdict =
    score >= 80
      ? "Excellent fit"
      : score >= 65
      ? "Strong fit"
      : score >= 50
      ? "Worth exploring"
      : "Stretch opportunity";

  const reasoning = `${verdict}. ${
    strengths[0] ?? "Limited overlap with your stated profile"
  }${gaps.length > 0 ? `. ${gaps[0]}` : "."}`;

  return { jobId: job.id, score, reasoning, strengths, gaps };
}

export function rankJobs(profile: Profile, prefs: Preferences, jobs: Job[]): JobMatch[] {
  return jobs.map((j) => scoreJob(profile, prefs, j)).sort((a, b) => b.score - a.score);
}

// ----- Document generation (mock) -----

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

export function generateTailoredCV(profile: Profile, job: Job): string {
  const jobTokens = tokenize([job.title, job.description, ...job.requirements, ...job.tags].join(" "));
  const prioritizedSkills = uniq([
    ...profile.skills.filter((s) => jobTokens.has(lower(s))),
    ...profile.skills,
  ]);

  const summary = `${profile.headline}. Experienced contributor seeking the ${job.title} role at ${job.company}. ${profile.summary}`;

  const exp = profile.workHistory
    .map((w) => {
      const dates = `${w.startDate} – ${w.endDate ?? "Present"}`;
      const tailored = w.achievements
        .map((a) => {
          const hit = Array.from(jobTokens).find((t) => lower(a).includes(t) && t.length > 3);
          return hit ? `★ ${a}` : `• ${a}`;
        })
        .join("\n");
      return `### ${w.role} — ${w.company}\n${dates}${w.location ? ` · ${w.location}` : ""}\n${tailored}`;
    })
    .join("\n\n");

  const edu = profile.education
    .map((e) => `### ${e.degree}, ${e.field} — ${e.school}\n${e.startDate} – ${e.endDate ?? "Present"}`)
    .join("\n\n");

  const linkBits: string[] = [];
  if (profile.linkedInUrl?.trim()) linkBits.push(profile.linkedInUrl.trim());
  if (profile.websiteUrl?.trim()) linkBits.push(profile.websiteUrl.trim());
  if (profile.githubUrl?.trim()) linkBits.push(profile.githubUrl.trim());
  if (profile.mediumUrl?.trim()) linkBits.push(profile.mediumUrl.trim());
  if (profile.xUrl?.trim()) linkBits.push(profile.xUrl.trim());
  for (const row of profile.additionalLinks ?? []) {
    const u = row.url.trim();
    if (!u) continue;
    const lab = row.label.trim();
    linkBits.push(lab ? `${lab}: ${u}` : u);
  }
  const linkLine = linkBits.length ? `\n${linkBits.join(" · ")}` : "";

  return `# ${profile.fullName}
${profile.email} · ${profile.phone} · ${formatProfileLocation(profile)}${linkLine}

## Summary
${summary}

## Skills
${prioritizedSkills.join(" · ")}

## Experience
${exp}

## Education
${edu}

---
Tailored for ${job.company} — ${job.title}. Items marked ★ closely match the role's requirements.`;
}

export function generateCoverLetter(profile: Profile, job: Job): string {
  const jobTokens = tokenize([job.title, job.description, ...job.requirements, ...job.tags].join(" "));
  const matchedSkills = profile.skills.filter((s) => jobTokens.has(lower(s))).slice(0, 4);
  const topAchievement =
    profile.workHistory[0]?.achievements[0] ?? "delivered impactful product work in fast-moving teams";

  const today = new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" });

  return `${today}

Dear ${job.company} team,

I'm writing to apply for the ${job.title} role. Your work — ${job.description.split(".")[0].toLowerCase()} — is exactly the kind of problem I want to spend the next chapter of my career on.

Most recently at ${profile.workHistory[0]?.company ?? "my current company"}, I ${lower(topAchievement)}. That experience maps directly onto your needs: ${
    matchedSkills.length > 0
      ? `${matchedSkills.join(", ")} are at the centre of how I work day-to-day`
      : "the skills you list are core to how I operate"
  }.

A few things I'd bring to the role:
• A bias for shipping — small, frequent improvements over big-bang launches.
• Strong collaboration with design and product, learned through ${profile.workHistory.length} previous roles.
• A care for craft: clean code, accessible UI, and documentation engineers actually read.

I'd love to talk about how I can help ${job.company} ${job.tags[0] ? `push ${job.tags[0].toLowerCase()} forward` : "on what's next"}.

Sincerely,
${profile.fullName}
${profile.email}`;
}

/** @deprecated re-export; prefer parseCvFromPlainText from cvTextImport */
export function mockParseCV(text: string): Partial<Profile> {
  return parseCvFromPlainText(text);
}

// ----- Insights -----
export function computeInsights(applications: Application[]) {
  const total = applications.length;
  const applied = applications.filter((a) => a.status !== "saved").length;
  const interview = applications.filter((a) => a.status === "interview" || a.status === "offer").length;
  const responseRate = applied > 0 ? Math.round((interview / applied) * 100) : 0;
  const interviewRate = applied > 0 ? Math.round((interview / applied) * 100) : 0;

  // Build last 8 weeks
  const weeks: { week: string; count: number }[] = [];
  for (let i = 7; i >= 0; i--) {
    const start = new Date();
    start.setDate(start.getDate() - i * 7);
    const label = start.toLocaleDateString("en-GB", { month: "short", day: "numeric" });
    const count = applications.filter((a) => {
      const at = a.appliedAt ?? a.savedAt;
      const d = new Date(at);
      const diff = (Date.now() - d.getTime()) / 86400000;
      return diff <= (i + 1) * 7 && diff > i * 7;
    }).length;
    weeks.push({ week: label, count });
  }

  return { totalApplications: applied, totalSaved: total - applied, responseRate, interviewRate, weeklyActivity: weeks };
}

export type { GeneratedDocument };
