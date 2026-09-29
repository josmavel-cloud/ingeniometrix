import { mkdir, readFile, readdir, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { buildBlueprintJson, renderDocx, restoreUncompactedDrafts } from "@/server/mvp/step6-blueprint-docx-service";
import { buildEvidenceLog, extractExportReferences, renderBibtex, renderRis } from "@/server/blueprint/blueprint-export";

async function main() {
  const db = new URL(process.env.DATABASE_URL_UNPOOLED ?? "");
  if (db.hostname !== "127.0.0.1" || db.port !== "55434" || db.pathname !== "/imx_b1") throw new Error("Isolated B2 DB only");
  const dir = path.resolve(process.argv[2]);
  const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8"));
  const report = await readJson(path.join(dir, "case-result.json"));
  const original = await prisma.blueprintVersion.findUniqueOrThrow({ where: { id: report.blueprint_version_id } });
  const project = await prisma.project.findUniqueOrThrow({ where: { id: report.project_id }, include: { intake: true, projectReferences: { where: { selected: true }, include: { reference: true } }, blueprintVersions: { select: { versionNumber: true } } } });
  const ledger = await readJson(report.artifacts.evidence_ledger);
  const originalPackagePath = path.join(process.cwd(), "artifacts-local", "mvp-step6-blueprint-docx", project.id, `${report.run_id}-step6`, "step6-blueprint-package.json");
  const pkg = await readJson(originalPackagePath);
  const outputs = [];
  for (const file of await readdir(path.join(dir, "provider-calls"))) {
    const call = await readJson(path.join(dir, "provider-calls", file));
    if (call.request.text?.format?.name === "mvp_step6_section_draft" && call.response.status === "completed") outputs.push(JSON.parse(call.response.output_text));
  }
  if (outputs.length !== 12) throw new Error(`Expected 12 genuine section outputs; found ${outputs.length}`);
  const versionNumber = Math.max(...project.blueprintVersions.map((item) => item.versionNumber)) + 1;
  const repairDir = path.join(path.dirname(originalPackagePath), `export-repair-v${versionNumber}`);
  await mkdir(repairDir, { recursive: true });
  pkg.section_drafts = restoreUncompactedDrafts(pkg, outputs, ledger, project);
  pkg.citation_coordinate_plan = pkg.section_drafts.flatMap((draft: any) => draft.citation_anchors);
  pkg.editorial_report = { ...pkg.editorial_report, status: "skipped", revised_section_count: 0, warnings: ["La revision editorial ejecutada se conserva en registros, pero esta exportacion usa las secciones originales completas para conservar la procedencia."] };
  pkg.step7_export_contract.docx_path = path.join(repairDir, "thesis-plan.docx");
  pkg.export_repair = { source_blueprint_version_id: original.id, source_package_path: originalPackagePath, new_llm_calls: 0, reason: "Remove word-budget deletion and shifted paragraph anchors; restore exact B2 section output before editorial rewriting." };
  pkg.coherence_report = { ...pkg.coherence_report, warnings: [...pkg.coherence_report.warnings, "Version de exportacion reparada deterministicamente; ver validacion textual y revision cientifica B2."] };
  await renderDocx({ project, package: pkg, outputPath: pkg.step7_export_contract.docx_path });
  const version = await prisma.blueprintVersion.create({ data: {
    projectId: project.id, versionNumber,
    model: original.model, promptVersion: original.promptVersion,
    intakeSnapshotJson: original.intakeSnapshotJson as any, selectedReferencesSnapshotJson: original.selectedReferencesSnapshotJson as any,
    blueprintJson: buildBlueprintJson({ project, package: pkg, ledger }) as any, coherenceReportJson: pkg.coherence_report,
  } });
  pkg.blueprint_version_id = version.id;
  pkg.step7_export_contract.blueprint_version_id = version.id;
  const packagePath = path.join(repairDir, "step6-blueprint-package.json");
  await writeFile(packagePath, JSON.stringify(pkg, null, 2));
  const repairedDocx = path.join(dir, `thesis-plan-complete-v${versionNumber}.docx`);
  await copyFile(pkg.step7_export_contract.docx_path, repairedDocx);
  await writeFile(path.join(dir, `case-result-before-v${versionNumber}.json`), JSON.stringify(report, null, 2));
  report.previous_blueprint_version_id = original.id;
  report.blueprint_version_id = version.id;
  report.canonical_package_path = packagePath;
  report.artifacts.docx = repairedDocx;
  report.artifacts.evidence_log = path.join(dir, `evidence_log-complete-v${versionNumber}.json`);
  report.artifacts.bibtex = path.join(dir, `references-complete-v${versionNumber}.bib`);
  report.artifacts.ris = path.join(dir, `references-complete-v${versionNumber}.ris`);
  report.continuity.blueprint_version_id = version.id;
  const references = extractExportReferences(version);
  await writeFile(report.artifacts.evidence_log, JSON.stringify(buildEvidenceLog(version), null, 2));
  await writeFile(report.artifacts.bibtex, renderBibtex(references));
  await writeFile(report.artifacts.ris, renderRis(references));
  await writeFile(path.join(dir, "case-result.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ version: version.id, docx: repairedDocx, provider_calls: 0 }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
