import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Document, Packer, Paragraph } from "docx";
import { readCanonicalStep6Docx } from "@/server/mvp/canonical-docx-download";

async function main() {
  const projectId = `fixture-download-${randomUUID()}`;
  const id = randomUUID();
  const dir = path.join(process.cwd(), "artifacts-local", "mvp-step6-blueprint-docx", projectId, "fixture-run");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, "fixture.docx");
  const buffer = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph("Fixture de descarga, no evidencia científica.")] }] }));
  await writeFile(file, buffer);
  await writeFile(path.join(dir, "step6-blueprint-package.json"), JSON.stringify({ project_id: projectId, blueprint_version_id: id, step7_export_contract: { docx_path: file } }));
  const version = { id, projectId, blueprintJson: { step6_docx: { docx_path: file, sha256: createHash("sha256").update(buffer).digest("hex") } } };
  assert.deepEqual(await readCanonicalStep6Docx(version), buffer);
  await assert.rejects(readCanonicalStep6Docx({ ...version, id: "other-version" }), /version solicitada/);
  await assert.rejects(readCanonicalStep6Docx({ ...version, blueprintJson: { step6_docx: { docx_path: file, sha256: "invalid" } } }), /Integridad DOCX/);
  assert.equal(await readCanonicalStep6Docx({ ...version, blueprintJson: {} }), null);
  await assert.rejects(readCanonicalStep6Docx({ ...version, blueprintJson: { step6_docx: {} } }), /sin DOCX canonico/);
  console.log("PASS B2 canonical download: 5 assertions; exact bytes, version ownership, checksum, no silent fallback.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
