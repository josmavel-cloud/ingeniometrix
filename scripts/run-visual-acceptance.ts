import "dotenv/config";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

import { getConfiguredLlmProvider } from "@/llm";
import { ApplicationBudget, withApplicationBudget } from "@/server/mvp/application-budget";
import type { MvpStep5EvidenceLedger } from "@/server/mvp/evidence-materialization-types";
import { exportPlanPdf } from "@/server/mvp/pdf-export";
import { HERO_INFOGRAPHIC_PROMPT_V2 } from "@/server/mvp/prompts/hero-infographic.v2";
import { MATRIX_VISUAL_PROMPT } from "@/server/mvp/prompts/matrix-visual.v1";
import { VISUAL_QA_PROMPT } from "@/server/mvp/prompts/visual-qa.v1";
import { buildCrossReferencePlan, renderDocx } from "@/server/mvp/step6-blueprint-docx-service";
import type { MvpStep6BlueprintPackage } from "@/server/mvp/step6-blueprint-docx-types";
import { buildVisualDeliverables } from "@/server/mvp/visual-deliverables";
import { publicVisualBrief, validateVisual } from "@/server/mvp/final-infographic-v2";

const exec = promisify(execFile);
const ROOT = path.join(process.cwd(), "artifacts-local", "release0-visual-acceptance");
const CASES = [
  { key: "engineering", caseResult: "artifacts-local/release0-scientific-validation/b3/final/engineering-export/case-result.json", program: "Maestría en Ingeniería Civil con mención en Estructuras" },
  { key: "qualitative", caseResult: "artifacts-local/release0-scientific-validation/b3/final/qualitative-delivery/case-result.json", program: "Maestría en Educación" },
] as const;

function sha256(buffer: Buffer) { return createHash("sha256").update(buffer).digest("hex"); }
async function readJson<T>(file: string): Promise<T> { return JSON.parse(await readFile(file, "utf8")) as T; }
async function writeJson(file: string, value: unknown) { await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function normalizedText(value: string) { return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9ñ ]/g, " ").replace(/\s+/g, " ").trim(); }
function pageFor(pages: string[], caption: string) {
  const needle = normalizedText(caption); if (!needle) return null;
  const exact = pages.findIndex((page) => normalizedText(page).includes(needle)); if (exact >= 0) return exact + 1;
  const words = needle.split(" ").slice(0, 5); const fallback = pages.findIndex((page) => words.every((word) => normalizedText(page).includes(word))); return fallback >= 0 ? fallback + 1 : null;
}

async function renderPages(pdfPath: string, outputDir: string) {
  const pdfHash = sha256(await readFile(pdfPath)).slice(0, 12);
  const pagesDir = path.join(outputDir, `pages-${pdfHash}`); await mkdir(pagesDir, { recursive: true });
  await exec("pdftoppm", ["-png", "-r", "110", pdfPath, path.join(pagesDir, "page")], { timeout: 120_000, maxBuffer: 2 * 1024 * 1024 });
  const pageFiles = (await readdir(pagesDir)).filter((file) => /^page-\d+\.png$/.test(file)).sort().map((file) => path.join(pagesDir, file));
  const thumbs: Buffer[] = [];
  for (const file of pageFiles) thumbs.push(await sharp(file).resize({ width: 300 }).extend({ top: 8, bottom: 8, left: 8, right: 8, background: "white" }).png().toBuffer());
  const columns = 3; const tileWidth = 316; const tileHeight = Math.max(...(await Promise.all(thumbs.map((buffer) => sharp(buffer).metadata()))).map((item) => item.height ?? 420)); const rows = Math.ceil(thumbs.length / columns);
  const contactSheet = path.join(outputDir, `contact-sheet-${pdfHash}.png`);
  await sharp({ create: { width: tileWidth * columns, height: tileHeight * rows, channels: 4, background: "#d8d8d8" } }).composite(thumbs.map((input, index) => ({ input, left: (index % columns) * tileWidth + 8, top: Math.floor(index / columns) * tileHeight + 8 }))).png().toFile(contactSheet);
  return { pageFiles, contactSheet };
}

