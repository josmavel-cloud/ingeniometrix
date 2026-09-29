import { z } from "zod";
import type { LlmProvider } from "@/llm/provider";
import { enrichmentModelOutputSchema, enrichmentOutputSchema, fallbackSearchEnrichment, validateSearchEnrichment, type SemanticPlannerInput } from "@/lib/retrieval-semantic-plan";
import { REFERENCE_SEARCH_V2_2_PROMPT } from "@/server/mvp/prompts/reference-search-v2.v2";
import { renderVersionedPrompt } from "@/server/mvp/prompts/render-versioned-prompt";

export function searchEnrichmentModel() { return process.env.SOURCE_DISCOVERY_PLAN_MODEL?.trim() || "gpt-5.4-nano"; }
export async function planSemanticSearch(input: SemanticPlannerInput, provider: Pick<LlmProvider, "generateStructuredObject">) {
  if (input.readiness !== "READY") return fallbackSearchEnrichment(input, "NEEDS_CLARIFICATION");
  try {
    // One logical call, no second text-fallback operation. Existing provider
    // budget/idempotency and transport retry policy remain in charge.
    const raw = await provider.generateStructuredObject({
      model: searchEnrichmentModel(), reasoningEffort: "low", maxOutputTokens: 4500,
      schemaName: "research_search_enrichment_roles_v2", schema: z.toJSONSchema(enrichmentModelOutputSchema),
      prompt: renderVersionedPrompt(REFERENCE_SEARCH_V2_2_PROMPT, { var_0: JSON.stringify({
        schemaVersion: input.schemaVersion, policyVersion: input.policyVersion,
        signals: input.signals.map(({ provenance, ...signal }) => ({ ...signal,
          provenance: provenance ? { origin: provenance.origin, acceptance: provenance.acceptance } : null })),
        ambiguities: input.ambiguities, readiness: input.readiness,
      }) }),
      trackingLabel: "structured:reference_search_v2_plan",
      trackingAttribution: { stage: "source_discovery", promptVersion: REFERENCE_SEARCH_V2_2_PROMPT.version },
    });
    const parsedRaw = enrichmentOutputSchema.parse(raw);
    const plan = validateSearchEnrichment(input, parsedRaw);
    plan.rawPlannerOutput = parsedRaw;
    return plan.status === "READY" ? plan : fallbackSearchEnrichment(input, "ENRICHMENT_INSUFFICIENT");
  } catch {
    return fallbackSearchEnrichment(input, "ENRICHMENT_UNAVAILABLE_OR_INVALID");
  }
}
