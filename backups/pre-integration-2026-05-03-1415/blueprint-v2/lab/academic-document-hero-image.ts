import { mkdir, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

import OpenAI from "openai";

import type { AcademicDocument } from "@/server/blueprint-v2/lab/academic-document-model";

const DEFAULT_IMAGE_MODEL = "gpt-image-2";

function resolveImageModel() {
  return process.env.OPENAI_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
}

function hasOpenAiKey() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function imageFileName(document: AcademicDocument) {
  const promptHash = createHash("sha256")
    .update(document.layout_plan.cover_visual.prompt)
    .digest("hex")
    .slice(0, 12);
  return document.variant === "master"
    ? `cover-hero-master-${promptHash}.png`
    : `cover-hero-university-${promptHash}.png`;
}

function withCoverWarning(document: AcademicDocument, warning: string): AcademicDocument {
  return {
    ...document,
    layout_plan: {
      ...document.layout_plan,
      cover_visual: {
        ...document.layout_plan.cover_visual,
        image_generation_status: "skipped",
        image_generation_warnings: Array.from(
          new Set([...document.layout_plan.cover_visual.image_generation_warnings, warning]),
        ),
      },
      warnings: Array.from(new Set([...document.layout_plan.warnings, warning])),
    },
    warnings: Array.from(new Set([...document.warnings, warning])),
  };
}

export async function applyAcademicHeroImageGeneration(input: {
  document: AcademicDocument;
  runDir: string;
}): Promise<AcademicDocument> {
  const outputPath = path.join(input.runDir, imageFileName(input.document));
  try {
    const stats = await stat(outputPath);
    if (stats.size > 20_000) {
      return {
        ...input.document,
        layout_plan: {
          ...input.document.layout_plan,
          cover_visual: {
            ...input.document.layout_plan.cover_visual,
            image_path: outputPath,
            image_model: input.document.layout_plan.cover_visual.image_model ?? resolveImageModel(),
            image_generation_status: "generated",
          },
        },
      };
    }
  } catch {
    // No reusable hero image in this run directory.
  }

  if (!hasOpenAiKey()) {
    return withCoverWarning(
      input.document,
      "No se genero hero image con IA porque OPENAI_API_KEY no esta disponible; se usara SVG deterministico.",
    );
  }

  const model = resolveImageModel();
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const response = await client.images.generate({
      model,
      prompt: `${input.document.layout_plan.cover_visual.prompt}\n\nRestricciones negativas: ${input.document.layout_plan.cover_visual.negative_prompt}`,
      size: "1024x1536",
      quality: "medium",
      background: "opaque",
      output_format: "png",
      n: 1,
    } as never);
    const firstImage = response.data?.[0] as { b64_json?: string } | undefined;
    const b64 = firstImage?.b64_json;

    if (!b64) {
      throw new Error("La API de imagenes no devolvio b64_json.");
    }

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, Buffer.from(b64, "base64"));

    return {
      ...input.document,
      layout_plan: {
        ...input.document.layout_plan,
        cover_visual: {
          ...input.document.layout_plan.cover_visual,
          image_path: outputPath,
          image_model: model,
          image_generation_status: "generated",
          image_generation_warnings: input.document.layout_plan.cover_visual.image_generation_warnings,
        },
      },
    };
  } catch (error) {
    const warning = `No se pudo generar hero image con ${model}; se usara SVG deterministico: ${
      error instanceof Error ? error.message : "error desconocido"
    }`;

    return {
      ...withCoverWarning(input.document, warning),
      layout_plan: {
        ...input.document.layout_plan,
        cover_visual: {
          ...input.document.layout_plan.cover_visual,
          image_model: model,
          image_generation_status: "failed",
          image_generation_warnings: Array.from(
            new Set([
              ...input.document.layout_plan.cover_visual.image_generation_warnings,
              warning,
            ]),
          ),
        },
        warnings: Array.from(new Set([...input.document.layout_plan.warnings, warning])),
      },
      warnings: Array.from(new Set([...input.document.warnings, warning])),
    };
  }
}
