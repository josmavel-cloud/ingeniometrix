import type { AcademicDocument, EquationLayoutPlan } from "@/server/blueprint-v2/lab/academic-document-model";

export type ProfessionalEquationReport = {
  artifact_type: "professional_equation_report";
  artifact_version: "v1";
  generated_at: string;
  equation_candidate_count: number;
  source_backed_equation_count: number;
  rendered_equation_count: number;
  native_math_count: number;
  source_image_fallback_count: number;
  generated_image_fallback_count: number;
  blocked_equation_count: number;
  source_grounded_explanation_count: number;
  variable_note_count: number;
  missing_variable_note_count: number;
  equations_required_but_missing_count: number;
  stale_equation_ref_count: number;
  raw_latex_public_leak_count: number;
  warnings: string[];
  blockers: string[];
  equations: Array<{
    variant: string;
    equation_number: number;
    asset_key: string;
    source_id: string;
    section_key: string;
    render_strategy: string;
    source_grounded_explanation_available: boolean;
    variable_note_count: number;
    missing_variable_note_count: number;
    warnings: string[];
    blockers: string[];
  }>;
};

function hasRawLatexPublicLeak(value: string | null | undefined) {
  return /\\frac|\\begin|\\end|\$\$|\\left|\\right|\\sqrt|\\sum/.test(value ?? "");
}

function equationIsSourceBacked(equation: EquationLayoutPlan) {
  return Boolean(equation.source_id && equation.source_id !== "unknown-source" && equation.asset_key);
}

function countMissingVariableNotes(equation: EquationLayoutPlan) {
  return equation.variable_notes.filter((note) =>
    note.source_backed === false ||
    note.status === "not_recovered" ||
    /no recuperada|pendiente/i.test(note.description),
  ).length;
}

function countRawLatexLeaks(equation: EquationLayoutPlan) {
  return [
    equation.display_text,
    equation.caption,
    equation.purpose,
    equation.source_context_summary,
    equation.section_explanation,
    equation.body_reference,
  ].filter(hasRawLatexPublicLeak).length;
}

export function buildProfessionalEquationReport(input: {
  documents: Array<{ label: string; document: AcademicDocument }>;
}): ProfessionalEquationReport {
  const rows = input.documents.flatMap((item) =>
    item.document.layout_plan.equations.map((equation) => ({
      variant: item.label,
      equation,
    })),
  );
  const equationRows = rows.map(({ variant, equation }) => ({
    variant,
    equation_number: equation.equation_number,
    asset_key: equation.asset_key,
    source_id: equation.source_id,
    section_key: equation.section_key,
    render_strategy: equation.render_strategy ?? "docx_math_native",
    source_grounded_explanation_available: Boolean(equation.source_grounded_explanation_available),
    variable_note_count: equation.variable_notes.length,
    missing_variable_note_count: countMissingVariableNotes(equation),
    warnings: equation.warnings,
    blockers: equation.blockers ?? [],
  }));
  const uniqueEquationKeys = new Set(rows.map(({ equation }) => `${equation.source_id}|${equation.asset_key}`));
  const rawLatexPublicLeakCount = rows.reduce(
    (sum, { equation }) => sum + countRawLatexLeaks(equation),
    0,
  );
  const blockedEquationCount = rows.filter(
    ({ equation }) => equation.render_strategy === "blocked_no_professional_render" || (equation.blockers ?? []).length > 0,
  ).length;
  const sourceBackedEquationCount = rows.filter(({ equation }) => equationIsSourceBacked(equation)).length;
  const sourceGroundedExplanationCount = rows.filter(
    ({ equation }) => equation.source_grounded_explanation_available && equation.source_context_summary,
  ).length;
  const missingVariableNoteCount = rows.reduce(
    (sum, { equation }) => sum + countMissingVariableNotes(equation),
    0,
  );
  const warnings = [
    rawLatexPublicLeakCount > 0 ? `raw_latex_public_leaks:${rawLatexPublicLeakCount}` : null,
    missingVariableNoteCount > 0 ? `equation_variable_descriptions_missing:${missingVariableNoteCount}` : null,
    rows.some(({ equation }) => equation.render_strategy === "generated_equation_image")
      ? "generated_equation_image_fallback_used"
      : null,
    rows.some(({ equation }) => equation.render_strategy === "source_equation_image")
      ? "source_equation_image_fallback_used"
      : null,
  ].filter((warning): warning is string => Boolean(warning));
  const blockers = [
    rawLatexPublicLeakCount > 0 ? "Public equation text still contains raw LaTeX markers." : null,
    blockedEquationCount > 0 ? "At least one equation has no professional render path." : null,
  ].filter((blocker): blocker is string => Boolean(blocker));

  return {
    artifact_type: "professional_equation_report",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    equation_candidate_count: uniqueEquationKeys.size,
    source_backed_equation_count: sourceBackedEquationCount,
    rendered_equation_count: rows.length - blockedEquationCount,
    native_math_count: rows.filter(({ equation }) => equation.render_strategy === "docx_math_native").length,
    source_image_fallback_count: rows.filter(({ equation }) => equation.render_strategy === "source_equation_image").length,
    generated_image_fallback_count: rows.filter(({ equation }) => equation.render_strategy === "generated_equation_image").length,
    blocked_equation_count: blockedEquationCount,
    source_grounded_explanation_count: sourceGroundedExplanationCount,
    variable_note_count: rows.reduce((sum, { equation }) => sum + equation.variable_notes.length, 0),
    missing_variable_note_count: missingVariableNoteCount,
    equations_required_but_missing_count: rows.filter(({ equation }) =>
      equation.warnings.some((warning) => /required_but_missing|pendiente/i.test(warning)),
    ).length,
    stale_equation_ref_count: 0,
    raw_latex_public_leak_count: rawLatexPublicLeakCount,
    warnings,
    blockers,
    equations: equationRows,
  };
}

export function renderProfessionalEquationReport(report: ProfessionalEquationReport) {
  const equationLines = report.equations.length
    ? report.equations.map((equation) =>
        `- ${equation.variant} Ecuacion ${equation.equation_number}: ${equation.asset_key} (${equation.render_strategy}); source_grounded=${equation.source_grounded_explanation_available}; missing_variables=${equation.missing_variable_note_count}`,
      ).join("\n")
    : "- No se detectaron ecuaciones renderizables.";

  return `# Professional Equation Report

Generated at: ${report.generated_at}

## Summary

- equation_candidate_count: ${report.equation_candidate_count}
- source_backed_equation_count: ${report.source_backed_equation_count}
- rendered_equation_count: ${report.rendered_equation_count}
- native_math_count: ${report.native_math_count}
- source_image_fallback_count: ${report.source_image_fallback_count}
- generated_image_fallback_count: ${report.generated_image_fallback_count}
- blocked_equation_count: ${report.blocked_equation_count}
- source_grounded_explanation_count: ${report.source_grounded_explanation_count}
- variable_note_count: ${report.variable_note_count}
- missing_variable_note_count: ${report.missing_variable_note_count}
- raw_latex_public_leak_count: ${report.raw_latex_public_leak_count}

## Equations

${equationLines}

## Warnings

${report.warnings.length ? report.warnings.map((warning) => `- ${warning}`).join("\n") : "- None."}

## Blockers

${report.blockers.length ? report.blockers.map((blocker) => `- ${blocker}`).join("\n") : "- None."}
`;
}
