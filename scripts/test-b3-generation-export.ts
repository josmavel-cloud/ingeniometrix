import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { definition, design, matrix, ledger } from "./test-b3-scientific-contracts";
import { generateScientificPlan } from "@/server/mvp/scientific-plan-generation";
import { generateFinalInfographic } from "@/server/mvp/final-infographic";
import { renderDocx } from "@/server/mvp/step6-blueprint-docx-service";
import { exportPlanPdf } from "@/server/mvp/pdf-export";

async function main() {
  global.fetch = async () => { throw new Error("Network prohibited in offline regression"); };
  await mkdir("artifacts-local/b3-offline", { recursive: true });
  const dir = await mkdtemp(path.join(process.cwd(), "artifacts-local/b3-offline/regression-"));
  const longText = "Propuesta sintética de análisis: " + "Se conservarán las decisiones del investigador, el método y sus limitaciones. ".repeat(15) + "Cierre íntegro con áéíóú, ñ y evidencia citada.";
  const narrative = { paragraphs: [{ text: longText, citations: [{ source_id: "S1", evidence_id: "E3" }] }], assumptions: [], limitations: [] };
  const phases: string[] = [];
  const provider = { generateStructuredObject: async (input: any) => {
    const phase = input.schemaName.replace("b3_", ""); phases.push(phase);
    assert.ok(input.prompt.includes("MARCO_DE_DATOS") || phase === "consistency_matrix");
    if (phase === "methodology") assert.ok(input.prompt.includes(design.analysis_method));
    if (phase === "final_title" || phase === "executive_summary") assert.ok(phases.includes("cross_section_review"));
    switch (phase) {
      case "problem_definition": return { ...narrative, problem: definition.problem };
      case "research_questions": return { questions: definition.questions };
      case "objectives_and_optional_hypotheses": return { objectives: definition.objectives, hypotheses_or_propositions: [] };
      case "research_design": return design;
      case "consistency_matrix": return matrix;
      case "cross_section_review": return { critical_issues: [], warnings: ["Fixture no científico"], checked_dimensions: ["Coherencia"] };
      case "final_title": return { title: "Propuesta sintética para regresión", short_title: "Prueba sintética", rationale: "Solo prueba", keywords: [], warnings: [] };
      default: return narrative;
    }
  } } as any;
  const result = await generateScientificPlan({ provider, projectId: "synthetic", runId: "offline", intake: {}, ledger, artifactDir: dir });
  assert.equal(phases.length, 13);
  assert.ok(phases.indexOf("methodology") > phases.indexOf("objectives_and_optional_hypotheses"));
  assert.ok(phases.indexOf("consistency_matrix") > phases.indexOf("methodology"));
  assert.ok(phases.indexOf("executive_summary") > phases.indexOf("final_title"));
  assert.equal(result.drafts.length, 10);
  assert.equal(result.drafts.find((d) => d.section_key === "consistency_matrix")!.blocks.filter((b) => b.kind === "table").length, 1);
  const hero = await generateFinalInfographic({ problem: definition.problem }, path.join(dir, "hero.png"));
  assert.equal(hero.status, "svg_fallback", "No budget context: no paid request, readable deterministic PNG");
  assert.ok((await readFile(hero.image_path!)).length > 1000);
  const docx = path.join(dir, "final-thesis-plan.docx"), pdf = path.join(dir, "final-thesis-plan.pdf");
  await renderDocx({ project: { title: result.titlePlan.title, program: "Prueba", university: "OTHER" } as any, package: { title_plan: result.titlePlan, hero_image: hero, academic_style_contract: { logo_asset_path: null, page: { margin_top_cm: 2.5, margin_bottom_cm: 2.5, margin_left_cm: 3, margin_right_cm: 2.5 } }, section_drafts: result.drafts, cross_reference_plan: [] } as any, outputPath: docx });
  const zip = await JSZip.loadAsync(await readFile(docx));
  const xml = await zip.file("word/document.xml")!.async("string");
  assert.ok(xml.includes(longText)); assert.ok(xml.includes(definition.objectives[0].text));
  assert.ok(xml.includes("w:tbl")); assert.ok(xml.includes("Ejemplo, 2026"));
  assert.ok(xml.includes('w:lineRule="atLeast"'), "Inline images need a paragraph tall enough for PDF conversion");
  assert.ok(!/Sintesis visual del blueprint|Tabla de contenido|schedule_and_budget/.test(xml));
  const exported = await exportPlanPdf(docx, pdf);
  assert.ok(exported.page_budget_pass);
  assert.ok(exported.text.replace(/\s+/g, " ").includes("Cierre íntegro con áéíóú, ñ y evidencia citada."));
  assert.ok(exported.text.includes("Ejemplo, 2026"));
  console.log(JSON.stringify({ status: "PASS B3 generation/export", calls_mocked: phases.length, docx, pdf, pages: exported.page_count, body_pages: exported.body_pages }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
