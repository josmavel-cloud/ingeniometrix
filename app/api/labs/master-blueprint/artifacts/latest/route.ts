import { NextResponse } from "next/server";

import { loadLatestMasterBlueprintLabRun } from "@/server/blueprint-v2/lab/artifact-reader";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const caseName = url.searchParams.get("caseName") || "blueprint-launch-latest";
    const latestRun = await loadLatestMasterBlueprintLabRun({ caseName });

    return NextResponse.json(latestRun);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo cargar el ultimo artifact del laboratorio.",
      },
      { status: 404 },
    );
  }
}
