// Vibejobber localStorage-backed store with React subscription support.
import { useSyncExternalStore } from "react";
import type {
  Application,
  ApplicationStatus,
  GeneratedDocument,
  Job,
  Preferences,
  Profile,
} from "./types";
import { SAMPLE_JOBS, SAMPLE_PREFERENCES, SAMPLE_PROFILE } from "./seed";

const KEY = "vibejobber:v1";

interface State {
  profile: Profile;
  preferences: Preferences;
  jobs: Job[];
  applications: Application[];
  documents: GeneratedDocument[];
  dismissedJobIds: string[];
}

const DEFAULT_STATE: State = {
  profile: SAMPLE_PROFILE,
  preferences: SAMPLE_PREFERENCES,
  jobs: SAMPLE_JOBS,
  applications: [],
  documents: [],
  dismissedJobIds: [],
};

let state: State = load();
const listeners = new Set<() => void>();

function load(): State {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<State>;
    return {
      profile: parsed.profile ?? DEFAULT_STATE.profile,
      preferences: parsed.preferences ?? DEFAULT_STATE.preferences,
      jobs: parsed.jobs && parsed.jobs.length > 0 ? parsed.jobs : DEFAULT_STATE.jobs,
      applications: parsed.applications ?? [],
      documents: parsed.documents ?? [],
      dismissedJobIds: parsed.dismissedJobIds ?? [],
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function emit() {
  listeners.forEach((l) => l());
}

function setState(updater: (s: State) => State) {
  state = updater(state);
  persist();
  emit();
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

const getSnapshot = () => state;

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => selector(getSnapshot()), () => selector(DEFAULT_STATE));
}

// ---------------- Mutations ----------------
const id = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const store = {
  getState: () => state,

  updateProfile(patch: Partial<Profile>) {
    setState((s) => ({ ...s, profile: { ...s.profile, ...patch } }));
  },
  updatePreferences(patch: Partial<Preferences>) {
    setState((s) => ({ ...s, preferences: { ...s.preferences, ...patch } }));
  },

  addWork(work: Omit<import("./types").WorkExperience, "id">) {
    setState((s) => ({
      ...s,
      profile: { ...s.profile, workHistory: [{ ...work, id: id() }, ...s.profile.workHistory] },
    }));
  },
  updateWork(workId: string, patch: Partial<import("./types").WorkExperience>) {
    setState((s) => ({
      ...s,
      profile: {
        ...s.profile,
        workHistory: s.profile.workHistory.map((w) => (w.id === workId ? { ...w, ...patch } : w)),
      },
    }));
  },
  removeWork(workId: string) {
    setState((s) => ({
      ...s,
      profile: { ...s.profile, workHistory: s.profile.workHistory.filter((w) => w.id !== workId) },
    }));
  },

  addEducation(edu: Omit<import("./types").Education, "id">) {
    setState((s) => ({
      ...s,
      profile: { ...s.profile, education: [{ ...edu, id: id() }, ...s.profile.education] },
    }));
  },
  removeEducation(eduId: string) {
    setState((s) => ({
      ...s,
      profile: { ...s.profile, education: s.profile.education.filter((e) => e.id !== eduId) },
    }));
  },

  addSkill(skill: string) {
    setState((s) =>
      s.profile.skills.includes(skill)
        ? s
        : { ...s, profile: { ...s.profile, skills: [...s.profile.skills, skill] } },
    );
  },
  removeSkill(skill: string) {
    setState((s) => ({ ...s, profile: { ...s.profile, skills: s.profile.skills.filter((x) => x !== skill) } }));
  },

  // Jobs
  dismissJob(jobId: string) {
    setState((s) => ({ ...s, dismissedJobIds: [...new Set([...s.dismissedJobIds, jobId])] }));
  },
  undismissJob(jobId: string) {
    setState((s) => ({ ...s, dismissedJobIds: s.dismissedJobIds.filter((id) => id !== jobId) }));
  },

  // Applications
  saveJob(jobId: string): Application {
    const existing = state.applications.find((a) => a.jobId === jobId);
    if (existing) return existing;
    const app: Application = {
      id: id(),
      jobId,
      status: "saved",
      appliedAt: null,
      savedAt: new Date().toISOString(),
      notes: "",
      cvDocId: null,
      coverDocId: null,
      timeline: [{ at: new Date().toISOString(), status: "saved" }],
    };
    setState((s) => ({ ...s, applications: [app, ...s.applications] }));
    return app;
  },
  updateApplication(appId: string, patch: Partial<Application>, statusNote?: string) {
    setState((s) => ({
      ...s,
      applications: s.applications.map((a) => {
        if (a.id !== appId) return a;
        const next: Application = { ...a, ...patch };
        if (patch.status && patch.status !== a.status) {
          next.timeline = [
            ...a.timeline,
            { at: new Date().toISOString(), status: patch.status, note: statusNote },
          ];
          if (patch.status !== "saved" && !a.appliedAt) next.appliedAt = new Date().toISOString();
        }
        return next;
      }),
    }));
  },
  setApplicationStatus(appId: string, status: ApplicationStatus, note?: string) {
    store.updateApplication(appId, { status }, note);
  },
  removeApplication(appId: string) {
    setState((s) => ({ ...s, applications: s.applications.filter((a) => a.id !== appId) }));
  },

  // Documents
  addDocument(doc: Omit<GeneratedDocument, "id" | "createdAt" | "version">): GeneratedDocument {
    const existingForJob = state.documents.filter((d) => d.jobId === doc.jobId && d.type === doc.type);
    const version = existingForJob.length + 1;
    const created: GeneratedDocument = {
      ...doc,
      id: id(),
      createdAt: new Date().toISOString(),
      version,
    };
    setState((s) => ({ ...s, documents: [created, ...s.documents] }));
    return created;
  },
  updateDocument(docId: string, content: string) {
    setState((s) => ({
      ...s,
      documents: s.documents.map((d) => (d.id === docId ? { ...d, content } : d)),
    }));
  },
  removeDocument(docId: string) {
    setState((s) => ({ ...s, documents: s.documents.filter((d) => d.id !== docId) }));
  },

  // Reset
  reset() {
    setState(() => DEFAULT_STATE);
  },
};
