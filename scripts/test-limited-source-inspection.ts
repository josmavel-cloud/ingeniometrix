import {
  buildLimitedInspectionItemFromText,
  evaluateLimitedInspectionGate,
} from "@/blueprint_launch/server/source-limited-inspection";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function repeated(text: string, count = 20) {
  return Array.from({ length: count }, () => text).join(" ");
}

function run() {
  const sourceA = buildLimitedInspectionItemFromText({
    sourceId: "source-a",
    title: "Current health adherence study",
    doi: "10.1000/current-a",
    plannedContentUrl: "https://example.org/a.pdf",
    inspectedKind: "pdf",
    text: repeated(
      "Current health adherence study 10.1000/current-a methods cross sectional study design sample population variable indicator outcome factor framework model.",
    ),
    equationCandidateCount: 0,
    secondaryReferenceCandidateCount: 3,
  });
  const sourceB = buildLimitedInspectionItemFromText({
    sourceId: "source-b",
    title: "Current clinical measurement framework",
    plannedContentUrl: "https://example.org/b.pdf",
    inspectedKind: "pdf",
    text: repeated(
      "Current clinical measurement framework methodology survey instrument validation scale score construct conceptual framework variable exposure outcome.",
    ),
    tableCandidateCount: 2,
    secondaryReferenceCandidateCount: 2,
  });

  assert(sourceA.identityStatus === "matched", "DOI/title matched source should pass identity check.");
  assert(sourceA.methodSignalCount > 0, "Method signals should be detected.");
  assert(sourceA.variableSignalCount > 0, "Variable signals should be detected.");

  const proceed = evaluateLimitedInspectionGate({ items: [sourceA, sourceB] });
  assert(
    proceed.postInspectionDecision === "PROCEED_TO_FULL_EXTRACTION",
    "Two useful sources with method/theory/variable signals should proceed.",
  );
  assert(proceed.secondaryReferenceCandidateCount === 5, "Secondary references should be counted.");

  const mismatch = buildLimitedInspectionItemFromText({
    sourceId: "source-c",
    title: "Current topic source",
    plannedContentUrl: "https://example.org/c.pdf",
    inspectedKind: "pdf",
    text: repeated("Completely unrelated document content with methods and variables."),
  });
  assert(mismatch.identityStatus === "mismatch", "Unrelated text should trigger mismatch.");

  const manualReview = evaluateLimitedInspectionGate({ items: [sourceA, sourceB, mismatch] });
  assert(
    manualReview.postInspectionDecision === "NEEDS_MANUAL_PDF_REVIEW",
    "Mismatched source should require manual review when enough usable text remains.",
  );

  const weakSet = evaluateLimitedInspectionGate({
    items: [
      buildLimitedInspectionItemFromText({
        sourceId: "source-d",
        title: "Current topic source",
        inspectedKind: "pdf",
        text: "short text",
      }),
    ],
  });
  assert(
    weakSet.postInspectionDecision === "BLOCK_NO_USABLE_EVIDENCE",
    "No usable extracted text should block before full extraction.",
  );

  const noMethodSignals = evaluateLimitedInspectionGate({
    items: [
      buildLimitedInspectionItemFromText({
        sourceId: "source-e",
        title: "Current topic one",
        inspectedKind: "pdf",
        text: repeated("Current topic one descriptive background context without study design markers."),
      }),
      buildLimitedInspectionItemFromText({
        sourceId: "source-f",
        title: "Current topic two",
        inspectedKind: "pdf",
        text: repeated("Current topic two descriptive background context without analytical markers."),
      }),
    ],
  });
  assert(
    noMethodSignals.postInspectionDecision === "NEEDS_DEEP_RESEARCH_LIGHT",
    "Usable text without method/theory/variable signals should route to Deep Research light fallback.",
  );
}

run();
console.log("test-limited-source-inspection: ok");
