import { buildSourceSufficiencyReport } from "@/server/blueprint-engine/quality/source-sufficiency";

type TestResult = { name: string; passed: boolean; detail?: string };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function runTest(name: string, fn: () => Promise<void> | void): Promise<TestResult> {
  try {
    await fn();
    return { name, passed: true };
  } catch (error) {
    return { name, passed: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

function fakeHandoff() {
  return {
    handoff_id: "handoff-neutral",
    warnings: [],
    source_registry: [
      {
        source_id: "source-direct",
        title: "Direct full text source",
        citation_metadata: { raw: { source_health_classification: { source_health: "usable_full_text", topic_fit: "direct" } } },
      },
      {
        source_id: "source-adjacent",
        title: "Adjacent context source",
        citation_metadata: { raw: { source_health_classification: { source_health: "usable_full_text", topic_fit: "adjacent" } } },
      },
      {
        source_id: "source-metadata",
        title: "Metadata source",
        citation_metadata: { raw: { source_health_classification: { source_health: "metadata_only", topic_fit: "direct" } } },
      },
    ],
    evidence_units: [
      {
        evidence_id: "source-direct-chunk-1",
        source_id: "source-direct",
        citation_eligibility: "direct_quote",
        claim_scope: "source_fact",
        char_start: 0,
        quote_hash: "hash-direct",
      },
      {
        evidence_id: "source-adjacent-chunk-1",
        source_id: "source-adjacent",
        citation_eligibility: "direct_quote",
        claim_scope: "source_fact",
        char_start: 0,
        quote_hash: "hash-adjacent",
      },
    ],
    source_priorities: [],
    asset_registry: [],
  } as any;
}

async function main() {
  const results = await Promise.all([
    runTest("under-minimum source set gets core method recommendation", () => {
      const report = buildSourceSufficiencyReport({
        case_id: "neutral",
        handoff: fakeHandoff(),
        minUsableFullTextSources: 4,
        productionSafety: {
          production_eligible: false,
          warnings: [],
          production_ineligibility_reasons: ["Usable full-text source count is below production minimum."],
        } as any,
      });
      assert(
        report.recommendations.some((item) => item.category === "add_core_method_sources"),
        "core method recommendation missing",
      );
      assert(report.production_eligible === false, "production eligibility was weakened");
    }),
    runTest("adjacent and metadata-only sources trigger replacement recommendation", () => {
      const report = buildSourceSufficiencyReport({
        handoff: fakeHandoff(),
        productionSafety: { production_eligible: false, warnings: [], production_ineligibility_reasons: [] } as any,
      });
      assert(
        report.recommendations.some((item) => item.category === "replace_weak_or_adjacent_sources"),
        "replacement recommendation missing",
      );
    }),
    runTest("secondary queue triggers recovery recommendation", () => {
      const report = buildSourceSufficiencyReport({
        handoff: fakeHandoff(),
        productionSafety: { production_eligible: false, warnings: [], production_ineligibility_reasons: [] } as any,
        secondaryReferenceQueue: {
          artifact_type: "secondary_reference_recovery_queue",
          artifact_version: "v1",
          generated_at: new Date().toISOString(),
          case_id: "neutral",
          handoff_id: "handoff-neutral",
          source_count_scanned: 1,
          candidate_count: 1,
          candidates: [
            {
              candidate_id: "secondary-1",
              dedupe_key: "title_year:test:2020",
              discovered_in_source_id: "source-direct",
              discovered_in_source_title: "Direct",
              discovered_from: "reference_list",
              marker: "Author (2020). Test.",
              title: "Test",
              authors: ["Author"],
              year: 2020,
              doi: null,
              evidence_id: null,
              snippet: "Author (2020). Test.",
              recovery_status: "not_recovered",
              citable_status: "not_citable_until_recovered",
              recommended_search_query: "Author 2020 Test",
              reasons: [],
              warnings: [],
            },
          ],
          warnings: [],
        },
      });
      assert(
        report.recommendations.some((item) => item.category === "recover_secondary_references"),
        "secondary recovery recommendation missing",
      );
    }),
  ]);

  for (const result of results) {
    console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` :: ${result.detail}` : ""}`);
  }
  if (results.some((result) => !result.passed)) process.exit(1);
}

main();
