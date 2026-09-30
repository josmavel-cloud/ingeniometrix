import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { readCanonicalStep6Docx } from "@/server/mvp/canonical-docx-download";
import { prisma } from "@/lib/prisma";
import { assertEvidenceContinuity, evaluateEvidenceGate } from "@/server/mvp/evidence-continuity";

async function main() {
  const db = new URL(process.env.DATABASE_URL_UNPOOLED ?? "");
  if (db.hostname !== "127.0.0.1" || db.port !== "55434" || db.pathname !== "/imx_b1") throw new Error("Isolated B2 DB only");
  const dir = path.resolve(process.argv[2]);
  const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8"));
  const report = await readJson(path.join(dir, "case-result.json"));
  const ledger = await readJson(report.artifacts.evidence_ledger);
  const canonicalDir = path.join(process.cwd(), "artifacts-local", "mvp-step6-blueprint-docx", report.project_id, `${report.run_id}-step6`);
  const pkg = await readJson(report.canonical_package_path ?? path.join(canonicalDir, "step6-blueprint-package.json"));
  const version = await prisma.blueprintVersion.findUniqueOrThrow({ where: { id: report.blueprint_version_id } });
  const project = await prisma.project.findUniqueOrThrow({ where: { id: report.project_id }, include: { intake: true, projectReferences: { where: { selected: true } } } });
  assertEvidenceContinuity(ledger, { projectId: project.id, stepRunId: report.continuity.step5_step_run_id, intake: project.intake!, referenceIds: project.projectReferences.map((row) => row.referenceId) });
  const buffer = await readCanonicalStep6Docx(version);
  if (!buffer) throw new Error("No canonical DOCX");
  const sample = await readFile(report.artifacts.docx);
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")!.async("string");
  const decode = (text: string) => text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  const normalize = (text: string) => text.normalize("NFKC").replace(/\s+/g, " ").trim();
  const documentText = normalize([...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((match) => decode(match[1])).join(" "));
  const missing: unknown[] = [];
  const claims: unknown[] = [];
  let expectedTexts = 0;
  for (const section of pkg.section_drafts) {
    const paragraphs = section.blocks.filter((block: any) => block.kind === "paragraph");
    for (const block of section.blocks) {
      const texts = block.kind === "paragraph" ? [block.text] : block.kind === "bullet_list" ? block.items : block.kind === "table" ? block.rows.flat() : [];
      for (const text of texts) {
        expectedTexts++;
        if (normalize(text) && !documentText.includes(normalize(text))) missing.push({ section: section.section_key, text });
      }
    }
    for (const anchor of section.citation_anchors) {
      const extraction = ledger.semantic_extractions.find((item: any) => item.source_id === anchor.source_id);
      const evidence = extraction?.evidence_items.find((item: any) => item.evidence_id === anchor.evidence_id);
      const source = ledger.source_registry.find((item: any) => item.source_id === anchor.source_id);
      claims.push({ section: section.section_key, claim: paragraphs[anchor.paragraph_index]?.text ?? null, anchor, reference: source?.doi, evidence_level: extraction?.evidence_basis, source_text_support: evidence?.supporting_excerpt ?? null, evidence_summary: evidence?.traceable_summary_es ?? null, excerpt_verified: evidence?.support_verified ?? false, citation_present: documentText.includes(normalize(anchor.citation_label)), semantic_review: "PENDING" });
    }
  }
  const calls = [];
  for (const filename of (await readdir(path.join(dir, "provider-calls"))).sort()) calls.push(await readJson(path.join(dir, "provider-calls", filename)));
  const usage = { calls: calls.length, input_tokens: 0, output_tokens: 0, cached_tokens: 0, total_tokens: 0, estimated_usd: 0, missing_usage_calls: 0 };
  for (const call of calls) {
    const u = call.response.usage;
    if (!u) { usage.missing_usage_calls++; continue; }
    const [input, cached, output] = call.response.model.startsWith("gpt-5.4-mini") ? [0.75, 0.075, 4.5] : call.response.model.startsWith("gpt-5.4-nano") ? [0.2, 0.02, 1.25] : [2.5, 0.25, 15];
    const c = u.input_tokens_details?.cached_tokens ?? 0;
    usage.input_tokens += u.input_tokens; usage.output_tokens += u.output_tokens; usage.cached_tokens += c; usage.total_tokens += u.total_tokens;
    usage.estimated_usd += ((u.input_tokens - c) * input + c * cached + u.output_tokens * output) / 1e6;
  }
  const summary = { project_id: report.project_id, run_id: report.run_id, blueprint_version_id: version.id, evidence_gate: evaluateEvidenceGate(ledger), persisted_intake_selection_continuity: "PASS", expected_texts: expectedTexts, missing_text_count: missing.length, missing_texts: missing, canonical_download_byte_identical: buffer.equals(sample), anchors: claims.length, usage, coherence_from_original_generation: pkg.coherence_report, visual_inspection: "See scientific-review.json and acceptance report; this script performs text/identity checks only" };
  await writeFile(path.join(dir, "document-evidence-review.json"), JSON.stringify(summary, null, 2));
  await writeFile(path.join(dir, "claim-to-evidence.json"), JSON.stringify(claims, null, 2));
  await writeFile(path.join(dir, "docx-extracted.txt"), documentText);
  console.log(JSON.stringify({ ...summary, missing_texts: missing.slice(0, 2), coherence: pkg.coherence_report.status }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
