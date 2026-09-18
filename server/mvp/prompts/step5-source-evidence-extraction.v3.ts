import { STEP5_SOURCE_EVIDENCE_EXTRACTION_PROMPT as V2 } from "./step5-source-evidence-extraction.v2";

const evidenceItem = V2.outputSchema.properties.evidence_items.items;
export const STEP5_SOURCE_EVIDENCE_EXTRACTION_PROMPT = {
  ...V2,
  version: "ingeniometrix-step5-source-evidence-extraction-v3",
  systemPrompt: `${V2.systemPrompt}\nEvery evidence item must include supporting_excerpt copied verbatim in the source language from a supplied chunk. The Spanish summary must not assert more than that excerpt supports. A matching excerpt establishes provenance, not automatic scientific sufficiency.`,
  userPromptTemplate: `${V2.userPromptTemplate}\nReturn at most 6 distinct evidence items, 3 methods/constructs and 3 limitations. Prefer concise complete sentences; do not fill every section when the source does not support it. Preserve methodological pluralism; source-study constructs are not automatically the proposed study's constructs. Metadata alone cannot support substantive claims.`,
  outputSchema: {
    ...V2.outputSchema,
    properties: {
      ...V2.outputSchema.properties,
      evidence_items: { ...V2.outputSchema.properties.evidence_items, maxItems: 6, items: {
        ...evidenceItem,
        required: [...evidenceItem.required, "supporting_excerpt"],
        properties: { ...evidenceItem.properties, supporting_excerpt: { type: "string" } },
      } },
    },
  },
} as const;
