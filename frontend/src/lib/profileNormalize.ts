import type { Profile } from "./types";
import { emptyProfile } from "./userDefaults";

type RemoteProfile = Partial<Profile> & { location?: string };

/**
 * Merge Firestore `profile` into a full `Profile`, migrating legacy `location` into `city`
 * when `city` is empty.
 */
export function normalizeProfileFromRemote(raw: unknown, email: string): Profile {
  const base = emptyProfile(email);
  if (!raw || typeof raw !== "object") return base;
  const o = raw as RemoteProfile;

  const country = typeof o.country === "string" ? o.country : "";
  let city = typeof o.city === "string" ? o.city : "";
  if (!city.trim() && typeof o.location === "string" && o.location.trim()) {
    city = o.location.trim();
  }

  return {
    ...base,
    fullName: typeof o.fullName === "string" ? o.fullName : base.fullName,
    email: typeof o.email === "string" ? o.email : email,
    phone: typeof o.phone === "string" ? o.phone : base.phone,
    country,
    city,
    headline: typeof o.headline === "string" ? o.headline : base.headline,
    summary: typeof o.summary === "string" ? o.summary : base.summary,
    workHistory: Array.isArray(o.workHistory) ? (o.workHistory as Profile["workHistory"]) : [],
    education: Array.isArray(o.education) ? (o.education as Profile["education"]) : [],
    skills: Array.isArray(o.skills) ? (o.skills as string[]) : [],
    sourceCvStoragePath: typeof o.sourceCvStoragePath === "string" ? o.sourceCvStoragePath : null,
    sourceCvFileName: typeof o.sourceCvFileName === "string" ? o.sourceCvFileName : null,
    sourceCvUploadedAt: typeof o.sourceCvUploadedAt === "string" ? o.sourceCvUploadedAt : null,
  };
}

/** Single line for CV / letters (city + localized country name for ISO codes). */
export function formatProfileLocation(profile: Profile): string {
  const dn = new Intl.DisplayNames(["en"], { type: "region" });
  const countryName =
    profile.country.length === 2 ? (dn.of(profile.country) ?? profile.country) : profile.country;
  if (profile.city.trim() && countryName.trim()) return `${profile.city.trim()}, ${countryName}`;
  if (profile.city.trim()) return profile.city.trim();
  if (countryName.trim()) return countryName;
  return "";
}
