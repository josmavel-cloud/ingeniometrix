import { NextResponse } from "next/server";

import { listCandidateRuns } from "@/app/api/labs/evidence-source-selection/_shared";

export async function GET() {
  try {
    const runs = await listCandidateRuns();

    return NextResponse.json({ runs });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron listar los runs de seleccion de fuentes.",
      },
      { status: 500 },
    );
  }
}

