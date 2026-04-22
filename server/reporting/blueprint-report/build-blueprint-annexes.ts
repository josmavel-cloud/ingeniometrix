import type { CanonicalAnnex } from "@/server/reporting/canonical-report-types";
import type { ResearchBlueprintRecord } from "@/server/blueprint/blueprint-types";

function buildCitationPlanAnnex(blueprint: ResearchBlueprintRecord): CanonicalAnnex | null {
  if (!Array.isArray(blueprint.citation_plan) || blueprint.citation_plan.length === 0) {
    return null;
  }

  return {
    id: "annex-citation-plan",
    title: "Anexo A. Plan de trazabilidad bibliografica",
    blocks: [
      {
        id: "annex-citation-plan-table",
        kind: "table",
        table: {
          caption: {
            title: "Plan de citado por seccion",
            position: "top",
            note: "Se listan los niveles de soporte y las referencias que respaldan cada seccion del blueprint.",
          },
          numbered: true,
          rows: [
            {
              cells: [
                { text: "Seccion" },
                { text: "Soporte" },
                { text: "Referencias" },
              ],
            },
            ...blueprint.citation_plan.map((section) => ({
              cells: [
                { text: section.section_title },
                { text: section.support_level },
                {
                  text:
                    section.supported_reference_ids.length > 0
                      ? section.supported_reference_ids.join(", ")
                      : "Sin referencias directas",
                },
              ],
            })),
          ],
        },
      },
    ],
  } satisfies CanonicalAnnex;
}

function buildAssumptionsAnnex(blueprint: ResearchBlueprintRecord): CanonicalAnnex | null {
  const assumptions = Array.isArray(blueprint.assumptions_detailed)
    ? blueprint.assumptions_detailed
    : [];

  if (assumptions.length === 0) {
    return null;
  }

  return {
    id: "annex-assumptions",
    title: "Anexo B. Supuestos y restricciones declaradas",
    blocks: [
      {
        id: "annex-assumptions-list",
        kind: "bullet_list",
        items: assumptions.map(
          (assumption) =>
            `${assumption.statement} (${assumption.reason}; secciones: ${assumption.affected_sections.join(", ") || "sin especificar"})`,
        ),
      },
    ],
  } satisfies CanonicalAnnex;
}

export function buildBlueprintAnnexes(blueprint: ResearchBlueprintRecord) {
  const annexes: Array<CanonicalAnnex | null> = [
    buildCitationPlanAnnex(blueprint),
    buildAssumptionsAnnex(blueprint),
  ];

  return annexes.filter((annex): annex is CanonicalAnnex => annex !== null);
}