function promptsMarkdown(sidecars: { hero: unknown; matrix: unknown }) {
  return `# PROMPTS_USED — Visual Thesis-Plan Deliverable Closure

## Hero infographic

- Model: ${HERO_INFOGRAPHIC_PROMPT_V2.model}
- Parameters: quality=high, size=1024x1024, n=1; at most one repair per document.
- Arrangement: one Images API prompt; pixel QA uses Responses API with user input_text + input_image.
- Version: ${HERO_INFOGRAPHIC_PROMPT_V2.version}
- Variables: ${HERO_INFOGRAPHIC_PROMPT_V2.variables.join(", ")}
- Output: ${HERO_INFOGRAPHIC_PROMPT_V2.expected_schema}

### System/instruction template

${HERO_INFOGRAPHIC_PROMPT_V2.systemPrompt}

### User template

${HERO_INFOGRAPHIC_PROMPT_V2.userPromptTemplate}

## Consistency matrix visual

- Model: ${MATRIX_VISUAL_PROMPT.model}
- Parameters: quality=high, size=1536x1024, n=1.
- Arrangement: one Images API prompt; exact semantic text is rendered deterministically from the validated matrix; pixel QA uses Responses API.
- Version: ${MATRIX_VISUAL_PROMPT.version}
- Variables: ${MATRIX_VISUAL_PROMPT.variables.join(", ")}
- Output: ${MATRIX_VISUAL_PROMPT.expected_schema}

### System/instruction template

${MATRIX_VISUAL_PROMPT.systemPrompt}

### User template

${MATRIX_VISUAL_PROMPT.userPromptTemplate}

## Pixel-level visual QA

- Model: configured IMX_VISUAL_QA_MODEL or ${VISUAL_QA_PROMPT.model}
- Parameters: max_output_tokens=${VISUAL_QA_PROMPT.max_output_tokens}; strict JSON schema; bounded by provider retry policy.
- Arrangement: Responses API user message containing input_text + input_image.
- Version: ${VISUAL_QA_PROMPT.version}
- Schema: ${VISUAL_QA_PROMPT.expected_schema}

### System/instruction template

${VISUAL_QA_PROMPT.systemPrompt}

### User template

${VISUAL_QA_PROMPT.userPromptTemplate}

## Actual resolved calls

Full resolved prompts, usage, rejection reasons and retained original/repair paths are preserved without intake secrets in these private sidecars:

\`\`\`json
${JSON.stringify(sidecars, null, 2)}
\`\`\`
`;
}

