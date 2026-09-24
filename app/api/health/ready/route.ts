import { prisma } from "@/lib/prisma";
import { access, constants } from "node:fs/promises";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await access(process.env.IMX_PRIVATE_STORAGE_ROOT || "artifacts-local", constants.R_OK | constants.W_OK);
    return Response.json({ status: "ready" }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
