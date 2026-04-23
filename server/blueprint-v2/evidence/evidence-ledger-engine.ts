import type {
  AssumptionInput,
  BlueprintSourceRecord,
  EvidenceLedger,
  ExtractedEvidencePack,
} from "@/server/blueprint-v2/types";

export function buildEvidenceLedger(input: {
  sourceRegistry: BlueprintSourceRecord[];
  evidencePacks: ExtractedEvidencePack[];
  assumptions: AssumptionInput[];
  assumptionSnippets: EvidenceLedger["snippets"];
  warnings: string[];
}): EvidenceLedger {
  const sourceSnippets = input.evidencePacks.flatMap((pack) => pack.snippets);

  return {
    source_registry: input.sourceRegistry,
    evidence_packs: input.evidencePacks,
    assets: input.evidencePacks.flatMap((pack) => pack.assets),
    assumptions: input.assumptions,
    snippets: [...sourceSnippets, ...input.assumptionSnippets],
    warnings: input.warnings,
  };
}
