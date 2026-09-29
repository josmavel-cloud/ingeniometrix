import {
  DegreeLevel,
  TemplateKey,
  TopicOriginType,
  TopicSelectionStatus,
  University,
} from "@prisma/client";

export const structuralWarrenBridgeFixture = {
  id: "structural-warren-bridge-peru",
  label: "Puente vehicular esencial de armadura metálica Warren en zona sísmica del Perú",
  project: {
    title:
      "Confiabilidad estructural de un puente vehicular esencial de armadura metálica tipo Warren en zona sísmica del Perú",
    country: "PE",
    language: "es",
    degreeLevel: DegreeLevel.MAESTRIA,
    university: University.OTHER,
    program: "Maestría en Ingeniería Civil con mención en Estructuras",
    templateKey: TemplateKey.GENERIC_POSGRADO_PE,
    topicOriginType: TopicOriginType.CUSTOM,
    topicSelectionStatus: TopicSelectionStatus.SELECTED,
    topicSeedText:
      "Confiabilidad estructural de un puente vehicular esencial de armadura metálica tipo Warren en zona sísmica del Perú",
    topicAreaLabel: "Ingeniería estructural y confiabilidad de infraestructura esencial",
  },
  intake: {
    topic:
      "Confiabilidad estructural de un puente vehicular esencial de armadura metálica tipo Warren en zona sísmica del Perú",
    problemContext:
      "En el Perú, los puentes vehiculares ubicados en corredores estratégicos cumplen un rol crítico para la conectividad, atención de emergencias y continuidad operativa después de eventos sísmicos. Muchos de estos puentes pueden presentar incertidumbres asociadas a cargas vehiculares, propiedades del acero, conexiones, deterioro, demanda sísmica y simplificaciones del modelo estructural. Los enfoques determinísticos tradicionales no siempre permiten cuantificar explícitamente la probabilidad de falla o el índice de confiabilidad de la estructura.",
    researchLine:
      "Ingeniería estructural, confiabilidad estructural, puentes metálicos, análisis probabilístico y evaluación sísmica de infraestructura esencial.",
    academicConstraints:
      "El proyecto debe diferenciar claramente entre un modelo académico/prototipo y la evaluación real de un puente existente. No debe afirmar condiciones de seguridad de un puente real sin planos, inspección, ensayos o datos verificables.",
    targetPopulation:
      "Puente vehicular esencial de armadura metálica tipo Warren, simplemente apoyado, representativo de corredores viales estratégicos en zonas sísmicas del Perú.",
    availableData:
      "Normativa peruana aplicable a puentes, criterios del MTC, parámetros sísmicos de una zona peruana seleccionada, propiedades del acero estructural, cargas vehiculares representativas y literatura técnica sobre confiabilidad de puentes metálicos.",
    preferredMethodology:
      "Enfoque cuantitativo aplicado, usando FORM como método de referencia para estimar índice de confiabilidad beta, con simulación Monte Carlo como comparación o validación complementaria.",
    advisorNotes:
      "Priorizar fuentes sobre structural reliability of steel bridges, truss bridge reliability, Warren truss bridges, seismic reliability of bridges, FORM, Monte Carlo simulation y fragility assessment. Evitar fuentes generales sin contenido estructural cuantitativo.",
  },
  selectionCriteria: {
    prioritize: [
      "confiabilidad estructural de puentes metálicos",
      "puentes tipo armadura/truss y Warren truss",
      "confiabilidad sísmica de puentes",
      "FORM y simulación Monte Carlo aplicados a estructuras",
      "curvas de fragilidad o evaluación probabilística de infraestructura vial esencial",
    ],
    reject: [
      "fuentes generales de gestión vial sin análisis estructural cuantitativo",
      "mantenimiento administrativo sin modelo de confiabilidad",
      "arquitectura o urbanismo sin contenido de puentes/estructuras",
    ],
  },
} as const;
