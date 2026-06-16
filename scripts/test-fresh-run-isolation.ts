import { readFileSync } from "node:fs";
import path from "node:path";

import {
  evidenceEngineHandoffV1Schema,
  type EvidenceEngineHandoffV1,
} from "@/server/blueprint-engine/contracts";
import {
  buildFreshRunIsolationReport,
  buildStaleContentScanReport,
} from "@/server/blueprint-engine/quality/fresh-run-isolation";
import type { AcademicDocument } from "@/server/blueprint-v2/lab/academic-document-model";

const HANDOFF_PATH = path.join(
  process.cwd(),
  "artifacts-local",
  "evidence-selected-source-runs",
  "case-001-seismic-isolators-peruvian-buildings",
  "2026-05-04T18-13-11-093Z",
  "evidence-handoff-v1.json",
);

type TestResult = {
  name: string;
  passed: boolean;
  details: string;
};

function test(name: string, passed: boolean, details: string): TestResult {
  return { name, passed, details };
}

function loadHandoff(): EvidenceEngineHandoffV1 {
  const parsed = evidenceEngineHandoffV1Schema.safeParse(
    JSON.parse(readFileSync(HANDOFF_PATH, "utf8")),
  );

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((issue) => issue.message).join("; "));
  }

  return parsed.data as EvidenceEngineHandoffV1;
}

function fakeDocument(input: {
  sourceId?: string;
  evidenceId?: string;
  assetKey?: string;
  assetSourceId?: string;
  assetFilePath?: string | null;
  title?: string;
  text?: string;
  coverImagePath?: string | null;
}): AcademicDocument {
  return {
    variant: "master",
    metadata: {
      title: input.title ?? "Revision sistematica aplicada para aisladores sismicos",
      short_header_title: "Revision aplicada para aisladores sismicos",
      keywords_line: "aisladores sismicos; edificios peruanos",
      subtitle: "Documento academico",
      university: "UPC",
      program: "Maestria en Ingenieria Civil",
      generated_at: "2026-05-05T00:00:00.000Z",
    },
    layout_plan: {
      cover_visual: {
        title: "Infografia metodologica del proyecto",
        subtitle: "Revision aplicada para aisladores sismicos",
        concept: input.text ?? "Flujo metodologico actual.",
        method_summary: "Revision aplicada y analisis comparativo.",
        prompt: "Infografia metodologica academica.",
        negative_prompt: "No fake data.",
        image_path: input.coverImagePath ?? null,
        image_model: null,
        image_generation_status: "not_requested",
        image_generation_warnings: [],
        image_layout: {
          width_px: 1024,
          height_px: 1536,
          min_first_page_height_pct: 60,
        },
        palette: {
          background: "F6F1EA",
          primary: "1F2937",
          accent: "7A4E2A",
          muted: "C9B8A7",
        },
      },
      figures: [],
      equations: [],
      schedule_visual: null,
      warnings: [],
    },
    sections: [
      {
        section_key: "problem_statement",
        title: "Planteamiento del problema",
        source_ids: input.sourceId ? [input.sourceId] : [],
        evidence_ids: input.evidenceId ? [input.evidenceId] : [],
        original_excerpt_ids: [],
        citation_anchors: [],
        blocks: [
          {
            block_type: "paragraph",
            text: input.text ?? "Texto academico actual.",
            citation_anchor_ids: [],
          },
        ],
        warnings: [],
      },
    ],
    asset_placements: input.assetKey
      ? [
          {
            asset_key: input.assetKey,
            source_id: input.assetSourceId ?? input.sourceId ?? "stale-source",
            section_key: "problem_statement",
            placement: "annex",
            paragraph_anchor: null,
            caption: "Figura metodologica actual.",
            render_mode: "image",
            renderable: true,
            file_path: input.assetFilePath ?? null,
            text_content: null,
            warnings: [],
          },
        ]
      : [],
  } as unknown as AcademicDocument;
}

