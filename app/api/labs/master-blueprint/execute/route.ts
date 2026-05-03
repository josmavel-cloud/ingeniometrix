import { NextResponse } from "next/server";

import { loadMasterBlueprintLabFixtureSet } from "@/server/blueprint-v2/lab/fixture-loader";
import { runMasterBlueprintLabThroughStep } from "@/server/blueprint-v2/lab/pipeline";
import type { MasterBlueprintLabStepKey } from "@/lib/labs/master-blueprint/types";

type ExecuteRequestBody = {
  caseName?: string;
  throughStep?: MasterBlueprintLabStepKey;
  allowLlm?: boolean;
};

export async function POST(request: Request) {
  const previousProvider = process.env.LLM_PROVIDER;

  try {
    const body = (await request.json()) as ExecuteRequestBody;

    if (body.allowLlm === false) {
      process.env.LLM_PROVIDER = "lab-disabled";
    }

    const fixtures = await loadMasterBlueprintLabFixtureSet({
      caseName: body.caseName || "blueprint-launch-latest",
    });
    const execution = await runMasterBlueprintLabThroughStep({
      fixtures,
      throughStep: body.throughStep || "prompt_planning",
      allowLlm: body.allowLlm ?? true,
    });

    return NextResponse.json(execution);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo ejecutar el laboratorio del MasterBlueprintEngine.",
      },
      { status: 500 },
    );
  } finally {
    if (previousProvider === undefined) {
      delete process.env.LLM_PROVIDER;
    } else {
      process.env.LLM_PROVIDER = previousProvider;
    }
  }
}
