import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/server/auth/session";
import { getMvpProjectStatus } from "@/server/mvp/status-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const status = await getMvpProjectStatus(user.id, id);

    return NextResponse.json({ ok: true, data: status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo obtener el estado MVP.";

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "MVP_STATUS_ERROR",
          message,
        },
      },
      { status: 400 },
    );
  }
}
