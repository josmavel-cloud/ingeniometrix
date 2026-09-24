import { cookies } from "next/headers";
import { authorizeTransfer } from "./transfers";
import { prisma } from "@/lib/prisma";
export async function directArtifactDownload(userId: string, projectId: string, versionId: string, kind: "BLUEPRINT_DOCX" | "BLUEPRINT_PDF") {
  if (process.env.IMX_HYBRID_TRANSFERS !== "1") return null;
  const artifact = await prisma.generatedArtifact.findFirst({ where: { userId, projectId, blueprintVersionId: versionId, kind }, select: { id: true } });
  // Do not render historical artifacts on Vercel or pretend a missing artifact exists.
  if (!artifact) return Response.json({ error: "ARTIFACT_NOT_READY" }, { status: 409 });
  const grant = await authorizeTransfer((await cookies()).get("imx_session")?.value || "", { purpose: "DOWNLOAD", projectId, artifactId: artifact.id });
  return new Response(null, { status: 302, headers: { Location: `${grant.url}?token=${encodeURIComponent(grant.token)}`, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
