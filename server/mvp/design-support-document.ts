import { Parser } from "htmlparser2";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fetchPublicDocument } from "@/server/retrieval/safe-document-fetch";

export type SupportPassage = { text: string; locator: string; page: number | null };
export type SupportDocument = {
  observedUrl: string; finalUrl: string; sha256: string; mediaType: "text/html" | "application/pdf";
  title: string; passages: SupportPassage[];
  privateArtifactPath?: string;
};
const clean = (text: string) => text.replace(/\s+/g, " ").trim();

// htmlparser2 decodes text entities once, never executes scripts or XML entities.
// Passage IDs refer to reading-order blocks, not invented page numbers.
export function htmlSupportPassages(html: string) {
  const passages: SupportPassage[] = [];
  let text = "", title = "", inTitle = false, ignored = 0;
  const hidden = new Set(["script", "style", "noscript", "template", "nav", "footer", "header", "svg"]);
  const blocks = new Set(["p", "li", "h1", "h2", "h3", "h4", "div", "section", "article", "tr", "br"]);
  const flush = () => { const value = clean(text); text = ""; if (value.length >= 40) passages.push({ text: value, locator: `html:block:${passages.length + 1}`, page: null }); };
  const parser = new Parser({
    onopentag(name) { if (hidden.has(name)) ignored++; if (name === "title") inTitle = true; if (!ignored && blocks.has(name)) flush(); },
    ontext(value) { if (inTitle) title += value; else if (!ignored) text += value; },
    onclosetag(name) { if (name === "title") inTitle = false; if (!ignored && blocks.has(name)) flush(); if (hidden.has(name)) ignored = Math.max(0, ignored - 1); },
  }, { decodeEntities: true });
  parser.end(html); flush();
  return { title: clean(title), passages };
}

export function rankSupportPassages(passages: SupportPassage[], question: string, maxChars = 10000) {
  const terms = new Set(question.toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}]{4,}/gu) ?? []);
  // This ranks inspection context only. Matching words never certify a claim.
  const ranked = passages.map((passage, index) => ({ passage, index,
    score: [...terms].filter(term => passage.text.toLowerCase().includes(term)).length }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  let size = 0;
  return ranked.filter(({ passage }) => {
    if (passage.text.length > 4000 || size + passage.text.length > maxChars) return false;
    size += passage.text.length; return true;
  }).slice(0, 12).sort((a, b) => a.index - b.index).map(item => item.passage);
}

export async function acquireSupportDocument(url: string, question: string, privateDirectory?: string): Promise<SupportDocument> {
  const fetched = await fetchPublicDocument(url, { Accept: "application/pdf,text/html,application/xhtml+xml" }, 20 * 1024 * 1024, 20000);
  if (!fetched.ok) throw new Error("DESIGN_SUPPORT_DOCUMENT_UNAVAILABLE");
  const sha256 = createHash("sha256").update(fetched.body).digest("hex");
  let title = "", passages: SupportPassage[], mediaType: SupportDocument["mediaType"];
  if (fetched.body.subarray(0, 5).toString() === "%PDF-") {
    mediaType = "application/pdf";
    const directory = await mkdtemp(path.join(os.tmpdir(), "imx-design-support-"));
    try {
      const file = path.join(directory, "source.pdf"), output = path.join(directory, "source.txt");
      await writeFile(file, fetched.body, { mode: 0o600 });
      const { stdout } = await promisify(execFile)("pdfinfo", [file], { timeout: 15000, maxBuffer: 65536, encoding: "utf8" });
      const pages = Number(/^Pages:\s+(\d+)/m.exec(stdout)?.[1]);
      if (!pages || pages > 1000 || /^Encrypted:\s+yes/m.test(stdout)) throw new Error("DESIGN_SUPPORT_PDF_INVALID");
      title = clean(/^Title:\s*(.+)$/m.exec(stdout)?.[1] ?? "");
      await promisify(execFile)("pdftotext", ["-f", "1", "-l", "60", file, output], { timeout: 60000, maxBuffer: 65536 });
      const extracted = await readFile(output, "utf8");
      if (extracted.length > 2_000_000) throw new Error("DESIGN_SUPPORT_TEXT_TOO_LARGE");
      passages = extracted.split("\f").flatMap((page, i) => page.split(/\n\s*\n/).map((paragraph, j) => ({
        text: clean(paragraph), page: i + 1, locator: `pdf:page:${i + 1}:paragraph:${j + 1}`,
      })).filter(passage => passage.text.length >= 40));
    } finally { await rm(directory, { recursive: true, force: true }); }
  } else if (/text\/html|application\/xhtml\+xml/.test(fetched.contentType)) {
    mediaType = "text/html";
    ({ title, passages } = htmlSupportPassages(fetched.body.toString("utf8")));
  } else throw new Error("DESIGN_SUPPORT_DOCUMENT_TYPE_UNSUPPORTED");
  let privateArtifactPath: string | undefined;
  if (privateDirectory) {
    await mkdir(privateDirectory, { recursive: true, mode: 0o700 });
    privateArtifactPath = path.join(privateDirectory, `${sha256}.${mediaType === "application/pdf" ? "pdf" : "html"}`);
    try { await writeFile(privateArtifactPath, fetched.body, { flag: "wx", mode: 0o600 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (createHash("sha256").update(await readFile(privateArtifactPath)).digest("hex") !== sha256) throw new Error("DESIGN_SUPPORT_ARTIFACT_INTEGRITY"); }
  }
  return { observedUrl: url, finalUrl: fetched.finalUrl, sha256, mediaType, title, privateArtifactPath,
    passages: rankSupportPassages(passages, question) };
}
