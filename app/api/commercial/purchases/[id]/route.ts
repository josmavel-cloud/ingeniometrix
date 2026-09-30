import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { purchaseForUser } from "@/server/commercial/purchases";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  try { return NextResponse.json(await purchaseForUser(user.id, (await context.params).id), { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "Compra no encontrada." }, { status: 404 }); }
}
