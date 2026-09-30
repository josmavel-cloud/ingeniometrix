import { PdfUploadError, pdfUploadMessage } from "@/server/storage/pdf-upload-error";
import { receivePdf, transferCors } from "@/server/hybrid/transfers";
export const runtime = "nodejs";
export async function OPTIONS(request: Request) {
  const headers = transferCors(request);
  return new Response(null, { status: headers ? 204 : 403, headers: headers || {} });
}
export async function PUT(request: Request) {
  const headers = transferCors(request);
  if (!headers) return Response.json({ error: "ORIGIN_DENIED" }, { status: 403 });
  if (!request.body || request.headers.get("content-type") !== "application/pdf") return Response.json({ error: "INVALID_PDF" }, { status: 400, headers });
  try { return Response.json(await receivePdf(request.headers.get("authorization")?.replace(/^Bearer /, "") || "", request.body), { headers }); }
  catch (error) {
    const unauthorized = error instanceof Error && error.message === "UNAUTHORIZED";
    return Response.json({ error: unauthorized ? "La autorización de carga venció. Vuelve a seleccionar el PDF." :
      pdfUploadMessage(error instanceof PdfUploadError ? error.category : "OTHER_SAFE_CATEGORY") },
      { status: unauthorized ? 401 : 400, headers });
  }
}
