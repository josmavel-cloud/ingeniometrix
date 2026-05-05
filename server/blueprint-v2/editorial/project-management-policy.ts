export type ResearchSchedulePhase =
  | "planificacion"
  | "revision"
  | "metodologia"
  | "ejecucion"
  | "analisis"
  | "redaccion"
  | "revision_asesor"
  | "cierre";

export type ScheduleGanttPolicy = {
  artifact_type: "schedule_gantt_policy";
  artifact_version: "v1";
  rule: string;
  required_fields: string[];
  assumptions_rule: string;
};

export type ResearchBudgetPolicy = {
  artifact_type: "research_budget_policy";
  artifact_version: "v1";
  rule: string;
  required_fields: string[];
  range_rule: string;
};

export type PublicAppendixPolicy = {
  artifact_type: "public_appendix_policy";
  artifact_version: "v1";
  include_academic_items: string[];
  exclude_internal_items: string[];
};

export type ScheduleGanttRow = {
  phase: ResearchSchedulePhase;
  task: string;
  start_month: number;
  end_month: number;
  duration: string;
  period_label: string;
  dependencies: string;
  deliverable: string;
  assumption: string | null;
};

export type BudgetRange = {
  min: number;
  max: number;
  currency: string;
};

export type ResearchBudgetRow = {
  category: string;
  cost_type: "direct" | "optional" | "contingency";
  item: string;
  unit: string;
  quantity: number;
  unit_cost_range: BudgetRange;
  subtotal_range: BudgetRange;
  assumption: string;
};

export type ResearchBudgetPlan = {
  currency: string;
  rows: ResearchBudgetRow[];
  total_estimated_range: BudgetRange;
  assumptions: string[];
};

export type PublicAppendixItem = {
  appendix_key: string;
  title: string;
  purpose: string;
  include_in_docx: boolean;
  source: "academic_model" | "project_management_policy" | "template";
};

export type ProjectManagementPolicyBundle = {
  schedule_gantt_policy: ScheduleGanttPolicy;
  research_budget_policy: ResearchBudgetPolicy;
  public_appendix_policy: PublicAppendixPolicy;
};

export const projectManagementPolicies: ProjectManagementPolicyBundle = {
  schedule_gantt_policy: {
    artifact_type: "schedule_gantt_policy",
    artifact_version: "v1",
    rule:
      "Construir un cronograma tipo Gantt para una propuesta de tesis de posgrado con fases, tareas, periodo, dependencias y entregables. No presentar actividades como completadas; cuando el calendario real no exista, declarar que los meses son referenciales.",
    required_fields: [
      "phase",
      "task",
      "start_month",
      "end_month",
      "duration",
      "dependencies",
      "deliverable",
    ],
    assumptions_rule:
      "Si faltan fechas institucionales, usar meses referenciales relativos M1-M6 o M1-M8 como supuestos ajustables al calendario academico.",
  },
  research_budget_policy: {
    artifact_type: "research_budget_policy",
    artifact_version: "v1",
    rule:
      "Construir un presupuesto preliminar de investigacion con costos directos, opcionales y contingencia. Usar rangos y supuestos, no cotizaciones exactas no verificadas.",
    required_fields: [
      "category",
      "item",
      "unit",
      "quantity",
      "unit_cost_range",
      "subtotal_range",
      "assumption",
    ],
    range_rule:
      "Los montos deben expresarse como rangos en moneda local cuando el pais sea conocido; si no hay pais, usar USD como moneda neutral.",
  },
  public_appendix_policy: {
    artifact_type: "public_appendix_policy",
    artifact_version: "v1",
    include_academic_items: [
      "matriz de consistencia",
      "resumen de seleccion de fuentes",
      "supuestos metodologicos",
      "instrumentos o protocolos disponibles",
      "cronograma y presupuesto",
      "matriz de variables, dimensiones o categorias",
    ],
    exclude_internal_items: [
      "rutas backend",
      "prompt traces",
      "logs de proveedor",
      "hashes de run",
      "evidence logs crudos",
      "diagnosticos de desarrollo",
    ],
  },
};

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function currencyForCountry(countryContext?: string | null) {
  const normalized = normalize(countryContext);
  if (normalized === "pe" || normalized.includes("peru")) {
    return "PEN";
  }
  if (normalized.includes("colombia")) {
    return "COP";
  }
  if (normalized.includes("chile")) {
    return "CLP";
  }

  return "USD";
}

