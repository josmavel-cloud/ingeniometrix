export type MasterBlueprintLabStepKey =
  | "master_template_runtime"
  | "prompt_planning"
  | "section_generation"
  | "consistency_matrix"
  | "blueprint_composition"
  | "legacy_blueprint_composition"
  | "validation"
  | "provenance"
  | "university_derivation"
  | "master_docx_render"
  | "university_docx_render";

export type MasterBlueprintLabStepDefinition = {
  key: MasterBlueprintLabStepKey;
  title: string;
  summary: string;
  description: string;
};

export type MasterBlueprintLabArtifacts = {
  masterTemplateRuntime?: Record<string, unknown>;
  templateImportContext?: Record<string, unknown>;
  templateRuntimeInspection?: Record<string, unknown>;
  templateQualityContract?: Record<string, unknown>;
  promptPlan?: Record<string, unknown>;
  sectionDrafts?: Record<string, unknown>;
  consistencyMatrix?: Record<string, unknown>;
  consistencyMatrixArtifact?: Record<string, unknown>;
  blueprintComposition?: Record<string, unknown>;
  legacyBlueprint?: Record<string, unknown>;
  validationReport?: Record<string, unknown>;
  provenanceReport?: Record<string, unknown>;
  universityBlueprint?: Record<string, unknown>;
  universityReductionPlan?: Record<string, unknown>;
  masterAcademicDocument?: Record<string, unknown>;
  universityAcademicDocument?: Record<string, unknown>;
  masterDocxRender?: Record<string, unknown>;
  masterDocxQaReport?: Record<string, unknown>;
  universityDocxRender?: Record<string, unknown>;
  universityDocxQaReport?: Record<string, unknown>;
  coherenceReport?: Record<string, unknown>;
  packageQualitySummary?: Record<string, unknown>;
};

export type MasterBlueprintLabStepRun = {
  key: MasterBlueprintLabStepKey;
  status: "pending" | "ready" | "executed" | "failed";
  durationMs: number | null;
  executedAt: string | null;
  artifactCount: number;
  warnings: string[];
  error: string | null;
};

export type MasterBlueprintLabSyntheticOverview = {
  caseName: string;
  fixtureDir: string;
  project: {
    title: string;
    university: string | null;
    program: string | null;
    degreeLevel: string | null;
    templateKey: string | null;
  };
  intake: {
    problemSummary: string | null;
    objectiveSummary: string | null;
    methodologyPreference: string | null;
    populationSummary: string | null;
  };
  sourceMix: {
    total: number;
    selected: number;
    providerExpansion: number;
    websearch: number;
    formalReferences: number;
    pdfCandidates: number;
  };
  pdfCoverage: {
    total: number;
    downloaded: number;
    skipped: number;
    bytesDownloaded: number;
    warnings: string[];
  };
  evidenceCoverage: {
    packs: number;
    snippets: number;
    assets: number;
    assumptions: number;
    signals: Record<string, number>;
    snippetOrigins: Record<string, number>;
  };
  sectionHintCoverage: Array<{
    sectionKey: string;
    snippetCount: number;
  }>;
  sourceCards: Array<{
    sourceId: string;
    title: string;
    origin: string;
    year: number | null;
    hasPdfUrl: boolean;
    pdfStatus: string;
    snippetCount: number;
    assetCount: number;
  }>;
};

export type MasterBlueprintLabRepoPdfExample = {
  runId: string;
  pdfCount: number;
  pdfFiles: string[];
  sampleFileName: string;
  pdfDir: string;
};

export type MasterBlueprintLabEngineeringPdf = {
  referenceId: string;
  title: string;
  year: number | null;
  authors: string[];
  fileName: string;
  runId: string;
  pdfPath: string;
};

export type MasterBlueprintLabEngineeringReference = {
  referenceId: string;
  title: string;
  year: number | null;
  authors: string[];
  landingPageUrl: string | null;
  isPreferred: boolean;
  localPdfRunId: string | null;
  localPdfFileName: string | null;
  localPdfPath: string | null;
};

export type MasterBlueprintLabEngineeringCase = {
  sourceEvalPath: string;
  projectTitle: string;
  topicAreaLabel: string | null;
  topic: string | null;
  problemContext: string | null;
  program: string | null;
  university: string | null;
  templateKey: string | null;
  selectedReferenceCount: number;
  matchedPdfRunId: string;
  matchedPdfCount: number;
  matchedPdfs: MasterBlueprintLabEngineeringPdf[];
  preferredReference: MasterBlueprintLabEngineeringReference | null;
};

export type MasterBlueprintLabExecutionResponse = {
  fixtureCase: string;
  artifactRun?: {
    runDir: string;
    runId: string;
    loadedAt: string;
    readOnly: boolean;
  };
  executedThrough: MasterBlueprintLabStepKey;
  execution: {
    llmEnabled: boolean;
    llmPolicy: "required" | "disabled";
    providerName: string | null;
    modelName: string | null;
  };
  steps: MasterBlueprintLabStepRun[];
  artifacts: MasterBlueprintLabArtifacts;
  inspectors: {
    syntheticOverview: MasterBlueprintLabSyntheticOverview;
    project: Record<string, unknown>;
    intake: Record<string, unknown>;
    sourceGate: Record<string, unknown>;
    acquisition: Record<string, unknown>;
    sourceRegistry: Record<string, unknown>;
    pdfDownloads: Record<string, unknown>;
    evidencePacks: Record<string, unknown>;
    evidenceLedger: Record<string, unknown>;
    assumptions: Record<string, unknown>;
    snippets: Record<string, unknown>;
    repoPdfExamples: MasterBlueprintLabRepoPdfExample[];
    engineeringCase: MasterBlueprintLabEngineeringCase | null;
  };
};
