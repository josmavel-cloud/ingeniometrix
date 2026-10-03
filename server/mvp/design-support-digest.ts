import type { MethodEvidencePack } from "./scientific-decision-contracts";
import type { DesignSupportAddendum } from "./design-support-addendum";
import { validateDesignSupport } from "./design-support-addendum";
import type { DesignSupportGap } from "./design-support-gap";
import { fingerprint } from "./job-execution-context";

export const DESIGN_SUPPORT_DIGEST_VERSION = "DesignSupportDigest.v1";
type Item = MethodEvidencePack["items"][number];
const key = (item: Pick<Item, "source_id" | "evidence_id">) => `${item.source_id}:${item.evidence_id}`;
const normalized = (text: string) => text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
// Generic procedural facets rank inspection candidates, never certify scientific
// support. No source name, discipline, user vocabulary or incident ID is privileged.
const facets = {
  discovery: /\b(search\w*|retriev\w*|busqu\w*|búsqu\w*|elegib\w*|eligib\w*)/iu,
  appraisal: /\b(apprais\w*|quality|calidad|sesgo\w*|bias|evaluat\w*|evaluaci\w*)/iu,
  extraction: /\b(extract\w*|extrac\w*|coding|codific\w*|categor\w*)/iu,
  synthesis: /\b(synthe\w*|sínte\w*|sinte\w*|integrat\w*|integra\w*|analy\w*|anális\w*)/iu,
  validation: /\b(validat\w*|validaci\w*|calibrat\w*|verific\w*|reproduc\w*)/iu,
};
const limitation = /\b(not intended|not sufficient|not be sufficient|may not|cannot|limited|limitations?|depend\w*|no permite|no garantiza|limitaci\w*|insuficiente|condicion\w*)/iu;
const explicitBoundary = /\b(not intended|not be sufficient|not sufficient|cannot|may need|no permite|no garantiza|insuficiente|solo si|only if)\b/iu;
const procedural = /\b(should|must|required|requires?|recommended|involves?|follow\w*|undertake\w*|consists?|debe\w*|requiere\w*|procedimiento\w*)/iu;
export function buildDesignSupportDigest(input: {
  pack: MethodEvidencePack; addendum: DesignSupportAddendum | null;
  identity: Pick<DesignSupportAddendum, "userId" | "projectId" | "jobId" | "definitionHash">;
  gaps: DesignSupportGap[]; requiredPointers: Array<Pick<Item, "source_id" | "evidence_id">>;
}) {
  if (input.addendum) validateDesignSupport(input.addendum, input.identity);
  const all = new Map(input.pack.items.map(item => [key(item), item]));
  if (all.size !== input.pack.items.length) throw new Error("DESIGN_DIGEST_DUPLICATE_POINTER");
  const chosen = new Map<string, { item: Item; reasons: string[]; claims: string[] }>();
  const choose = (item: Item, reason: string, claims: string[]) => {
    const saved = chosen.get(key(item));
    if (saved) { saved.reasons = [...new Set([...saved.reasons, reason])]; saved.claims = [...new Set([...saved.claims, ...claims])]; }
    else chosen.set(key(item), { item, reasons: [reason], claims });
  };
  for (const pointer of input.requiredPointers) {
    const item = all.get(key(pointer));
    if (!item) throw new Error("DESIGN_DIGEST_REQUIRED_POINTER_MISSING");
    choose(item, "EXISTING_DESIGN_POINTER", []);
  }
  const exclusions: Array<{ evidenceId: string; reason: string }> = [];
  for (const source of [...(input.addendum?.sources ?? [])].sort((a, b) => a.sourceId.localeCompare(b.sourceId))) {
    const gaps = input.gaps.filter(gap => gap.gapId === source.gapId);
    if (!gaps.length) throw new Error("DESIGN_DIGEST_GAP_MISMATCH");
    const claims = gaps.flatMap(gap => gap.findingCodes);
    const seen = new Set<string>();
    const ranked = input.pack.items.filter(item => item.source_id === source.sourceId).map((item, index) => {
      const original = source.document.passages[index];
      if (!original || item.excerpt !== original.text || item.locator?.chunk_id !== original.locator || item.allowed_use !== "theory_or_method_support" ||
          ["ABSTRACT_METADATA", "VERIFIED_METADATA_ONLY"].includes(item.evidence_level)) throw new Error("DESIGN_DIGEST_PASSAGE_INTEGRITY");
      const text = normalized(item.excerpt);
      const duplicate = seen.has(text); seen.add(text);
      const found = Object.entries(facets).filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
      const limits = limitation.test(text);
      return { item, index, duplicate, found, limits, score: found.length + (procedural.test(text) ? 8 : 0) + (explicitBoundary.test(text) ? 6 : 0) - (/\b(compliance|correlated|preliminary research|we sought|discovered)\b/iu.test(text) ? 6 : 0), text };
    }).filter(candidate => {
      if (chosen.has(key(candidate.item))) return true;
      const reason = candidate.duplicate ? "DUPLICATE_TEXT" : candidate.text.length < 100 ? "HEADING_OR_SHORT_METADATA" : null;
      if (reason) { exclusions.push({ evidenceId: candidate.item.evidence_id, reason }); return false; }
      return true;
    }).sort((a, b) => b.score - a.score || a.index - b.index);
    // Each relevant source contributes only useful inspection context. Diversity
    // never upgrades evidence or forces its citation. Preserve contrary caveats.
    const selectedTexts: Set<string>[] = [];
    let selectedCount = 0;
    for (const candidate of ranked) {
      const words = new Set(candidate.text.match(/[\p{L}\p{N}]+/gu) ?? []);
      const nearDuplicate = selectedTexts.some(previous => {
        const intersection = [...words].filter(word => previous.has(word)).length;
        return intersection / new Set([...words, ...previous]).size > 0.8;
      });
      const pinned = chosen.has(key(candidate.item));
      // Broad procedural facet overlap is NOT redundancy: a general overview
      // must not displace detailed extraction/synthesis instructions. Keep full
      // distinct passages and explicit restrictions even after the soft quota.
      const boundary = explicitBoundary.test(candidate.text);
      if (!pinned && (nearDuplicate && !boundary || candidate.score <= 0 || selectedCount >= 6 && !boundary)) {
        exclusions.push({ evidenceId: candidate.item.evidence_id, reason: nearDuplicate ? "NEAR_DUPLICATE_TEXT" :
          candidate.score <= 0 ? "BACKGROUND_NOT_PROCEDURAL" : "LOWER_RANKED_AVAILABLE_IN_FULL_ADDENDUM" });
        continue;
      }
      choose(candidate.item, pinned ? "EXISTING_DESIGN_POINTER" : boundary ? "TRANSFER_LIMIT_OR_COUNTEREVIDENCE" :
        `GAP_LINKED_DISTINCT_PROCEDURE:${candidate.found.join(",")}`, claims);
      selectedTexts.push(words); selectedCount++;
    }
  }
  const passages = [...chosen.values()].sort((a, b) => key(a.item).localeCompare(key(b.item))).map(({ item, reasons, claims }) => ({
    source_id: item.source_id, evidence_id: item.evidence_id, evidence_level: item.evidence_level,
    allowed_use: item.allowed_use, locator: item.locator, excerpt: item.excerpt,
    ...(input.addendum?.sources.some(source => source.sourceId === item.source_id) ? {} : { summary: item.summary }),
    supports: claims, selectionReasons: reasons,
  }));
  const used = new Set(passages.map(item => item.source_id));
  const sources = [...used].sort().map(sourceId => {
    const source = input.addendum?.sources.find(item => item.sourceId === sourceId);
    return source ? { source_id: sourceId, title: source.title, authors: source.authors, year: source.year, doi: source.doi,
      provenance: source.provenance, sourceType: source.document.mediaType, documentHash: source.document.sha256,
      observedUrl: source.document.observedUrl, finalUrl: source.document.finalUrl,
      transferLimits: "La extracción y el vínculo con la brecha no certifican aplicabilidad; evaluar los pasajes y sus condiciones." }
      : input.pack.selected_sources.find(item => item.source_id === sourceId) ?? { source_id: sourceId };
  });
  const effectiveEvidenceFingerprint = fingerprint({ identity: input.identity, pack: input.pack, addendum: input.addendum?.checksum ?? null });
  const value = { version: DESIGN_SUPPORT_DIGEST_VERSION, effectiveEvidenceFingerprint,
    supportAssessment: "INSPECTION_CANDIDATES_NOT_SCIENTIFIC_APPROVAL",
    claimsToSupport: input.gaps.map(gap => ({ gapId: gap.gapId, findingCodes: gap.findingCodes, claim: gap.affectedClaim, requirement: gap.whyMaterial })),
    sources, passages };
  return { ...value, digestFingerprint: fingerprint(value), audit: { originalPassageCount: input.pack.items.length,
    selectedPassageCount: passages.length, exclusions, fullSupportChecksum: input.addendum?.checksum ?? null } };
}
export type DesignSupportDigest = ReturnType<typeof buildDesignSupportDigest>;
export function digestPromptContext(digest: DesignSupportDigest) {
  const { audit: _audit, ...context } = digest;
  return context;
}
