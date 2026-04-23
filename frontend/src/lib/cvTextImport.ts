// Heuristic CV / resume text → profile fields (client-side, no server round-trip).

import type { Education, Profile, WorkExperience } from "./types";

const newId = (): string =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `w-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const SECTION_RE =
  /^(summary|profile|about(?:\s+me)?|professional\s+summary|objective|experience|work(?:\s+history)?|employment|education|skills?|technical\s+skills?|key\s+skills?|competenc(?:y|ies)|project|certification|awards?)$/i;

const RESERVED_FIRST_LINES = /^(curriculum|resume|cv|vitae|page\s+\d)/i;

export type CvTextQuality = { ok: true } | { ok: false; message: string };

export function assessCvTextReadability(text: string): CvTextQuality {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 40) {
    return {
      ok: false,
      message:
        "Almost no readable text in this file. If it is a scan or photo-based PDF, export a text-based PDF, or upload a .docx or .txt file instead.",
    };
  }
  if (t.length < 120 && !EMAIL_RE.test(t) && !/[+]\d{6,}|\d{3}[-\s.]\d{3}/.test(t)) {
    return {
      ok: false,
      message:
        "We could only read a little text. Try a text-based PDF, .docx, or paste your CV as a .txt file.",
    };
  }
  if (!/[a-zA-Z]{8}/.test(t)) {
    return { ok: false, message: "Could not read enough letters from this file — it may be image-based." };
  }
  return { ok: true };
}

function linesFromText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
}

function pickEmail(text: string): string | null {
  const all = (text.match(EMAIL_RE) ?? [])
    .map((e) => e.trim())
    .filter(
      (e) =>
        !/^(no-?reply|mailer|support@)/i.test(e) &&
        !/example\.(com|org|test)/i.test(e) &&
        !/sentry\.(io|wf)/.test(e),
    );
  return all[0] ?? null;
}

function pickPhone(text: string): string | null {
  const candidates: string[] = [];
  const patterns = [
    /\+\d{1,3}[-.\s]?(?:\(?\d{2,4}\)?[-.\s]?)\d{2,4}[-.\s]?\d{2,4}[-.\s]?\d{0,6}/g,
    /(?:\(?\d{3}\)?[-.\s])\d{3}[-.\s]?\d{4}\b/g,
  ];
  for (const p of patterns) {
    for (const m of text.matchAll(p)) {
      const digits = m[0].replace(/\D/g, "");
      if (digits.length >= 9 && digits.length <= 16) {
        candidates.push(m[0].replace(/\s+/g, " ").trim());
      }
    }
  }
  return candidates[0] ?? null;
}

function pickUrl(text: string, re: RegExp): string | null {
  const g = re.global ? re : new RegExp(re.source, re.flags + "g");
  for (const m of text.matchAll(g)) {
    return m[0].replace(/[.,;:)]+$/, "");
  }
  for (const m of text.matchAll(/https?:\/\/[^\s\][)"]+/g)) {
    if (re.test(m[0])) {
      return m[0].replace(/[.,;:)]+$/, "");
    }
  }
  return null;
}

function lookLikeNameLine(line: string): boolean {
  if (line.length < 3 || line.length > 64) return false;
  // Reject lines that look like emails/URLs, but allow middle initials (e.g. "A.").
  if (/@|:\/\/|\swww\.|\.(com|org|io|dev|net)\b/i.test(line)) return false;
  if (/\d{3}/.test(line)) return false;
  if (RESERVED_FIRST_LINES.test(line)) return false;
  if (SECTION_RE.test(line.replace(/[^a-zA-Z ]/g, ""))) return false;
  const words = line.split(/\s+/);
  if (words.length < 2 || words.length > 5) return false;
  if (/\b(Engineer|Developer|Designer|Manager|Analyst|Consultant|Director|Lead|Head|Officer|Specialist|Scientist|Architect)\b/i.test(line)) {
    return false;
  }
  if (!words.every((w) => /^[A-ZÀ-Ý][\w'`.-]+$/i.test(w))) {
    if (!/^[A-Z]/.test(line) || /[^a-zA-Z\s'`.-]/.test(line)) {
      return false;
    }
  }
  return true;
}

function pickName(lines: string[]): string | null {
  let i = 0;
  while (i < lines.length && i < 10) {
    const line = lines[i]!;
    i++;
    if (RESERVED_FIRST_LINES.test(line)) {
      continue;
    }
    if (lookLikeNameLine(line)) {
      return line;
    }
  }
  return null;
}