function main() {
  const handoff = loadHandoff();
  const currentSourceId = handoff.source_registry[0]?.source_id ?? "";
  const currentEvidenceId = handoff.evidence_units[0]?.evidence_id ?? "";
  const currentAsset = handoff.asset_registry[0];
  const outputFolder = path.join(
    process.cwd(),
    "artifacts-local",
    "lab-b-full-diagnostic-docx-runs",
    "case-001-seismic-isolators-peruvian-buildings",
    "test-current-run",
  );

  const staleSourceReport = buildFreshRunIsolationReport({
    handoff,
    artifact_refs: [],
    current_output_folder: outputFolder,
    academic_documents: [
      {
        label: "fake_stale_source_doc",
        document: fakeDocument({
          sourceId: "stale-source-previous-run",
          evidenceId: currentEvidenceId,
        }),
      },
    ],
  });
  const staleAssetReport = buildFreshRunIsolationReport({
    handoff,
    artifact_refs: [],
    current_output_folder: outputFolder,
    academic_documents: [
      {
        label: "fake_stale_asset_doc",
        document: fakeDocument({
          sourceId: currentSourceId,
          evidenceId: currentEvidenceId,
          assetKey: "old-run-asset-key",
          assetSourceId: currentSourceId,
          assetFilePath:
            "C:\\projects\\ingeniometrix\\artifacts-local\\lab-b-full-diagnostic-docx-runs\\old-case\\2026-01-01T00-00-00-000Z\\old.png",
        }),
      },
    ],
  });
  const deterministicReport = buildFreshRunIsolationReport({
    handoff,
    artifact_refs: [],
    current_output_folder: outputFolder,
    academic_documents: [
      {
        label: "fake_template_asset_doc",
        document: fakeDocument({
          sourceId: currentSourceId,
          evidenceId: currentEvidenceId,
          coverImagePath: path.join(outputFolder, "cover-hero-master-test.png"),
        }),
      },
    ],
  });
  const mutableLatestProductionReport = buildFreshRunIsolationReport({
    handoff,
    mode: "production",
    artifact_refs: [
      {
        ref_id: "latest-test",
        uri: "C:\\projects\\ingeniometrix\\artifacts-local\\blueprint_launch\\consolidated_evidence\\latest-consolidated-evidence.json",
        storage_kind: "local_file",
        content_type: "application/json",
      },
    ],
  });
  const staleTopicReport = buildStaleContentScanReport({
    handoff,
    artifact_refs: [],
    current_output_folder: outputFolder,
    academic_documents: [
      {
        label: "fake_stale_topic_doc",
        document: fakeDocument({
          sourceId: currentSourceId,
          evidenceId: currentEvidenceId,
          title: "Adaptive reuse and mass timber overbuild in Toronto",
          text: "Este parrafo menciona Canada y office-to-residential.",
        }),
      },
    ],
  });
  const validReport = buildFreshRunIsolationReport({
    handoff,
    artifact_refs: [],
    current_output_folder: outputFolder,
    academic_documents: [
      {
        label: "fake_valid_doc",
        document: fakeDocument({
          sourceId: currentSourceId,
          evidenceId: currentEvidenceId,
          assetKey: currentAsset?.asset_key,
          assetSourceId: currentAsset?.source_id,
        }),
      },
    ],
  });

  const results = [
    test(
      "fake document model with stale source id is blocked",
      staleSourceReport.blockers.some((blocker) => blocker.includes("stale_source_ref")),
      staleSourceReport.blockers.join(" | "),
    ),
    test(
      "fake asset ref from another run is blocked",
      staleAssetReport.blockers.some((blocker) => blocker.includes("stale_asset_ref")) &&
        staleAssetReport.blockers.some((blocker) => blocker.includes("foreign_run_path")),
      staleAssetReport.blockers.join(" | "),
    ),
    test(
      "deterministic template fallback asset is allowed",
      deterministicReport.blockers.length === 0,
      deterministicReport.blockers.join(" | ") || "no blockers",
    ),
    test(
      "mutable latest path in production mode is flagged",
      mutableLatestProductionReport.blockers.some((blocker) => blocker.includes("mutable_latest_path")),
      mutableLatestProductionReport.blockers.join(" | "),
    ),
    test(
      "public-facing field containing old topic marker is flagged",
      staleTopicReport.blockers.some((blocker) => blocker.includes("stale_topic_marker")),
      staleTopicReport.blockers.join(" | "),
    ),
    test(
      "current valid source/evidence/asset refs pass",
      validReport.blockers.length === 0 &&
        validReport.stale_asset_ref_count === 0 &&
        validReport.stale_source_ref_count === 0,
      validReport.blockers.join(" | ") || "no blockers",
    ),
  ];
  const failed = results.filter((result) => !result.passed);

  for (const result of results) {
    console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name} :: ${result.details}`);
  }
  console.log(`\nFresh-run isolation tests: ${results.length - failed.length}/${results.length} passed`);

  if (failed.length > 0) {
    process.exit(1);
  }
}

main();
