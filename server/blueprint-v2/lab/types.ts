import type {
  EvidenceAcquisitionResult,
  EvidenceLedger,
  ExtractedEvidencePack,
  MasterBlueprintEngineProject,
  PdfDownloadResult,
  SourceIntakeGateResult,
} from "@/server/blueprint-v2/types";

export type MasterBlueprintLabFixtureSet = {
  project: MasterBlueprintEngineProject;
  sourceGate: SourceIntakeGateResult;
  acquisition: EvidenceAcquisitionResult;
  pdfDownloads: PdfDownloadResult;
  evidencePacks: ExtractedEvidencePack[];
  evidenceLedger: EvidenceLedger;
};

export type LoadedMasterBlueprintLabFixtureSet = MasterBlueprintLabFixtureSet & {
  caseName: string;
  fixtureDir: string;
};

export type MasterBlueprintSteps5To11LabResult = {
  master_template_key: string;
  fixture_case: string;
  execution: {
    llm_enabled: boolean;
    llm_policy: "required" | "disabled";
    provider_name: string | null;
    model_name: string | null;
    fallback_sections_count: number;
  };
  source_gate: SourceIntakeGateResult;
  acquisition: EvidenceAcquisitionResult;
  pdf_downloads: PdfDownloadResult;
  evidence_ledger: EvidenceLedger;
  master_template: import("@/server/blueprint-v2/types").MasterTemplateRuntime;
  section_prompt_plan: import("@/server/blueprint-v2/types").SectionPromptPlan;
  master_section_drafts: import("@/server/blueprint-v2/types").MasterSectionDraft[];
  consistency_matrix: import("@/server/blueprint-v2/types").ConsistencyMatrixRow[];
  provenance_report: import("@/server/blueprint-v2/types").DocumentProvenanceReport;
  validation_report: import("@/server/blueprint-v2/types").MasterBlueprintValidationReport;
  package_quality_summary?: ReturnType<
    typeof import("@/server/blueprint-v2/lab/package-quality-summary").buildPackageQualitySummary
  >;
  coherence_report: Awaited<
    ReturnType<typeof import("@/server/blueprint-v2/validation/blueprint-validation-engine").validateMasterBlueprintPackage>
  >["coherenceReport"];
  legacy_blueprint: import("@/server/blueprint/blueprint-types").ResearchBlueprintRecord;
  university_blueprint: import("@/server/blueprint-v2/types").UniversityBlueprintPackage;
  fixture_checks: {
    evidence_pack_source_ids: string[];
    ledger_source_ids: string[];
    assumption_snippet_count: number;
    rebuilt_ledger_matches_fixture: boolean;
  };
};