function findSectionText(lines: string[], labels: string[], endLabelRegex: RegExp): string {
  const lower = labels.map((l) => l.toLowerCase());
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]!.toLowerCase().replace(/[:\-–—#*_]/g, "").trim();
    const noNum = t.replace(/^\d+\.?\s*/, "");
    if (lower.some((l) => noNum === l || noNum.startsWith(l + " "))) {
      start = i + 1;
      break;
    }
  }
  if (start < 0) return "";
  const out: string[] = [];
  for (let j = start; j < lines.length; j++) {
    const t = lines[j]!.trim();
    if (endLabelRegex.test(t) && t.length < 50 && j > start) {
      break;
    }
    out.push(lines[j]!);
  }
  return out.join("\n").trim();
}

function yyyymmFromToken(line: string): { start: string; end: string | null; rest: string } {
  if (!line.trim()) {
    return { start: "2018-01", end: null, rest: "" };
  }
  // "Jan 2020 – Mar 2023", "2020-2022", "2019-2021"
  const p = /(\d{4})\s*[-–—\s](?:to\s+)?(Present|Current|Now|\d{4})/i;
  const m1 = line.match(p);
  if (m1) {
    const y1 = m1[1]!;
    const y2 = m1[2]!;
    if (/present|current|now/i.test(y2)) {
      return { start: `${y1}-01`, end: null, rest: line.replace(m1[0]!, "").trim() };
    }
    if (/^\d{4}$/.test(y2)) {
      return { start: `${y1}-01`, end: `${y2}-12`, rest: line.replace(m1[0]!, "").trim() };
    }
  }
  const m2 = line.match(/\b((19|20)\d{2})\b/);
  if (m2) {
    const y = m2[1]!;
    return { start: `${y}-01`, end: null, rest: line.replace(m2[0]!, "").trim() };
  }
  return { start: "2018-01", end: null, rest: line };
}

function parseExperienceSection(raw: string): WorkExperience[] {
  if (!raw.trim()) {
    return [];
  }
  const L = linesFromText(raw);
  const atRe = /^(.{2,100})\s+at\s+(.+?)$/i;
  const out: WorkExperience[] = [];
  for (let i = 0; i < L.length; ) {
    if (/^experience$|^(work|employment|professional)\s+history?$/i.test(L[i]!) && L[i]!.length < 32) {
      i++;
      continue;
    }
    const m = L[i]!.match(atRe);
    if (!m) {
      i++;
      continue;
    }
    const role = m[1]!.replace(/\s+/g, " ").trim();
    const company = m[2]!.split(/[|;,]/)[0]!.replace(/\s+/g, " ").trim();
    if (role.length < 2 || company.length < 2) {
      i++;
      continue;
    }
    i++;
    let d = yyyymmFromToken("");
    if (i < L.length && (/\b(19|20)\d{2}\b|Present|Current|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/.test(L[i]!))) {
      d = yyyymmFromToken(L[i]!);
      i++;
    }
    const ach: string[] = [];
    for (; i < L.length; i++) {
      const row = L[i]!;
      if (atRe.test(row)) {
        break;
      }
      if (/^[\u2022•\-*·]/.test(row) || (row[0] === "–" && !row.startsWith("---") && !row.startsWith("––"))) {
        const t = row.replace(/^[·•\-*–\s]+/u, "").trim();
        if (t.length > 1) {
          ach.push(t);
        }
        continue;
      }
    }
    out.push({
      id: newId(),
      role: role || "Position",
      company: company || "—",
      startDate: d.start,
      endDate: d.end,
      achievements: ach.slice(0, 10),
    });
    if (out.length >= 4) {
      return out;
    }
  }
  if (out.length) {
    return out;
  }
  if (L.filter((l) => /^[·•\-*·\u2022]/.test(l)).length < 2) {
    return [];
  }
  const withBullets = L.filter((l) => /^[·•\-*·\u2022]/.test(l) || l.startsWith("– ")).map((l) =>
    l.replace(/^[·•\-*·–\s]+/u, "").trim(),
  );
  if (withBullets.length < 2) {
    return [];
  }
  const dateLine = L.find((l) => /(19|20)\d{2}/.test(l)) || "";
  const y = yyyymmFromToken(dateLine);
  return [
    {
      id: newId(),
      role: "Selected experience",
      company: "—",
      startDate: y.start,
      endDate: y.end,
      achievements: withBullets.slice(0, 8),
    },
  ];
}

