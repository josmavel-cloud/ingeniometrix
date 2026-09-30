import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { sourceCounts, sourceProgression, type UsableSource } from "@/lib/source-sufficiency-policy";
import { sourceRelevanceTier } from "@/server/retrieval/source-relevance-tier";
import { candidateMetadataHash, type CandidateAssessment } from "@/server/retrieval/candidate-review-policy";
import { observedSourceMetadata } from "@/server/retrieval/observed-source-metadata";
import { researchIdeaOptionsSchema, validateIdeaOptions } from "@/lib/research-idea-options";
import { PrivateFileArtifactStore } from "@/server/storage/artifact-store";
import { PdfUploadError } from "@/server/storage/pdf-upload-error";
const source = (id: string, tier: UsableSource["tier"], selected = true, usable = true): UsableSource => ({ id, tier, selected, usable });
async function main() {
  const core = [source("a", "CORE"), source("b", "CORE"), source("c", "CORE")];
  assert.equal(sourceProgression(core, false).readiness, "READY");
  const mixed = [...core.slice(0, 2), source("e", "EXPLORATORY")];
  assert.equal(sourceProgression(mixed, false).readiness, "BLOCKED", "exploratory cannot suppress fallback");
  assert.equal(sourceProgression(mixed, true).readiness, "READY_WITH_LIMITATIONS");
  assert.equal(sourceProgression([core[0], source("e", "EXPLORATORY"), source("f", "EXPLORATORY")], true).readiness, "BLOCKED");
  assert.equal(sourceProgression([core[0], core[1], core[1]], true).readiness, "BLOCKED", "one work counted once");
  assert.equal(sourceCounts([...core, source("off", "EXCLUDED"), source("pending", "CORE", true, false)]).selectedUsable, 3);
  assert.equal(sourceProgression([...core, ...Array.from({ length: 8 }, (_,i) => source(String(i), "EXPLORATORY"))], true).readiness, "BLOCKED");
  const assessment: CandidateAssessment = { policyVersion: "candidate-semantic-review.v2", candidateId: "example", searchIntentHash: "intent", metadataHash: "hash",
    origin: "DETERMINISTIC", relevance: "PARTIALLY_RELEVANT", role: "THEORETICAL", confidence: "HIGH", rationale: "related", matchedIntentDimensions: [], mismatches: [], evidence: [{ field: "title", quote: "Theory" }] };
  assert.equal(sourceRelevanceTier(assessment, true), "EXPLORATORY");
  assert.equal(sourceRelevanceTier({ ...assessment, relevance: "OFF_TOPIC" }, true), "EXCLUDED");
  assert.equal(sourceRelevanceTier(assessment, false), "EXCLUDED");
  const html = '<meta name="citation_title" content="A scholarly work"><meta name="citation_author" content="An Author"><meta name="citation_publication_date" content="2025"><meta name="citation_doi" content="10.1234/example"><meta name="description" content="Not an abstract">';
  assert.equal(observedSourceMetadata(html, "A scholarly work")?.abstract, null);
  assert.equal(observedSourceMetadata(html, "Invented title"), null);
  for (const area of ["engineering", "education", "health", "social science", "business", "humanities"]) {
    const options = { schemaVersion: "ResearchIdeaOptions.v1", options: [1,2,3].map(i => ({ workingTitle: `${area} direction ${i}`, briefProblem: `An open problem in ${area}`, purpose: "Examine the problem", objectOrPopulation: "A proposed study object", context: "", coreConcepts: [area], whyItIsViable: "Feasibility remains subject to evidence and access", uncertainties: ["Data access is not known"], provenance: "AI_PROPOSED" })) };
    assert.equal(validateIdeaOptions(options).options.length, 3);
    assert.equal(researchIdeaOptionsSchema.safeParse({ ...options, options: options.options.slice(0, 2) }).success, false);
    assert.throws(() => validateIdeaOptions({ ...options, options: Array(3).fill(options.options[0]) }), /NOT_DISTINCT/);
  }
  const root = await mkdtemp(path.join(tmpdir(), "imx-pdf-diagnostics-"));
  try {
    const store = new PrivateFileArtifactStore(root);
    let pdf = "%PDF-1.4\n"; const offsets: number[] = [];
    for (const [i, object] of ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>"].entries()) {
      offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
    }
    pdf += `%${"x".repeat(430000)}\n`; const xref = Buffer.byteLength(pdf);
    pdf += `xref\n0 4\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = Buffer.from(pdf);
    const stream = (buffer: Buffer) => { let offset = 0; return new ReadableStream<Uint8Array>({ pull(controller) { if (offset >= buffer.length) return controller.close(); const end = Math.min(offset + 997, buffer.length); controller.enqueue(buffer.subarray(offset, end)); offset = end; } }); };
    const key = randomUUID(); const written = await store.putPdf(key, stream(bytes), bytes.length);
    assert.equal(written.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.deepEqual(await readFile(store.pathForPdf(key)), bytes);
    for (const [body, size, category] of [[bytes, bytes.length + 1, "BODY_LENGTH_MISMATCH"], [bytes, bytes.length - 1, "BODY_LENGTH_MISMATCH"], [Buffer.from("bogus pdf"), 9, "INVALID_PDF_SIGNATURE"], [Buffer.from("%PDF-invalid"), 12, "PDFINFO_VALIDATION_FAILED"]] as const) {
      await assert.rejects(store.putPdf(randomUUID(), stream(body), size), error => error instanceof PdfUploadError && error.category === category);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
  console.log("PASS source policy, exploratory integrity, dedupe, multidisciplinary ideas, observed metadata, chunked PDF and rejection diagnostics; provider calls=0");
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Test failed"); process.exitCode = 1; });
