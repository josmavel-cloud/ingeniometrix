import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { prisma } from "@/lib/prisma";
import { renderFinalMethodologicalInfographic } from "@/server/mvp/compact-asset-planner";
import { LATAM_COMPACT_PROFILE } from "@/server/mvp/document-profiles/latam-compact-v1";
import { exportPlanPdf } from "@/server/mvp/pdf-export";
import { appendDeterministicCitationLabels } from "@/server/mvp/scientific-plan-generation";
import { renderDocx } from "@/server/mvp/step6-blueprint-docx-service";
import type { MvpStep6BlueprintPackage, MvpStep6SectionDraft } from "@/server/mvp/step6-blueprint-docx-types";

const exec = promisify(execFile);
const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");

function normalizeCitations(draft: MvpStep6SectionDraft) {
  const labelsByParagraph = new Map<number, string[]>();
  for (const anchor of draft.citation_anchors) {
    const labels = labelsByParagraph.get(anchor.paragraph_index) ?? [];
    labels.push(anchor.citation_label);
    labelsByParagraph.set(anchor.paragraph_index, labels);
  }
  let paragraphIndex = 0;
  draft.blocks = draft.blocks.map((block) => {
    if (block.kind !== "paragraph") return block;
    const labels = labelsByParagraph.get(paragraphIndex++);
    return labels?.length ? { ...block, text: appendDeterministicCitationLabels(block.text, labels) } : block;
  });
}

function removeUntrackedFigures(draft: MvpStep6SectionDraft, acceptedPaths: Set<string>) {
  const blocks = [] as MvpStep6SectionDraft["blocks"];
  for (const block of draft.blocks) {
    if (block.kind === "figure" && (!block.image_path || !acceptedPaths.has(block.image_path))) {
      const previous = blocks.at(-1);
      if (previous?.kind === "paragraph" && /\b(?:figura|diagrama)\b/i.test(previous.text)) blocks.pop();
      continue;
    }
    blocks.push(block);
  }
  draft.blocks = blocks;
}