function durationLabel(startMonth: number, endMonth: number) {
  const months = Math.max(1, endMonth - startMonth + 1);
  return months === 1 ? "1 mes" : `${months} meses`;
}

function periodLabel(startMonth: number, endMonth: number) {
  return startMonth === endMonth ? `M${startMonth}` : `M${startMonth}-M${endMonth}`;
}

function buildRow(input: {
  phase: ResearchSchedulePhase;
  task: string;
  start_month: number;
  end_month: number;
  dependencies: string;
  deliverable: string;
  assumption?: string | null;
}): ScheduleGanttRow {
  return {
    phase: input.phase,
    task: input.task,
    start_month: input.start_month,
    end_month: input.end_month,
    duration: durationLabel(input.start_month, input.end_month),
    period_label: periodLabel(input.start_month, input.end_month),
    dependencies: input.dependencies,
    deliverable: input.deliverable,
    assumption: input.assumption ?? null,
  };
}

export function buildResearchScheduleGanttRows(input: {
  methodology?: string | null;
  knowledgeArea?: string | null;
  countryContext?: string | null;
} = {}): ScheduleGanttRow[] {
  const methodology = normalize(input.methodology);
  const area = normalize(input.knowledgeArea);
  const usesDocumentaryData =
    /revision|documental|bibliograf|comparativo|sistematic/.test(methodology);
  const usesFieldwork =
    /entrevista|encuesta|campo|paciente|hospital|aula|muestra|experimental/.test(methodology) ||
    /salud|educacion|psicologia|gestion/.test(area);
  const usesModelSetup =
    /simulacion|modelo|control|estructural|ingenier|dinamic|mesa|sism/.test(`${methodology} ${area}`);

  const rows = [
    buildRow({
      phase: "planificacion",
      task: "Delimitacion del problema, alcance, preguntas y objetivos",
      start_month: 1,
      end_month: 1,
      dependencies: "Aprobacion del plan inicial",
      deliverable: "Problema, objetivos y alcance revisados",
      assumption: "Meses referenciales ajustables al calendario academico.",
    }),
    buildRow({
      phase: "revision",
      task: "Revision de literatura, antecedentes y marco teorico",
      start_month: 1,
      end_month: 2,
      dependencies: "Delimitacion aprobada",
      deliverable: "Matriz de antecedentes y bases teoricas",
      assumption: null,
    }),
    buildRow({
      phase: "metodologia",
      task: "Diseno metodologico, variables/categorias e instrumentos",
      start_month: 2,
      end_month: 3,
      dependencies: "Revision teorica consolidada",
      deliverable: "Diseno metodologico e instrumentos preliminares",
      assumption: null,
    }),
    buildRow({
      phase: "ejecucion",
      task: usesModelSetup
        ? "Configuracion de modelo, criterios de comparacion o simulacion"
        : usesFieldwork
          ? "Preparacion y aplicacion piloto de instrumentos"
          : usesDocumentaryData
            ? "Seleccion, depuracion y codificacion de documentos fuente"
            : "Preparacion de datos o unidades de analisis",
      start_month: 3,
      end_month: 4,
      dependencies: "Diseno metodologico aprobado",
      deliverable: usesModelSetup
        ? "Modelo o matriz de evaluacion configurada"
        : usesFieldwork
          ? "Instrumentos listos y piloto documentado"
          : "Corpus documental organizado",
      assumption: "No implica trabajo completado; es una fase planificada.",
    }),
    buildRow({
      phase: "analisis",
      task: "Analisis, simulacion, comparacion o evaluacion segun el diseno",
      start_month: 4,
      end_month: 5,
      dependencies: "Datos, corpus o modelo preparados",
      deliverable: "Resultados preliminares o matriz de analisis",
      assumption: null,
    }),
    buildRow({
      phase: "redaccion",
      task: "Interpretacion, discusion preliminar y redaccion del informe",
      start_month: 5,
      end_month: 6,
      dependencies: "Analisis preliminar disponible",
      deliverable: "Borrador completo para revision",
      assumption: null,
    }),
    buildRow({
      phase: "revision_asesor",
      task: "Revision con asesor, control de coherencia y trazabilidad",
      start_month: 6,
      end_month: 6,
      dependencies: "Borrador completo",
      deliverable: "Observaciones incorporadas",
      assumption: null,
    }),
    buildRow({
      phase: "cierre",
      task: "Ajustes finales, formato institucional y preparacion de entrega",
      start_month: 6,
      end_month: 6,
      dependencies: "Revision de asesor atendida",
      deliverable: "Documento final listo para evaluacion institucional",
      assumption: null,
    }),
  ];

  return rows;
}

