import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { DegreeLevel, ProjectStatus, TemplateKey, TopicOriginType, TopicSelectionStatus, University } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { runMvpBibliographicMap } from "@/server/mvp/bibliographic-map-service";
import { runMvpEvidenceInformedTopicRefinement } from "@/server/mvp/topic-refinement-service";
import type { IntakeInput } from "@/server/projects/project-validation";
import { saveIntakeForProject } from "@/server/projects/project-service";

const TEST_USER_EMAIL = "mvp-bridge-cpr-diagnostics@ingeniometrix.local";

const intake: IntakeInput = {
  topic:
    "Comportamiento dinámico post-sismo de un puente arco de concreto armado mediante vibraciones inducidas por tránsito vehicular",
  problemContext:
    "Se desea evaluar el comportamiento dinámico post-sismo de un puente arco de concreto armado usando vibraciones inducidas por tránsito vehicular. El método Contact-Point Response (CPR) registrará aceleraciones desde vehículos instrumentados y se modelará el puente en SAP2000. El objetivo es desarrollar una metodología rápida y económica para detectar daño estructural en puentes rurales sin usar sensores permanentes.",
  researchLine:
    "Ingeniería estructural, dinámica de puentes, monitoreo de salud estructural, evaluación post-sismo, identificación modal indirecta y modelamiento numérico.",
  academicConstraints:
    "El plan debe distinguir claramente entre detección preliminar de daño y diagnóstico estructural concluyente. Debe advertir que la metodología requiere validación experimental/numérica y no reemplaza inspecciones profesionales de seguridad.",
  targetPopulation:
    "Puentes arco de concreto armado en zonas rurales expuestos a eventos sísmicos, con acceso vehicular suficiente para mediciones móviles.",
  availableData:
    "Registros de aceleración de vehículos instrumentados, parámetros geométricos y estructurales del puente, modelo SAP2000, escenarios post-sismo simulados o medidos y condiciones de tránsito controladas.",
  preferredMethodology:
    "Metodología cuantitativa aplicada con modelamiento en SAP2000, simulación de escenarios de daño, extracción de respuesta en punto de contacto vehiculo-puente y comparación de indicadores dinámicos pre/post-sismo.",
  advisorNotes:
    "Priorizar literatura sobre indirect bridge monitoring, contact-point response, vehicle scanning method, bridge health monitoring, post-earthquake bridge assessment, vehicle-induced vibration, concrete arch bridges y finite element model updating.",
};

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function chooseRecommended(refinement: Awaited<ReturnType<typeof runMvpEvidenceInformedTopicRefinement>>) {
  return (
    refinement.alternatives.find((option) => option.option_id === refinement.recommended_option_id) ??
    refinement.alternatives.find((option) => option.strategy === "balanceada") ??
    refinement.alternatives[0]
  );
}

function evaluateQuality(input: {
  refinement: Awaited<ReturnType<typeof runMvpEvidenceInformedTopicRefinement>>;
  map: Awaited<ReturnType<typeof runMvpBibliographicMap>>;
}) {
  const crossReferenceCount = input.map.sources.reduce(
    (total, source) =>
      total +
      source.cross_references.cited_by_sample.length +
      source.cross_references.referenced_works_sample.length +
      source.cross_references.related_works_sample.length,
    0,
  );
  const selected = chooseRecommended(input.refinement);
  const domainTerms = [
    "bridge",
    "vehicle",
    "vibration",
    "structural health monitoring",
    "contact point",
    "indirect",
    "damage",
    "modal",
    "earthquake",
    "finite element",
    "sap2000",
  ];
  const sourceText = input.map.sources
    .map((source) => [source.title, source.concepts.join(" "), source.keywords.join(" "), source.topics.join(" ")].join(" "))
    .join(" ")
    .toLowerCase();
  const matchedDomainTerms = domainTerms.filter((term) => sourceText.includes(term));
  const warnings = [
    input.refinement.evidence_map.references.length < 5 ? "Paso 2 tuvo menos de 5 referencias exploratorias." : null,
    input.refinement.alternatives.length < 3 ? "Paso 2 produjo menos de 3 alternativas." : null,
    input.map.sources.length < 5 ? "Paso 3 tuvo menos de 5 fuentes candidatas." : null,
    crossReferenceCount < 8 ? "Paso 3 genero pocas referencias cruzadas." : null,
    matchedDomainTerms.length < 5 ? "Cobertura conceptual debil para monitoreo indirecto de puentes." : null,
    ...input.map.selection_guidance.warnings,
  ].filter((value): value is string => Boolean(value));
  const score =
    Math.min(input.refinement.evidence_map.references.length, 5) * 8 +
    Math.min(input.refinement.alternatives.length, 4) * 8 +
    Math.min(input.map.sources.length, 5) * 8 +
    Math.min(crossReferenceCount, 15) * 2 +
    Math.min(matchedDomainTerms.length, 8) * 4;

  return {
    score_100: Math.min(100, score),
    passed: score >= 75 && warnings.length <= 2,
    selected_option: selected
      ? {
          option_id: selected.option_id,
          strategy: selected.strategy,
          title: selected.title,
          feasibility_score_100: selected.feasibility_score_100,
          novelty_score_100: selected.novelty_score_100,
          evidence_coverage_score_100: selected.evidence_coverage_score_100,
        }
      : null,
    counts: {
      step2_references: input.refinement.evidence_map.references.length,
      alternatives: input.refinement.alternatives.length,
      step3_sources: input.map.sources.length,
      cross_references: crossReferenceCount,
      matched_domain_terms: matchedDomainTerms.length,
    },
    matched_domain_terms: matchedDomainTerms,
    warnings,
  };
}

