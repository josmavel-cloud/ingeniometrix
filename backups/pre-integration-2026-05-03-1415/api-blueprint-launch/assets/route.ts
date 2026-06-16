import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

const ARTIFACTS_ROOT = path.resolve(process.cwd(), "artifacts-local");

function getMimeType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".png") {
    return "image/png";
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }
  if (extension === ".webp") {
    return "image/webp";
  }

  return "application/octet-stream";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const requestedPath = url.searchParams.get("path");

    if (!requestedPath) {
      throw new Error("Falta path del asset.");
    }

    const resolvedPath = path.resolve(requestedPath);
    if (!resolvedPath.startsWith(ARTIFACTS_ROOT)) {
      throw new Error("Asset fuera de artifacts-local.");
    }

    const file = await readFile(resolvedPath);

    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": getMimeType(resolvedPath),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo cargar el asset.";

    return NextResponse.json({ error: message }, { status: 404 });
  }
}
