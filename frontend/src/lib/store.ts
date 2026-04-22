// Firestore-backed store: user doc, documents subcollection, and global `jobs` catalog.
import { useSyncExternalStore } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import type {
  Application,
  ApplicationStatus,
  GeneratedDocument,
  Job,
  Preferences,
  Profile,
  ProfileSetupMeta,
} from "./types";
import { jobFromFirestore, JOBS_COLLECTION } from "./jobsFromFirestore";
import { normalizeProfileFromRemote } from "./profileNormalize";
import { emptyPreferences, emptyProfile } from "./userDefaults";
import { firebase } from "./firebase";

/** Old bundled demo “About you” — strip when user is still on wizard step 1. */
const LEGACY_DEMO_ABOUT = {
  fullName: "Alex Rivera",
  headline: "Senior Frontend Engineer • React • Design Systems",
  summary:
    "Frontend engineer with 6+ years building production web apps. Led the design system at a Series B fintech and shipped a customer-facing dashboard from zero to 50k MAUs. Comfortable across the stack and known for clean architecture and steady mentorship.",
} as const;

function profileMatchesLegacyBundledDemo(p: Profile): boolean {
  const legacyCity = "Berlin, Germany";
  return (
    p.fullName === LEGACY_DEMO_ABOUT.fullName &&
    p.headline === LEGACY_DEMO_ABOUT.headline &&
    p.summary === LEGACY_DEMO_ABOUT.summary &&
    p.city.trim() === legacyCity &&
    !p.country
  );
}

export interface State {
  profile: Profile;
  preferences: Preferences;
  jobs: Job[];
  applications: Application[];
  documents: GeneratedDocument[];
  dismissedJobIds: string[];
  /** When `completed` is false, the app redirects to `/complete-profile` (resume at `currentStep`). */
  profileSetup: ProfileSetupMeta;
  /** True after the first Firestore user snapshot is merged (avoids treating logged-out defaults as real). */
  firestoreSynced: boolean;
}

/** Logged-out placeholder — `completed: true` avoids blocking `/complete-profile` before Firestore hydrates. */
const DEFAULT_PROFILE_SETUP: ProfileSetupMeta = { completed: true, currentStep: 1 };

const DEFAULT_STATE: State = {
  profile: emptyProfile(""),
  preferences: emptyPreferences(),
  jobs: [],
  applications: [],
  documents: [],
  dismissedJobIds: [],
  profileSetup: DEFAULT_PROFILE_SETUP,
  firestoreSynced: false,
};

function parseProfileSetup(data: Record<string, unknown>): ProfileSetupMeta {
  const p = data.profileSetup as ProfileSetupMeta | undefined;
  if (p && typeof p.completed === "boolean" && typeof p.currentStep === "number") {
    return {
      completed: p.completed,
      currentStep: Math.min(4, Math.max(1, Math.floor(p.currentStep))),
    };
  }
  return { completed: true, currentStep: 1 };
}

