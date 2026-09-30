import { createHash } from "node:crypto";
import { normalizeTitle } from "@/lib/text";
import { normalizeScholarlyDoi } from "./provider-query-policy";

const decode = (value: string) => value.replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
  .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/\s+/g, " ").trim();
/** Only explicit bibliographic metadata is eligible, never a synthesized abstract. */
export function observedSourceMetadata(html: string, expectedTitle: string) {
  const fields = new Map<string, string[]>();
  for (const tag of html.match(/<meta\s[^>]{0,10000}>/gi) ?? []) {
    const attrs = new Map([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)].map(m => [m[1].toLowerCase(), decode(m[3])]));
    const name = (attrs.get("name") ?? attrs.get("property") ?? "").toLowerCase();
    const content = attrs.get("content"); if (name && content) fields.set(name, [...(fields.get(name) ?? []), content]);
  }
  const first = (...keys: string[]) => keys.flatMap(key => fields.get(key) ?? [])[0] ?? null;
  const title = first("citation_title", "dc.title", "dcterms.title");
  if (!title || normalizeTitle(title) !== normalizeTitle(expectedTitle)) return null;
  const authors = fields.get("citation_author") ?? fields.get("dc.creator") ?? [];
  const year = Number(/\b(?:19|20)\d{2}\b/.exec(first("citation_publication_date", "dc.date", "dcterms.issued") ?? "")?.[0]) || null;
  const doi = normalizeScholarlyDoi(first("citation_doi", "dc.identifier.doi") ?? "") || null;
  if (!authors.length || !year) return null;
  return { title, authors, year, doi, abstract: first("citation_abstract", "dc.description.abstract", "dcterms.abstract"),
    venue: first("citation_journal_title", "dc.publisher"), bodyHash: createHash("sha256").update(html).digest("hex") };
}
