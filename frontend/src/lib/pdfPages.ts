import * as pdfjs from "pdfjs-dist";
// Vite: worker for pdf.js
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

/** Returns page count for a PDF file. Rejects for non-PDF. */
export async function getPdfPageCount(file: File): Promise<number> {
  if (!file || file.size === 0) return 0;
  if (!isPdfFile(file)) {
    throw new Error("not_pdf");
  }
  const buf = await file.arrayBuffer();
  const task = pdfjs.getDocument({ data: buf, useSystemFonts: true });
  const pdf = await task.promise;
  return pdf.numPages;
}

type TextItem = { str: string; hasEOL?: boolean };

/**
 * Extract plain text from a text-based PDF (not scanned images). Preserves line breaks
 * when the PDF stream includes them. Used for profile autofill.
 */
export async function extractTextFromPdf(file: File): Promise<string> {
  if (!isPdfFile(file)) {
    throw new Error("not_pdf");
  }
  const buf = await file.arrayBuffer();
  const task = pdfjs.getDocument({ data: buf, useSystemFonts: true });
  const pdf = await task.promise;
  const pageChunks: string[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const lineParts: string[] = [];
    let current = "";
    for (const item of content.items) {
      if (!("str" in item) || typeof (item as TextItem).str !== "string") {
        continue;
      }
      const ti = item as TextItem;
      current += ti.str;
      if (ti.hasEOL) {
        const t = current.trim();
        if (t) lineParts.push(t);
        current = "";
      }
    }
    if (current.trim()) {
      lineParts.push(current.trim());
    }
    pageChunks.push(lineParts.join("\n"));
  }

  return pageChunks
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t\u00a0]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
