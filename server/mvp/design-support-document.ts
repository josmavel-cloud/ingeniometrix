import { Parser } from "htmlparser2";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fetchPublicDocument } from "@/server/retrieval/safe-document-fetch";

export type SupportPassage = { text: string; locator: string; page: number | null;
  contentKind?: "METADATA" | "ABSTRACT" | "FULL_TEXT_PASSAGE"; contentKindBasis?: string };
export type SupportDocument = {
  observedUrl: string; finalUrl: string; sha256: string; mediaType: "text/html" | "application/pdf";
  title: string; passages: SupportPassage[];
  privateArtifactPath?: string;
  bibliography?: { title: string | null; authors: string[]; year: number | null; doi: string | null };
};
const clean = (text: string) => text.replace(/\s+/g, " ").trim();

export function supportBibliographyFromHtml(html: string): NonNullable<SupportDocument["bibliography"]> {
  const values = new Map<string, string[]>();
  const parser = new Parser({ onopentag(name, attributes) {
    if (name !== "meta") return;
    const key = (attributes.name ?? "").toLowerCase(), value = clean(attributes.content ?? "");
    if (key.startsWith("citation_") && value) values.set(key, [...(values.get(key) ?? []), value]);
  } }, { decodeEntities: true });
  parser.end(html);
  const date = values.get("citation_publication_date")?.[0] ?? values.get("citation_date")?.[0] ?? "";
  const doi = values.get("citation_doi")?.[0]?.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "") ?? null;
  return { title: values.get("citation_title")?.[0] ?? null,
    authors: [...new Set(values.get("citation_author") ?? [])], year: /^(18|19|20|21)\d{2}\b/.test(date) ? Number(date.slice(0, 4)) : null,
    doi: doi && /^10\.\d{4,9}\/\S+$/i.test(doi) ? doi : null };
}

