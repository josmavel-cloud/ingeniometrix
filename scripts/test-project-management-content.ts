import {
  buildPublicAppendixPlan,
  buildResearchBudgetPlan,
  buildResearchScheduleGanttRows,
  projectManagementPolicies,
} from "../server/blueprint-v2/editorial/project-management-policy";
import { buildScheduleGanttTableRows } from "../server/blueprint-v2/lab/docx-renderer";
import { hasRecognizedScheduleGanttText } from "../server/blueprint-v2/lab/docx-qa-engine";
import type { AcademicDocxLayoutPlan, ScheduleVisualPlan } from "../server/blueprint-v2/lab/academic-document-model";

type TestResult = {
  name: string;
  passed: boolean;
  details?: string;
};

function test(name: string, passed: boolean, details?: string): TestResult {
  return { name, passed, details };
}

const ganttRows = buildResearchScheduleGanttRows({
  methodology: "Revision sistematica aplicada, analisis comparativo y matriz multicriterio.",
  knowledgeArea: "ingenieria sismorresistente",
  countryContext: "PE",
});

const budgetPlan = buildResearchBudgetPlan({
  methodology: "Revision sistematica aplicada, analisis comparativo y matriz multicriterio.",
  knowledgeArea: "ingenieria sismorresistente",
  countryContext: "PE",
});

const appendixPlan = buildPublicAppendixPlan({
  hasMatrix: true,
  hasScheduleBudget: true,
  hasVariables: true,
  hasSourceSelection: true,
  hasInstruments: true,
});

const scheduleVisual: ScheduleVisualPlan = {
  label: "Cronograma visual de investigacion",
  caption: "Cronograma referencial tipo Gantt para la ejecucion del proyecto de investigacion.",
  source_note: "Fuente: elaboracion propia a partir del plan de trabajo.",
  tasks: ganttRows.map((row) => ({
    task: row.task,
    start_month: row.start_month,
    end_month: row.end_month,
    phase: row.phase,
    dependency: row.dependencies,
    deliverable: row.deliverable,
    duration: row.duration,
    assumption: row.assumption,
  })),
};
const scheduleTableRows = buildScheduleGanttTableRows(scheduleVisual);
const partialLayoutPlan: Pick<
  AcademicDocxLayoutPlan,
  "schedule_gantt_rows" | "budget_rows" | "budget_total_range" | "appendix_public_items" | "appendix_internal_items"
> = {
  schedule_gantt_rows: ganttRows,
  budget_rows: budgetPlan.rows,
  budget_total_range: budgetPlan.total_estimated_range,
  appendix_public_items: appendixPlan.public_items,
  appendix_internal_items: appendixPlan.internal_items_excluded,
};

const requiredPhases = [
  "revision",
  "metodologia",
  "ejecucion",
  "analisis",
  "redaccion",
  "revision_asesor",
  "cierre",
];
const phaseSet = new Set(ganttRows.map((row) => row.phase));
const budgetHasRequiredFields = budgetPlan.rows.every(
  (row) =>
    row.category &&
    row.item &&
    row.unit &&
    row.quantity > 0 &&
    row.unit_cost_range.currency &&
    row.subtotal_range.max >= row.subtotal_range.min &&
    row.assumption,
);
const publicTitles = appendixPlan.public_items.map((item) => item.title.toLowerCase()).join(" | ");
const excludedInternal = appendixPlan.internal_items_excluded.join(" | ").toLowerCase();

const results: TestResult[] = [
  test(
    "Gantt rows include required phases, dependencies, and deliverables",
    requiredPhases.every((phase) => phaseSet.has(phase as never)) &&
      ganttRows.every((row) => row.dependencies && row.deliverable && row.duration),
    JSON.stringify(ganttRows, null, 2),
  ),
  test(
    "Gantt policy marks generic timeline assumptions",
    ganttRows.some((row) => /referenciales|planificada/i.test(row.assumption ?? "")) &&
      /referenciales/i.test(projectManagementPolicies.schedule_gantt_policy.assumptions_rule),
    projectManagementPolicies.schedule_gantt_policy.assumptions_rule,
  ),
  test(
    "Budget rows include category, item, unit, quantity, ranges, assumptions, and total",
    budgetHasRequiredFields &&
      budgetPlan.currency === "PEN" &&
      budgetPlan.total_estimated_range.max > budgetPlan.total_estimated_range.min,
    JSON.stringify(budgetPlan, null, 2),
  ),
  test(
    "Budget policy uses ranges instead of unsupported exact quotes",
    /rangos/i.test(projectManagementPolicies.research_budget_policy.range_rule) &&
      budgetPlan.assumptions.some((item) => /cotizaciones/i.test(item)),
    projectManagementPolicies.research_budget_policy.range_rule,
  ),
  test(
    "Public appendix policy includes academic items and excludes backend/debug items",
    /matriz de consistencia/.test(publicTitles) &&
      /supuestos metodologicos/.test(publicTitles) &&
      /cronograma y presupuesto|soporte/.test(publicTitles) &&
      /rutas backend/.test(excludedInternal) &&
      /prompt traces/.test(excludedInternal),
    JSON.stringify(appendixPlan, null, 2),
  ),
  test(
    "DOCX QA still recognizes richer schedule/Gantt rows",
    scheduleTableRows[0]?.includes("Dependencia") &&
      scheduleTableRows[0]?.includes("Entregable") &&
      hasRecognizedScheduleGanttText(
        `Cronograma referencial tipo Gantt ${scheduleTableRows[0]?.join(" ")}`,
      ),
    JSON.stringify(scheduleTableRows, null, 2),
  ),
  test(
    "Budget table is represented in the academic document layout model shape",
    (partialLayoutPlan.budget_rows?.length ?? 0) >= 5 &&
      Boolean(partialLayoutPlan.budget_total_range) &&
      (partialLayoutPlan.appendix_public_items?.length ?? 0) >= 4,
    JSON.stringify(partialLayoutPlan, null, 2),
  ),
];

const failed = results.filter((result) => !result.passed);

for (const result of results) {
  console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}`);
  if (!result.passed && result.details) {
    console.log(`  ${result.details}`);
  }
}

console.log(`\nProject-management content tests: ${results.length - failed.length}/${results.length} passed`);

if (failed.length > 0) {
  process.exit(1);
}
