import jsPDF from "jspdf";
import type { GeneratedDocument } from "./types";

// Render a generated document (markdown-ish) to a clean ATS-friendly PDF.
export function downloadDocAsPdf(doc: GeneratedDocument) {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  const writeBlock = (text: string, opts: { size: number; bold?: boolean; gap?: number }) => {
    pdf.setFont("helvetica", opts.bold ? "bold" : "normal");
    pdf.setFontSize(opts.size);
    const lines = pdf.splitTextToSize(text, maxWidth) as string[];
    for (const line of lines) {
      if (y > pageHeight - margin) {
        pdf.addPage();
        y = margin;
      }
      pdf.text(line, margin, y);
      y += opts.size * 1.25;
    }
    y += opts.gap ?? 4;
  };

  const lines = doc.content.split("\n");
  for (const raw of lines) {
    const line = raw.replace(/\r/g, "");
    if (line.trim() === "" || line.trim() === "---") {
      y += 6;
      continue;
    }
    if (line.startsWith("# ")) {
      writeBlock(line.slice(2), { size: 20, bold: true, gap: 6 });
    } else if (line.startsWith("## ")) {
      writeBlock(line.slice(3), { size: 13, bold: true, gap: 4 });
    } else if (line.startsWith("### ")) {
      writeBlock(line.slice(4), { size: 11, bold: true, gap: 2 });
    } else {
      writeBlock(line, { size: 10, gap: 2 });
    }
  }

  const safeName = doc.title.replace(/[^a-z0-9-]+/gi, "-");
  pdf.save(`${safeName}.pdf`);
}
