import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { prisma } from "@/lib/prisma";
import { readCanonicalStep6Docx } from "@/server/mvp/canonical-docx-download";
import { readCanonicalStep6Pdf } from "@/server/mvp/canonical-pdf-download";
import { assertEvidenceContinuity, excerptOccurs } from "@/server/mvp/evidence-continuity";
import { assessEvidenceCoverage } from "@/server/mvp/evidence-coverage";
import { normalizeConsistencyMatrix, MVP_DOCUMENT_SECTIONS } from "@/server/mvp/research-plan-contracts";
import type { MvpStep5EvidenceLedger } from "@/server/mvp/evidence-materialization-types";
import type { MvpStep6BlueprintPackage } from "@/server/mvp/step6-blueprint-docx-types";

async function main() {
  for (const key of ["DATABASE_URL", "DATABASE_URL_UNPOOLED"]) {
    const db = new URL(process.env[key] ?? "");
    if (db.hostname !== "127.0.0.1" || db.port !== "55434" || db.pathname !== "/imx_b1") throw new Error("Isolated B3 DB required");
  }
  const dir = path.resolve(process.argv[2]);
  const json = async <T = any>(file: string): Promise<T> => JSON.parse(await readFile(file, "utf8"));
  const report = await json(path.join(dir, "case-result.json"));
  const ledger = await json<MvpStep5EvidenceLedger>(report.artifacts.evidence_ledger);
  const pkg = await json<MvpStep6BlueprintPackage>(path.join(report.artifacts.canonical_dir, "step6-blueprint-package.json"));
  const version = await prisma.blueprintVersion.findUniqueOrThrow({ where: { id: report.blueprint_version_id } });
  const project = await prisma.project.findUniqueOrThrow({ where: { id: report.project_id }, include: { intake: true, projectReferences: { where: { selected: true }, include: { reference: true } } } });
  assertEvidenceContinuity(ledger, { projectId: project.id, stepRunId: report.continuity.step5_step_run_id, intake: project.intake!, referenceIds: project.projectReferences.map((r) => r.referenceId) });
  const docx = await readCanonicalStep6Docx(version), pdf = await readCanonicalStep6Pdf(version);
  assert.ok(docx?.equals(await readFile(report.artifacts.docx)));
  assert.ok(pdf.equals(await readFile(report.artifacts.pdf)));
  const manifest = version.blueprintJson as Record<string, any>;
  await assert.rejects(readCanonicalStep6Pdf({ ...version, blueprintJson: { ...manifest, step6_docx: { ...manifest.step6_docx, pdf_sha256: "0".repeat(64) } } }), /Integridad PDF/);
  await assert.rejects(readCanonicalStep6Pdf({ ...version, projectId: "unrelated-project" }));
  assert.deepEqual(pkg.section_drafts.map((s) => s.section_key), MVP_DOCUMENT_SECTIONS.filter((s) => s !== "cover"));
  const scientific = pkg.scientific_plan!;
  normalizeConsistencyMatrix(scientific.matrix, scientific.definition, scientific.design);
  const zip = await JSZip.loadAsync(docx!);
  const xml = await zip.file("word/document.xml")!.async("string");
  const decode = (text: string) => text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  // Allow renderer accent correction and duplicate punctuation cleanup, never lost words.
  const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/([.;:]){2,}/g, "$1").replace(/\s+/g, " ").trim();
  const docText = normalize([...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => decode(m[1])).join(" "));
  const extracted = await promisify(execFile)("pdftotext", ["-raw", report.artifacts.pdf, "-"], { maxBuffer: 8_000_000 });
  const pdfText = normalize(extracted.stdout);
  const missing: unknown[] = [], claims: unknown[] = [], missingPdfTails: unknown[] = [];
  let textsChecked = 0;
  for (const draft of pkg.section_drafts) {
    for (const block of draft.blocks) {
      const texts = block.kind === "paragraph" ? [block.text] : block.kind === "bullet_list" || block.kind === "reference_list" ? block.items : block.kind === "table" ? block.rows.flat() : [];
      for (const text of texts) {
        textsChecked++;
        if (normalize(text) && !docText.includes(normalize(text))) missing.push({ section: draft.section_key, text });
        const tail = normalize(text).split(" ").slice(-8).join(" ");
        if (tail && !pdfText.includes(tail)) missingPdfTails.push({ section: draft.section_key, tail });
      }
    }
    for (const anchor of draft.citation_anchors) {
      const extraction = ledger.semantic_extractions.find((e) => e.source_id === anchor.source_id)!;
      const evidence = extraction?.evidence_items.find((e) => e.evidence_id === anchor.evidence_id);
      const source = ledger.source_registry.find((s) => s.source_id === anchor.source_id)!;
      const material = ledger.pdf_materializations.find((m) => m.source_id === anchor.source_id);
      const availableTexts: string[] = [];
      if (material?.chunks_path) {
        const chunks = await json(material.chunks_path);
        availableTexts.push(...(Array.isArray(chunks) ? chunks : chunks.chunks ?? []).map((c: any) => c.text));
      }
      const abstract = project.projectReferences.find((r) => r.referenceId === source.reference_id)?.reference.abstract;
      if (abstract) availableTexts.push(abstract.replace(/<[^>]*>/g, " "));
      const verified = evidence && excerptOccurs(evidence.supporting_excerpt, availableTexts);
      claims.push({ section: draft.section_key, claim: anchor.claim_summary, reference: source.doi, evidence_level: extraction.evidence_basis, citation_anchor: anchor, source_text_support: evidence?.supporting_excerpt, source_excerpt_independently_verified: !!verified, citation_in_docx: docText.includes(normalize(anchor.citation_label)), citation_in_pdf: pdfText.includes(normalize(anchor.citation_label)), substantive_support_review: "REQUIRES_SEMANTIC_REVIEW" });
    }
  }
  const pages = await json(path.join(report.artifacts.canonical_dir, "pdf-validation.json"));
  const assets = await json(path.join(report.artifacts.canonical_dir, "asset-quality.json"));
  const discovery = await json(path.join(report.artifacts.canonical_dir, "research-discovery.json"));
  const summary = { project_id: project.id, version_id: version.id, canonical_downloads_byte_identical: true, section_count: pkg.section_drafts.length, methodology: scientific.design.approach, hypotheses_count: scientific.definition.hypotheses_or_propositions.length, matrix_rows: scientific.matrix.rows.length, body_pages: pages.body_pages, total_pages: pages.page_count, texts_checked: textsChecked, missing_docx_texts: missing, pdf_tail_check_flags: missingPdfTails, citation_anchors: claims.length, evidence_items: ledger.semantic_extractions.flatMap((e) => e.evidence_items).filter((e) => e.support_verified).length, evidence_coverage: assessEvidenceCoverage(ledger), assets, discovery: { candidates: discovery.candidates.length, inspected_additional: discovery.added_reference_ids.length, tiers: discovery.tiers }, hero: pkg.hero_image, substantive_review: "PENDING", visual_review: "PENDING" };
  await writeFile(path.join(dir, "document-evidence-review.json"), JSON.stringify(summary, null, 2));
  await writeFile(path.join(dir, "claim-to-evidence.json"), JSON.stringify(claims, null, 2));
  await writeFile(path.join(dir, "pdf-extracted.txt"), extracted.stdout);
  await writeFile(path.join(dir, "docx-extracted.txt"), docText);
  console.log(JSON.stringify({ ...summary, assets: { candidates: assets.candidates.length, accepted: assets.accepted_for_document.length }, hero: { model: pkg.hero_image.image_model, status: pkg.hero_image.status }, evidence_coverage: summary.evidence_coverage.status, failed_excerpt_checks: claims.filter((c: any) => !c.source_excerpt_independently_verified).length }, null, 2));
  assert.equal(missing.length, 0, "Every structured text must survive DOCX export");
  assert.ok(claims.every((c: any) => c.source_excerpt_independently_verified && c.citation_in_docx && c.citation_in_pdf), "Citations/excerpts must resolve in both exports");
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
