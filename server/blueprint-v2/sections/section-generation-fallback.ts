import type { ConsolidatedEvidenceArtifact } from "@/blueprint_launch/server/local-playground-store";
import type {
  EvidenceLedger,
  MasterBlueprintEngineProject,
  MasterSectionDraft,
} from "@/server/blueprint-v2/types";
import { clipText, parseBulletLines } from "@/server/blueprint-v2/utils";

import {
  buildEvidenceUnitMap,
  getDraftText,
  type MethodScopeGuidanceItem,
  type RuntimePromptContext,
  sanitizeRecoveredText,
  uniqueEvidenceUnits,
} from "@/server/blueprint-v2/sections/section-generation-shared";

function buildFallbackSectionContent(input: {
  title: string;
  sectionKey: string;
  project: MasterBlueprintEngineProject;
  evidenceLedger: EvidenceLedger;
}) {
  const evidenceBlock = input.evidenceLedger.snippets
    .filter((snippet) => snippet.section_hint_keys.includes(input.sectionKey))
    .slice(0, 3)
    .map(
      (snippet) =>
        `- ${
          clipText(sanitizeRecoveredText(snippet.text), 220) ??
          sanitizeRecoveredText(snippet.text)
        }`,
    )
    .join("\n");

  if (evidenceBlock) {
    return `Esta seccion presenta una version preliminar basada en la evidencia recuperada para ${sanitizeRecoveredText(input.project.intake.topic)}.\n${evidenceBlock}`;
  }

  return `Esta seccion queda en version preliminar a partir del intake disponible sobre ${sanitizeRecoveredText(input.project.intake.topic)}. Requiere revision academica adicional para mayor precision.`;
}

function toQuestion(value: string) {
  const normalized = value
    .replace(/^[*-]\s*/, "")
    .replace(/[.]+$/g, "")
    .trim();

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

function getTopEvidenceTexts(input: {
  evidenceLedger: EvidenceLedger;
  sectionKeys: string[];
  limit?: number;
}) {
  return input.evidenceLedger.snippets
    .filter((snippet) =>
      input.sectionKeys.some((sectionKey) =>
        snippet.section_hint_keys.includes(sectionKey),
      ),
    )
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, input.limit ?? 3)
    .map(
      (snippet) =>
        clipText(sanitizeRecoveredText(snippet.text), 220) ??
        sanitizeRecoveredText(snippet.text),
    )
    .filter(Boolean);
}

function buildScheduleSection() {
  return [
    "- Mes 1: delimitacion final del problema, ajuste de preguntas y revision inicial del corpus.",
    "- Mes 2: organizacion de antecedentes, estado del arte y bases teoricas del proyecto.",
    "- Mes 3: cierre de la estrategia metodologica, categorias o criterios de analisis y plan de trabajo.",
    "- Mes 4: consolidacion del borrador principal y revision de coherencia entre objetivos, preguntas y metodo.",
    "- Mes 5: ajustes con observaciones academicas, normalizacion de referencias y preparacion de anexos.",
    "- Mes 6: cierre del documento, control final de trazabilidad y preparacion para exportacion institucional.",
  ].join("\n");
}

