import { beforeEach, describe, expect, it, vi } from "vitest";

const extractTextFromPdf = vi.fn();

vi.mock("./pdfPages", () => ({
  extractTextFromPdf: (...args: unknown[]) => extractTextFromPdf(...args),
}));

const extractRawText = vi.fn();
vi.mock("mammoth", () => ({
  extractRawText: (...a: unknown[]) => extractRawText(...a),
}));

describe("extractTextForProfileImport", () => {
  beforeEach(() => {
    vi.resetModules();
    extractTextFromPdf.mockReset();
    extractRawText.mockReset();
    extractTextFromPdf.mockResolvedValue("from pdf");
    extractRawText.mockResolvedValue({ value: "from docx" });
  });

  it("reads plain .txt as text", async () => {
    const { extractTextForProfileImport } = await import("./cvFileImport");
    const f = new File(["hello world"], "notes.txt", { type: "text/plain" });
    await expect(extractTextForProfileImport(f)).resolves.toBe("hello world");
  });

  it("uses extractTextFromPdf for PDF by MIME type", async () => {
    const { extractTextForProfileImport } = await import("./cvFileImport");
    const f = new File([""], "cv.pdf", { type: "application/pdf" });
    const out = await extractTextForProfileImport(f);
    expect(extractTextFromPdf).toHaveBeenCalledWith(f);
    expect(out).toBe("from pdf");
  });

  it("uses extractTextFromPdf for PDF by file extension", async () => {
    const { extractTextForProfileImport } = await import("./cvFileImport");
    const f = new File([""], "resume.PDF", { type: "application/octet-stream" });
    const out = await extractTextForProfileImport(f);
    expect(extractTextFromPdf).toHaveBeenCalledWith(f);
    expect(out).toBe("from pdf");
  });

  it("extracts .docx with mammoth", async () => {
    const { extractTextForProfileImport } = await import("./cvFileImport");
    const buf = new ArrayBuffer(8);
    const f = new File([buf], "profile.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const out = await extractTextForProfileImport(f);
    expect(extractRawText).toHaveBeenCalled();
    expect(out).toBe("from docx");
  });

  it("rejects legacy .doc with a clear error", async () => {
    const { extractTextForProfileImport } = await import("./cvFileImport");
    const f = new File([""], "old.doc", { type: "application/msword" });
    await expect(extractTextForProfileImport(f)).rejects.toThrow(/\.docx or PDF/);
  });
});
