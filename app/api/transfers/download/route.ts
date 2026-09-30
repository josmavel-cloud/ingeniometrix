import { consumeTransfer } from "@/server/hybrid/transfers";
import { prisma } from "@/lib/prisma";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const grant = await consumeTransfer(new URL(request.url).searchParams.get("token") || "", "DOWNLOAD");
    const artifact = await prisma.generatedArtifact.findFirst({ where: { id: grant.artifactId!, projectId: grant.projectId, userId: grant.userId } });
    if (!artifact) return new Response(null, { status: 404 });
    return new Response(Buffer.from(artifact.content), { headers: { "Content-Type": artifact.mimeType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(artifact.fileName)}`,
      "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } });
  } catch { return new Response(null, { status: 401, headers: { "Cache-Control": "no-store" } }); }
}
