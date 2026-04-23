/**
 * Normalize user/LLM markdown for preview: unwrap accidental outer code fences
 * and fix ATX headings. CommonMark requires a space (or tab) after the # run; lines
 * like `##Title` (no separator) are paragraphs, so `##` shows literally. We fix that
 * to `## Title` (and `##\\tX` to `## X`). Blockquote lines: `> ##X` get the same.
 */
export function prepareMarkdownForPreview(raw: string): string {
  const withNl = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const t0 = stripOuterCodeFence(withNl);
  return ensureAtxHeadingSpaces(t0).trim();
}

/** If the string is one fenced block (``` or ```markdown), return inner text only. */
function stripOuterCodeFence(s: string): string {
  const t = s.trim();
  if (!t.startsWith("```")) {
    return s;
  }
  const lines = t.split("\n");
  if (lines.length < 2) {
    return s;
  }
  const first = lines[0].trim();
  if (!first.startsWith("```")) {
    return s;
  }
  const last = lines[lines.length - 1].trim();
  if (last === "```") {
    return lines
      .slice(1, -1)
      .map((l) => l.replace(/\r$/, ""))
      .join("\n");
  }
  return s;
}

function ensureAtxHeadingSpaces(s: string): string {
  return s
    .split("\n")
    .map((line) => line.replace(/\r$/, ""))
    .map((line) => fixAtxLine(line))
    .join("\n");
}

/**
 * `afterBq` = line after any leading `> ` blockquote markers.
 * Fix `##X` and `##\\tX`; leave `## X`, `##`, and `## #` (etc.) as-is.
 */
function fixAtxLine(line: string): string {
  const bqMatch = /^(> ?)+/.exec(line);
  const bq = bqMatch ? bqMatch[0] : "";
  const afterBq = bq ? line.slice(bq.length) : line;

  const m = /^(\s{0,3})(#{1,6})(.*)$/.exec(afterBq);
  if (!m) {
    return line;
  }
  const indent = m[1];
  const hashes = m[2];
  const rest = m[3];

  if (rest.length === 0) {
    return line;
  }
  // Already a proper separator after the # run
  if (rest[0] === " " || rest[0] === "\t") {
    if (rest[0] === "\t") {
      // normalize tab to a single space so `##\tX` becomes `## X`
      const afterTab = rest.slice(1).replace(/^\s*/, "");
      return `${bq}${indent}${hashes} ${afterTab}`;
    }
    return line;
  }
  // e.g. `##...` with only more # (closing syntax or 7+ hashes) — do not mangle
  if (rest[0] === "#") {
    return line;
  }
  // `##Title`, `##*x*`, etc.
  return `${bq}${indent}${hashes} ${rest}`;
}
