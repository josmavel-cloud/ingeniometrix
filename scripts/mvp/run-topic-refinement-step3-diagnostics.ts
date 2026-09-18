import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { DegreeLevel, ProjectStatus, TemplateKey, TopicOriginType, TopicSelectionStatus, University } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { runMvpBibliographicMap } from "@/server/mvp/bibliographic-map-service";
import { runMvpEvidenceInformedTopicRefinement } from "@/server/mvp/topic-refinement-service";
import type { IntakeInput } from "@/server/projects/project-validation";
import { saveIntakeForProject } from "@/server/projects/project-service";

const TEST_USER_EMAIL = "mvp-topic-refinement-diagnostics@ingeniometrix.local";

type DiagnosticFixture = {
  id: string;
  label: string;
  program: string;
  topicAreaLabel: string;
  intake: IntakeInput;
};

const fixtures: DiagnosticFixture[] = [
  {
    id: "education-ai-feedback-rural",
    label: "Retroalimentación con IA en escritura académica rural",
    program: "Maestría en Educación con mención en Docencia e Innovación",
    topicAreaLabel: "Educación, tecnologia educativa y escritura academica",
    intake: {
      topic: "Uso de retroalimentación automatizada con inteligencia artificial para mejorar la escritura académica en estudiantes universitarios rurales",
      problemContext:
        "Estudiantes universitarios de sedes rurales presentan dificultades persistentes para estructurar argumentos, citar fuentes y revisar borradores academicos. Las herramientas de retroalimentacion automatizada podrian apoyar el proceso, pero existe incertidumbre sobre su efectividad pedagogica, aceptacion docente y riesgos de dependencia tecnologica.",
      researchLine: "Tecnologia educativa, escritura academica, retroalimentacion formativa e inteligencia artificial aplicada a educacion superior.",
      academicConstraints:
        "El proyecto debe evitar presentar la IA como sustituto del docente y debe considerar integridad academica, privacidad de datos y brecha digital.",
      targetPopulation: "Estudiantes universitarios de primeros ciclos en sedes rurales o perifericas de una universidad latinoamericana.",
      availableData: "Rubricas de escritura, borradores de estudiantes, encuestas de percepcion, registros de uso de la herramienta y calificaciones de tareas academicas.",
      preferredMethodology: "Diseño mixto cuasi experimental con pretest/postest, rubrica de escritura y entrevistas o grupos focales.",
      advisorNotes: "Priorizar literatura sobre automated writing evaluation, AI feedback, academic writing, formative assessment, rural higher education y academic integrity.",
    },
  },
  {
    id: "health-telemedicine-diabetes",
    label: "Telemedicina y adherencia en diabetes tipo 2",
    program: "Maestría en Salud Pública",
    topicAreaLabel: "Salud publica, enfermedades cronicas y salud digital",
    intake: {
      topic: "Impacto de la telemedicina en la adherencia al tratamiento de pacientes adultos con diabetes tipo 2 en atención primaria",
      problemContext:
        "La diabetes tipo 2 requiere seguimiento continuo, educacion y adherencia terapeutica. En centros de atencion primaria con limitaciones de acceso, la telemedicina podria mejorar continuidad de cuidados, pero se necesita delimitar que componentes digitales se asocian con mejor adherencia y bajo que condiciones.",
      researchLine: "Salud digital, enfermedades cronicas, adherencia terapeutica, atencion primaria y evaluacion de intervenciones.",
      academicConstraints:
        "El plan no debe proponer cambios clinicos sin aprobacion etica ni reemplazar criterio medico. Debe distinguir adherencia autoinformada, registros farmaceuticos y resultados clinicos.",
      targetPopulation: "Pacientes adultos con diabetes mellitus tipo 2 atendidos en establecimientos de atencion primaria urbanos o periurbanos.",
      availableData: "Historias clinicas, encuestas de adherencia, registros de citas virtuales, HbA1c si estuviera disponible y variables sociodemograficas.",
      preferredMethodology: "Revision aplicada y posible estudio observacional cuantitativo con analisis de asociacion o diferencia pre/post.",
      advisorNotes: "Buscar fuentes sobre telemedicine, diabetes type 2, medication adherence, primary care, HbA1c, digital health interventions y implementation barriers.",
    },
  },
  {
    id: "business-supply-chain-sme",
    label: "Analítica predictiva para inventarios en pymes",
    program: "Maestría en Administración y Analítica de Negocios",
    topicAreaLabel: "Gestion empresarial, operaciones y analitica predictiva",
    intake: {
      topic: "Uso de analítica predictiva para reducir quiebres de stock en pequeñas empresas minoristas",
      problemContext:
        "Las pequeñas empresas minoristas suelen gestionar inventarios con hojas de calculo, experiencia del encargado y reposicion reactiva. Esto produce quiebres de stock, sobreinventario y perdida de ventas. La analitica predictiva podria mejorar la planificacion, pero se requiere un alcance viable con datos limitados.",
      researchLine: "Gestion de operaciones, cadena de suministro, analitica de negocios, pronostico de demanda e inventarios en pymes.",
      academicConstraints:
        "El proyecto debe evitar prometer optimizacion perfecta; debe considerar calidad de datos, estacionalidad, interpretabilidad y capacidad operativa de una pyme.",
      targetPopulation: "Pequeñas empresas minoristas con historico de ventas mensual o semanal y registros basicos de inventario.",
      availableData: "Ventas historicas, calendario comercial, niveles de inventario, quiebres reportados, promociones y categorias de productos.",
      preferredMethodology: "Estudio aplicado cuantitativo con modelos de pronostico comparativos, metricas de error y simulacion simple de politicas de reposicion.",
      advisorNotes: "Priorizar literatura sobre demand forecasting, inventory management, small retail business, stockout reduction, machine learning for SMEs y interpretable forecasting.",
    },
  },
];

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
  const topAlternative = chooseRecommended(input.refinement);
  const avgAlternativeQuality = Math.round(
    input.refinement.alternatives.reduce(
      (total, option) => total + option.feasibility_score_100 + option.novelty_score_100 + option.evidence_coverage_score_100,
      0,
    ) / Math.max(1, input.refinement.alternatives.length * 3),
  );
  const score =
    Math.min(input.refinement.evidence_map.references.length, 5) * 8 +
    Math.min(input.refinement.alternatives.length, 3) * 10 +
    Math.min(input.map.sources.length, 5) * 8 +
    Math.min(crossReferenceCount, 15) * 2 +
    Math.min(input.map.field_map.recurring_concepts.length + input.map.field_map.recurring_keywords.length, 10) * 2;
  const warnings = [
    input.refinement.alternatives.length < 3 ? "Paso 2 produjo menos de 3 alternativas." : null,
    input.refinement.evidence_map.references.length < 5 ? "Paso 2 tuvo menos de 5 referencias exploratorias." : null,
    input.map.sources.length < 5 ? "Paso 3 tuvo menos de 5 fuentes candidatas." : null,
    crossReferenceCount < 6 ? "Paso 3 genero pocas referencias cruzadas." : null,
    avgAlternativeQuality < 60 ? "Calidad promedio de alternativas baja." : null,
    ...input.map.selection_guidance.warnings,
  ].filter((value): value is string => Boolean(value));

  return {
    score_100: Math.min(100, score),
    passed: score >= 70 && warnings.length <= 3,
    avg_alternative_quality: avgAlternativeQuality,
    recommended_option: {
      option_id: topAlternative?.option_id,
      strategy: topAlternative?.strategy,
      title: topAlternative?.title,
      feasibility_score_100: topAlternative?.feasibility_score_100,
      novelty_score_100: topAlternative?.novelty_score_100,
      evidence_coverage_score_100: topAlternative?.evidence_coverage_score_100,
    },
    counts: {
      step2_references: input.refinement.evidence_map.references.length,
      alternatives: input.refinement.alternatives.length,
      step3_sources: input.map.sources.length,
      cross_references: crossReferenceCount,
      recurring_concepts: input.map.field_map.recurring_concepts.length,
      recurring_keywords: input.map.field_map.recurring_keywords.length,
      recurring_topics: input.map.field_map.recurring_topics.length,
    },
    warnings,
  };
}