let state: State = structuredClone(DEFAULT_STATE);
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function setLocalState(next: State) {
  state = next;
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

export function clearUserData() {
  setLocalState(structuredClone(DEFAULT_STATE));
}

function userRef(uid: string) {
  if (!firebase.db) throw new Error("Firestore not configured");
  return doc(firebase.db, "users", uid);
}

function docsCol(uid: string) {
  if (!firebase.db) throw new Error("Firestore not configured");
  return collection(firebase.db, "users", uid, "documents");
}

function mergeRemote(
  profile: Profile,
  preferences: Preferences,
  applications: Application[],
  dismissedJobIds: string[],
  documents: GeneratedDocument[],
  profileSetup: ProfileSetupMeta,
): State {
  return {
    profile,
    preferences,
    jobs: getSnapshot().jobs,
    applications,
    dismissedJobIds,
    documents,
    profileSetup,
    firestoreSynced: true,
  };
}

/** Subscribe to user doc, documents, and global job catalog; returns unsubscribe. */
export function subscribeUserData(uid: string): () => void {
  if (!firebase.db) return () => {};

  const uref = userRef(uid);
  const dref = docsCol(uid);
  const jobsRef = collection(firebase.db, JOBS_COLLECTION);

  const unsubJobs = onSnapshot(jobsRef, (snap) => {
    const jobs: Job[] = [];
    for (const d of snap.docs) {
      const parsed = jobFromFirestore(d.id, d.data() as Record<string, unknown>);
      if (parsed) jobs.push(parsed);
    }
    jobs.sort((a, b) => (a.postedAt < b.postedAt ? 1 : -1));
    const s = getSnapshot();
    setLocalState({ ...s, jobs });
  });

  const unsubUser = onSnapshot(uref, (snap) => {
    if (!snap.exists()) {
      const email = firebase.auth?.currentUser?.email ?? "";
      void setDoc(
        uref,
        (() => {
          const profile = emptyProfile(email);
          const preferences = emptyPreferences();
          return {
            profile,
            preferences,
            applications: [],
            dismissedJobIds: [],
            profileSetup: { completed: false, currentStep: 1 },
          };
        })(),
        { merge: true },
      );
      return;
    }
    const d = snap.data() as Record<string, unknown>;
    const email = firebase.auth?.currentUser?.email ?? "";
    let profile = normalizeProfileFromRemote(d.profile, email);
    const preferences = (d.preferences as Preferences) ?? emptyPreferences();
    const applications = (d.applications as Application[]) ?? [];
    const dismissedJobIds = (d.dismissedJobIds as string[]) ?? [];
    const documents = getSnapshot().documents;
    const profileSetup = parseProfileSetup(d);
    if (!profileSetup.completed && profileSetup.currentStep === 1 && profileMatchesLegacyBundledDemo(profile)) {
      profile = {
        ...profile,
        fullName: "",
        country: "",
        city: "",
        headline: "",
        summary: "",
        phone: "",
      };
      void updateDoc(uref, { profile });
    }
    setLocalState(mergeRemote(profile, preferences, applications, dismissedJobIds, documents, profileSetup));
  });

  const unsubDocs = onSnapshot(dref, (snap) => {
    const documents: GeneratedDocument[] = snap.docs.map((s) => {
      const x = s.data() as Omit<GeneratedDocument, "id">;
      return { ...x, id: s.id };
    });
    const s = getSnapshot();
    setLocalState({ ...s, documents });
  });

  return () => {
    unsubUser();
    unsubDocs();
    unsubJobs();
  };
}

function uidOrThrow(): string {
  const uid = firebase.auth?.currentUser?.uid;
  if (!uid) throw new Error("Not signed in");
  return uid;
}

const id = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const store = {
  getState: () => state,

  async setProfileSetup(meta: ProfileSetupMeta) {
    const uid = uidOrThrow();
    const next: ProfileSetupMeta = {
      completed: meta.completed,
      currentStep: Math.min(4, Math.max(1, Math.floor(meta.currentStep))),
    };
    setLocalState({ ...state, profileSetup: next });
    await updateDoc(userRef(uid), { profileSetup: next });
  },

  async updateProfile(patch: Partial<Profile>) {
    const uid = uidOrThrow();
    const next = { ...state.profile, ...patch };
    setLocalState({ ...state, profile: next });
    await updateDoc(userRef(uid), { profile: next });
  },

  async updatePreferences(patch: Partial<Preferences>) {
    const uid = uidOrThrow();
    const next = { ...state.preferences, ...patch };
    setLocalState({ ...state, preferences: next });
    await updateDoc(userRef(uid), { preferences: next });
  },

  async addWork(work: Omit<import("./types").WorkExperience, "id">) {
    const uid = uidOrThrow();
    const nextProfile = { ...state.profile, workHistory: [{ ...work, id: id() }, ...state.profile.workHistory] };
    setLocalState({ ...state, profile: nextProfile });
    await updateDoc(userRef(uid), { profile: nextProfile });
  },

  async updateWork(workId: string, patch: Partial<import("./types").WorkExperience>) {
    const uid = uidOrThrow();
    const nextProfile = {
      ...state.profile,
      workHistory: state.profile.workHistory.map((w) => (w.id === workId ? { ...w, ...patch } : w)),
    };
    setLocalState({ ...state, profile: nextProfile });
    await updateDoc(userRef(uid), { profile: nextProfile });
  },

  async removeWork(workId: string) {
    const uid = uidOrThrow();
    const nextProfile = {
      ...state.profile,
      workHistory: state.profile.workHistory.filter((w) => w.id !== workId),
    };
    setLocalState({ ...state, profile: nextProfile });
    await updateDoc(userRef(uid), { profile: nextProfile });
  },

  async addEducation(edu: Omit<import("./types").Education, "id">) {
    const uid = uidOrThrow();
    const nextProfile = { ...state.profile, education: [{ ...edu, id: id() }, ...state.profile.education] };
    setLocalState({ ...state, profile: nextProfile });
    await updateDoc(userRef(uid), { profile: nextProfile });
  },

  async removeEducation(eduId: string) {
    const uid = uidOrThrow();
    const nextProfile = {
      ...state.profile,
      education: state.profile.education.filter((e) => e.id !== eduId),
    };
    setLocalState({ ...state, profile: nextProfile });
    await updateDoc(userRef(uid), { profile: nextProfile });
  },

  async addSkill(skill: string) {
    const uid = uidOrThrow();
    if (state.profile.skills.includes(skill)) return;
    const nextProfile = { ...state.profile, skills: [...state.profile.skills, skill] };
    setLocalState({ ...state, profile: nextProfile });
    await updateDoc(userRef(uid), { profile: nextProfile });
  },

  async removeSkill(skill: string) {
    const uid = uidOrThrow();
    const nextProfile = { ...state.profile, skills: state.profile.skills.filter((x) => x !== skill) };
    setLocalState({ ...state, profile: nextProfile });
    await updateDoc(userRef(uid), { profile: nextProfile });
  },

  async dismissJob(jobId: string) {
    const uid = uidOrThrow();
    const next = [...new Set([...state.dismissedJobIds, jobId])];
    setLocalState({ ...state, dismissedJobIds: next });
    await updateDoc(userRef(uid), { dismissedJobIds: next });
  },

  async undismissJob(jobId: string) {
    const uid = uidOrThrow();
    const next = state.dismissedJobIds.filter((x) => x !== jobId);
    setLocalState({ ...state, dismissedJobIds: next });
    await updateDoc(userRef(uid), { dismissedJobIds: next });
  },

  async saveJob(jobId: string): Promise<Application> {
    const uid = uidOrThrow();
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
    const nextApps = [app, ...state.applications];
    setLocalState({ ...state, applications: nextApps });
    await updateDoc(userRef(uid), { applications: nextApps });
    return app;
  },

  async updateApplication(appId: string, patch: Partial<Application>, statusNote?: string) {
    const uid = uidOrThrow();
    const nextApps = state.applications.map((a) => {
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
    });
    setLocalState({ ...state, applications: nextApps });
    await updateDoc(userRef(uid), { applications: nextApps });
  },

  setApplicationStatus(appId: string, status: ApplicationStatus, note?: string) {
    void store.updateApplication(appId, { status }, note);
  },

  async removeApplication(appId: string) {
    const uid = uidOrThrow();
    const nextApps = state.applications.filter((a) => a.id !== appId);
    setLocalState({ ...state, applications: nextApps });
    await updateDoc(userRef(uid), { applications: nextApps });
  },

  async addDocument(doc: Omit<GeneratedDocument, "id" | "createdAt" | "version">): Promise<GeneratedDocument> {
    const uid = uidOrThrow();
    const existingForJob = state.documents.filter((d) => d.jobId === doc.jobId && d.type === doc.type);
    const version = existingForJob.length + 1;
    const createdAt = new Date().toISOString();
    const payload: Record<string, unknown> = {
      type: doc.type,
      jobId: doc.jobId,
      jobTitle: doc.jobTitle ?? null,
      company: doc.company ?? null,
      title: doc.title,
      content: doc.content,
      version,
      createdAt,
    };
    const ref = await addDoc(docsCol(uid), payload);
    const created: GeneratedDocument = {
      ...doc,
      id: ref.id,
      createdAt,
      version,
    };
    return created;
  },

  async updateDocument(docId: string, content: string) {
    const uid = uidOrThrow();
    await updateDoc(doc(firebase.db!, "users", uid, "documents", docId), { content });
  },

  async removeDocument(docId: string) {
    const uid = uidOrThrow();
    await deleteDoc(doc(docsCol(uid), docId));
  },

  async reset() {
    const uid = uidOrThrow();
    const uref = userRef(uid);
    const qs = await getDocs(docsCol(uid));
    const batch = writeBatch(firebase.db!);
    qs.forEach((s) => batch.delete(s.ref));
    await batch.commit();
    const email = state.profile.email || firebase.auth?.currentUser?.email || "";
    await setDoc(
      uref,
      {
        profile: emptyProfile(email),
        preferences: emptyPreferences(),
        applications: [],
        dismissedJobIds: [],
        profileSetup: { completed: false, currentStep: 1 },
      },
    );
  },
};
