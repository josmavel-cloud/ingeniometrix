import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";
import type OpenAI from "openai";
import { WEB_DISCOVERY_SCHEMA_VERSION, WEB_SOURCE_TYPES,
  type ValidatedWebCandidate, type WebDiscoveryProposal, type WebSourceObservation } from "./web-discovery-contract";

const str = (length: number) => z.string().trim().min(1).max(length);
const proposalSchema = z.object({
  localCandidateRef: str(48), gapIds: z.array(str(120)).min(1).max(1),
  identityProposal: z.object({ title: str(500), authors: z.array(str(180)).max(20), year: z.number().int().min(1000).max(2200).nullable(),
    doi: str(300).nullable(), issuer: str(300).nullable(), sourceType: z.enum(WEB_SOURCE_TYPES) }).strict(),
  observedUrl: str(2048),
  relevanceProposal: z.object({ role: z.enum(["DIRECT", "METHODOLOGICAL", "THEORETICAL", "CONTEXTUAL"]),
    gapCoverage: str(700), rationale: str(900), uncertainty: str(600) }).strict(),
  accessProposal: z.object({ reportedAccessType: z.enum(["REPORTED_PDF", "REPORTED_FULL_TEXT", "UNKNOWN"]),
    reportedPdfUrl: str(2048).nullable(), alternateUrls: z.array(str(2048)).max(6) }).strict(),
}).strict();
const outputSchema = z.object({ schemaVersion: z.literal(WEB_DISCOVERY_SCHEMA_VERSION), candidates: z.array(proposalSchema).max(6) }).strict();
export const WEB_DISCOVERY_JSON_SCHEMA = z.toJSONSchema(outputSchema);

export function normalizePublicWebUrl(value: string): string | null {
  if (value.length > 2048 || /[\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !url.hostname) return null;
    const host = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
    // Literal IPs, even public ones, are excluded at this proposal-only stage.
    if (isIP(host) || !host.includes(".") || /(^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)) return null;
    if (url.port && url.port !== "80" && url.port !== "443") return null;
    url.hash = "";
    return url.toString();
  } catch { return null; }
}

type WebCall = Extract<OpenAI.Responses.Response["output"][number], { type: "web_search_call" }>;
export function extractWebObservations(response: Pick<OpenAI.Responses.Response, "id" | "output" | "created_at">, operationId: string) {
  const calls = response.output.filter((item): item is WebCall => item.type === "web_search_call");
  const observations: WebSourceObservation[] = [];
  let searchActionCount = 0;
  for (const call of calls) {
    if (call.status !== "completed" || call.action.type !== "search") continue;
    searchActionCount++;
    for (const [sourceIndex, raw] of (call.action.sources ?? []).entries()) {
      const normalizedUrl = normalizePublicWebUrl(raw.url);
      if (!normalizedUrl) continue;
      observations.push({ observationId: createHash("sha256").update(JSON.stringify([operationId,response.id,call.id,raw.url])).digest("hex"),
        operationId, responseId: response.id, toolCallId: call.id, actionType: "search",
        queryIfAvailable: call.action.queries?.join(" | ") || call.action.query || null,
        observedUrl: raw.url, normalizedUrl, observedTitleIfAvailable: null,
        observedAt: new Date(response.created_at * 1000).toISOString(), sourceIndex });
    }
  }
  return { toolCallCount: calls.length, searchActionCount, observations };
}

export function validateWebDiscoveryProposals(outputText: string, observations: WebSourceObservation[], allowedGapIds: string[], maxCandidates: number,
  operationId: string) {
  let parsed: z.infer<typeof outputSchema>;
  try { parsed = outputSchema.parse(JSON.parse(outputText)); }
  catch { return { validEnvelope: false as const, candidates: [] as ValidatedWebCandidate[], rejectedProposals: [] as Array<{localCandidateRef:string;reason:string}> }; }
  if (parsed.candidates.length > maxCandidates) return { validEnvelope: false as const, candidates: [] as ValidatedWebCandidate[], rejectedProposals: [] as Array<{localCandidateRef:string;reason:string}> };
  const allowed = new Set(allowedGapIds);
  const occurrences = new Map<string, number>();
  for (const proposal of parsed.candidates) occurrences.set(proposal.localCandidateRef, (occurrences.get(proposal.localCandidateRef) ?? 0) + 1);
  const candidates: ValidatedWebCandidate[] = [], rejectedProposals: Array<{localCandidateRef:string;reason:string}> = [];
  for (const proposal of parsed.candidates as WebDiscoveryProposal[]) {
    const reject = (reason: string) => rejectedProposals.push({ localCandidateRef: proposal.localCandidateRef, reason });
    if (occurrences.get(proposal.localCandidateRef)! > 1) { reject("DUPLICATE_LOCAL_CANDIDATE_REF"); continue; }
    if (proposal.gapIds.some(id => !allowed.has(id))) { reject("UNKNOWN_GAP_REF"); continue; }
    const normalized = normalizePublicWebUrl(proposal.observedUrl);
    if (!normalized || proposal.accessProposal.reportedPdfUrl && !normalizePublicWebUrl(proposal.accessProposal.reportedPdfUrl) ||
        proposal.accessProposal.alternateUrls.some(url => !normalizePublicWebUrl(url))) { reject("UNSAFE_URL"); continue; }
    const matches = observations.filter(o => o.operationId === operationId && o.normalizedUrl === normalized);
    if (!matches.length) { reject("MODEL_ONLY_URL_NOT_OBSERVED"); continue; }
    if (matches.length !== 1) { reject("AMBIGUOUS_SOURCE_OBSERVATION"); continue; }
    candidates.push({ proposal, observationIds: [matches[0].observationId],
      metadataProvenance: { observedUrl: "TOOL_OBSERVED", title: "MODEL_PROPOSED",
        authors: proposal.identityProposal.authors.length ? "MODEL_PROPOSED" : "UNKNOWN",
        year: proposal.identityProposal.year === null ? "UNKNOWN" : "MODEL_PROPOSED",
        doi: proposal.identityProposal.doi === null ? "UNKNOWN" : "MODEL_PROPOSED",
        issuer: proposal.identityProposal.issuer === null ? "UNKNOWN" : "MODEL_PROPOSED",
        sourceType: "MODEL_PROPOSED", access: proposal.accessProposal.reportedAccessType === "UNKNOWN" ? "UNKNOWN" : "MODEL_PROPOSED" } });
  }
  return { validEnvelope: true as const, candidates, rejectedProposals };
}
