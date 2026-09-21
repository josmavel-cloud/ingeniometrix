import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, rename } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { pageBudgetPolicy } from "./execution-policy";
const exec = promisify(execFile);

export async function exportPlanPdf(docxPath: string, pdfPath: string) {
  const directory = path.dirname(pdfPath);
  await mkdir(directory, { recursive: true });
  const profile = await mkdtemp(path.join(directory, ".libreoffice-profile-"));
  await exec(process.env.IMX_LIBREOFFICE_BIN ?? "libreoffice", [`-env:UserInstallation=${pathToFileURL(profile).href}`, "--headless", "--convert-to", "pdf:writer_pdf_Export", "--outdir", directory, docxPath], { timeout: 120000, maxBuffer: 2 * 1024 * 1024 });
  const generated = path.join(directory, path.basename(docxPath, ".docx") + ".pdf");
  if (generated !== pdfPath) await rename(generated, pdfPath);
  const buffer = await readFile(pdfPath);
  if (buffer.subarray(0, 5).toString() !== "%PDF-") throw new Error("PDF_EXPORT_INVALID");
  const { stdout } = await exec("pdftotext", ["-layout", pdfPath, "-"], { timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
  const pages = stdout.split("\f").filter((page) => page.trim());
  const referencesPage = pages.findIndex((page, i) => i > 0 && /^\s*\d*\.?\s*Referencias\s*$/m.test(page));
  const bodyPages = referencesPage >= 0 ? referencesPage - 1 : null; // Separate cover and references sections.
  const policy = pageBudgetPolicy(bodyPages);
  // Render success and editorial length are separate outcomes. Even guard violations
  // retain the PDF for targeted rendering review, never scientific regeneration.
  const result = { pdf_path: pdfPath, page_count: pages.length, body_pages: bodyPages, hard_max_body_pages: policy.guard, soft_max_body_pages: policy.soft, page_budget_pass: policy.status === "PASS", page_budget_status: policy.status, warnings: policy.status === "PASS" ? [] : [`PDF_${policy.status}: ${bodyPages ?? "unknown"} body pages`], text: stdout, rendered_with: "LibreOffice DOCX -> PDF" };
  return result;
}
