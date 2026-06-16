import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

function isSafeSegment(value: string | null) {
  return Boolean(value && /^[a-zA-Z0-9._-]+$/.test(value));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId");
  const fileName = searchParams.get("fileName");

  if (!runId || !fileName || !isSafeSegment(runId) || !isSafeSegment(fileName) || !fileName.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Parametros invalidos para abrir el PDF del lab." }, { status: 400 });
  }
  const safeRunId = runId;
  const safeFileName = fileName;

  const rootDir = path.join(process.cwd(), "artifacts-local", "master-blueprint-engine");
  const targetPath = path.resolve(rootDir, safeRunId, "pdfs", safeFileName);

  if (!targetPath.startsWith(path.resolve(rootDir))) {
    return NextResponse.json({ error: "Ruta de PDF fuera del laboratorio." }, { status: 400 });
  }

  try {
    const fileBuffer = await readFile(targetPath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${safeFileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "No se encontro el PDF solicitado en el lab." }, { status: 404 });
  }
}