function renderMarkdown(report: Awaited<ReturnType<typeof run>>) {
  const lines = [
    "# Custom Bridge CPR Step 1-3 Diagnostic",
    "",
    `- run_id: ${report.run_id}`,
    `- project_id: ${report.project_id}`,
    `- quality_score_100: ${report.quality.score_100}`,
    `- passed: ${report.quality.passed}`,
    `- selected_option: ${report.quality.selected_option?.title ?? "N/A"}`,
    `- warnings: ${report.quality.warnings.length ? report.quality.warnings.join("; ") : "none"}`,
    "",
    "## Paso 1 - Intake normalizado",
    "",
    `- normalizedTopic: ${report.step2.normalized_intake.normalizedTopic}`,
    `- knowledgeArea: ${report.step2.normalized_intake.knowledgeArea.label} (${report.step2.normalized_intake.knowledgeArea.confidence})`,
    `- coreConcepts: ${report.step2.normalized_intake.retrievalHints.coreConcepts.join(", ")}`,
    `- objectTerms: ${report.step2.normalized_intake.retrievalHints.objectTerms.join(", ")}`,
    `- methodTerms: ${report.step2.normalized_intake.retrievalHints.methodTerms.join(", ")}`,
    "",
    "## Paso 2 - Alternativas",
    "",
    ...report.step2.alternatives.flatMap((option) => [
      `### ${option.option_id} / ${option.strategy}`,
      `- title: ${option.title}`,
      `- question: ${option.research_question}`,
      `- scores: feasibility ${option.feasibility_score_100}, novelty ${option.novelty_score_100}, evidence ${option.evidence_coverage_score_100}`,
      `- risks: ${option.risks.join("; ")}`,
      "",
    ]),
    "## Paso 3 - Fuentes candidatas",
    "",
    ...report.step3.sources.map(
      (source) =>
        `- ${source.title} (${source.year ?? "s/f"}) — ${source.venue ?? "sin venue"}; score=${source.relevance_score}; crossRefs=${
          source.cross_references.cited_by_sample.length +
          source.cross_references.referenced_works_sample.length +
          source.cross_references.related_works_sample.length
        }`,
    ),
    "",
    `## Conceptos recurrentes: ${report.step3.field_map.recurring_concepts.slice(0, 10).join(", ")}`,
    `## Keywords recurrentes: ${report.step3.field_map.recurring_keywords.slice(0, 10).join(", ")}`,
    `## Domain terms matched: ${report.quality.matched_domain_terms.join(", ")}`,
  ];
  return `${lines.join("\n")}\n`;
}

async function run() {
  const runId = `bridge-cpr-step1-3-${nowStamp()}`;
  const artifactDir = path.join(process.cwd(), "artifacts-local", "mvp-custom-bridge-cpr-step1-3", runId);
  await mkdir(artifactDir, { recursive: true });

  const user = await prisma.user.upsert({
    where: { email: TEST_USER_EMAIL },
    create: { email: TEST_USER_EMAIL, name: "MVP Bridge CPR Diagnostics", locale: "es-PE" },
    update: { name: "MVP Bridge CPR Diagnostics", locale: "es-PE" },
  });
  const project = await prisma.project.create({
    data: {
      userId: user.id,
      status: ProjectStatus.DRAFT,
      title: `Puente arco CPR post-sismo (${runId})`,
      country: "PE",
      language: "es",
      degreeLevel: DegreeLevel.MAESTRIA,
      university: University.OTHER,
      program: "Maestría en Ingeniería Civil con mención en Estructuras",
      templateKey: TemplateKey.GENERIC_POSGRADO_PE,
      topicOriginType: TopicOriginType.CUSTOM,
      topicSelectionStatus: TopicSelectionStatus.SELECTED,
      topicSeedText: intake.topic,
      topicAreaLabel: "Ingeniería estructural, puentes, monitoreo de salud estructural y dinámica post-sismo",
    },
  });

  await saveIntakeForProject(user.id, project.id, intake);
  const step2 = await runMvpEvidenceInformedTopicRefinement({ userId: user.id, projectId: project.id });
  const selected = chooseRecommended(step2);
  await saveIntakeForProject(user.id, project.id, selected.suggested_intake);
  const step3 = await runMvpBibliographicMap({ userId: user.id, projectId: project.id, desiredTotal: 5 });
  const quality = evaluateQuality({ refinement: step2, map: step3 });
  const report = {
    ok: true,
    run_id: runId,
    artifact_dir: artifactDir,
    project_id: project.id,
    selected_option_id: selected.option_id,
    step2,
    step3,
    quality,
  };

  await writeFile(path.join(artifactDir, "bridge-cpr-step1-3-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(artifactDir, "bridge-cpr-step1-3-summary.md"), renderMarkdown(report), "utf8");
  return report;
}

run()
  .then((report) => {
    console.log(JSON.stringify({
      ok: report.ok,
      run_id: report.run_id,
      artifact_dir: report.artifact_dir,
      project_id: report.project_id,
      selected_option_id: report.selected_option_id,
      quality: report.quality,
      normalized: {
        topic: report.step2.normalized_intake.normalizedTopic,
        knowledgeArea: report.step2.normalized_intake.knowledgeArea,
        retrievalHints: report.step2.normalized_intake.retrievalHints,
      },
      sources: report.step3.sources.map((source) => ({
        title: source.title,
        year: source.year,
        venue: source.venue,
        relevance_score: source.relevance_score,
      })),
    }, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  });
