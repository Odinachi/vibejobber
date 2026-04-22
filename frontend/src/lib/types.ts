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
  location: string;
  headline: string;
  summary: string;
  workHistory: WorkExperience[];
  education: Education[];
  skills: string[];
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
  timeline: { at: string; status: ApplicationStatus; note?: string }[];
}

export interface Insights {
  totalApplications: number;
  totalSaved: number;
  responseRate: number;
  interviewRate: number;
  weeklyActivity: { week: string; count: number }[];
}
