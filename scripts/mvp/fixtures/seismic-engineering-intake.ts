import {
  DegreeLevel,
  TemplateKey,
  TopicOriginType,
  TopicSelectionStatus,
  University,
} from "@prisma/client";

export const seismicEngineeringFixture = {
  id: "seismic-engineering-peru",
  label: "Edificaciones de concreto armado con estrategias de disipacion sismica",
  project: {
    title:
      "Evaluacion comparativa de estrategias de disipacion sismica para edificaciones de concreto armado",
    country: "PE",
    language: "es",
    degreeLevel: DegreeLevel.MAESTRIA,
    university: University.OTHER,
    program: "Maestria en Ingenieria Civil con mencion en Estructuras",
    templateKey: TemplateKey.GENERIC_POSGRADO_PE,
    topicOriginType: TopicOriginType.CUSTOM,
    topicSelectionStatus: TopicSelectionStatus.SELECTED,
    topicSeedText:
      "Evaluacion comparativa de estrategias de disipacion sismica para edificaciones de concreto armado",
    topicAreaLabel: "Ingenieria estructural y sismorresistente",
  },
  intake: {
    topic:
      "Evaluacion comparativa de estrategias de disipacion sismica para mejorar el desempeno estructural de edificaciones de concreto armado en zonas urbanas de alta amenaza sismica del Peru",
    problemContext:
      "En ciudades peruanas ubicadas en zonas de alta amenaza sismica, muchas edificaciones de concreto armado presentan incertidumbre respecto a su desempeno esperado ante sismos severos. Existe interes academico en evaluar si estrategias como disipadores viscosos, amortiguadores histereticos o aislamiento sismico pueden reducir derivas, demandas internas y dano estructural esperado, sin afirmar seguridad real de edificaciones especificas.",
    researchLine:
      "Ingenieria estructural, ingenieria sismica, desempeno estructural, control pasivo de vibraciones y evaluacion comparativa de sistemas de proteccion sismica.",
    academicConstraints:
      "No emitir diagnostico de seguridad estructural real ni reemplazar evaluacion profesional. No inventar resultados numericos. Separar claramente diseno conceptual, simulacion academica y validacion experimental o normativa. Declarar supuestos de modelamiento, registros sismicos y propiedades estructurales.",
    targetPopulation:
      "Edificaciones de concreto armado de mediana altura ubicadas en zonas urbanas peruanas de alta amenaza sismica.",
    availableData:
      "Modelos estructurales idealizados o desarrollados en software de analisis, propiedades mecanicas asumidas o documentadas, registros sismicos seleccionados, espectros de diseno, derivas maximas, cortantes de piso, desplazamientos y parametros de disipadores o aisladores.",
    preferredMethodology:
      "Enfoque cuantitativo aplicado mediante modelamiento estructural y analisis dinamico no lineal o lineal equivalente, comparando un modelo base con alternativas de disipacion o aislamiento sismico segun indicadores de desempeno.",
    advisorNotes:
      "Priorizar literatura sobre seismic performance, passive control, viscous dampers, hysteretic dampers, base isolation, reinforced concrete buildings, nonlinear dynamic analysis, performance-based seismic design y contexto sismico peruano.",
  },
} as const;
