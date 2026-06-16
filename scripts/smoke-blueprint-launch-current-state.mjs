import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const statePath = path.join(root, "artifacts-local", "blueprint_launch", "lab-state.json");
const latestConsolidatedPath = path.join(
  root,
  "artifacts-local",
  "blueprint_launch",
  "consolidated_evidence",
  "latest-consolidated-evidence.json",
);

const checks = [];

function pass(name, detail = "") {
  checks.push({ status: "PASS", name, detail });
}

function fail(name, detail = "") {
  checks.push({ status: "FAIL", name, detail });
}

function assertCheck(condition, name, detail = "") {
  if (condition) {
    pass(name, detail);
  } else {
    fail(name, detail);
  }
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function countUnitsByEligibility(units, eligibility) {
  return units.filter((unit) => unit.citation_eligibility === eligibility).length;
}

function summarizeAndExit() {
  for (const check of checks) {
    console.log(`${check.status} ${check.name}${check.detail ? ` - ${check.detail}` : ""}`);
  }

  const failed = checks.filter((check) => check.status === "FAIL");
  console.log("");
  console.log(`Smoke checks: ${checks.length - failed.length}/${checks.length} passed.`);

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

try {
  assertCheck(existsSync(statePath), "lab state exists", statePath);
  assertCheck(existsSync(latestConsolidatedPath), "latest consolidated artifact exists", latestConsolidatedPath);

  if (!existsSync(statePath) || !existsSync(latestConsolidatedPath)) {
    summarizeAndExit();
    process.exit();
  }

  const state = readJson(statePath);
  const latestConsolidated = readJson(latestConsolidatedPath);
  const consolidated = state.consolidatedEvidenceArtifact ?? latestConsolidated;
  const sourceSignalExtraction = state.sourceSignalExtraction;
  const contentMaterialization = state.contentMaterialization;
  const evidencePacksArtifact = state.evidencePacksArtifact;
  const selectedSourcesBundle = state.selectedSourcesBundle;
  const evidenceUnits = consolidated.evidence_units ?? [];
  const sectionDossiers = consolidated.section_dossiers ?? [];

  assertCheck(Boolean(state.savedIntake), "saved intake is present");
  assertCheck(Boolean(selectedSourcesBundle), "selected source bundle is present");
  assertCheck(selectedSourcesBundle?.selectedCount === 6, "selected source count is frozen at 6");
  assertCheck(Boolean(contentMaterialization), "content materialization is present");
  assertCheck(contentMaterialization?.readyForStep5 === true, "content is ready for Step 5");
  assertCheck(contentMaterialization?.pdfCount === 6, "six PDFs are materialized");
  assertCheck(Boolean(sourceSignalExtraction), "source signal extraction is present");
  assertCheck(sourceSignalExtraction?.readyForStep6 === true, "source signal extraction is ready for Step 6");
  assertCheck(sourceSignalExtraction?.sourceCount === 6, "Step 5 source count is 6");
  assertCheck(sourceSignalExtraction?.totalSnippetCount >= 80, "Step 5 has at least 80 snippets");
  assertCheck(sourceSignalExtraction?.totalAssetCount >= 30, "Step 5 has at least 30 assets");
  assertCheck(sourceSignalExtraction?.totalTextCharCount >= 2_000_000, "Step 5 preserved more than 2M text chars");
  assertCheck(Boolean(evidencePacksArtifact), "evidence packs artifact is present");
  assertCheck(evidencePacksArtifact?.packs?.length === 6, "evidence packs cover 6 sources");

  assertCheck(Boolean(consolidated.artifact_path), "Step 6 artifact path is recorded");
  assertCheck(
    Boolean(consolidated.artifact_path) && existsSync(consolidated.artifact_path),
    "Step 6 artifact path exists on disk",
    consolidated.artifact_path ?? "",
  );
  assertCheck(evidenceUnits.length >= 150, "Step 6 has at least 150 evidence units");
  assertCheck(
    countUnitsByEligibility(evidenceUnits, "direct_quote") >= 80,
    "Step 6 has at least 80 direct quote units",
  );
  assertCheck(
    countUnitsByEligibility(evidenceUnits, "asset_reference") >= 30,
    "Step 6 has at least 30 asset reference units",
  );
  assertCheck(sectionDossiers.length === 11, "Step 6 has 11 section dossiers");
  assertCheck(consolidated.coverage_map?.overall_readiness === "alta", "overall readiness is alta");
  assertCheck(consolidated.quality_gate?.status !== "block", "quality gate is not blocking");
  assertCheck(
    consolidated.context_preservation_contract?.full_context_is_preserved === true,
    "context preservation contract is lossless",
  );
  assertCheck(
    consolidated.context_preservation_contract?.next_llm_waves_must_hydrate_from_paths === true,
    "next LLM waves are instructed to hydrate from paths",
  );

  const handoffPaths = consolidated.downstream_handoff_manifest?.read_only_input_paths ?? [];
  assertCheck(handoffPaths.length >= 40, "handoff manifest includes at least 40 read-only paths");
  const missingHandoffPaths = handoffPaths.filter((filePath) => !existsSync(filePath));
  assertCheck(missingHandoffPaths.length === 0, "all handoff read-only paths exist");

  const sources = sourceSignalExtraction?.sources ?? [];
  for (const source of sources) {
    assertCheck(Boolean(source.extractedTextPath), `source ${source.sourceId} has extracted text path`);
    assertCheck(
      Boolean(source.extractedTextPath) && existsSync(source.extractedTextPath),
      `source ${source.sourceId} extracted text exists`,
    );
    assertCheck(Boolean(source.sourceChunksPath), `source ${source.sourceId} has chunks path`);
    assertCheck(
      Boolean(source.sourceChunksPath) && existsSync(source.sourceChunksPath),
      `source ${source.sourceId} chunks file exists`,
    );

    if (source.sourceChunksPath && existsSync(source.sourceChunksPath)) {
      const chunksPayload = readJson(source.sourceChunksPath);
      assertCheck(
        chunksPayload.chunk_count > 0 && Array.isArray(chunksPayload.chunks),
        `source ${source.sourceId} chunks payload is valid`,
        `${chunksPayload.chunk_count ?? 0} chunks`,
      );
    }
  }

  const prompts = consolidated.llm_prompts ?? [];
  assertCheck(prompts.length === 3, "Step 6 stores three LLM prompts");
  assertCheck(
    prompts.every((prompt) => prompt.promptTemplate && prompt.promptText),
    "Step 6 prompt templates and final prompts are stored",
  );
} catch (error) {
  fail("smoke test crashed", error instanceof Error ? error.stack ?? error.message : String(error));
}

summarizeAndExit();
