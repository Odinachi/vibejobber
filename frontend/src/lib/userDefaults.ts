import type { Preferences, Profile } from "./types";

/** New-account profile: empty “About you” and no CV sections until the user fills them. */
export function emptyProfile(email: string): Profile {
  return {
    fullName: "",
    email,
    phone: "",
    country: "",
    city: "",
    headline: "",
    summary: "",
    workHistory: [],
    education: [],
    skills: [],
    sourceCvStoragePath: null,
    sourceCvFileName: null,
    sourceCvUploadedAt: null,
  };
}

/** Default job-search preferences before the user edits them. */
export function emptyPreferences(): Preferences {
  return {
    desiredRoles: [],
    locations: [],
    workModes: ["remote"],
    salaryMin: 0,
    salaryCurrency: "USD",
    jobTypes: ["full-time"],
  };
}