async function runCase(caseInput: (typeof CASES)[number]) {
  const started = Date.now(); const outputDir = path.join(ROOT, caseInput.key); await mkdir(outputDir, { recursive: true });
  const caseResult = await readJson<any>(caseInput.caseResult); const canonicalDir = caseResult.artifacts.canonical_dir as string;
  const packagePath = path.join(canonicalDir, "step6-blueprint-package.json"); const ledgerPath = caseResult.artifacts.evidence_ledger as string;
  const packageBuffer = await readFile(packagePath); const ledgerBuffer = await readFile(ledgerPath);
  const pkg = JSON.parse(packageBuffer.toString("utf8")) as MvpStep6BlueprintPackage; const ledger = JSON.parse(ledgerBuffer.toString("utf8")) as MvpStep5EvidenceLedger;
  if (pkg.project_id !== caseResult.project_id || ledger.project_id !== caseResult.project_id || pkg.blueprint_version_id !== caseResult.blueprint_version_id) throw new Error(`${caseInput.key}: B3 snapshot identity mismatch`);
  if (!pkg.scientific_plan) throw new Error(`${caseInput.key}: scientific plan snapshot missing`);
  const provider = getConfiguredLlmProvider(); const budget = new ApplicationBudget(4, 2); const drafts = structuredClone(pkg.section_drafts);
  const heroPath = path.join(outputDir, "hero-infographic.png");
  const reuseAccepted = process.env.IMX_REUSE_VISUAL_ACCEPTANCE === "1";
  let reuseOverrides = {};
  if (reuseAccepted) {
    try {
      const matrixSidecar = await readJson<any>(path.join(outputDir, "visuals", "consistency-matrix-visual.png.json"));
      const heroSidecar = await readJson<any>(`${heroPath}.json`);
      if (!matrixSidecar.accepted || heroSidecar.status !== "generated") throw new Error("Only accepted visuals may be reused");
      reuseOverrides = {
        imageGeneratorOverride: async () => matrixSidecar.usage,
        ...(process.env.IMX_REUSE_VISUAL_QA === "1" ? { visionValidatorOverride: async () => matrixSidecar.visual_quality } : {}),
        heroGeneratorOverride: async ({ definition, design, outputPath }: any) => {
          const brief = publicVisualBrief(definition, design);
          const quality = process.env.IMX_REUSE_VISUAL_QA === "1"
            ? heroSidecar.attempts.at(-1).quality
            : await validateVisual({ provider, imagePath: outputPath, assetType: "hero_infographic", publicBrief: brief, requiredProperties: ["relevante", "legible", "sin resultados inventados", "sin identificadores internos", "sin recortes"], forbiddenExactLabels: [...definition.questions.map((item: any) => item.id), ...definition.objectives.map((item: any) => item.id), ...design.constructs.map((item: any) => item.id)] });
          return { plan: { prompt_version: heroSidecar.prompt_version, placement: "cover", visual_type: "methodological_infographic_cover", prompt: heroSidecar.prompt, negative_prompt: heroSidecar.negative_prompt, summary: heroSidecar.summary, image_path: outputPath, image_model: heroSidecar.image_model, status: "generated", warnings: [] }, brief, attempts: [{ path: outputPath, prompt: heroSidecar.prompt, usage: { reused: true }, quality, error: null }], initialRequests: 0, repairRequests: 0, accepted: quality.pass && quality.relevant && quality.readable && quality.no_internal_identifiers && quality.no_invented_results && quality.no_clipping };
        },
      };
    } catch { reuseOverrides = {}; }
  }
  const visual = await withApplicationBudget(budget, () => buildVisualDeliverables({ provider, definition: pkg.scientific_plan!.definition, design: pkg.scientific_plan!.design, matrix: pkg.scientific_plan!.matrix, ledger, usedSourceIds: [...new Set(drafts.flatMap((draft) => draft.used_source_ids))], drafts, artifactDir: outputDir, heroOutputPath: heroPath, projectId: pkg.project_id, runId: `release0-visual-rerender-${caseInput.key}`, ...reuseOverrides }));
  const crossReferences = buildCrossReferencePlan({ drafts, pdfMentions: [] });
  const finalPackage: MvpStep6BlueprintPackage = { ...pkg, generated_at: new Date().toISOString(), section_drafts: drafts, hero_image: visual.heroImage, visual_plan: visual.visualPlan, cross_reference_plan: crossReferences, scientific_plan: { ...pkg.scientific_plan, generation_order: [...pkg.scientific_plan.generation_order, "visual_plan", "matrix_image_validated", "editable_matrix_after_image", "docx", "pdf"] } };
  const project = { title: pkg.title_plan.title, program: caseInput.program, university: "OTHER" };
  const docxPath = path.join(outputDir, "final-thesis-plan.docx"); const pdfPath = path.join(outputDir, "final-thesis-plan.pdf");
  await renderDocx({ project: project as any, package: finalPackage, outputPath: docxPath }); const pdf = await exportPlanPdf(docxPath, pdfPath);
  await Promise.all([writeJson(path.join(outputDir, "step6-blueprint-package.json"), finalPackage), writeJson(path.join(outputDir, "application-budget.json"), budget.entries), copyFile(ledgerPath, path.join(outputDir, "evidence-ledger.json")), copyFile(caseResult.artifacts.evidence_log, path.join(outputDir, "evidence-log.json")), copyFile(path.join(canonicalDir, "bibliography.bib"), path.join(outputDir, "bibliography.bib")), copyFile(path.join(canonicalDir, "bibliography.ris"), path.join(outputDir, "bibliography.ris"))]);
  const { stdout } = await exec("pdftotext", ["-layout", pdfPath, "-"], { timeout: 30_000, maxBuffer: 12 * 1024 * 1024 }); const pages = stdout.split("\f").filter((page) => page.trim());
  const rendered = await renderPages(pdfPath, outputDir);
  const inventory = visual.visualPlan.assets.map((asset) => {
    const crossReference = crossReferences.find((item) => normalizedText(item.title) === normalizedText(asset.caption));
    return { asset_id: asset.asset_id, type: asset.asset_type, method: asset.rendering_method, status: asset.status, page: asset.asset_type === "hero_infographic" ? 1 : pageFor(pages, crossReference ? `${crossReference.label}. ${asset.caption}` : asset.caption), caption: asset.caption, attribution: asset.attribution, output_paths: [...new Set(asset.output_paths)] };
  });
  const heroSidecar = await readJson(`${heroPath}.json`); const matrixSidecar = await readJson(path.join(outputDir, "visuals", "consistency-matrix-visual.png.json"));
  await writeFile(path.join(outputDir, "PROMPTS_USED.md"), promptsMarkdown({ hero: heroSidecar, matrix: matrixSidecar }), "utf8");
  const result = { case: caseInput.key, mode: "frozen_B3_snapshot_rerender", scientific_snapshot: { project_id: pkg.project_id, blueprint_version_id: pkg.blueprint_version_id, package_sha256: sha256(packageBuffer), evidence_ledger_sha256: sha256(ledgerBuffer), identity_verified: true }, docx_path: docxPath, pdf_path: pdfPath, page_count: pdf.page_count, body_pages: pdf.body_pages, page_budget_pass: pdf.page_budget_pass, all_pages_rendered: rendered.pageFiles.length === pdf.page_count, page_renders: rendered.pageFiles, contact_sheet: rendered.contactSheet, asset_inventory: inventory, required_visuals_accepted: ["hero_infographic", "conceptual_diagram", "methodology_workflow", "evidence_comparison_table", "research_design_table", "consistency_matrix_image", "consistency_matrix_table"].every((type) => visual.visualPlan.assets.some((asset) => asset.asset_type === type && asset.status === "accepted")), matrix_image_before_editable: drafts.find((draft) => draft.section_key === "consistency_matrix")?.blocks.findIndex((block) => block.kind === "figure" && block.asset_key === "original:consistency-matrix-visual")! < drafts.find((draft) => draft.section_key === "consistency_matrix")?.blocks.findIndex((block) => block.kind === "table")!, equations: visual.visualPlan.assets.find((asset) => asset.asset_id === "equations"), budget_entries: budget.entries, cost_usd: budget.entries.reduce((sum, entry) => sum + (entry.estimated_usd ?? entry.reserved_usd), 0), backend_duration_ms: Date.now() - started, warnings: visual.visualPlan.warnings };
  await writeJson(path.join(outputDir, "acceptance-result.json"), result); return result;
}

async function main() {
  await mkdir(ROOT, { recursive: true }); const results = [];
  const onlyCase = process.env.IMX_VISUAL_ACCEPTANCE_CASE;
  for (const item of CASES) {
    if (onlyCase && item.key !== onlyCase) results.push(await readJson<any>(path.join(ROOT, item.key, "acceptance-result.json")));
    else results.push(await runCase(item));
  }
  const totalCost = results.reduce((sum, result) => sum + result.cost_usd, 0); if (totalCost > 8) throw new Error(`TASK_BUDGET_EXCEEDED: ${totalCost}`);
  await writeJson(path.join(ROOT, "acceptance-summary.json"), { status: results.every((result) => result.required_visuals_accepted && result.page_budget_pass && result.all_pages_rendered && result.matrix_image_before_editable) ? "PASS" : "FAIL", total_cost_usd: totalCost, results });
  console.log(JSON.stringify({ status: "DONE", total_cost_usd: totalCost, cases: results.map((result) => ({ case: result.case, body_pages: result.body_pages, required_visuals_accepted: result.required_visuals_accepted, contact_sheet: result.contact_sheet })) }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
