// Extract plain text from CV files for client-side autofill (PDF, .txt, .docx).

import { extractTextFromPdf } from "./pdfPages";

export async function extractTextForProfileImport(file: File): Promise<string> {
  const n = file.name.toLowerCase();
  const t = file.type;
  if (t === "text/plain" || n.endsWith(".txt")) {
    return file.text();
  }
  if (t === "application/pdf" || n.endsWith(".pdf")) {
    return extractTextFromPdf(file);
  }
  if (t === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || n.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const r = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return r.value;
  }
  if (n.endsWith(".doc") && t !== "text/plain") {
    throw new Error("Legacy .doc is not supported. Save as .docx or PDF and try again.");
  }
  return file.text();
}
