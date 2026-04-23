import { setTimeout as delay } from "node:timers/promises";

import { getConfiguredLlmProvider } from "@/llm";
import { buildSectionPrompt } from "@/server/blueprint-v2/prompts/section-prompt-builder";
import type {
  EvidenceLedger,
  MasterBlueprintEngineProject,
  MasterSectionDraft,
  MasterTemplateRuntime,
  SectionPromptPlan,
} from "@/server/blueprint-v2/types";
import { clipText, parseBulletLines } from "@/server/blueprint-v2/utils";

const DIRECT_DERIVATION_KEYS = new Set([
  "problem_statement",
  "keywords",
  "objectives",
  "research_questions",
  "general_research_question",
  "specific_research_questions",
  "theoretical_justification",
  "practical_justification",
  "methodological_justification",
  "general_hypothesis",
  "specific_hypotheses",
  "research_antecedents",
  "state_of_the_art",
  "theoretical_bases",
  "terms_definition",
  "methodology",
  "methodological_approach",
  "research_design",
  "population_and_sample",
  "data_collection_techniques",
  "research_instruments",
  "research_procedure",
  "analysis_plan",
  "references",
  "annexes",
]);

function buildFallbackSectionContent(input: {
  title: string;
  sectionKey: string;
  project: MasterBlueprintEngineProject;
  evidenceLedger: EvidenceLedger;
}) {
  const evidenceBlock = input.evidenceLedger.snippets
    .filter((snippet) => snippet.section_hint_keys.includes(input.sectionKey))
    .slice(0, 3)
    .map((snippet) => `- ${clipText(snippet.text, 220) ?? snippet.text}`)
    .join("\n");

  if (evidenceBlock) {
    return `Esta seccion presenta una version preliminar basada en la evidencia recuperada para ${input.project.intake.topic}.\n${evidenceBlock}`;
  }

  return `Esta seccion queda en version preliminar a partir del intake disponible sobre ${input.project.intake.topic}. Requiere revision academica adicional para mayor precision.`;
}

function toQuestion(value: string) {
  const normalized = value.replace(/^[*-]\s*/, "").replace(/[.]+$/g, "").trim();

  if (!normalized) {
    return "";
  }

  if (normalized.endsWith("?")) {
    return normalized;
  }

  const lowered = normalized.charAt(0).toLowerCase() + normalized.slice(1);
  const verbMatch = lowered.match(
    /^(identificar|describir|analizar|evaluar|determinar|establecer|proponer|examinar|comparar|estimar)\s+(.+)$/i,
  );

  if (!verbMatch) {
    return `Como se manifiesta ${lowered}?`;
  }

  const [, verb, remainder] = verbMatch;

  switch (verb.toLowerCase()) {
    case "identificar":
      return `Que elementos permiten identificar ${remainder}?`;
    case "describir":
      return `Como se caracteriza ${remainder}?`;
    case "analizar":
    case "examinar":
      return `Como se relaciona ${remainder} con el problema de investigacion?`;
    case "evaluar":
    case "estimar":
      return `En que medida ${remainder}?`;
    case "determinar":
    case "establecer":
      return `Que relacion existe respecto de ${remainder}?`;
    case "comparar":
      return `Que diferencias o similitudes se observan en ${remainder}?`;
    case "proponer":
      return `Que lineamientos resultan pertinentes para ${remainder}?`;
    default:
      return `Como se manifiesta ${lowered}?`;
  }
}

function getDraftText(drafts: MasterSectionDraft[], sectionKey: string) {
  return drafts.find((draft) => draft.section_key === sectionKey)?.content ?? "";
}

function getTopEvidenceTexts(input: {
  evidenceLedger: EvidenceLedger;
  sectionKeys: string[];
  limit?: number;
}) {
  return input.evidenceLedger.snippets
    .filter((snippet) =>
      input.sectionKeys.some((sectionKey) => snippet.section_hint_keys.includes(sectionKey)),
    )
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, input.limit ?? 3)
    .map((snippet) => clipText(snippet.text, 220) ?? snippet.text)
    .filter(Boolean);
}

