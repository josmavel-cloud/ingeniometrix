export const RELEASE0_BACKEND_CONTRACT_VERSION = "release0-backend-contracts-v1";

export type Release0StepId =
  | "step_1_intake"
  | "step_2_refinement"
  | "step_3_sources"
  | "step_4_additional_sources"
  | "step_5_source_health"
  | "step_6_blueprint"
  | "step_7_exports";

export type Release0ContinuityUse =
  | "used_by_next_step"
  | "used_by_exports"
  | "used_for_audit"
  | "diagnostic_only"
  | "cleanup_candidate";

export type Release0ArtifactContract = {
  key: string;
  description: string;
  storage: "postgres_json" | "filesystem" | "object_storage_ready" | "response_only";
  lifecycle: "permanent" | "temporary" | "diagnostic";
  continuity: Release0ContinuityUse[];
};

export type Release0PersistenceContract = {
  model: string;
  purpose: string;
  lifecycle: "permanent" | "temporary" | "diagnostic";
  continuity: Release0ContinuityUse[];
};

export type Release0EntrypointContract = {
  services: string[];
  apiRoutes: string[];
  diagnostics: string[];
  packageScripts: string[];
};

export type Release0StepContract = {
  id: Release0StepId;
  order: number;
  name: string;
  description: string;
  canonicalStepKey: string;
  currentRunKey: string;
  implementationStatus:
    | "implemented"
    | "implemented_with_contract_gap"
    | "planned_for_release0";
  executionMode: "sync" | "async_ready";
  llmPolicy: {
    required: boolean;
    provider: "OPENAI" | "SYSTEM";
    promptVersions: string[];
    deterministicFallback: boolean;
  };
  entrypoints: Release0EntrypointContract;
  consumes: string[];
  produces: Release0ArtifactContract[];
  persistence: Release0PersistenceContract[];
  observability: string[];
  nextStepRequires: string[];
  cleanupFlags: Array<{
    key: string;
    priority: "cleanup_now" | "cleanup_later" | "monitor";
    reason: string;
  }>;
};

export const RELEASE0_CORE_PRISMA_MODELS = [
  "User",
  "Project",
  "Intake",
  "Reference",
  "ProjectReference",
  "BlueprintVersion",
  "AuditLog",
  "MvpStepRun",
  "ProjectTemplateContentPlan",
  "ProjectEvidenceLedger",
  "ProjectEvidenceCard",
  "ProjectSourceMaterialization",
  "ProjectSourceAsset",
] as const;

export const RELEASE0_STEP_RUN_REQUIRED_FIELDS = [
  "id",
  "projectId",
  "userId",
  "stepKey",
  "status",
  "provider",
  "model",
  "promptVersion",
  "startedAt",
  "finishedAt",
  "durationMs",
  "retryCount",
  "fallbackUsed",
  "inputHash",
  "outputHash",
  "inputSnapshotJson",
  "outputSnapshotJson",
  "warningsJson",
  "errorsJson",
  "artifactDir",
  "artifactManifestPath",
] as const;

export const RELEASE0_OBSERVABILITY_CONTRACT = {
  runIdentity: ["projectId", "runId", "stepKey"],
  timing: ["startedAt", "finishedAt", "durationMs"],
  llmUsage: ["provider", "model", "promptVersion", "tokens", "estimatedCost"],
  reliability: ["status", "retryCount", "fallbackUsed", "warningsJson", "errorsJson"],
  artifacts: ["artifactDir", "artifactManifestPath", "inputHash", "outputHash"],
} as const;