function parseEducationSection(raw: string): Education[] {
  if (!raw.trim()) {
    return [];
  }
  const lines = linesFromText(raw);
  const out: Education[] = [];
  for (const line of lines) {
    if (line.length < 20 || /^education$/i.test(line)) {
      continue;
    }
    if (!/(university|college|institute|polytechnic|academy)/i.test(line) && !/^(BSc|MSc|PhD|Bachelor|Master|MBA|Diploma|B\.?A\.?|B\.?Sc\.?|M\.?A\.?|MSc)/i.test(line)) {
      continue;
    }
    const years = line.match(/\b(19|20)\d{2}\b/g) ?? [];
    const schoolM = line.match(
      /([A-Z0-9][A-Za-z0-9&'’\s-]{2,60}(?:University|College|Institute|Polytechnic|School|Academy))/i,
    );
    const head = line.split(/[,|·(]/)[0]!.trim();
    if (schoolM) {
      out.push({
        id: newId(),
        school: schoolM[1]!.trim().slice(0, 120),
        degree: head.length < 100 ? head : "Degree",
        field: "—",
        startDate: years[0] ? `${years[0]}-09` : "2015-09",
        endDate: years[1] && years[1] !== years[0] ? `${years[1]}-07` : null,
      });
    } else if (head.length > 10 && /(BSc|MSc|PhD|Bachelor|Master|MBA|Diploma|Degree)/i.test(line)) {
      out.push({
        id: newId(),
        school: line.replace(/^[^,]+,\s*/, "").split(/[·|–-]/)[0]!.trim().slice(0, 120) || "Institution",
        degree: head.slice(0, 64),
        field: "—",
        startDate: years[0] ? `${years[0]}-09` : "2015-09",
        endDate: years[1] && years[1] !== years[0] ? `${years[1]}-07` : null,
      });
    } else {
      continue;
    }
    if (out.length >= 2) {
      return out;
    }
  }
  return out;
}

function skillsFromText(raw: string, fallback: string): string[] {
  const t = (raw || fallback).replace(/^\s*[-•*·]+\s*/gm, "");
  if (!t.trim()) {
    return [];
  }
  if (t.includes("•")) {
    return t
      .split("•")
      .map((s) => s.trim().replace(/^[-·]\s*/, ""))
      .map((s) => s.split(/[,;]/)[0]!.trim())
      .filter((s) => s.length > 1 && s.length < 50);
  }
  const fromSep = t.split(/[,;|·/]/).map((s) => s.trim()).filter((s) => s.length > 0 && s.length < 50);
  if (fromSep.length >= 2) {
    return fromSep.slice(0, 20);
  }
  return [];
}

const TECH_HINTS = [
  "TypeScript", "JavaScript", "Python", "Java", "Go", "Rust", "C++", "C#", "React", "Vue", "Angular", "Svelte", "Node.js",
  "Django", "Flask", "FastAPI", "Next.js", "Remix", "GraphQL", "gRPC", "SQL", "PostgreSQL", "MongoDB", "Redis", "AWS",
  "Azure", "GCP", "Docker", "Kubernetes", "Tailwind", "Figma", "Jest", "Cypress", "CI/CD", "Terraform", "Ruby", "PHP",
  "Laravel", "Spring", "Kotlin", "Swift", "Scala", "R", "Tableau", "Power BI", "HTML", "CSS", "Bash", "Shell",
] as const;

function inferSkillsFromBody(text: string, existing: string[]): string[] {
  const set = new Set<string>(existing.map((s) => s.trim()).filter(Boolean));
  const low = text.toLowerCase();
  for (const h of TECH_HINTS) {
    if (low.includes(h.toLowerCase())) {
      set.add(h);
    }
  }
  return Array.from(set).slice(0, 24);
}

/**
 * Heuristic parser for autofill. Only sets fields with reasonable evidence in the text.
 */
export function parseCvFromPlainText(text: string): Partial<Profile> {
  const patch: Partial<Profile> = {};
  const full = text.replace(/\r/g, "\n");
  const lines = linesFromText(full);
  if (lines.length === 0) {
    return patch;
  }

  const email = pickEmail(full);
  if (email) {
    patch.email = email;
  }
  const phone = pickPhone(full);
  if (phone) {
    patch.phone = phone;
  }
  const linkedin = pickUrl(
    full,
    /https?:\/\/(www\.)?linkedin\.com\/[^\s\][)"]+/i,
  );
  if (linkedin) {
    patch.linkedInUrl = linkedin;
  }
  const github = pickUrl(
    full,
    /https?:\/\/(github\.com|www\.github\.com)\/[^\s\][)"]+/i,
  );
  if (github) {
    patch.githubUrl = github;
  }
  const med = pickUrl(
    full,
    /https?:\/\/(www\.)?medium\.com\/[^\s\][)"]+/i,
  );
  if (med) {
    patch.mediumUrl = med;
  }
  const x = pickUrl(
    full,
    /https?:\/\/(x\.com|www\.x\.com|twitter\.com)\/[^\s\][)"]+/i,
  );
  if (x) {
    patch.xUrl = x;
  }

  const name = pickName(lines);
  if (name) {
    patch.fullName = name;
  }

  const summaryText = findSectionText(
    lines,
    ["summary", "profile", "about me", "professional summary", "objective", "about"],
    /^(EXPERIENCE|WORK|EMPLOYMENT|EDUCATION|SKILLS|PROJECTS?|CERTIF)/i,
  );
  if (summaryText && summaryText.length > 40) {
    patch.summary = summaryText.replace(/\n+/g, "\n").trim().slice(0, 1800);
    if (!patch.headline) {
      const first = summaryText.split("\n").find((l) => l.length > 20 && l.length < 200);
      if (first) {
        patch.headline = first.replace(/[.]+$/, "").trim().slice(0, 200);
      }
    }
  }

  if (!patch.headline && (patch.summary || name)) {
    const guess = (patch.summary || lines.filter((l) => l.length > 12 && l.length < 100).join(" ")).split("\n")[0]!;
    if (guess) {
      patch.headline = guess.split(/[.!?]/)[0]!.trim().slice(0, 180) || (name ? `${name.split(" ")[0]} — professional` : "Professional");
    }
  }

  const skillsText = findSectionText(
    lines,
    ["skills", "technical skills", "key skills", "core competencies", "competencies", "tech stack", "stack"],
    /^(EXPERIENCE|EDUCATION|WORK|EMPLOYMENT|PROJECTS?|CERTIF|LANGUAGES?)/i,
  );
  let sk = skillsFromText(skillsText, full.slice(0, 4000));
  if (sk.length < 2) {
    sk = inferSkillsFromBody(full, sk);
  }
  if (sk.length > 0) {
    patch.skills = sk.slice(0, 32);
  }

  const expRaw = findSectionText(
    lines,
    [
      "experience",
      "work experience",
      "work history",
      "professional experience",
      "employment",
      "relevant experience",
    ],
    /^(EDUCATION|SKILLS?|ACADEMIC|PROJECTS?|CERTIF|PUBLICATION|REFERENCES?)/i,
  );
  const work = parseExperienceSection(expRaw);
  if (work.length > 0) {
    patch.workHistory = work;
  } else {
    const ach = lines
      .filter(
        (l) =>
          /^[•\-*·\u2022]/.test(l) &&
          l.length > 8 &&
          !/linkedin|@/.test(l) &&
          !/^\d+\.?\s*$/.test(l),
      )
      .map((l) => l.replace(/^[•\-*·\u2022]\s*/u, "").trim());
    if (ach.length >= 2) {
      const dateLine = lines.find((line) => /\b(19|20)\d{2}\b/.test(line) && line.length < 60) || "";
      const d = yyyymmFromToken(dateLine);
      patch.workHistory = [
        {
          id: newId(),
          role: patch.headline?.split(/[.–-]/)[0]!.trim().slice(0, 64) || "Recent role",
          company: "—",
          startDate: d.start,
          endDate: d.end,
          achievements: ach.slice(0, 8),
        },
      ];
    }
  }

  const eduRaw = findSectionText(
    lines,
    ["education", "academic background", "qualifications"],
    /^(EXPERIENCE|SKILLS?|WORK|EMPLOYMENT|PROJECTS?|CERTIF|AWARDS?)/i,
  );
  const education = parseEducationSection(eduRaw);
  if (education.length > 0) {
    patch.education = education;
  }

  return patch;
}

/** @deprecated use parseCvFromPlainText — same implementation */
export function mockParseCV(text: string): Partial<Profile> {
  return parseCvFromPlainText(text);
}