function range(min: number, max: number, currency: string): BudgetRange {
  return { min, max, currency };
}

function budgetRow(input: {
  category: string;
  cost_type?: ResearchBudgetRow["cost_type"];
  item: string;
  unit: string;
  quantity: number;
  unitMin: number;
  unitMax: number;
  currency: string;
  assumption: string;
}): ResearchBudgetRow {
  return {
    category: input.category,
    cost_type: input.cost_type ?? "direct",
    item: input.item,
    unit: input.unit,
    quantity: input.quantity,
    unit_cost_range: range(input.unitMin, input.unitMax, input.currency),
    subtotal_range: range(
      input.unitMin * input.quantity,
      input.unitMax * input.quantity,
      input.currency,
    ),
    assumption: input.assumption,
  };
}

export function buildResearchBudgetPlan(input: {
  methodology?: string | null;
  knowledgeArea?: string | null;
  countryContext?: string | null;
} = {}): ResearchBudgetPlan {
  const currency = currencyForCountry(input.countryContext);
  const methodology = normalize(input.methodology);
  const area = normalize(input.knowledgeArea);
  const needsFieldwork =
    /entrevista|encuesta|campo|paciente|hospital|aula|muestra/.test(methodology) ||
    /salud|educacion|psicologia|politica/.test(area);
  const needsModeling =
    /simulacion|modelo|control|estructural|ingenier|dinamic|sism/.test(`${methodology} ${area}`);

  const rows: ResearchBudgetRow[] = [
    budgetRow({
      category: "software_datos",
      item: "Gestion bibliografica, hojas de calculo y almacenamiento",
      unit: "paquete mensual",
      quantity: 3,
      unitMin: currency === "PEN" ? 0 : 0,
      unitMax: currency === "PEN" ? 80 : 25,
      currency,
      assumption: "Se priorizan herramientas institucionales o gratuitas; el rango cubre licencias menores si fueran necesarias.",
    }),
    budgetRow({
      category: "materiales",
      item: "Materiales de organizacion, impresion de borradores y anotacion",
      unit: "lote",
      quantity: 1,
      unitMin: currency === "PEN" ? 80 : 25,
      unitMax: currency === "PEN" ? 220 : 70,
      currency,
      assumption: "Monto referencial para trabajo documental y revision academica.",
    }),
    budgetRow({
      category: needsModeling ? "modelacion_validacion" : "validacion",
      item: needsModeling
        ? "Preparacion de matriz, modelo conceptual o verificacion tecnica"
        : "Validacion preliminar de instrumentos o matriz de analisis",
      unit: "actividad",
      quantity: 1,
      unitMin: currency === "PEN" ? 150 : 45,
      unitMax: currency === "PEN" ? 500 : 150,
      currency,
      assumption: "No reemplaza ensayos, consultorias especializadas ni licencias mayores no justificadas por el metodo.",
    }),
    budgetRow({
      category: "asesoria_revision",
      item: "Revision academica, estilo y normalizacion de referencias",
      unit: "servicio",
      quantity: 1,
      unitMin: currency === "PEN" ? 120 : 35,
      unitMax: currency === "PEN" ? 350 : 105,
      currency,
      assumption: "Apoyo opcional de revision formal; no incluye elaboracion sustantiva por terceros.",
      cost_type: "optional",
    }),
    budgetRow({
      category: "entrega",
      item: "Impresion, empastado simple o preparacion digital final",
      unit: "lote",
      quantity: 1,
      unitMin: currency === "PEN" ? 80 : 25,
      unitMax: currency === "PEN" ? 260 : 80,
      currency,
      assumption: "Depende de los requisitos de entrega de la universidad.",
    }),
  ];

  if (needsFieldwork) {
    rows.splice(
      2,
      0,
      budgetRow({
        category: "trabajo_campo",
        item: "Movilidad local, comunicacion y coordinacion para recoleccion de datos",
        unit: "jornada",
        quantity: 4,
        unitMin: currency === "PEN" ? 25 : 8,
        unitMax: currency === "PEN" ? 80 : 24,
        currency,
        assumption: "Solo aplica si el protocolo aprobado exige contacto con participantes o sedes.",
      }),
    );
  }

  const subtotalMin = rows.reduce((sum, row) => sum + row.subtotal_range.min, 0);
  const subtotalMax = rows.reduce((sum, row) => sum + row.subtotal_range.max, 0);
  const contingencyMin = Math.round(subtotalMin * 0.08);
  const contingencyMax = Math.round(subtotalMax * 0.12);
  rows.push(
    budgetRow({
      category: "contingencia",
      item: "Reserva para variaciones menores del plan",
      unit: "porcentaje referencial",
      quantity: 1,
      unitMin: contingencyMin,
      unitMax: contingencyMax,
      currency,
      assumption: "Contingencia de 8%-12% sobre costos estimados; debe revisarse antes de ejecucion.",
      cost_type: "contingency",
    }),
  );

  return {
    currency,
    rows,
    total_estimated_range: range(
      rows.reduce((sum, row) => sum + row.subtotal_range.min, 0),
      rows.reduce((sum, row) => sum + row.subtotal_range.max, 0),
      currency,
    ),
    assumptions: [
      "Presupuesto preliminar para propuesta academica; no contiene cotizaciones de proveedor.",
      "Los montos se expresan como rangos y deben ajustarse al protocolo aprobado.",
      "No se incluyen costos que impliquen ejecucion completa de investigacion no aprobada.",
    ],
  };
}