function buildProblemStatement(input: {
  project: MasterBlueprintEngineProject;
  evidenceLedger: EvidenceLedger;
  supportFragments?: string[];
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
    input.supportFragments && input.supportFragments.length > 0
      ? `Como soporte comparativo adicional, el corpus consolidado permite destacar que ${input.supportFragments
          .slice(0, 2)
          .join(" ")}`
      : null,
    "En consecuencia, el problema se formula desde el caso y el alcance declarados en el intake, usando la evidencia solo como antecedente comparativo y no como sustituto del contexto propio del proyecto.",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildMethodologySection(input: {
  project: MasterBlueprintEngineProject;
  evidenceLedger: EvidenceLedger;
  supportFragments?: string[];
  expectedElements?: string[];
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
    input.expectedElements && input.expectedElements.length > 0
      ? `En esta etapa conviene explicitar, como minimo, ${input.expectedElements.join(", ")}.`
      : null,
    input.supportFragments && input.supportFragments.length > 0
      ? `La evidencia consolidada tambien respalda, de forma comparativa, ${input.supportFragments
          .slice(0, 2)
          .join(" ")}`
      : null,
    "En terminos operativos, la seccion metodologica debe dejar visible el tipo de estudio, la logica de seleccion del caso, las tecnicas de recoleccion o revision aplicables y la forma general en que se analizaran los hallazgos.",
    "Dado que se trata de un proyecto de investigacion de maestria, la metodologia debe mantenerse en un nivel defendible y ejecutable, evitando prometer validaciones normativas, estructurales o economicas que exceden el alcance actual.",
    "La version actual prioriza una formulacion prudente: el diseno final, los instrumentos y el plan analitico deben cerrarse con validacion academica, sin prometer resultados causales que la evidencia disponible todavia no permite sostener.",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildGeneralObjective(input: {
  project: MasterBlueprintEngineProject;
  evidenceLedger: EvidenceLedger;
}) {
  const contextEvidence = getTopEvidenceTexts({
    evidenceLedger: input.evidenceLedger,
    sectionKeys: ["problem_statement", "methodology", "research_antecedents"],
    limit: 2,
  });
  const populationFragment = input.project.intake.targetPopulation?.trim()
    ? `en ${input.project.intake.targetPopulation}`
    : "en el contexto delimitado por el intake";

  return [
    `Analizar los factores que condicionan ${input.project.intake.topic.toLowerCase()} ${populationFragment}.`,
    contextEvidence.length > 0
      ? `Como soporte comparativo, se consideran antecedentes que describen ${contextEvidence.join(" ")}`
      : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function buildSpecificObjectives(input: {
  project: MasterBlueprintEngineProject;
  evidenceLedger: EvidenceLedger;
  supportFragments?: string[];
}) {
  const problemCue =
    clipText(input.project.intake.problemContext, 140)?.toLowerCase() ??
    "el problema delimitado";
  const methodologyCue =
    clipText(input.project.intake.preferredMethodology, 120)?.toLowerCase() ??
    "el enfoque metodologico previsto";
  const dataCue =
    clipText(input.project.intake.availableData, 120)?.toLowerCase() ??
    "la evidencia disponible";
  const evidenceCue =
    getTopEvidenceTexts({
      evidenceLedger: input.evidenceLedger,
      sectionKeys: ["research_antecedents", "state_of_the_art", "methodology"],
      limit: 1,
    })[0] ?? null;

  return [
    `- Identificar los factores operativos y de gestion vinculados con ${problemCue}.`,
    `- Describir la forma en que ${dataCue} permite examinar el problema en el contexto del estudio.`,
    `- Analizar la coherencia entre el problema delimitado, ${methodologyCue} y los antecedentes mas cercanos al tema.`,
    evidenceCue
      ? `- Proponer lineamientos preliminares sustentados en los antecedentes recuperados sobre ${clipText(evidenceCue, 120)?.toLowerCase() ?? "el tema de estudio"}.`
      : input.supportFragments?.[0]
        ? `- Proponer lineamientos preliminares consistentes con la evidencia comparativa sobre ${clipText(input.supportFragments[0], 120)?.toLowerCase() ?? "el tema de estudio"}.`
        : "- Proponer lineamientos preliminares consistentes con la evidencia y las restricciones declaradas en el intake.",
  ].join("\n");
}

function buildFallbackSupportFragments(input: {
  runtimePromptContext: RuntimePromptContext;
  consolidatedEvidence: ConsolidatedEvidenceArtifact | null;
}) {
  const evidenceUnitMap = buildEvidenceUnitMap(input.consolidatedEvidence);

  return uniqueEvidenceUnits(
    input.runtimePromptContext.used_evidence_ids.map((evidenceId) =>
      evidenceUnitMap.get(evidenceId),
    ),
  )
    .map((unit) => unit.summary_es ?? unit.label)
    .filter((text): text is string => Boolean(text))
    .map((text) => clipText(text, 180) ?? text)
    .slice(0, 3);
}

export function deriveSectionWithoutLlm(input: {
  sectionKey: string;
  title: string;
  project: MasterBlueprintEngineProject;
  evidenceLedger: EvidenceLedger;
  drafts: MasterSectionDraft[];
  runtimePromptContext: RuntimePromptContext;
  consolidatedEvidence: ConsolidatedEvidenceArtifact | null;
  methodGuidance: MethodScopeGuidanceItem | null;
}) {
  const supportFragments = buildFallbackSupportFragments({
    runtimePromptContext: input.runtimePromptContext,
    consolidatedEvidence: input.consolidatedEvidence,
  });
  const methodology = getDraftText(input.drafts, "methodology");
  const objectives = parseBulletLines(
    getDraftText(input.drafts, "specific_objectives"),
  );
  const formalSources = input.evidenceLedger.source_registry.filter(
    (source) => source.eligible_for_formal_reference,
  );

  switch (input.sectionKey) {
    case "problem_statement":
      return buildProblemStatement({
        project: input.project,
        evidenceLedger: input.evidenceLedger,
        supportFragments,
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
    case "general_objective":
      return buildGeneralObjective({
        project: input.project,
        evidenceLedger: input.evidenceLedger,
      });
    case "specific_objectives":
      return buildSpecificObjectives({
        project: input.project,
        evidenceLedger: input.evidenceLedger,
        supportFragments,
      });
    case "objectives":
      return [
        getDraftText(input.drafts, "general_objective"),
        getDraftText(input.drafts, "specific_objectives"),
      ]
        .filter(Boolean)
        .join("\n");
    case "research_questions":
      return (
        [
          getDraftText(input.drafts, "general_research_question"),
          getDraftText(input.drafts, "specific_research_questions"),
        ]
          .filter(Boolean)
          .join("\n") ||
        [
          `- ${toQuestion(`analizar ${input.project.intake.problemContext ?? input.project.intake.topic}`)}`,
          `- ${toQuestion(`comparar criterios para ${input.project.intake.topic}`)}`,
          supportFragments[0]
            ? `- ${toQuestion(`contrastar ${clipText(supportFragments[0], 100) ?? supportFragments[0]}`)}`
            : null,
        ]
          .filter(Boolean)
          .join("\n")
      );
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
      return [
        formalSources
          .slice(0, 5)
          .map(
            (source) =>
              `- ${source.title} (${source.year ?? "s/f"}) aporta antecedentes utiles sobre el tema y el contexto del estudio.`,
          )
          .join("\n"),
        supportFragments[0]
          ? `Como lectura comparativa del corpus consolidado, destaca que ${supportFragments[0]}`
          : null,
      ]
        .filter(Boolean)
        .join("\n");
    case "state_of_the_art":
      return [
        `La evidencia recuperada sugiere un estado del arte centrado en enfoques comparativos, criterios aplicados y marcos preliminares de evaluacion vinculados con ${input.project.intake.topic.toLowerCase()}.`,
        supportFragments[0]
          ? `En particular, el corpus consolidado permite observar que ${supportFragments[0]}`
          : null,
        "Persisten vacios de validacion local, por lo que esta sintesis debe leerse como base para el proyecto y no como cierre definitivo del caso.",
      ]
        .filter(Boolean)
        .join(" ");
    case "theoretical_bases":
      return [
        `Las bases teoricas se organizan alrededor de conceptos sobre ${input.project.intake.topic.toLowerCase()}, criterios de analisis y marcos comparativos relacionados con el problema de investigacion.`,
        supportFragments[0]
          ? `Como soporte conceptual, puede sintetizarse que ${supportFragments[0]}`
          : null,
      ]
        .filter(Boolean)
        .join(" ");
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
        supportFragments,
        expectedElements: input.methodGuidance?.expected_elements,
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
        ? [
            `El analisis se desarrollara en coherencia con la metodologia propuesta: ${clipText(methodology, 360) ?? methodology}`,
            supportFragments[0]
              ? `Como referencia comparativa, el corpus permite considerar que ${supportFragments[0]}`
              : null,
          ]
            .filter(Boolean)
            .join(" ")
        : "El plan de analisis se definira en funcion del enfoque metodologico y de la disponibilidad final de datos.";
    case "variables_or_categories":
    case "variables_indicators":
    case "categories_subcategories":
    case "evaluation_criteria":
      return [
        "- Criterio o categoria 1: relacion directa con el problema y con la unidad de analisis delimitada para el proyecto.",
        "- Criterio o categoria 2: utilidad para comparar alternativas, precedentes o decisiones de forma preliminar y trazable.",
        "- Criterio o categoria 3: coherencia con la metodologia propuesta, con los objetivos y con el alcance real de la investigacion.",
        "- Criterio o categoria 4: posibilidad de observarse o describirse con la evidencia bibliografica y contextual disponible en esta etapa.",
        "- Criterio o categoria 5: capacidad para convertirse luego en base de evaluacion, matriz o esquema comparativo defendible en una tesis de maestria.",
        supportFragments[0]
          ? `- Soporte comparativo principal: ${clipText(supportFragments[0], 180) ?? supportFragments[0]}`
          : null,
        supportFragments[1]
          ? `- Soporte comparativo complementario: ${clipText(supportFragments[1], 180) ?? supportFragments[1]}`
          : null,
      ]
        .filter(Boolean)
        .join("\n");
    case "abstract":
      return [
        `El proyecto aborda ${input.project.intake.topic} a partir del problema ${input.project.intake.problemContext ?? "delimitado en el intake"}.`,
        getDraftText(input.drafts, "general_objective")
          ? `Su objetivo general es ${getDraftText(input.drafts, "general_objective").replace(/^Analizar\s+/i, "analizar ").replace(/[.]+$/g, "")}.`
          : null,
        methodology
          ? `La metodologia planteada es ${clipText(methodology, 220) ?? methodology}.`
          : null,
        supportFragments[0]
          ? `Como soporte comparativo, se considera que ${supportFragments[0]}`
          : null,
        "El documento se mantiene en nivel de proyecto de investigacion y deja explicitas las validaciones pendientes del caso.",
      ]
        .filter(Boolean)
        .join(" ");
    case "references":
      return formalSources
        .slice(0, 12)
        .map(
          (source) =>
            `- ${source.authors.join(", ") || "Autor no disponible"} (${source.year ?? "s/f"}). ${source.title}. ${source.venue ?? "Fuente por precisar"}${source.doi ? `. DOI: ${source.doi}` : ""}`,
        )
        .join("\n");
    case "schedule":
      return buildScheduleSection();
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
