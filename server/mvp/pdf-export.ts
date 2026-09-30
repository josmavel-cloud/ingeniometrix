import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, rename } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { assessRenderSanity, pageBudgetPolicy } from "./execution-policy";
const exec = promisify(execFile);

export async function exportPlanPdf(docxPath: string, pdfPath: string, options: { templateHardMaxBodyPages?: number | null; expectedBodyPages?: number | null; targetMinBodyPages?: number; targetMaxBodyPages?: number; softMaxBodyPages?: number } = {}) {
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
  const bodyPageTexts = referencesPage >= 0 ? pages.slice(1, referencesPage) : [];
  const sanity = assessRenderSanity({ bodyPages, bodyPageTexts, expectedBodyPages: options.expectedBodyPages });
  const policy = pageBudgetPolicy(bodyPages, { templateHardMaxBodyPages: options.templateHardMaxBodyPages, renderSanity: sanity, targetMinBodyPages: options.targetMinBodyPages, targetMaxBodyPages: options.targetMaxBodyPages, softMaxBodyPages: options.softMaxBodyPages });
  const warnings = policy.status === "ABOVE_SOFT_MAX"
    ? ["El plan supera la extensión objetivo. Puedes ajustarlo posteriormente según los requisitos específicos de tu universidad."]
    : policy.status === "TEMPLATE_LIMIT_EXCEEDED"
      ? ["El plan supera el máximo definido por la plantilla institucional y requiere ajuste antes de publicarse."]
      : policy.status === "RENDER_SANITY_FAILURE" || policy.status === "UNMEASURED"
        ? [`La exportación requiere revisión técnica: ${policy.renderSanity.reasons.join(", ") || "no se pudo medir la extensión"}.`]
        : [];
  const result = { pdf_path: pdfPath, page_count: pages.length, body_pages: bodyPages, target_body_pages: policy.target, template_hard_max_body_pages: policy.templateHardMax, hard_max_body_pages: policy.templateHardMax, soft_max_body_pages: policy.soft, length_status: policy.status, publication_allowed: policy.publicationAllowed, render_sanity_status: policy.renderSanity.status, render_sanity_reasons: policy.renderSanity.reasons, render_sanity_emergency_max_body_pages: policy.renderSanity.emergencyMaxBodyPages, page_budget_pass: policy.publicationAllowed, page_budget_status: policy.status, warnings, text: stdout, rendered_with: "LibreOffice DOCX -> PDF" };
  return result;
}
