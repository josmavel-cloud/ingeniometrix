import { Parser } from "htmlparser2";

export const REFERENCE_DISPLAY_TEXT_VERSION = "reference-display-text.v1";
const BLOCK = new Set(["p", "jats:p", "abstract", "jats:abstract", "title", "jats:title", "br", "li", "jats:list-item"]);
// MathML text can carry the actual scientific expression. Keep its text while
// dropping executable/embedded content and all markup in the display projection.
const SKIP = new Set(["script", "style", "iframe", "object", "svg", "!doctype"]);

function extractReadingText(raw: string) {
  const chunks: string[] = [];
  let hidden = 0;
  const parser = new Parser({
    onopentag(name) { const lower = name.toLowerCase(); if (hidden || SKIP.has(lower)) hidden++; else if (BLOCK.has(lower)) chunks.push("\n"); },
    onclosetag(name) { if (hidden) hidden--; else if (BLOCK.has(name.toLowerCase())) chunks.push("\n"); },
    ontext(value) { if (!hidden) chunks.push(value); },
  }, { decodeEntities: true, xmlMode: false, lowerCaseTags: true });
  parser.write(raw); parser.end();
  return chunks.join("");
}

/** A reading projection only. Bibliographic source fields remain unchanged. */
export function referenceDisplayText(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 200_000) return null;
  // HTMLParser2 has no network, external-entity or script execution capability.
  // Some providers double-encode JATS tags; make one bounded second pass only
  // for that recognized structure, never recursively parse arbitrary output.
  let text: string;
  try {
    text = extractReadingText(raw);
    if (/<\/?jats:[a-z][\w-]*\b/i.test(text)) text = extractReadingText(text);
  } catch { return null; }
  text = text.replace(/&amp;/gi, "&").replace(/\u00a0/g, " ").replace(/[\t\r ]+/g, " ")
    .replace(/ *\n+ */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return text || null;
}
