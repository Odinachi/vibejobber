// Domain types for Vibejobber

export type WorkMode = "remote" | "hybrid" | "onsite";
export type JobType = "full-time" | "part-time" | "contract" | "internship";
export type ApplicationStatus = "saved" | "applied" | "interview" | "offer" | "rejected";
export type DocumentType = "cv" | "cover_letter";

export interface WorkExperience {
  id: string;
  company: string;
  role: string;
  startDate: string; // YYYY-MM
  endDate: string | null; // null = present
  location?: string;
  achievements: string[];
}

export interface Education {
  id: string;
  school: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string | null;
}

export interface Profile {
  fullName: string;
  email: string;
  phone: string;
  /** ISO 3166-1 alpha-2 country code (e.g. `DE`). */
  country: string;
  /** City or locality as free text. */
  city: string;
  headline: string;
  summary: string;
  workHistory: WorkExperience[];
  education: Education[];
  skills: string[];
  /** Firebase Storage object path for the user’s uploaded source CV (account setup), if any. */
  sourceCvStoragePath?: string | null;
  /** Original file name of the uploaded source CV. */
  sourceCvFileName?: string | null;
  /** When the source CV was uploaded (ISO). */
  sourceCvUploadedAt?: string | null;
}

export interface Preferences {
  desiredRoles: string[];
  locations: string[];
  workModes: WorkMode[];
  salaryMin: number;
  salaryCurrency: string;
  jobTypes: JobType[];
}

export interface Job {
  id: string;
  title: string;
  company: string;
  companyLogo?: string;
  location: string;
  workMode: WorkMode;
  jobType: JobType;
  salaryMin: number;
  salaryMax: number;
  salaryCurrency: string;
  description: string;
  requirements: string[];
  responsibilities: string[];
  niceToHave?: string[];
  applyUrl: string;
  source: string;
  postedAt: string; // ISO
  tags: string[];
}

export interface JobMatch {
  jobId: string;
  score: number; // 0-100
  reasoning: string;
  strengths: string[];
  gaps: string[];
}

export interface GeneratedDocument {
  id: string;
  type: DocumentType;
  jobId: string | null;
  jobTitle?: string;
  company?: string;
  title: string;
  content: string; // markdown / plain
  version: number;
  createdAt: string;
}

export interface Application {
  id: string;
  jobId: string;
  status: ApplicationStatus;
  appliedAt: string | null;
  savedAt: string;
  notes: string;
  cvDocId: string | null;
  coverDocId: string | null;
  /** Set after the first one-time “generate CV” for this job; even if the doc is deleted, regeneration stays disabled. */
  cvGenLocked?: boolean;
  /** Set after the first one-time “generate cover letter” for this job. */
  coverGenLocked?: boolean;
  /** Latest apply-agent run for this job, if any. */
  agentRunId?: string | null;
  timeline: { at: string; status: ApplicationStatus; note?: string }[];
}

/** Firestore: `users/{uid}/applicationRuns/{runId}` (written by the apply cloud function). */
export interface ApplicationRun {
  id: string;
  runId: string;
  userId: string;
  jobId: string;
  jobTitle?: string;
  applyUrl?: string;
  status: string;
  error?: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface Insights {
  totalApplications: number;
  totalSaved: number;
  responseRate: number;
  interviewRate: number;
  weeklyActivity: { week: string; count: number }[];
}

/** Persisted on the Firestore user doc — drives the post–sign-in setup wizard. */
export interface ProfileSetupMeta {
  completed: boolean;
  /** 1 = basics, 2 = work history, 3 = skills, 4 = job preferences (resume here if incomplete). */
  currentStep: number;
}