// htmlparser2 decodes text entities once, never executes scripts or XML entities.
// Passage IDs refer to reading-order blocks, not invented page numbers.
export function htmlSupportPassages(html: string) {
  type Kind = NonNullable<SupportPassage["contentKind"]>;
  type Frame = { tag: string; ignored: boolean; kind: Kind | null; fullBody: boolean };
  const passages: SupportPassage[] = [], stack: Frame[] = [];
  const metadataAbstracts = new Set<string>(), metadataDescriptions = new Set<string>();
  let text = "", title = "", heading = "", inHeading = false, sectionKind: Kind | null = null;
  let citationRecord = false, bodyStructure = false;
  const hidden = new Set(["script", "style", "noscript", "template", "nav", "footer", "header", "svg", "aside"]);
  const blocks = new Set(["p", "li", "h1", "h2", "h3", "h4", "div", "section", "article", "tr", "br"]);
  const identityText = (value: string) => clean(value).normalize("NFKC");
  function provenance(): { kind: Kind; basis: string } {
    if (inHeading) return {kind:"METADATA",basis:"SECTION_HEADING"};
    const explicit = [...stack].reverse().find(frame => frame.kind);
    if (explicit?.kind) return {kind:explicit.kind,basis:explicit.kind === "ABSTRACT" ? "ABSTRACT_CONTAINER" : "METADATA_CONTAINER"};
    if (sectionKind) return {kind:sectionKind,basis:sectionKind === "ABSTRACT" ? "ABSTRACT_SECTION" : "SECTION_STRUCTURE"};
    if (stack.some(frame => frame.fullBody)) return {kind:"FULL_TEXT_PASSAGE",basis:"ARTICLE_OR_CHAPTER_BODY"};
    return {kind:"METADATA",basis:"NO_SUBSTANTIVE_BODY_PROVENANCE"};
  }
  const flush = () => {
    const value = clean(text); text = "";
    if (value.length < 40) return;
    const {kind,basis}=provenance();
    passages.push({text:value,locator:`html:block:${passages.length + 1}`,page:null,contentKind:kind,contentKindBasis:basis});
  };
  const parser = new Parser({
    onopentag(name, attributes) {
      if (blocks.has(name)) flush();
      const marker = `${attributes.id ?? ""} ${attributes.class ?? ""} ${attributes.itemprop ?? ""}`.toLowerCase();
      const tokens = marker.split(/[^a-z0-9]+/).filter(Boolean);
      const ignored = !!stack.at(-1)?.ignored || hidden.has(name) || attributes.hidden !== undefined || attributes["aria-hidden"] === "true" ||
        ["navigation","contentinfo","banner","search"].includes(attributes.role ?? "") || tokens.some(token => ["nav","navbar","footer","header","breadcrumb","breadcrumbs","toolbar","cookie","cookies","share","social","menu"].includes(token));
      const kind: Kind | null = tokens.some(token => ["abstract","summary","resumen"].includes(token)) ? "ABSTRACT" :
        name === "h1" || tokens.some(token => ["metadata","bibliographic","citation","record","references","bibliography","authors","affiliations"].includes(token)) ? "METADATA" : null;
      const fullBody = !kind && (name === "article" || /(?:article|chapter|wiki|full)[-_ ]?(?:body|content|text)|articlebody/.test(marker));
      if (fullBody) bodyStructure = true;
      stack.push({tag:name,ignored,kind,fullBody});
      if (/^h[1-6]$/.test(name)) { inHeading=true; heading=""; }
      if (name === "meta") {
        const key=(attributes.name ?? attributes.property ?? "").toLowerCase(), value=identityText(attributes.content ?? "");
        if (key === "citation_title") citationRecord=true;
        if (value && ["citation_abstract","dc.description.abstract","dcterms.abstract","dc.abstract"].includes(key)) metadataAbstracts.add(value);
        if (value && ["description","og:description","dc.description","dcterms.description"].includes(key)) metadataDescriptions.add(value);
      }
    },
    ontext(value) {
      if (stack.some(frame=>frame.tag === "title")) { title+=value; return; }
      if (stack.at(-1)?.ignored || stack.some(frame=>frame.tag === "head")) return;
      if (inHeading) heading+=value;
      text+=value;
    },
    onclosetag(name) {
      if (blocks.has(name)) flush();
      if (/^h[1-6]$/.test(name)) {
        const label=clean(heading).toLowerCase().replace(/^\d+(?:\.\d+)*[.\s]*/,"");
        if (/^(abstract|summary|resumen)\b/.test(label)) sectionKind="ABSTRACT";
        else if (/^(references|bibliography|referencias|bibliograf[ií]a|acknowledg|author|affiliation)\b/.test(label)) sectionKind="METADATA";
        else if (/^(introduction|background|methods?|materials|results?|discussion|conclusions?|procedures?|data extraction|critical appraisal|quality assessment|introducci[oó]n|m[eé]todo|resultado|discusi[oó]n|conclusi[oó]n|procedimiento|extracci[oó]n|valoraci[oó]n)\b/.test(label)) { sectionKind="FULL_TEXT_PASSAGE"; bodyStructure=true; }
        else sectionKind=null;
        inHeading=false; heading="";
      }
      const index=stack.map(frame=>frame.tag).lastIndexOf(name);
      if (index>=0) stack.splice(index);
    },
  }, { decodeEntities:true });
  parser.end(html); flush();
  for (const passage of passages) {
    const value=identityText(passage.text);
    if (metadataAbstracts.has(value) || citationRecord && metadataDescriptions.has(value)) {
      passage.contentKind="ABSTRACT"; passage.contentKindBasis="BIBLIOGRAPHIC_ABSTRACT_METADATA_MATCH";
    } else if (!bodyStructure && passage.contentKind === "FULL_TEXT_PASSAGE") {
      passage.contentKind="METADATA"; passage.contentKindBasis="NO_SUBSTANTIVE_BODY_PROVENANCE";
    }
  }
  return {title:clean(title),passages};
}

