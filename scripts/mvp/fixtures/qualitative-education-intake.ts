import {
  DegreeLevel,
  TemplateKey,
  TopicOriginType,
  TopicSelectionStatus,
  University,
} from "@prisma/client";

export const qualitativeEducationFixture = {
  id: "qualitative-rural-formative-feedback-peru",
  label: "Experiencias docentes con retroalimentacion formativa en secundaria rural",
  project: {
    title: "Experiencias docentes al implementar retroalimentacion formativa en secundaria rural del Peru",
    country: "PE",
    language: "es",
    degreeLevel: DegreeLevel.MAESTRIA,
    university: University.OTHER,
    program: "Maestria en Educacion",
    templateKey: TemplateKey.GENERIC_POSGRADO_PE,
    topicOriginType: TopicOriginType.CUSTOM,
    topicSelectionStatus: TopicSelectionStatus.SELECTED,
    topicSeedText: "Experiencias docentes al implementar retroalimentacion formativa en secundaria rural del Peru",
    topicAreaLabel: "Educacion secundaria, practica docente y evaluacion formativa",
  },
  intake: {
    topic: "Experiencias de docentes de educacion secundaria publica al implementar practicas de retroalimentacion formativa en contextos rurales del Peru",
    problemContext: "La literatura describe beneficios y desafios de la retroalimentacion formativa, pero se requiere comprender como docentes de secundaria rural interpretan, adaptan y sostienen estas practicas en sus condiciones institucionales concretas. El alcance territorial y la institucion se mantienen por definir; no se presume acceso a participantes ni una brecha universal.",
    researchLine: "Practica docente, evaluacion para el aprendizaje, educacion rural y desarrollo profesional docente.",
    academicConstraints: "El trabajo es una propuesta cualitativa. No inventar participantes, instrumentos validados, permisos, aprobacion etica, saturacion, hallazgos ni generalizacion estadistica. Declarar decisiones pendientes de acceso, muestreo y delimitacion territorial.",
    targetPopulation: "Docentes de educacion secundaria publica que trabajan en contextos rurales peruanos; la region, las instituciones y los criterios de inclusion deben definirse antes del trabajo de campo.",
    availableData: "Se propone producir entrevistas semiestructuradas y analizar documentos pedagogicos, sujeto a acceso institucional, consentimiento y aprobacion etica. No existen datos recolectados al momento de formular el plan.",
    preferredMethodology: "Enfoque cualitativo interpretativo mediante estudio de caso o casos multiples, muestreo intencional, entrevistas semiestructuradas, analisis documental y analisis tematico reflexivo. Las decisiones finales dependen del acceso y la delimitacion del caso.",
    advisorNotes: "Priorizar evidencia sobre formative assessment, formative feedback, teacher feedback practices, rural secondary education, teacher professional learning, qualitative case study y reflexive thematic analysis. Diferenciar evidencia internacional de afirmaciones especificas sobre Peru.",
  },
} as const;
