import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  ActorType,
  DegreeLevel,
  ExportStatus,
  ProjectStatus,
  Provider,
  TemplateKey,
  TopicOriginType,
  TopicSelectionStatus,
  University,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { MIN_SELECTED_REFERENCES } from "@/lib/research-workflow";
import { normalizeTitle } from "@/lib/text";
import {
  buildEvidenceLog,
  extractExportReferences,
  renderBibtex,
  renderRis,
} from "@/server/blueprint/blueprint-export";
import { runMvpSourceDiscovery } from "@/server/mvp/source-discovery-service";
import { getMvpProjectStatus } from "@/server/mvp/status-service";
import { saveIntakeForProject } from "@/server/projects/project-service";
import { updateSelectedProjectReferences } from "@/server/retrieval/reference-service";

const RUNNER_VERSION = "mvp-backend-core-e2e.v2_source_discovery";
const TEST_USER_EMAIL = "mvp-e2e@ingeniometrix.local";

type RunnerMode = "mock" | "retrieval";

type CliOptions = {
  mode: RunnerMode;
  keepDbRecords: boolean;
};

type ReferenceSnapshot = {
  reference_id: string;
  title: string;
  doi: string | null;
  authors: string[];
  year: number | null;
  venue: string | null;
  abstract: string | null;
};