function renderMarkdown(report: Awaited<ReturnType<typeof runDiagnostics>>) {
  const lines = [
    "# MVP Topic Refinement + Step 3 Diagnostics",
    "",
    `- run_id: ${report.run_id}`,
    `- overall_passed: ${report.overall_passed}`,
    `- average_score_100: ${report.average_score_100}`,
    "",
  ];

  for (const item of report.cases) {
    lines.push(`## ${item.fixture.label}`);
    lines.push("", `- project_id: ${item.project_id}`, `- quality_score_100: ${item.quality.score_100}`, `- passed: ${item.quality.passed}`);
    lines.push(`- recommended: ${item.quality.recommended_option.title}`);
    lines.push(`- counts: ${JSON.stringify(item.quality.counts)}`);
    if (item.quality.warnings.length > 0) {
      lines.push("- warnings:");
      for (const warning of item.quality.warnings) lines.push(`  - ${warning}`);
    }
    lines.push("- Step 3 recurring concepts: " + item.step3.field_map.recurring_concepts.slice(0, 6).join(", "));
    lines.push("- Step 3 selection ids: " + item.step3.selection_guidance.recommended_reference_ids.join(", "));
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

async function runDiagnostics() {
  const runId = `topic-refinement-step3-${nowStamp()}`;
  const artifactDir = path.join(process.cwd(), "artifacts-local", "mvp-topic-refinement-step3", runId);
  await mkdir(artifactDir, { recursive: true });

  const user = await prisma.user.upsert({
    where: { email: TEST_USER_EMAIL },
    create: { email: TEST_USER_EMAIL, name: "MVP Topic Refinement Diagnostics", locale: "es-PE" },
    update: { name: "MVP Topic Refinement Diagnostics", locale: "es-PE" },
  });

  const cases = [];

  for (const fixture of fixtures) {
    const project = await prisma.project.create({
      data: {
        userId: user.id,
        status: ProjectStatus.DRAFT,
        title: `${fixture.label} (${runId})`,
        country: "PE",
        language: "es",
        degreeLevel: DegreeLevel.MAESTRIA,
        university: University.OTHER,
        program: fixture.program,
        templateKey: TemplateKey.GENERIC_POSGRADO_PE,
        topicOriginType: TopicOriginType.CUSTOM,
        topicSelectionStatus: TopicSelectionStatus.SELECTED,
        topicSeedText: fixture.intake.topic,
        topicAreaLabel: fixture.topicAreaLabel,
      },
    });

    await saveIntakeForProject(user.id, project.id, fixture.intake);
    const refinement = await runMvpEvidenceInformedTopicRefinement({ userId: user.id, projectId: project.id });
    const selected = chooseRecommended(refinement);
    await saveIntakeForProject(user.id, project.id, selected.suggested_intake);
    const step3 = await runMvpBibliographicMap({ userId: user.id, projectId: project.id, desiredTotal: 5 });
    const quality = evaluateQuality({ refinement, map: step3 });

    const caseReport = {
      fixture: { id: fixture.id, label: fixture.label, topicAreaLabel: fixture.topicAreaLabel },
      project_id: project.id,
      selected_option_id: selected.option_id,
      step2: refinement,
      step3,
      quality,
    };

    cases.push(caseReport);
    await writeFile(path.join(artifactDir, `${fixture.id}.json`), `${JSON.stringify(caseReport, null, 2)}\n`, "utf8");
  }

  const averageScore = Math.round(cases.reduce((total, item) => total + item.quality.score_100, 0) / cases.length);
  const report = {
    ok: true,
    run_id: runId,
    artifact_dir: artifactDir,
    overall_passed: cases.every((item) => item.quality.passed) && averageScore >= 75,
    average_score_100: averageScore,
    cases,
  };

  await writeFile(path.join(artifactDir, "diagnostic-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(artifactDir, "diagnostic-summary.md"), renderMarkdown(report), "utf8");
  return report;
}

runDiagnostics()
  .then((report) => {
    console.log(JSON.stringify({
      ok: report.ok,
      run_id: report.run_id,
      artifact_dir: report.artifact_dir,
      overall_passed: report.overall_passed,
      average_score_100: report.average_score_100,
      cases: report.cases.map((item) => ({
        fixture: item.fixture,
        project_id: item.project_id,
        selected_option_id: item.selected_option_id,
        quality: item.quality,
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
