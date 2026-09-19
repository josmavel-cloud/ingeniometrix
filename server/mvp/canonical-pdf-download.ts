import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { readCanonicalStep6Docx } from "./canonical-docx-download";

// Authorization is performed by the caller, exactly as for the existing DOCX route.
export async function readCanonicalStep6Pdf(version: { id: string; projectId: string; blueprintJson: unknown }) {
  await readCanonicalStep6Docx(version); // Same project, version and immutable manifest.
  const artifact = (version.blueprintJson as { step6_docx?: { docx_path?: string; pdf_path?: string; pdf_sha256?: string } }).step6_docx;
  if (!artifact?.pdf_path || !artifact.docx_path || !artifact.pdf_sha256) throw new Error("Version sin PDF canonico verificado.");
  const root = await realpath(path.dirname(artifact.docx_path));
  const pdf = await realpath(artifact.pdf_path);
  if (path.dirname(pdf) !== root) throw new Error("PDF fuera de la version autorizada.");
  const buffer = await readFile(pdf);
  if (buffer.subarray(0, 5).toString() !== "%PDF-" || createHash("sha256").update(buffer).digest("hex") !== artifact.pdf_sha256) throw new Error("Integridad PDF: contenido distinto de la version solicitada.");
  return buffer;
}