async function main() {
  const sourceDir = process.env.RC4_G3_SOURCE_DIR;
  const sourceVersionId = process.env.RC4_G3_SOURCE_VERSION_ID;
  if (!sourceDir || !sourceVersionId) throw new Error("RC4_G3_SOURCE_DIR and RC4_G3_SOURCE_VERSION_ID are required");

  const sourcePackage = JSON.parse(await readFile(path.join(sourceDir, "step6-blueprint-package.json"), "utf8")) as MvpStep6BlueprintPackage;
  if (sourcePackage.document_profile !== LATAM_COMPACT_PROFILE.id) throw new Error("LATAM_COMPACT_PROFILE_REQUIRED");
  if (sourcePackage.blueprint_version_id !== sourceVersionId) throw new Error("SOURCE_VERSION_MISMATCH");

  const sourceVersion = await prisma.blueprintVersion.findUniqueOrThrow({ where: { id: sourceVersionId } });
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: sourceVersion.projectId },
    include: {
      intake: true,
      projectReferences: { select: { id: true, referenceId: true, selectedOrder: true, reference: { select: { id: true, title: true, doi: true, year: true, venue: true, authorsJson: true } } } },
      blueprintVersions: { select: { versionNumber: true }, orderBy: { versionNumber: "desc" }, take: 1 },
    },
  });

  const outputDir = path.join(sourceDir, "presentation-repair");
  await mkdir(outputDir, { recursive: true, mode: 0o700 });
  const repaired = structuredClone(sourcePackage);
  const acceptedPaths = new Set((repaired.visual_plan?.assets ?? []).filter((asset) => asset.status === "accepted").flatMap((asset) => asset.output_paths));
  for (const draft of repaired.section_drafts) {
    normalizeCitations(draft);
    removeUntrackedFigures(draft, acceptedPaths);
    for (const block of draft.blocks) {
      if (block.kind === "table" && /diseño de investigación propuesto/i.test(block.title)) block.render_hint = "compact_page_break";
    }
  }

  const finalDraft = repaired.section_drafts.find((draft) => draft.section_key === "final_methodological_infographic");
  if (!finalDraft || !repaired.scientific_plan) throw new Error("FINAL_INFOGRAPHIC_INPUT_MISSING");
  const regeneratedDraft = structuredClone(finalDraft);
  regeneratedDraft.blocks = [];
  regeneratedDraft.used_asset_keys = [];
  const infographicPath = await renderFinalMethodologicalInfographic({
    definition: repaired.scientific_plan.definition,
    design: repaired.scientific_plan.design,
    drafts: [regeneratedDraft],
    artifactDir: outputDir,
  });
  finalDraft.blocks = regeneratedDraft.blocks;
  finalDraft.used_asset_keys = regeneratedDraft.used_asset_keys;
  const infographicAsset = repaired.visual_plan?.assets.find((asset) => asset.asset_id === "final-methodological-infographic");
  if (infographicAsset) infographicAsset.output_paths = [infographicPath];

  const docxPath = path.join(outputDir, "final-thesis-plan.docx");
  const pdfPath = path.join(outputDir, "final-thesis-plan.pdf");
  await renderDocx({ project, package: repaired, outputPath: docxPath });
  const pdf = await exportPlanPdf(docxPath, pdfPath, {
    expectedBodyPages: sourcePackage.page_budget_plan.estimated_pages,
    targetMinBodyPages: LATAM_COMPACT_PROFILE.bodyPages.targetMin,
    targetMaxBodyPages: LATAM_COMPACT_PROFILE.bodyPages.targetMax,
    softMaxBodyPages: LATAM_COMPACT_PROFILE.bodyPages.max,
  });
  if (!pdf.publication_allowed || pdf.body_pages === null || pdf.body_pages < LATAM_COMPACT_PROFILE.bodyPages.min || pdf.body_pages > LATAM_COMPACT_PROFILE.bodyPages.max) {
    throw new Error(`PRESENTATION_REPAIR_PAGE_CONTRACT: ${pdf.body_pages}`);
  }
  const duplicatedCitation = /\([^()]*;[^()]*,\s*(?:19|20)\d{2}[^()]*\)\.?\s*\([^()]*,\s*(?:19|20)\d{2}/u.test(pdf.text);
  if (duplicatedCitation) throw new Error("PRESENTATION_REPAIR_DUPLICATED_CITATION");

  const docx = await readFile(docxPath);
  const pdfBuffer = await readFile(pdfPath);
  const report = {
    version: "rc4-g3-presentation-repair.v1",
    source_blueprint_version_id: sourceVersionId,
    scientific_content_regenerated: false,
    provider_calls: 0,
    fixes: ["deterministic citation normalization", "atomic asset fallback", "native bullet indentation", "landscape footer clearance", "hanging-indent references", "regenerated deterministic final infographic"],
    omitted_untracked_figures: true,
    body_pages: pdf.body_pages,
    total_pages: pdf.page_count,
    page_status: pdf.length_status,
    publication_allowed: pdf.publication_allowed,
    docx_path: docxPath,
    pdf_path: pdfPath,
    docx_sha256: sha256(docx),
    pdf_sha256: sha256(pdfBuffer),
  };
  await writeFile(path.join(outputDir, "presentation-repair-report.json"), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  await writeFile(path.join(outputDir, "step6-blueprint-package.presentation-repair.json"), `${JSON.stringify(repaired, null, 2)}\n`, { mode: 0o600 });
  const renderDir = path.join(outputDir, "page-renders");
  await mkdir(renderDir, { recursive: true });
  await exec("pdftoppm", ["-png", "-r", "110", pdfPath, path.join(renderDir, "page")], { timeout: 120000, maxBuffer: 2 * 1024 * 1024 });
  console.log(JSON.stringify(report, null, 2));
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
  await prisma.$disconnect();
}).finally(async () => prisma.$disconnect());
