import { getCurrentUser } from "@/server/auth/session";
import { ownedPageData } from "@/server/hybrid/page-data";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ segments: string[] }> }) {
  const { segments } = await context.params;
  const headers = { "Cache-Control": "private, no-store" };
  if (segments.length > 2) return Response.json({ error: "Not found" }, { status: 404, headers });
  const [kind, id] = segments;
  const user = await getCurrentUser();
  if (kind === "session" && !id) return Response.json(user ? { id: user.id, name: user.name, email: user.email } : null, { headers });
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  const result = await ownedPageData(user.id, kind, id);
  return Response.json(result ?? { error: "Not found" }, { status: result === null ? 404 : 200, headers });
}
