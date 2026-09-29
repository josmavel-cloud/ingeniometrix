import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

// Caller must first authorize this exact project/version; never pick a latest run.
export async function readCanonicalStep6Docx(version: { id: string; projectId: string; blueprintJson: unknown }) {
  const blueprint = version.blueprintJson as { step6_docx?: { docx_path?: string; sha256?: string } };
  const artifact = blueprint.step6_docx;
  if (!artifact) return null; // Existing non-MVP versions retain their exporter.
  if (!artifact.docx_path) throw new Error("Version Step 6 sin DOCX canonico; no se sustituira por un generador alterno.");
  const projectRoot = await realpath(path.join(process.cwd(), "artifacts-local", "mvp-step6-blueprint-docx", version.projectId));
  const docxPath = await realpath(artifact.docx_path);
  if (!docxPath.startsWith(projectRoot + path.sep)) throw new Error("DOCX fuera del proyecto autorizado.");
  const manifest = JSON.parse(await readFile(path.join(path.dirname(docxPath), "step6-blueprint-package.json"), "utf8"));
  if (manifest.project_id !== version.projectId || manifest.blueprint_version_id !== version.id || manifest.step7_export_contract?.docx_path !== artifact.docx_path) throw new Error("DOCX no corresponde a la version solicitada.");
  const buffer = await readFile(docxPath);
  if (artifact.sha256 && createHash("sha256").update(buffer).digest("hex") !== artifact.sha256) throw new Error("Integridad DOCX: el archivo cambio desde su generacion.");
  return buffer;
}
