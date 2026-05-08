import { buildLimitedInspectionItemFromText } from "@/blueprint_launch/server/source-limited-inspection";
import {
  buildPdfRelevanceKeywordCategories,
  reviewPdfRelevanceFromLimitedInspection,
} from "@/server/blueprint-engine/quality/pdf-relevance-review";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function repeated(text: string, count = 18) {
  return Array.from({ length: count }, () => text).join(" ");
}

function limitedInspection(items: ReturnType<typeof buildLimitedInspectionItemFromText>[]) {
  return {
    artifact_type: "limited_source_inspection" as const,
    artifact_version: "v1" as const,
    savedAt: new Date().toISOString(),
    summary: "synthetic",
    runDir: null,
    attemptedCount: items.length,
    inspectedCount: items.filter((item) => item.status === "inspected").length,
    usableInspectionCount: items.filter((item) => item.status === "inspected" && item.textCharCount >= 500).length,
    failedCount: items.filter((item) => item.status === "failed").length,
    skippedCount: items.filter((item) => item.status === "skipped").length,
    postInspectionDecision: "PROCEED_TO_FULL_EXTRACTION" as const,
    postInspectionReasons: [],
    sourceIdsForFullExtraction: items.map((item) => item.sourceId),
    sourceIdsNeedingReplacement: [],
    sourceIdsNeedingManualReview: [],
    sourceIdsForDeepResearchLight: [],
    secondaryReferenceCandidateCount: 0,
    items,
    warnings: [],
  };
}

const intake = {
  topic: "Association between medication adherence and treatment continuity in adult patients with chronic disease in outpatient services.",
  problemContext: "The study focuses on barriers to medication adherence, continuity of care, and patient follow-up in outpatient chronic disease services.",
  researchLine: "Public health, chronic disease management, therapeutic adherence, care quality.",
  targetPopulation: "Adult patients with chronic disease in outpatient follow-up services.",
  availableData: "Published studies on adherence instruments, barriers, follow-up and health service factors.",
  preferredMethodology: "Applied literature review and observational cross-sectional study proposal.",
  academicConstraints: "No personal health data will be used in this phase.",
  advisorNotes: "Separate local evidence from international evidence.",
};

async function run() {
  const categories = buildPdfRelevanceKeywordCategories({
    intake,
    knowledgeAreaLabel: "Neutral health discipline",
  });
  assert(categories.necessary.includes("adherence"), "Necessary keywords should derive from the current intake.");
  assert(!categories.necessary.includes("seismic"), "Keyword categories must not contain unrelated stale terms.");

  const nuclear = buildLimitedInspectionItemFromText({
    sourceId: "source-nuclear",
    title: "Medication adherence and continuity in adult chronic disease outpatient care",
    doi: "10.1000/source-nuclear",
    inspectedKind: "pdf",
    text: repeated(
      "Medication adherence and treatment continuity in adult chronic disease outpatient services were assessed using a cross sectional study design. The population included adult patients in outpatient follow-up, and outcomes included adherence barriers, care continuity, health literacy, and patient follow-up.",
    ),
  });
  const contextual = buildLimitedInspectionItemFromText({
    sourceId: "source-contextual",
    title: "General health systems financing review",
    inspectedKind: "pdf",
    text: repeated(
      "This health systems financing review discusses service organization, policy context, and broad public health planning. It does not evaluate medication adherence, continuity of treatment, adult patient follow-up, or chronic disease outpatient outcomes.",
    ),
  });
  const failed = buildLimitedInspectionItemFromText({
    sourceId: "source-failed",
    title: "Potentially useful inaccessible source",
    status: "failed",
    inspectedKind: "unknown",
    text: "",
  });

  const report = await reviewPdfRelevanceFromLimitedInspection({
    caseId: "synthetic-current-case",
    intake,
    knowledgeAreaLabel: "Neutral health discipline",
    limitedInspection: limitedInspection([nuclear, contextual, failed]),
    allowLlm: false,
  });

  const nuclearReview = report.items.find((item) => item.source_id === "source-nuclear");
  const contextualReview = report.items.find((item) => item.source_id === "source-contextual");
  const failedReview = report.items.find((item) => item.source_id === "source-failed");

  assert(report.llm_status === "skipped", "allowLlm=false should avoid LLM calls.");
  assert(nuclearReview?.relevance_class === "nuclear_direct", "PDF text covering the current core should be nuclear.");
  assert(
    nuclearReview?.allowed_evidence_use === "central_claim_support",
    "Nuclear source should be allowed for central claim support.",
  );
  assert(
    contextualReview?.relevance_class !== "nuclear_direct",
    "Same broad area without central problem coverage must not be nuclear.",
  );
  assert(failedReview?.relevance_class === "unusable", "Failed/no-text source cannot be relevant.");
  assert(report.source_ids_nuclear_direct.includes("source-nuclear"), "Nuclear source id should be reported.");
  assert(
    report.source_ids_needing_replacement.includes("source-failed"),
    "Unusable source should be marked for replacement.",
  );
}

void run().then(() => {
  console.log("test-pdf-relevance-review: ok");
});
