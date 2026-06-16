export type BlueprintLaunchIntake = {
  topic: string;
  problemContext: string;
  researchLine: string;
  academicConstraints: string;
  targetPopulation: string;
  availableData: string;
  preferredMethodology: string;
  advisorNotes: string;
  searchQuery: string;
};

export type BlueprintLaunchProjectData = {
  title: string;
  degreeLevel: string;
  university: string;
  program: string;
  knowledgeAreaLabel: string;
  templateKey: string;
  country: string;
  language: string;
  status: string;
  mode: string;
};

export const syntheticProjectData: BlueprintLaunchProjectData = {
  title:
    "Adaptive reuse con mass-timber overbuild para reconversion habitacional de inmuebles comerciales distressed en Toronto",
  degreeLevel: "MAESTRIA",
  university: "UPC",
  program: "Maestria en Arquitectura y Procesos Proyectuales",
  knowledgeAreaLabel: "Arquitectura",
  templateKey: "UPC_POSGRADO",
  country: "PE",
  language: "es",
  status: "DRAFT_LOCAL",
  mode: "PLAYGROUND_SINTETICO",
};

export const syntheticIntake: BlueprintLaunchIntake = {
  topic:
    "Creative business ideas to overcome the housing crisis in Canada considering mass-timber overbuild as a strategy of adaptive reuse on distressed commercial buildings. Case of Toronto type B and C buildings.",
  problemContext:
    "La crisis de vivienda en Canada presiona a las ciudades a identificar estrategias de densificacion y reconversion de activos subutilizados con mayor velocidad y menor huella de carbono. En Toronto, numerosos edificios comerciales distressed tipo B y C presentan vacancias, obsolescencia funcional y baja rentabilidad, pero podrian convertirse en soporte para soluciones de adaptive reuse y sobre-elevacion liviana en mass timber si se demuestra viabilidad arquitectonica, normativa y de negocio.",
  researchLine:
    "Arquitectura sostenible, adaptive reuse, regeneracion urbana y factibilidad de housing conversion.",
  academicConstraints:
    "El proyecto debe desarrollarse en espanol y mantenerse dentro de un alcance viable para tesis de maestria. Debe basarse en bibliografia academica trazable, revision de precedentes internacionales, criterios normativos y analisis comparado, sin exigir desarrollo ejecutivo completo ni modelado estructural detallado de ingenieria.",
  targetPopulation:
    "Edificios comerciales distressed tipo B y C en Toronto con potencial de reconversion habitacional y sobre-elevacion en mass timber mediante estrategias de adaptive reuse.",
  availableData:
    "Se asume disponibilidad de tipologias de edificios comerciales obsoletos, precedentes de office-to-residential conversion, referencias sobre vertical extensions en mass timber, criterios de zoning y building code de Toronto, indicadores de housing demand y marcos de factibilidad arquitectonica y economica.",
  preferredMethodology:
    "Enfoque aplicado con analisis tipologico, revision comparada de precedentes, construccion de criterios de evaluacion para adaptive reuse y sobre-elevacion en mass timber, y formulacion de un framework de factibilidad arquitectonica, regulatoria y de negocio para housing conversion.",
  advisorNotes:
    "Mantener el foco en adaptive reuse, conversion comercial-residencial y mass-timber overbuild como estrategia replicable frente a la crisis de vivienda. Priorizar criterios de seleccion tipologica, compatibilidad programatica, restricciones normativas, viabilidad economica preliminar y potencial de densificacion. Evitar convertir la tesis en un proyecto ejecutivo completo.",
  searchQuery:
    "adaptive reuse mass timber overbuild distressed commercial buildings Toronto housing conversion",
};
