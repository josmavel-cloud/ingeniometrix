import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

const ARTIFACTS_ROOT = path.resolve(path.join(process.cwd(), "artifacts-local"));
const ALLOWED_PREFIXES = [
  path.join(ARTIFACTS_ROOT, "blueprint_launch", "extracted_assets"),
  path.join(ARTIFACTS_ROOT, "master-blueprint-engine"),
];

function resolveMimeType(filePath: string, fallback: string | null) {
  if (fallback) {
    return fallback;
  }

  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".svg":
      return "image/svg+xml";
    case ".txt":
      return "text/plain; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const assetPath = searchParams.get("path");
  const mimeType = searchParams.get("mimeType");

  if (!assetPath) {
    return NextResponse.json({ error: "Falta path del asset del lab." }, { status: 400 });
  }

  const resolvedPath = path.resolve(assetPath);
  const isAllowed = ALLOWED_PREFIXES.some((prefix) => resolvedPath.startsWith(path.resolve(prefix)));

  if (!resolvedPath.startsWith(ARTIFACTS_ROOT) || !isAllowed) {
    return NextResponse.json({ error: "Ruta de asset fuera del laboratorio." }, { status: 400 });
  }

  try {
    const fileBuffer = await readFile(resolvedPath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": resolveMimeType(resolvedPath, mimeType),
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "No se encontro el asset solicitado en el lab." }, { status: 404 });
  }
}