export function rankSupportPassages(passages: SupportPassage[], question: string, maxChars = 10000) {
  const terms = new Set(question.toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}]{4,}/gu) ?? []);
  // This ranks inspection context only. Matching words never certify a claim.
  const sectionStart = /\b(quality assessment|critical appraisal|data extraction|extracting data from|detailed methods for|stage[s]? [0-9]|valoraci[oó]n|extracci[oó]n de datos)\b/iu;
  const sectionLead = new Set(passages.flatMap((p, i) => sectionStart.test(p.text) ? [i, i + 1] : []));
  const ranked = passages.map((passage, index) => ({ passage, index,
    score: [...terms].filter(term => passage.text.toLowerCase().includes(term)).length +
      (sectionLead.has(index) ? 20 : 0) + (passage.contentKind === "FULL_TEXT_PASSAGE" ? 20 : passage.contentKind === "METADATA" ? -80 : passage.contentKind === "ABSTRACT" ? -40 : 0) - (/^abstract\b/iu.test(passage.text) ? 40 : 0) +
      (/\b(should|must|describe|report|state|identify|record|document|debe|describir|registrar|indicar)\b/i.test(passage.text) ? 4 : 0) +
      (passage.text.length >= 160 ? 1 : 0) +
      (/\b(quality assessment|data extraction|coding|codes|themes|pilot|valoraci[oó]n|codificaci[oó]n)\b/iu.test(passage.text) ? 4 : 0) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  let size = 0;
  return ranked.filter(({ passage }) => {
    if (passage.text.length > 4000 || size + passage.text.length > maxChars) return false;
    size += passage.text.length; return true;
  }).slice(0, 12).sort((a, b) => a.index - b.index).map(item => item.passage);
}

export function verifiedPdfIdentityTitle(extracted: string, expected: { title: string; doi: string | null }) {
  const typography = (value: string) => clean(value.normalize("NFKC").replace(/[(),:;“”„«»]/g, " ")).toLowerCase();
  const firstPage = typography(extracted.split("\f")[0]);
  return (` ${firstPage} `).includes(` ${typography(expected.title)} `) &&
    (!expected.doi || firstPage.includes(expected.doi.toLowerCase())) ? expected.title : null;
}

export async function acquireSupportDocument(url: string, question: string, privateDirectory?: string, expectedIdentity?: { title: string; doi: string | null }): Promise<SupportDocument> {
  const fetched = await fetchPublicDocument(url, { Accept: "application/pdf,text/html,application/xhtml+xml" }, 20 * 1024 * 1024, 20000);
  if (!fetched.ok) throw new Error("DESIGN_SUPPORT_DOCUMENT_UNAVAILABLE");
  try { return await inspectSupportDocumentBytes(fetched, url, question, privateDirectory, expectedIdentity); }
  catch (error) {
    // The body was acquired even when PDF parsing, identity or persistence fails.
    // Propagate only a safe counting marker; never include document bytes/content.
    const failure = error instanceof Error ? error : new Error("DESIGN_SUPPORT_INSPECTION_FAILED");
    Object.assign(failure, { documentAcquired: true });
    throw failure;
  }
}

export async function inspectSupportDocumentBytes(fetched: { body: Buffer; contentType: string; finalUrl: string },
  url: string, question: string, privateDirectory?: string, expectedIdentity?: { title: string; doi: string | null }): Promise<SupportDocument> {
  const sha256 = createHash("sha256").update(fetched.body).digest("hex");
  let title = "", passages: SupportPassage[], mediaType: SupportDocument["mediaType"];
  let bibliography: SupportDocument["bibliography"];
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
      // PDF metadata can contain a placeholder (e.g. "Author:"). Trust a
      // proposed title only when the actual first page contains it verbatim
      // after whitespace normalization; a supplied DOI must occur too.
      if (expectedIdentity && verifiedPdfIdentityTitle(extracted, expectedIdentity)) {
        title = expectedIdentity.title;
        bibliography = { title, doi: expectedIdentity.doi, authors: [], year: null };
      }
      if (extracted.length > 2_000_000) throw new Error("DESIGN_SUPPORT_TEXT_TOO_LARGE");
      passages = extracted.split(/\nReferences\s*\n/, 1)[0].split("\f").flatMap((page, i) => page.split(/\n\s*\n/).map((paragraph, j) => ({
        text: clean(paragraph), page: i + 1, locator: `pdf:page:${i + 1}:paragraph:${j + 1}`,
      })).filter(passage => passage.text.length >= 40));
    } finally { await rm(directory, { recursive: true, force: true }); }
  } else if (/text\/html|application\/xhtml\+xml/.test(fetched.contentType)) {
    mediaType = "text/html";
    ({ title, passages } = htmlSupportPassages(fetched.body.toString("utf8")));
    bibliography = supportBibliographyFromHtml(fetched.body.toString("utf8"));
  } else throw new Error("DESIGN_SUPPORT_DOCUMENT_TYPE_UNSUPPORTED");
  let privateArtifactPath: string | undefined;
  if (privateDirectory) {
    await mkdir(privateDirectory, { recursive: true, mode: 0o700 });
    privateArtifactPath = path.join(privateDirectory, `${sha256}.${mediaType === "application/pdf" ? "pdf" : "html"}`);
    try { await writeFile(privateArtifactPath, fetched.body, { flag: "wx", mode: 0o600 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (createHash("sha256").update(await readFile(privateArtifactPath)).digest("hex") !== sha256) throw new Error("DESIGN_SUPPORT_ARTIFACT_INTEGRITY"); }
  }
  return { observedUrl: url, finalUrl: fetched.finalUrl, sha256, mediaType, title, privateArtifactPath, bibliography,
    passages: rankSupportPassages(passages, question) };
}
