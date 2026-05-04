import { NextResponse } from "next/server";

import { buildMasterTemplatePlaygroundDocxBuffer } from "@/blueprint_launch/server/master-template-playground";

export async function GET() {
  const { buffer, snapshot } = await buildMasterTemplatePlaygroundDocxBuffer();
  const fileName = `${snapshot.templateKey.toLowerCase()}-resumen.docx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
