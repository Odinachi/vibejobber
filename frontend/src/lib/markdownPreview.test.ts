import { describe, expect, it } from "vitest";
import { prepareMarkdownForPreview } from "./markdownPreview";

describe("prepareMarkdownForPreview", () => {
  it("inserts space after ## when missing (common LLM bug)", () => {
    const out = prepareMarkdownForPreview("##Summary\n\nPara");
    expect(out).toContain("## Summary");
    expect(out).not.toMatch(/\n##Summary/);
  });

  it("leaves well-formed ATX alone", () => {
    const s = "## Good heading\n\nText";
    expect(prepareMarkdownForPreview(s)).toBe(s);
  });

  it("normalizes tab after ## to a space", () => {
    const out = prepareMarkdownForPreview("##\tAfter tab");
    expect(out).toBe("## After tab");
  });

  it("strips outer markdown code fence", () => {
    const inStr = "```markdown\n##X\n\ny\n```";
    const out = prepareMarkdownForPreview(inStr);
    expect(out).toContain("## X");
  });

  it("handles blockquote + heading", () => {
    expect(prepareMarkdownForPreview("> ##X")).toBe("> ## X");
  });
});