function buildProblemStatement(input: {
  project: MasterBlueprintEngineProject;
  evidenceLedger: EvidenceLedger;
}) {
  const evidence = getTopEvidenceTexts({
    evidenceLedger: input.evidenceLedger,
    sectionKeys: ["problem_statement", "research_antecedents"],
    limit: 3,
  });

  return [
    `En el contexto de ${input.project.intake.topic}, el problema de investigacion se centra en ${input.project.intake.problemContext || "una brecha todavia no suficientemente delimitada en el intake"}.`,
    input.project.intake.targetPopulation?.trim()
      ? `La delimitacion inicial considera como poblacion o contexto de interes a ${input.project.intake.targetPopulation}.`
      : null,
    input.project.intake.researchLine?.trim()
      ? `Esta situacion se inscribe en la linea de investigacion ${input.project.intake.researchLine}.`
      : null,
    evidence.length > 0
      ? `Los antecedentes recuperados sugieren, de forma convergente, brechas o desafios asociados a ${evidence.join(" ")}`
      : null,
    "En consecuencia, el problema se formula desde el caso y el alcance declarados en el intake, usando la evidencia solo como antecedente comparativo y no como sustituto del contexto propio del proyecto.",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildMethodologySection(input: {
  project: MasterBlueprintEngineProject;
  evidenceLedger: EvidenceLedger;
}) {
  const methodSignals = getTopEvidenceTexts({
    evidenceLedger: input.evidenceLedger,
    sectionKeys: [
      "methodology",
      "methodological_approach",
      "research_design",
      "analysis_plan",
    ],
    limit: 3,
  });

  return [
    `La metodologia propuesta para el estudio es ${input.project.intake.preferredMethodology || "de caracter preliminar y sujeta a cierre academico"}, manteniendo coherencia con el problema planteado y con la disponibilidad real de datos declarada por el usuario.`,
    input.project.intake.targetPopulation?.trim()
      ? `La unidad de analisis y la poblacion de interes se delimitan preliminarmente a ${input.project.intake.targetPopulation}.`
      : null,
    input.project.intake.availableData?.trim()
      ? `Las tecnicas e instrumentos deberan adaptarse a las fuentes de informacion disponibles, entre ellas ${input.project.intake.availableData}.`
      : null,
    methodSignals.length > 0
      ? `Como apoyo, los antecedentes metodologicamente mas cercanos sugieren rutas de levantamiento y analisis vinculadas con ${methodSignals.join(" ")}`
      : null,
    "La version actual prioriza una formulacion prudente: el diseno final, los instrumentos y el plan analitico deben cerrarse con validacion academica, sin prometer resultados causales que la evidencia disponible todavia no permite sostener.",
  ]
    .filter(Boolean)
    .join(" ");
}

function deriveSectionWithoutLlm(input: {
  sectionKey: string;
  title: string;
  project: MasterBlueprintEngineProject;
  evidenceLedger: EvidenceLedger;
  drafts: MasterSectionDraft[];
}) {
  const methodology = getDraftText(input.drafts, "methodology");
  const objectives = parseBulletLines(getDraftText(input.drafts, "specific_objectives"));
  const formalSources = input.evidenceLedger.source_registry.filter(
    (source) => source.eligible_for_formal_reference,
  );

  switch (input.sectionKey) {
    case "problem_statement":
      return buildProblemStatement({
        project: input.project,
        evidenceLedger: input.evidenceLedger,
      });
    case "keywords": {
      const terms = Array.from(
        new Set(
          `${input.project.intake.topic} ${input.project.intake.researchLine ?? ""}`
            .toLowerCase()
            .split(/[^a-z0-9áéíóúñü]+/i)
            .filter((term) => term.length >= 4),
        ),
      ).slice(0, 5);
      return terms.map((term) => `- ${term}`).join("\n");
    }
    case "objectives":
      return [
        getDraftText(input.drafts, "general_objective"),
        getDraftText(input.drafts, "specific_objectives"),
      ]
        .filter(Boolean)
        .join("\n");
    case "research_questions":
      return [
        getDraftText(input.drafts, "general_research_question"),
        getDraftText(input.drafts, "specific_research_questions"),
      ]
        .filter(Boolean)
        .join("\n");
    case "general_research_question":
      return toQuestion(
        getDraftText(input.drafts, "general_objective") ||
          "abordar el problema de investigacion delimitado",
      );
    case "specific_research_questions":
      return objectives.map((objective) => `- ${toQuestion(objective)}`).join("\n");
    case "theoretical_justification":
      return `Desde el plano teorico, el estudio busca aclarar vacios y relaciones conceptuales sobre ${input.project.intake.topic}, articulando antecedentes recientes y un marco interpretativo coherente con el problema planteado.`;
    case "practical_justification":
      return `En el plano practico, la investigacion aspira a ofrecer criterios utiles para la toma de decisiones y para la mejora del contexto analizado, especialmente dentro del ambito descrito en el intake del proyecto.`;
    case "methodological_justification":
      return `Desde el enfoque metodologico, el plan justifica la seleccion de un diseno prudente y trazable, alineado con la disponibilidad real de datos y con la necesidad de producir evidencia defendible.`;
    case "general_hypothesis":
      return `La mejora en ${input.project.intake.topic.toLowerCase()} se asocia con condiciones organizacionales, tecnicas y de gestion que pueden analizarse mediante el enfoque metodologico propuesto.`;
    case "specific_hypotheses":
      return objectives
        .slice(0, 3)
        .map(
          (objective) =>
            `- Existe una relacion analizable entre ${objective.toLowerCase()} y el problema delimitado.`,
        )
        .join("\n");
    case "research_antecedents":
      return formalSources
        .slice(0, 5)
        .map(
          (source) =>
            `- ${source.title} (${source.year ?? "s/f"}) aporta antecedentes utiles sobre el tema y el contexto del estudio.`,
        )
        .join("\n");
    case "state_of_the_art":
      return `La evidencia recuperada sugiere un estado del arte centrado en enfoques de adopcion, gestion y analisis aplicado, con predominio de estudios recientes y con espacios todavia abiertos para una delimitacion contextual mas precisa en Peru.`;
    case "theoretical_bases":
      return `Las bases teoricas se organizan alrededor de conceptos sobre ${input.project.intake.topic.toLowerCase()}, gestion basada en evidencia y adopcion de practicas o capacidades organizacionales relacionadas con el problema de investigacion.`;
    case "terms_definition":
      return [
        `- ${input.project.intake.topic}: concepto central del estudio delimitado en el plan.`,
        "- Adopcion: grado en que una practica o capacidad es incorporada de manera sistematica.",
        "- Evidencia: informacion recuperable y trazable que sustenta decisiones o inferencias del estudio.",
      ].join("\n");
    case "methodology":
      return buildMethodologySection({
        project: input.project,
        evidenceLedger: input.evidenceLedger,
      });
    case "methodological_approach":
      return (
        input.project.intake.preferredMethodology ||
        methodology ||
        "Enfoque metodologico mixto o por definir con validacion academica."
      );
    case "research_design":
      return `Se propone un diseno ${input.project.intake.preferredMethodology?.toLowerCase() ?? "coherente con la disponibilidad de datos"}, cuidando que la estrategia de levantamiento y analisis permita responder las preguntas de investigacion sin exceder el alcance del plan.`;
    case "population_and_sample":
      return (
        input.project.intake.targetPopulation ||
        "La poblacion y muestra se delimitan de manera preliminar al contexto descrito en el problema y requieren precision final con el asesor."
      );
    case "data_collection_techniques":
      return [
        input.project.intake.availableData?.toLowerCase().includes("encuesta")
          ? "- Encuesta estructurada."
          : "- Revision documental.",
        input.project.intake.availableData?.toLowerCase().includes("entrevista")
          ? "- Entrevista semiestructurada."
          : "- Registro de evidencia secundaria.",
      ].join("\n");
    case "research_instruments":
      return [
        "- Cuestionario o ficha de levantamiento de informacion.",
        "- Guia de entrevista o protocolo de registro documental.",
      ].join("\n");
    case "research_procedure":
      return [
        "- Delimitar la unidad de analisis y confirmar criterios de inclusion.",
        "- Recuperar y organizar evidencia bibliografica y datos disponibles.",
        "- Aplicar las tecnicas definidas y consolidar la base para el analisis.",
      ].join("\n");
    case "analysis_plan":
      return methodology
        ? `El analisis se desarrollara en coherencia con la metodologia propuesta: ${clipText(methodology, 360) ?? methodology}`
        : "El plan de analisis se definira en funcion del enfoque metodologico y de la disponibilidad final de datos.";
    case "references":
      return formalSources
        .slice(0, 12)
        .map(
          (source) =>
            `- ${source.authors.join(", ") || "Autor no disponible"} (${source.year ?? "s/f"}). ${source.title}. ${source.venue ?? "Fuente por precisar"}${source.doi ? `. DOI: ${source.doi}` : ""}`,
        )
        .join("\n");
    case "annexes":
      return [
        "- Matriz de trazabilidad del blueprint.",
        "- Registro de procedencia y evidencia usada por el engine.",
        "- Instrumentos preliminares o tablas de apoyo si el asesor lo solicita.",
      ].join("\n");
    default:
      return buildFallbackSectionContent({
        title: input.title,
        sectionKey: input.sectionKey,
        project: input.project,
        evidenceLedger: input.evidenceLedger,
      });
  }
}

function resolveSupportLevel(input: {
  pdfSourceCount: number;
  sourceCount: number;
  webSourceCount: number;
  assumptionCount: number;
}) {
  if (input.pdfSourceCount > 0) {
    return "pdf_supported" as const;
  }

  if (input.sourceCount > 0) {
    return "reference_supported" as const;
  }

  if (input.webSourceCount > 0) {
    return "web_supported" as const;
  }

  if (input.assumptionCount > 0) {
    return "assumption_backed" as const;
  }

  return "intake_supported" as const;
}

export async function runSectionGenerationEngine(input: {
  project: MasterBlueprintEngineProject;
  masterTemplate: MasterTemplateRuntime;
  evidenceLedger: EvidenceLedger;
  promptPlan: SectionPromptPlan;
}): Promise<MasterSectionDraft[]> {
  const provider = getConfiguredLlmProvider();
  const drafts: MasterSectionDraft[] = [];

  for (const planItem of input.promptPlan.generation_plan
    .slice()
    .sort((left, right) => left.order - right.order)) {
    if (planItem.section_key === "consistency_matrix") {
      continue;
    }

    const baseManifestItem = input.promptPlan.prompt_manifest.find(
      (manifestItem) => manifestItem.section_key === planItem.section_key,
    );

    if (!baseManifestItem) {
      continue;
    }

    const priorSections = drafts
      .filter((draft) => planItem.depends_on_keys.includes(draft.section_key))
      .map((draft) => ({
        section_key: draft.section_key,
        title: draft.title,
        content: draft.content,
      }));
    const prompt = buildSectionPrompt({
      project: input.project,
      section: planItem,
      templateSection: input.masterTemplate.sections.find(
        (templateSection) => templateSection.semantic_key === planItem.section_key,
      ),
      evidenceLedger: input.evidenceLedger,
      priorSections,
      manifestItem: {
        section_key: baseManifestItem.section_key,
        title: baseManifestItem.title,
        phase: baseManifestItem.phase,
        evidence_snippet_ids: baseManifestItem.evidence_snippet_ids,
        supporting_source_ids: baseManifestItem.supporting_source_ids,
        supporting_pdf_source_ids: baseManifestItem.supporting_pdf_source_ids,
        supporting_web_source_ids: baseManifestItem.supporting_web_source_ids,
        supporting_assumption_ids: baseManifestItem.supporting_assumption_ids,
      },
    });
    const content = DIRECT_DERIVATION_KEYS.has(planItem.section_key)
      ? deriveSectionWithoutLlm({
          sectionKey: planItem.section_key,
          title: planItem.title,
          project: input.project,
          evidenceLedger: input.evidenceLedger,
          drafts,
        })
      : await Promise.race([
          provider.generateText({
            prompt,
          }),
          delay(18_000).then(() => {
            throw new Error("Se excedio el tiempo operativo por seccion.");
          }),
        ]).catch(() =>
          buildFallbackSectionContent({
            title: planItem.title,
            sectionKey: planItem.section_key,
            project: input.project,
            evidenceLedger: input.evidenceLedger,
          }),
        );

    drafts.push({
      section_key: planItem.section_key,
      title: planItem.title,
      phase: planItem.phase,
      content: content.trim(),
      content_kind: planItem.content_kind,
      support_level: resolveSupportLevel({
        pdfSourceCount: baseManifestItem.supporting_pdf_source_ids.length,
        sourceCount: baseManifestItem.supporting_source_ids.length,
        webSourceCount: baseManifestItem.supporting_web_source_ids.length,
        assumptionCount: baseManifestItem.supporting_assumption_ids.length,
      }),
      supported_source_ids: baseManifestItem.supporting_source_ids,
      supported_pdf_source_ids: baseManifestItem.supporting_pdf_source_ids,
      supported_web_source_ids: baseManifestItem.supporting_web_source_ids,
      supported_assumption_ids: baseManifestItem.supporting_assumption_ids,
      evidence_snippet_ids: baseManifestItem.evidence_snippet_ids,
      warnings:
        baseManifestItem.evidence_snippet_ids.length === 0
          ? ["La seccion se redacto con soporte directo limitado y depende mas del intake/assumptions."]
          : [],
      prompt,
    });
  }

  return drafts;
}
