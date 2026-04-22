import type { Job, JobType, WorkMode } from "./types";

const WORK_MODES: WorkMode[] = ["remote", "hybrid", "onsite"];
const JOB_TYPES: JobType[] = ["full-time", "part-time", "contract", "internship"];

function asWorkMode(v: unknown): WorkMode {
  return WORK_MODES.includes(v as WorkMode) ? (v as WorkMode) : "remote";
}

function asJobType(v: unknown): JobType {
  return JOB_TYPES.includes(v as JobType) ? (v as JobType) : "full-time";
}

function stringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** Top-level Firestore collection for the job catalog (read by signed-in clients). */
export const JOBS_COLLECTION = "jobs";

/**
 * Maps a Firestore job document to `Job`. Invalid or incomplete docs are skipped.
 * Document id becomes `Job.id`; other fields should mirror `Job` in the console.
 */
export function jobFromFirestore(docId: string, raw: Record<string, unknown>): Job | null {
  if (typeof raw.title !== "string" || typeof raw.company !== "string") return null;
  const nice = raw.niceToHave;
  return {
    id: docId,
    title: raw.title,
    company: raw.company,
    companyLogo: typeof raw.companyLogo === "string" ? raw.companyLogo : undefined,
    location: typeof raw.location === "string" ? raw.location : "",
    workMode: asWorkMode(raw.workMode),
    jobType: asJobType(raw.jobType),
    salaryMin: typeof raw.salaryMin === "number" && !Number.isNaN(raw.salaryMin) ? raw.salaryMin : 0,
    salaryMax: typeof raw.salaryMax === "number" && !Number.isNaN(raw.salaryMax) ? raw.salaryMax : 0,
    salaryCurrency: typeof raw.salaryCurrency === "string" ? raw.salaryCurrency : "USD",
    description: typeof raw.description === "string" ? raw.description : "",
    requirements: stringArray(raw.requirements),
    responsibilities: stringArray(raw.responsibilities),
    niceToHave: nice === undefined ? undefined : stringArray(nice),
    applyUrl: typeof raw.applyUrl === "string" ? raw.applyUrl : "#",
    source: typeof raw.source === "string" ? raw.source : "",
    postedAt: typeof raw.postedAt === "string" ? raw.postedAt : new Date().toISOString(),
    tags: stringArray(raw.tags),
  };
}
