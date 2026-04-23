import { describe, expect, it } from "vitest";
import { assessCvTextReadability, parseCvFromPlainText } from "./cvTextImport";

const sampleCv = `Jane A. Smith
Frontend Engineer
jane.smith@acme.io
+1 (415) 555-0199
https://linkedin.com/in/janesmith
https://github.com/janesmith
https://jane.dev
https://www.behance.net/janesmith

Summary
I build design systems and React applications with a focus on accessibility. Ten years in product companies.

Experience

Senior Engineer at Acme Corp
2020-01 – Present
• Led the design system used by 40+ engineers
• Migrated the web app to TypeScript and React 18
• Shipped a new pricing flow that improved conversion 12%

Skills
TypeScript, React, GraphQL, Node.js, Figma, Testing

Education
BSc in Computer Science, State University, 2011 – 2014
`;

describe("parseCvFromPlainText", () => {
  it("extracts contact, summary, and role-at-company experience", () => {
    const p = parseCvFromPlainText(sampleCv);
    expect(p.fullName).toMatch(/Jane/);
    expect(p.email).toBe("jane.smith@acme.io");
    expect(p.phone).toBeTruthy();
    expect(p.linkedInUrl).toContain("linkedin.com");
    expect(p.githubUrl).toContain("github.com");
    expect(p.summary).toBeTruthy();
    expect(p.headline).toBeTruthy();
    expect(p.workHistory).toBeDefined();
    const w = p.workHistory![0]!;
    expect(w.role).toMatch(/Engineer/);
    expect(w.company).toMatch(/Acme/);
    expect(w.achievements.length).toBeGreaterThanOrEqual(1);
    expect(p.websiteUrl).toContain("jane.dev");
    expect(p.additionalLinks?.some((l) => l.url.includes("behance"))).toBe(true);
  });

  it("accepts assessCvTextReadability for typical extracted text", () => {
    expect(assessCvTextReadability(sampleCv).ok).toBe(true);
  });

  it("rejects empty or too-short text", () => {
    const r = assessCvTextReadability("hi");
    expect(r.ok).toBe(false);
  });
});
