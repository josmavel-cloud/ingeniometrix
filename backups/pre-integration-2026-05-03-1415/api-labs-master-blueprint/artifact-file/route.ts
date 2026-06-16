import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const LAB_RUN_ROOT = path.join(
  process.cwd(),
  "artifacts-local",
  "blueprint-v2-lab",
  "steps-5-11",
);

const ALLOWED_FILES = new Map([
  ["master_docx", "12-master-docx-preview.docx"],
  ["university_docx", "13-university-docx-preview.docx"],
  ["master_academic_model", "115-master-academic-document-model.json"],
  ["master_manifest", "120-master-docx-manifest.json"],
  ["master_qa", "121-master-docx-qa-report.json"],
  ["university_blueprint", "70-university-blueprint.json"],
  ["university_reduction_plan", "71-university-reduction-plan.json"],
  ["university_academic_model", "135-university-academic-document-model.json"],
  ["university_manifest", "130-university-docx-manifest.json"],
  ["university_qa", "131-university-docx-qa-report.json"],
]);

async function getLatestRunDir(caseName: string) {
  const caseDir = path.join(LAB_RUN_ROOT, caseName);
  const entries = await readdir(caseDir, { withFileTypes: true });
  const dirs = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const fullPath = path.join(caseDir, entry.name);
        const stats = await stat(fullPath);
        return {
          name: entry.name,
          fullPath,
          mtimeMs: stats.mtimeMs,
        };
      }),
  );
  const latest = dirs
    .sort((left, right) => right.name.localeCompare(left.name) || right.mtimeMs - left.mtimeMs)
    .at(0);

  if (!latest) {
    throw new Error(`No hay runs locales para el caso ${caseName}.`);
  }

  return latest.fullPath;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const caseName = url.searchParams.get("caseName") || "blueprint-launch-latest";
    const kind = url.searchParams.get("kind") || "";
    const fileName = ALLOWED_FILES.get(kind);

    if (!fileName) {
      return NextResponse.json({ error: "Archivo de artifact no permitido." }, { status: 400 });
    }

    const runDir = await getLatestRunDir(caseName);
    const filePath = path.resolve(runDir, fileName);
    const resolvedRunDir = path.resolve(runDir);

    if (!filePath.startsWith(resolvedRunDir)) {
      return NextResponse.json({ error: "Ruta de artifact invalida." }, { status: 400 });
    }

    const bytes = await readFile(filePath);
    const isDocx = fileName.endsWith(".docx");

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": isDocx
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo cargar el archivo del artifact.",
      },
      { status: 404 },
    );
  }
}