function parseCliOptions(): CliOptions {
  const modeArg = process.argv.find((arg) => arg.startsWith("--mode="))?.split("=")[1] ?? "mock";

  if (modeArg !== "mock" && modeArg !== "retrieval") {
    throw new Error("Modo inválido. Usa --mode=mock o --mode=retrieval.");
  }

  return {
    mode: modeArg,
    keepDbRecords: process.argv.includes("--keep-db-records"),
  };
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function normalizeAuthors(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function buildMockBlueprintJson(input: {
  projectTitle: string;
  referenceSnapshots: ReferenceSnapshot[];
  mode: RunnerMode;
}) {
  const referencesUsed = input.referenceSnapshots.slice(0, 3).map((reference) => ({
    reference_id: reference.reference_id,
    title: reference.title,
  }));

  return {
    artifact_type: "mvp_mock_blueprint",
    artifact_version: "v1",
    title: input.projectTitle,
    refined_topic:
      "Uso responsable de inteligencia artificial para estructurar retroalimentación académica en posgrado",
    general_objective:
      "Diseñar un plan inicial de investigación para analizar cómo la inteligencia artificial puede apoyar procesos de retroalimentación académica sin reemplazar el criterio docente.",
    specific_objectives: [
      "Identificar dimensiones clave de retroalimentación académica asistida por IA.",
      "Relacionar riesgos de uso automatizado con criterios de revisión humana.",
      "Proponer una ruta metodológica inicial para evaluar adopción y utilidad percibida.",
    ],
    research_questions: [
      "¿Qué dimensiones de la retroalimentación académica pueden apoyarse con IA bajo supervisión humana?",
      "¿Qué riesgos deben controlarse para evitar uso irresponsable o sustitución del criterio docente?",
      "¿Qué diseño metodológico inicial permite evaluar utilidad, adopción y límites del apoyo automatizado?",
    ],
    key_constructs_or_variables: [
      "retroalimentación académica",
      "IA generativa",
      "supervisión humana",
      "adopción tecnológica",
    ],
    methodology_overview:
      "Enfoque aplicado de alcance exploratorio-descriptivo con revisión de fuentes seleccionadas y validación humana de supuestos antes de avanzar a instrumentos o trabajo de campo.",
    assumptions: [
      "El proyecto se mantiene como planificación académica inicial, no como tesis final.",
      input.mode === "retrieval"
        ? "Las fuentes provienen de discovery real, pero este runner todavía no ejecuta inspección documental ni evidencia full-text."
        : "Las fuentes mock representan el contrato de datos; no sustituyen verificación documental real.",
    ],
    engine_warnings: [
      `Runner ${input.mode}: el blueprint sigue siendo deterministic stub para probar backend core.`,
      "No hay citas textuales directas porque no existe full text verificado en este modo.",
    ],
    references_used: referencesUsed,
    citation_plan: [
      {
        section_key: "antecedentes",
        supported_reference_ids: referencesUsed.map((reference) => reference.reference_id),
        support_level: "metadata_and_abstract_only",
      },
      {
        section_key: "metodologia",
        supported_reference_ids: referencesUsed.slice(0, 2).map((reference) => reference.reference_id),
        support_level: "metadata_and_abstract_only",
      },
    ],
    readiness_snapshot: {
      status: "mock_ready_with_warnings",
      blockers: [],
      warnings: ["Este blueprint es stub deterministic para probar el backend core."],
    },
  };
}

async function createProject(userId: string, runId: string) {
  return prisma.project.create({
    data: {
      userId,
      title: `MVP Backend Core E2E ${runId}`,
      status: ProjectStatus.DRAFT,
      country: "PE",
      language: "es",
      degreeLevel: DegreeLevel.MAESTRIA,
      university: University.OTHER,
      program: "Maestría de prueba backend",
      templateKey: TemplateKey.GENERIC_POSGRADO_PE,
      topicOriginType: TopicOriginType.CUSTOM,
      topicSelectionStatus: TopicSelectionStatus.SELECTED,
      topicSeedText:
        "IA generativa y retroalimentación académica responsable en programas de posgrado",
      topicAreaLabel: "Educación superior y tecnología educativa",
    },
  });
}

async function addMockSelectedReferences(projectId: string): Promise<ReferenceSnapshot[]> {
  const mockReferences = [
    {
      title: "Generative artificial intelligence in higher education feedback practices",
      doi: "10.0000/imx.mock.001",
      authors: ["Rivera Ana", "Torres Luis"],
      year: 2024,
      venue: "Journal of Responsible Educational Technology",
      abstract:
        "Study discussing supervised use of generative AI for formative feedback in postgraduate learning environments.",
    },
    {
      title: "Human oversight frameworks for AI-assisted academic writing support",
      doi: "10.0000/imx.mock.002",
      authors: ["Martinez Carla"],
      year: 2023,
      venue: "AI and Education Review",
      abstract:
        "Framework paper on maintaining human review, transparency and accountability when AI assists academic writing support.",
    },
    {
      title: "Adoption factors for educational AI tools in Latin American postgraduate programs",
      doi: "10.0000/imx.mock.003",
      authors: ["Gomez Pedro", "Salazar Maria"],
      year: 2022,
      venue: "Latin American Journal of Digital Learning",
      abstract:
        "Empirical overview of adoption factors, perceived usefulness and risk controls for AI tools in postgraduate education.",
    },
  ];

  const selectedSnapshots: ReferenceSnapshot[] = [];

  for (const [index, item] of mockReferences.entries()) {
    const existingReference = await prisma.reference.findFirst({ where: { doi: item.doi } });
    const reference = existingReference
      ? await prisma.reference.update({
          where: { id: existingReference.id },
          data: {
            title: item.title,
            normalizedTitle: normalizeTitle(item.title),
            authorsJson: item.authors,
            abstract: item.abstract,
            venue: item.venue,
            year: item.year,
            workType: "journal-article",
            landingPageUrl: `https://example.org/${slugify(item.title)}`,
          },
        })
      : await prisma.reference.create({
          data: {
            doi: item.doi,
            title: item.title,
            normalizedTitle: normalizeTitle(item.title),
            authorsJson: item.authors,
            abstract: item.abstract,
            venue: item.venue,
            year: item.year,
            workType: "journal-article",
            landingPageUrl: `https://example.org/${slugify(item.title)}`,
          },
        });

    await prisma.projectReference.create({
      data: {
        projectId,
        referenceId: reference.id,
        sourceProvider: Provider.SYSTEM,
        relevanceScore: 9 - index,
        selected: true,
        selectedOrder: index + 1,
        selectionReason: "Fuente mock seleccionada por el runner backend E2E.",
      },
    });

    selectedSnapshots.push({
      reference_id: reference.id,
      title: reference.title,
      doi: reference.doi,
      authors: item.authors,
      year: reference.year,
      venue: reference.venue,
      abstract: reference.abstract,
    });
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { status: ProjectStatus.SOURCES_SELECTED },
  });

  return selectedSnapshots;
}

async function selectRetrievalReferences(userId: string, projectId: string) {
  const discovery = await runMvpSourceDiscovery(userId, projectId, {
    desiredTotal: MIN_SELECTED_REFERENCES,
  });

  if (discovery.status === "blocked" || discovery.suggested_selection_ids.length < MIN_SELECTED_REFERENCES) {
    return {
      discovery,
      selectedSnapshots: [] as ReferenceSnapshot[],
    };
  }

  const selectedIds = discovery.suggested_selection_ids.slice(0, MIN_SELECTED_REFERENCES);
  await updateSelectedProjectReferences(userId, projectId, selectedIds);

  const selected = await prisma.projectReference.findMany({
    where: {
      projectId,
      selected: true,
    },
    orderBy: { selectedOrder: "asc" },
    include: { reference: true },
  });

  return {
    discovery,
    selectedSnapshots: selected.map((item) => ({
      reference_id: item.referenceId,
      title: item.reference.title,
      doi: item.reference.doi,
      authors: normalizeAuthors(item.reference.authorsJson),
      year: item.reference.year,
      venue: item.reference.venue,
      abstract: item.reference.abstract,
    })),
  };
}

async function writeBlockedSummary(input: {
  artifactDir: string;
  options: CliOptions;
  runId: string;
  userId: string;
  projectId: string;
  afterProjectStatus: unknown;
  discovery: unknown;
  keepDbRecords: boolean;
}) {
  const finalStatus = await getMvpProjectStatus(input.userId, input.projectId);
  const dbCleanup = input.keepDbRecords
    ? { performed: false, reason: "--keep-db-records was provided" }
    : await prisma.project
        .delete({ where: { id: input.projectId } })
        .then(() => ({ performed: true, reason: "Deleted temporary project records after blocked retrieval run." }));
  const summary = {
    ok: true,
    blocked: true,
    runner_version: RUNNER_VERSION,
    mode: input.options.mode,
    run_id: input.runId,
    user_id: input.userId,
    project_id: input.projectId,
    artifact_dir: input.artifactDir,
    discovery: input.discovery,
    status_transitions: {
      after_project_create: input.afterProjectStatus,
      final: finalStatus,
    },
    db_cleanup: dbCleanup,
    next_action_es:
      "Discovery real quedó bloqueado o insuficiente. Corrige intake/query o fuente manual; no ejecutar Deep Research hasta tener inspección post-selección.",
  };

  await writeFile(path.join(input.artifactDir, "run-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(summary, null, 2));
}

async function main() {
  const options = parseCliOptions();
  const runId = `mvp-e2e-${options.mode}-${nowStamp()}`;
  const artifactDir = path.join(process.cwd(), "artifacts-local", "mvp-e2e", runId);

  await mkdir(artifactDir, { recursive: true });
  await prisma.$queryRaw`SELECT 1`;

  const user = await prisma.user.upsert({
    where: { email: TEST_USER_EMAIL },
    create: { email: TEST_USER_EMAIL, name: "MVP E2E Runner", locale: "es-PE" },
    update: { name: "MVP E2E Runner", locale: "es-PE" },
  });

  const project = await createProject(user.id, runId);
  const afterProjectStatus = await getMvpProjectStatus(user.id, project.id);

  const projectWithIntake = await saveIntakeForProject(user.id, project.id, {
    topic:
      "IA generativa y retroalimentación académica responsable en programas de posgrado",
    problemContext:
      "Los programas de posgrado exploran herramientas de IA para acelerar retroalimentación, pero necesitan criterios para mantener supervisión humana y trazabilidad.",
    researchLine: "Tecnología educativa aplicada",
    academicConstraints:
      "El producto debe apoyar planificación académica; no debe prometer generación automática de tesis.",
    targetPopulation: "Docentes y estudiantes de posgrado en universidades peruanas",
    availableData:
      "Fuentes bibliográficas, entrevistas exploratorias futuras y registros de revisión académica si el usuario los aporta.",
    preferredMethodology: "Exploratorio-descriptivo con enfoque mixto inicial",
    advisorNotes: "Priorizar ética, trazabilidad, revisión humana y claridad de alcance.",
  });

  const discoveryAndSelection =
    options.mode === "mock"
      ? { discovery: null, selectedSnapshots: await addMockSelectedReferences(project.id) }
      : await selectRetrievalReferences(user.id, project.id);

  if (discoveryAndSelection.selectedSnapshots.length < MIN_SELECTED_REFERENCES) {
    await writeBlockedSummary({
      artifactDir,
      options,
      runId,
      userId: user.id,
      projectId: project.id,
      afterProjectStatus,
      discovery: discoveryAndSelection.discovery,
      keepDbRecords: options.keepDbRecords,
    });
    return;
  }

  const afterSourcesStatus = await getMvpProjectStatus(user.id, project.id);
  const blueprintJson = buildMockBlueprintJson({
    projectTitle: projectWithIntake.title,
    referenceSnapshots: discoveryAndSelection.selectedSnapshots,
    mode: options.mode,
  });
  const coherenceReportJson = {
    artifact_type: "mvp_mock_coherence_report",
    artifact_version: "v1",
    status: "pass_with_mock_warnings",
    problem_objective_alignment: {
      status: "pass",
      notes: "El objetivo mock se alinea con el problema del intake.",
    },
    citation_traceability: {
      status: "warning",
      notes:
        options.mode === "retrieval"
          ? "Las referencias reales fueron seleccionadas desde discovery, pero falta inspección documental/full-text."
          : "Las referencias son mock y solo prueban trazabilidad estructural.",
    },
    missing_information_flags: [],
    risk_flags: ["Modo runner: no usar como salida académica real."],
  };

  await prisma.project.update({
    where: { id: project.id },
    data: { status: ProjectStatus.BLUEPRINT_GENERATING },
  });

  const blueprintVersion = await prisma.blueprintVersion.create({
    data: {
      projectId: project.id,
      versionNumber: 1,
      model: "mock-mvp-backend-core",
      promptVersion: RUNNER_VERSION,
      intakeSnapshotJson: projectWithIntake.intake ?? {},
      selectedReferencesSnapshotJson: discoveryAndSelection.selectedSnapshots,
      blueprintJson,
      coherenceReportJson,
      exportStatus: ExportStatus.READY,
    },
  });

  await prisma.project.update({
    where: { id: project.id },
    data: { status: ProjectStatus.EXPORT_READY },
  });

  const evidenceLog = buildEvidenceLog(blueprintVersion);
  const exportReferences = extractExportReferences(blueprintVersion);
  const bibtex = renderBibtex(exportReferences);
  const ris = renderRis(exportReferences);
  const manifest = {
    artifact_type: "mvp_e2e_export_manifest",
    artifact_version: "v1",
    run_id: runId,
    mode: options.mode,
    project_id: project.id,
    user_id: user.id,
    blueprint_version_id: blueprintVersion.id,
    generated_at: new Date().toISOString(),
    discovery: discoveryAndSelection.discovery,
    files: {
      evidence_log: "evidence_log.json",
      bibtex: "referencias.bib",
      ris: "referencias.ris",
      docx_placeholder: "plan-investigacion-ingeniometrix.mock-docx-placeholder.txt",
    },
    warnings: [
      "El DOCX de este runner es un placeholder textual; la generación DOCX real entra en Pass 7.",
      options.mode === "retrieval"
        ? "Discovery es real, pero evidencia/blueprint/DOCX siguen en stub."
        : "Las fuentes y blueprint son mock; solo validan wiring backend.",
    ],
  };

  await Promise.all([
    writeFile(path.join(artifactDir, "evidence_log.json"), `${JSON.stringify(evidenceLog, null, 2)}\n`, "utf8"),
    writeFile(path.join(artifactDir, "referencias.bib"), `${bibtex}\n`, "utf8"),
    writeFile(path.join(artifactDir, "referencias.ris"), `${ris}\n`, "utf8"),
    writeFile(
      path.join(artifactDir, "plan-investigacion-ingeniometrix.mock-docx-placeholder.txt"),
      "Placeholder DOCX mock del runner backend E2E. No es un documento DOCX real.\n",
      "utf8",
    ),
    writeFile(path.join(artifactDir, "export-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
  ]);

  await prisma.auditLog.create({
    data: {
      projectId: project.id,
      userId: user.id,
      eventType: "MVP_BACKEND_CORE_E2E_COMPLETED",
      actorType: ActorType.SYSTEM,
      provider: Provider.SYSTEM,
      payloadJson: {
        runnerVersion: RUNNER_VERSION,
        mode: options.mode,
        runId,
        artifactDir,
        blueprintVersionId: blueprintVersion.id,
      },
    },
  });

  const finalStatus = await getMvpProjectStatus(user.id, project.id);
  const dbCleanup = options.keepDbRecords
    ? { performed: false, reason: "--keep-db-records was provided" }
    : await prisma.project
        .delete({ where: { id: project.id } })
        .then(() => ({
          performed: true,
          reason: "Deleted temporary project records; shared Reference rows remain for reuse.",
        }));

  const summary = {
    ok: true,
    runner_version: RUNNER_VERSION,
    mode: options.mode,
    run_id: runId,
    user_id: user.id,
    project_id: project.id,
    blueprint_version_id: blueprintVersion.id,
    artifact_dir: artifactDir,
    status_transitions: {
      after_project_create: afterProjectStatus,
      after_sources_selected: afterSourcesStatus,
      final: finalStatus,
    },
    discovery: discoveryAndSelection.discovery,
    keep_db_records: options.keepDbRecords,
    db_cleanup: dbCleanup,
    note:
      "Pass 2 validates real retrieval wiring when --mode=retrieval. Deep Research, real evidence inspection and real DOCX remain intentionally out of scope.",
  };

  await writeFile(path.join(artifactDir, "run-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