export const RELEASE0_STEP_CONTRACTS = [
  {
    id: "step_1_intake",
    order: 1,
    name: "Intake inicial",
    description: "Normaliza el intake estructurado y declara calidad de entrada para el pipeline.",
    canonicalStepKey: "step_1_intake_normalization",
    currentRunKey: "step_1_intake_normalization",
    implementationStatus: "implemented",
    executionMode: "sync",
    llmPolicy: {
      required: true,
      provider: "OPENAI",
      promptVersions: ["ingeniometrix-step1-intake-normalization-v3"],
      deterministicFallback: true,
    },
    entrypoints: {
      services: ["server/mvp/intake-normalization-service.ts"],
      apiRoutes: ["app/api/projects/[id]/intake/route.ts"],
      diagnostics: ["scripts/mvp/run-step1-intake-diagnostics.ts"],
      packageScripts: ["mvp:step1:intake", "mvp:step1:intake:diagnose"],
    },
    consumes: ["Project", "Intake"],
    produces: [
      {
        key: "normalized_intake",
        description: "Intake normalizado, perfil de dominio y hints de recuperacion.",
        storage: "postgres_json",
        lifecycle: "permanent",
        continuity: ["used_by_next_step", "used_for_audit"],
      },
      {
        key: "step1_artifact_manifest",
        description: "Manifest local con resultado, warnings y uso LLM.",
        storage: "filesystem",
        lifecycle: "diagnostic",
        continuity: ["used_for_audit", "diagnostic_only"],
      },
    ],
    persistence: [
      {
        model: "MvpStepRun",
        purpose: "Run canonico con snapshots, hashes, warnings, errores y artifacts.",
        lifecycle: "permanent",
        continuity: ["used_by_next_step", "used_for_audit"],
      },
      {
        model: "AuditLog",
        purpose: "Eventos de inicio, exito y fallo del diagnostico/ejecucion.",
        lifecycle: "permanent",
        continuity: ["used_for_audit"],
      },
    ],
    observability: ["run_id", "step_key", "duration_ms", "model", "prompt_version", "api_usage", "warnings", "errors"],
    nextStepRequires: ["normalized_intake.retrievalHints", "input_quality.ready_for_step_2"],
    cleanupFlags: [],
  },
  {
    id: "step_2_refinement",
    order: 2,
    name: "Refinamiento con evidencia",
    description: "Genera alternativas refinadas usando evidencia preliminar y deja una opcion elegible.",
    canonicalStepKey: "step_2_evidence_informed_refinement",
    currentRunKey: "step_2_evidence_informed_refinement",
    implementationStatus: "implemented",
    executionMode: "sync",
    llmPolicy: {
      required: true,
      provider: "OPENAI",
      promptVersions: ["ingeniometrix-step2-evidence-informed-refinement-v1"],
      deterministicFallback: true,
    },
    entrypoints: {
      services: ["server/mvp/topic-refinement-service.ts"],
      apiRoutes: ["app/api/projects/[id]/mvp/step-2/route.ts"],
      diagnostics: ["scripts/mvp/run-step2-topic-refinement-diagnostics.ts", "scripts/mvp/run-steps1-4-diagnostics.ts"],
      packageScripts: ["mvp:step2:refinement:diagnose", "mvp:steps1-4:diagnose"],
    },
    consumes: ["normalized_intake", "Reference", "ProjectReference"],
    produces: [
      {
        key: "refinement_options",
        description: "Tres alternativas de intake refinado con score, riesgos y fuentes de soporte.",
        storage: "filesystem",
        lifecycle: "permanent",
        continuity: ["used_by_next_step", "used_for_audit"],
      },
      {
        key: "selected_refinement_option",
        description: "Opcion seleccionada por usuario/sistema para preparar fuentes.",
        storage: "postgres_json",
        lifecycle: "permanent",
        continuity: ["used_by_next_step", "used_for_audit"],
      },
    ],
    persistence: [
      {
        model: "MvpStepRun",
        purpose: "Run del refinamiento y snapshot de alternativas.",
        lifecycle: "permanent",
        continuity: ["used_by_next_step", "used_for_audit"],
      },
      {
        model: "AuditLog",
        purpose: "Evento MVP_STEP2_REFINEMENT_OPTION_SELECTED consumido por Step 3.",
        lifecycle: "permanent",
        continuity: ["used_by_next_step", "used_for_audit"],
      },
    ],
    observability: ["run_id", "step_key", "duration_ms", "model", "prompt_version", "api_usage", "selected_option"],
    nextStepRequires: ["selected_option_id", "first_batch_candidate_ids", "search_terms_for_step_3"],
    cleanupFlags: [],
  },
  {
    id: "step_3_sources",
    order: 3,
    name: "Fuentes",
    description: "Prepara la primera tanda de fuentes candidatas y permite seleccionarlas.",
    canonicalStepKey: "step_3_source_selection_batch_gate",
    currentRunKey: "step_3_source_selection_batch_gate",
    implementationStatus: "implemented",
    executionMode: "sync",
    llmPolicy: {
      required: false,
      provider: "SYSTEM",
      promptVersions: ["deterministic-source-selection-v1"],
      deterministicFallback: true,
    },
    entrypoints: {
      services: ["server/mvp/source-selection-service.ts", "server/mvp/source-discovery-service.ts"],
      apiRoutes: ["app/api/projects/[id]/source-selection/route.ts"],
      diagnostics: ["scripts/mvp/run-step3-source-selection-diagnostics.ts"],
      packageScripts: ["mvp:step3:source-selection:diagnose"],
    },
    consumes: ["selected_refinement_option", "ProjectReference", "Reference"],
    produces: [
      {
        key: "first_source_batch",
        description: "Primer conjunto visible de candidatos con scores y senales de acceso.",
        storage: "filesystem",
        lifecycle: "permanent",
        continuity: ["used_by_next_step", "used_for_audit"],
      },
      {
        key: "selected_sources",
        description: "ProjectReference.selected y selectedOrder para fuentes elegidas.",
        storage: "postgres_json",
        lifecycle: "permanent",
        continuity: ["used_by_next_step", "used_by_exports", "used_for_audit"],
      },
    ],
    persistence: [
      {
        model: "ProjectReference",
        purpose: "Seleccion persistida de fuentes que alimenta Step 5.",
        lifecycle: "permanent",
        continuity: ["used_by_next_step", "used_by_exports", "used_for_audit"],
      },
      {
        model: "MvpStepRun",
        purpose: "Run del batch gate y aplicacion de seleccion.",
        lifecycle: "permanent",
        continuity: ["used_by_next_step", "used_for_audit"],
      },
    ],
    observability: ["candidate_count", "selected_reference_ids", "search_layers", "warnings", "artifact_manifest_path"],
    nextStepRequires: ["selected_reference_ids", "ProjectReference.selected=true"],
    cleanupFlags: [],
  },
  {
    id: "step_4_additional_sources",
    order: 4,
    name: "Fuentes adicionales",
    description: "Amplia candidatos si la primera tanda no alcanza calidad/cobertura.",
    canonicalStepKey: "step_4_additional_sources",
    currentRunKey: "step_4_additional_sources",
    implementationStatus: "implemented",
    executionMode: "sync",
    llmPolicy: {
      required: false,
      provider: "SYSTEM",
      promptVersions: ["deterministic-source-selection-v1"],
      deterministicFallback: true,
    },
    entrypoints: {
      services: ["server/mvp/source-selection-service.ts"],
      apiRoutes: ["app/api/projects/[id]/mvp/step-4/route.ts"],
      diagnostics: ["scripts/mvp/run-steps1-4-diagnostics.ts"],
      packageScripts: ["mvp:steps1-4:diagnose"],
    },
    consumes: ["first_source_batch", "selected_refinement_option"],
    produces: [
      {
        key: "additional_source_batch",
        description: "Pool expandido via action=request_more.",
        storage: "filesystem",
        lifecycle: "permanent",
        continuity: ["used_by_next_step", "used_for_audit"],
      },
      {
        key: "expanded_selected_sources",
        description: "Seleccion final despues de primera tanda o tanda adicional.",
        storage: "postgres_json",
        lifecycle: "permanent",
        continuity: ["used_by_next_step", "used_by_exports", "used_for_audit"],
      },
    ],
    persistence: [
      {
        model: "ProjectReference",
        purpose: "Misma tabla de seleccion final para Step 5.",
        lifecycle: "permanent",
        continuity: ["used_by_next_step", "used_by_exports", "used_for_audit"],
      },
      {
        model: "MvpStepRun",
        purpose: "Run canonico de expansion/finalizacion de fuentes adicionales.",
        lifecycle: "permanent",
        continuity: ["used_by_next_step", "used_for_audit"],
      },
    ],
    observability: ["expanded_pool_count", "multilingual_expansion", "selected_reference_ids", "warnings"],
    nextStepRequires: ["final_selected_reference_ids", "expanded_pool_count"],
    cleanupFlags: [],
  },
  {
    id: "step_5_source_health",
    order: 5,
    name: "Source Health / Evidencia y assets",
    description: "Materializa evidencia, salud de fuentes, assets, ecuaciones y ledger trazable.",
    canonicalStepKey: "step_5_evidence_materialization",
    currentRunKey: "step_5_evidence_materialization",
    implementationStatus: "implemented",
    executionMode: "async_ready",
    llmPolicy: {
      required: true,
      provider: "OPENAI",
      promptVersions: [
        "ingeniometrix-step5-evidence-materialization-v1",
        "ingeniometrix-step5-source-evidence-extraction-v1",
        "ingeniometrix-step5-asset-visual-localization-v1",
        "ingeniometrix-step5-equation-latex-ocr-v1",
      ],
      deterministicFallback: true,
    },
    entrypoints: {
      services: ["server/mvp/evidence-materialization-service.ts", "server/mvp/evidence-materialization-types.ts"],
      apiRoutes: ["app/api/projects/[id]/mvp/step-5/route.ts"],
      diagnostics: [
        "scripts/mvp/run-step5-evidence-materialization-diagnostics.ts",
        "scripts/mvp/run-step5-asset-inspection-report.ts",
        "scripts/mvp/run-step5-completion-pack.ts",
      ],
      packageScripts: ["mvp:step5:evidence-materialization:diagnose", "mvp:step5:asset-inspection", "mvp:step5:complete"],
    },
    consumes: ["selected_sources", "Reference", "ProjectReference"],
    produces: [
      {
        key: "evidence_ledger",
        description: "Ledger canonico con registros de fuente, evidencias, assets y planes de seccion.",
        storage: "postgres_json",
        lifecycle: "permanent",
        continuity: ["used_by_next_step", "used_by_exports", "used_for_audit"],
      },
      {
        key: "source_assets",
        description: "Assets extraidos/curados, incluyendo imagenes, tablas y ecuaciones LaTeX.",
        storage: "filesystem",
        lifecycle: "permanent",
        continuity: ["used_by_next_step", "used_for_audit"],
      },
      {
        key: "references",
        description: "Referencias formateadas y metadata bibliografica para citas y exportacion.",
        storage: "filesystem",
        lifecycle: "permanent",
        continuity: ["used_by_next_step", "used_by_exports", "used_for_audit"],
      },
      {
        key: "curated_assets",
        description: "Subset de assets con calidad suficiente para insertar o citar en el blueprint.",
        storage: "filesystem",
        lifecycle: "permanent",
        continuity: ["used_by_next_step", "used_for_audit"],
      },
      {
        key: "semantic_extractions",
        description: "Evidencias semanticas extraidas por fuente con anchors y usos permitidos.",
        storage: "filesystem",
        lifecycle: "permanent",
        continuity: ["used_by_next_step", "used_by_exports", "used_for_audit"],
      },
      {
        key: "asset_inspection_pdf",
        description: "PDF local para inspeccion humana de assets.",
        storage: "filesystem",
        lifecycle: "diagnostic",
        continuity: ["diagnostic_only"],
      },
    ],
    persistence: [
      {
        model: "ProjectEvidenceLedger",
        purpose: "Fuente canonica de evidencia para Step 6 y Step 7.",
        lifecycle: "permanent",
        continuity: ["used_by_next_step", "used_by_exports", "used_for_audit"],
      },
      {
        model: "ProjectEvidenceCard",
        purpose: "Resumen trazable por fuente y uso permitido.",
        lifecycle: "permanent",
        continuity: ["used_by_next_step", "used_by_exports", "used_for_audit"],
      },
      {
        model: "ProjectSourceMaterialization",
        purpose: "Rutas y metricas de materializacion por fuente.",
        lifecycle: "permanent",
        continuity: ["used_by_next_step", "used_for_audit"],
      },
      {
        model: "ProjectSourceAsset",
        purpose: "Assets curados para el blueprint.",
        lifecycle: "permanent",
        continuity: ["used_by_next_step", "used_for_audit"],
      },
    ],
    observability: ["source_count", "evidence_card_count", "asset_count", "llm_usage", "warnings", "artifact_manifest_path"],
    nextStepRequires: ["evidence_ledger", "references", "curated_assets", "semantic_extractions"],
    cleanupFlags: [
      {
        key: "diagnostic_pdfs_are_temporary",
        priority: "monitor",
        reason: "Los PDFs de inspeccion no deben convertirse en outputs de producto.",
      },
    ],
  },
  {
    id: "step_6_blueprint",
    order: 6,
    name: "Blueprint",
    description: "Genera DOCX academico editable con trazabilidad, matriz, assets y contratos de exportacion.",
    canonicalStepKey: "step_6_blueprint_docx",
    currentRunKey: "step_6_blueprint_docx",
    implementationStatus: "implemented",
    executionMode: "async_ready",
    llmPolicy: {
      required: true,
      provider: "OPENAI",
      promptVersions: [
        "ingeniometrix-step6-blueprint-docx-v1",
        "ingeniometrix-step6-section-draft-v1",
        "ingeniometrix-step6-editorial-review-v1",
        "ingeniometrix-step6-title-generation-v1",
        "ingeniometrix-step6-hero-image-v1",
      ],
      deterministicFallback: true,
    },
    entrypoints: {
      services: ["server/mvp/step6-blueprint-docx-service.ts", "server/mvp/step6-blueprint-docx-types.ts"],
      apiRoutes: ["app/api/projects/[id]/mvp/step-6/route.ts"],
      diagnostics: ["scripts/mvp/run-step6-blueprint-docx-diagnostics.ts"],
      packageScripts: ["mvp:step6:blueprint-docx:diagnose"],
    },
    consumes: ["evidence_ledger", "references", "curated_assets", "semantic_extractions"],
    produces: [
      {
        key: "blueprint_docx",
        description: "Documento Word editable del plan academico.",
        storage: "filesystem",
        lifecycle: "permanent",
        continuity: ["used_by_exports", "used_for_audit"],
      },
      {
        key: "blueprint_package",
        description: "JSON canonico con secciones, trazabilidad, referencias cruzadas y contrato Step 7.",
        storage: "filesystem",
        lifecycle: "permanent",
        continuity: ["used_by_next_step", "used_by_exports", "used_for_audit"],
      },
      {
        key: "blueprint_version",
        description: "Version persistida del blueprint para rutas de export actuales.",
        storage: "postgres_json",
        lifecycle: "permanent",
        continuity: ["used_by_exports", "used_for_audit"],
      },
    ],
    persistence: [
      {
        model: "BlueprintVersion",
        purpose: "Version oficial consumida por endpoints de BibTeX/RIS/evidence log y DOCX legacy.",
        lifecycle: "permanent",
        continuity: ["used_by_exports", "used_for_audit"],
      },
      {
        model: "MvpStepRun",
        purpose: "Run del blueprint y snapshot de salida.",
        lifecycle: "permanent",
        continuity: ["used_by_exports", "used_for_audit"],
      },
    ],
    observability: ["section_count", "source_count", "asset_count", "llm_calls", "tokens", "cost", "warnings"],
    nextStepRequires: ["docx_path", "blueprint_version_id", "references_available", "evidence_log_available"],
    cleanupFlags: [],
  },
  {
    id: "step_7_exports",
    order: 7,
    name: "Exports",
    description: "Empaqueta DOCX, BibTeX, RIS, evidence_log.json y manifest final.",
    canonicalStepKey: "step_7_exports",
    currentRunKey: "legacy_blueprint_export_routes",
    implementationStatus: "planned_for_release0",
    executionMode: "sync",
    llmPolicy: {
      required: false,
      provider: "SYSTEM",
      promptVersions: [],
      deterministicFallback: true,
    },
    entrypoints: {
      services: ["server/blueprint/blueprint-export.ts"],
      apiRoutes: [
        "app/api/projects/[id]/blueprints/[versionId]/docx/route.ts",
        "app/api/projects/[id]/blueprints/[versionId]/bibtex/route.ts",
        "app/api/projects/[id]/blueprints/[versionId]/ris/route.ts",
        "app/api/projects/[id]/blueprints/[versionId]/evidence-log/route.ts",
      ],
      diagnostics: [],
      packageScripts: [],
    },
    consumes: ["blueprint_docx", "blueprint_package", "blueprint_version", "evidence_ledger"],
    produces: [
      {
        key: "docx",
        description: "Documento final editable.",
        storage: "filesystem",
        lifecycle: "permanent",
        continuity: ["used_by_exports", "used_for_audit"],
      },
      {
        key: "bibtex",
        description: "Archivo BibTeX con fuentes usadas.",
        storage: "response_only",
        lifecycle: "permanent",
        continuity: ["used_by_exports", "used_for_audit"],
      },
      {
        key: "ris",
        description: "Archivo RIS con fuentes usadas.",
        storage: "response_only",
        lifecycle: "permanent",
        continuity: ["used_by_exports", "used_for_audit"],
      },
      {
        key: "evidence_log_json",
        description: "Log de evidencia trazable para auditoria.",
        storage: "response_only",
        lifecycle: "permanent",
        continuity: ["used_by_exports", "used_for_audit"],
      },
      {
        key: "export_manifest_json",
        description: "Manifest final de archivos, hashes, versiones y warnings.",
        storage: "filesystem",
        lifecycle: "permanent",
        continuity: ["used_by_exports", "used_for_audit"],
      },
    ],
    persistence: [
      {
        model: "BlueprintVersion",
        purpose: "Fuente actual para endpoints legacy; debe conectarse al paquete Step 6 productivo.",
        lifecycle: "permanent",
        continuity: ["used_by_exports", "used_for_audit"],
      },
      {
        model: "MvpStepRun",
        purpose: "Debe agregarse para Step 7 antes de cerrar Release 0.",
        lifecycle: "permanent",
        continuity: ["used_for_audit", "cleanup_candidate"],
      },
    ],
    observability: ["export_manifest", "hashes", "status", "warnings", "artifact_paths"],
    nextStepRequires: [],
    cleanupFlags: [
      {
        key: "step7_manifest_and_run_missing",
        priority: "cleanup_now",
        reason: "Hay rutas de export individuales, pero falta un servicio productivo de paquete final con MvpStepRun y manifest.",
      },
    ],
  },
] as const satisfies readonly Release0StepContract[];

export function getRelease0StepContract(id: Release0StepId) {
  return RELEASE0_STEP_CONTRACTS.find((step) => step.id === id) ?? null;
}

export function getRelease0PipelineMap() {
  return {
    artifact_type: "mvp_release0_backend_contract_map",
    artifact_version: "v1",
    contract_version: RELEASE0_BACKEND_CONTRACT_VERSION,
    steps: RELEASE0_STEP_CONTRACTS,
    core_prisma_models: RELEASE0_CORE_PRISMA_MODELS,
    step_run_required_fields: RELEASE0_STEP_RUN_REQUIRED_FIELDS,
    observability_contract: RELEASE0_OBSERVABILITY_CONTRACT,
  };
}
