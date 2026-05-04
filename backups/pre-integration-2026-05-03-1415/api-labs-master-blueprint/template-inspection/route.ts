import { NextResponse } from "next/server";

import { loadMasterBlueprintLabFixtureSet } from "@/server/blueprint-v2/lab/fixture-loader";
import { buildTemplateQualityContractArtifact } from "@/server/blueprint-v2/lab/template-quality-contract";
import { buildTemplateRuntimeInspectionArtifact } from "@/server/blueprint-v2/lab/template-runtime-inspector";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const caseName = url.searchParams.get("caseName") || "blueprint-launch-latest";
    const fixtures = await loadMasterBlueprintLabFixtureSet({ caseName });
    const inspection = await buildTemplateRuntimeInspectionArtifact(fixtures);
    const qualityContract = buildTemplateQualityContractArtifact(inspection);

    return NextResponse.json({
      inspection,
      qualityContract,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo inspeccionar el runtime de templates.",
      },
      { status: 500 },
    );
  }
}