export function buildPublicAppendixPlan(input: {
  hasMatrix?: boolean;
  hasScheduleBudget?: boolean;
  hasVariables?: boolean;
  hasSourceSelection?: boolean;
  hasInstruments?: boolean;
} = {}) {
  const publicItems: PublicAppendixItem[] = [
    input.hasMatrix !== false
      ? {
          appendix_key: "consistency_matrix",
          title: "Matriz de consistencia",
          purpose: "Mostrar alineacion entre problema, objetivos, hipotesis o supuestos y metodologia.",
          include_in_docx: true,
          source: "academic_model",
        }
      : null,
    input.hasSourceSelection !== false
      ? {
          appendix_key: "source_selection_summary",
          title: "Resumen academico de fuentes seleccionadas",
          purpose: "Explicar el uso academico de fuentes recuperadas, limitaciones y cautelas de trazabilidad.",
          include_in_docx: true,
          source: "project_management_policy",
        }
      : null,
    {
      appendix_key: "methodological_assumptions",
      title: "Supuestos metodologicos",
      purpose: "Declarar supuestos de alcance, calendario, presupuesto y evidencia pendiente.",
      include_in_docx: true,
      source: "project_management_policy",
    },
    input.hasInstruments
      ? {
          appendix_key: "instruments_protocols",
          title: "Instrumentos o protocolos preliminares",
          purpose: "Ubicar instrumentos, protocolos o matrices que requieren validacion posterior.",
          include_in_docx: true,
          source: "academic_model",
        }
      : null,
    input.hasScheduleBudget !== false
      ? {
          appendix_key: "schedule_budget_support",
          title: "Soporte de cronograma y presupuesto",
          purpose: "Presentar supuestos operativos para la gestion academica del proyecto.",
          include_in_docx: true,
          source: "project_management_policy",
        }
      : null,
    input.hasVariables
      ? {
          appendix_key: "variables_dimensions_matrix",
          title: "Matriz de variables, dimensiones o categorias",
          purpose: "Detallar dimensiones, indicadores o categorias derivados del diseno metodologico.",
          include_in_docx: true,
          source: "academic_model",
        }
      : null,
  ].filter((item): item is PublicAppendixItem => Boolean(item));

  return {
    public_items: publicItems,
    internal_items_excluded: projectManagementPolicies.public_appendix_policy.exclude_internal_items,
  };
}
