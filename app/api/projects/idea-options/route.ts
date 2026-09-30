import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/server/auth/session";
import { generateResearchIdeaOptions } from "@/server/projects/research-idea-options-service";
export async function POST(request: Request) {
  const user = await requireCurrentUser();
  try { return NextResponse.json(await generateResearchIdeaOptions(user.id, await request.json())); }
  catch { return NextResponse.json({ error: "No pudimos generar las ideas ahora. Conservamos el área elegida; reintentar no duplica una operación ya realizada." }, { status: 400 }); }
}
