import { copyFile, writeFile } from "node:fs/promises";
import OpenAI from "openai";
import sharp from "sharp";

import type { LlmProvider } from "@/llm/provider";
import type { LlmUsageAttribution } from "@/server/llm-usage-registry";

import { currentApplicationBudget, reservePaidCall } from "./application-budget";
import { deterministicInfographic, HERO_OUTPUT_TOKEN_BOUND } from "./final-infographic";
import { HERO_INFOGRAPHIC_PROMPT_V2 } from "./prompts/hero-infographic.v2";
import { VISUAL_QA_PROMPT } from "./prompts/visual-qa.v1";
import type { ResearchDefinition, ResearchDesign } from "./research-plan-contracts";
import type { MvpStep6HeroImagePlan } from "./step6-blueprint-docx-types";

export type PublicVisualBrief = {
  research_subject: string;
  proposed_method: string;
  visual_relationships: string[];
  permitted_display_labels: string[];
  excluded_internal_metadata: string[];
};

export type VisualQualityResult = {
  pass: boolean;
  relevant: boolean;
  readable: boolean;
  no_internal_identifiers: boolean;
  no_invented_results: boolean;
  no_clipping: boolean;
  matrix_representation: boolean;
  issues: string[];
};

const VISUAL_QA_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    pass: { type: "boolean" }, relevant: { type: "boolean" }, readable: { type: "boolean" },
    no_internal_identifiers: { type: "boolean" }, no_invented_results: { type: "boolean" }, no_clipping: { type: "boolean" },
    matrix_representation: { type: "boolean" }, issues: { type: "array", items: { type: "string" } },
  },
  required: ["pass", "relevant", "readable", "no_internal_identifiers", "no_invented_results", "no_clipping", "matrix_representation", "issues"],
} as const;

export function publicVisualBrief(definition: ResearchDefinition, design: ResearchDesign): PublicVisualBrief {
  return {
    research_subject: `${definition.problem} Unidad, población o corpus propuesto: ${design.unit_population_corpus}`,
    proposed_method: `${design.approach}; ${design.design}; análisis propuesto: ${design.analysis_method}`,
    visual_relationships: [
      ...design.constructs.map((item) => `${item.kind}: ${item.name}`),
      ...definition.hypotheses_or_propositions.map((item) => `Relación propuesta: ${item.text}`),
      `Flujo propuesto: ${design.procedure.join(" → ")}`,
    ].filter(Boolean),
    permitted_display_labels: [],
    excluded_internal_metadata: ["IDs internos", "claves de esquema", "anclas de citas", "rutas", "modelos", "runs"],
  };
}

export async function requestGeneratedImage(input: {
  purpose: string; model: string; prompt: string; outputPath: string;
  size: "1024x1024" | "1536x1024" | "1024x1536"; quality: "high";
}) {
  const budget = currentApplicationBudget();
  if (!budget) throw new Error("IMAGE_BUDGET_REQUIRED");
  const outputBound = input.size === "1024x1024" ? HERO_OUTPUT_TOKEN_BOUND : Math.ceil(HERO_OUTPUT_TOKEN_BOUND * 1.5);
  const reservation = await reservePaidCall(input.purpose, input.model, ((Buffer.byteLength(input.prompt) + 2048) * 5 + outputBound * 30) / 1e6);
  const started = Date.now();
  try {
    const response = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: 180_000 }).images.generate({
      model: input.model, prompt: input.prompt, quality: input.quality, size: input.size, n: 1, output_format: "png",
    });
    const usage = response.usage ?? null;
    const estimatedCost = usage ? (usage.input_tokens * 5 + usage.output_tokens * 30) / 1e6 : null;
    if (usage && estimatedCost !== null) await reservation.complete(estimatedCost, usage); else await reservation.fail();
    const encoded = response.data?.[0]?.b64_json;
    if (!encoded) throw new Error("IMAGE_OUTPUT_MISSING");
    const buffer = Buffer.from(encoded, "base64");
    await sharp(buffer).metadata();
    await writeFile(input.outputPath, buffer);
    return { usage, estimated_cost_usd: estimatedCost, duration_ms: Date.now() - started };
  } catch (error) {
    await reservation.fail();
    throw error;
  }
}

export async function validateVisual(input: {
  provider: LlmProvider; imagePath: string; assetType: "hero_infographic" | "consistency_matrix_image";
  publicBrief: unknown; requiredProperties: string[]; forbiddenExactLabels: string[];
  trackingAttribution?: LlmUsageAttribution;
}) {
  if (!input.provider.generateVisionStructuredObject) throw new Error("VISION_QA_UNAVAILABLE");
  const actualPrompt = `${VISUAL_QA_PROMPT.systemPrompt}\n\n${VISUAL_QA_PROMPT.userPromptTemplate
    .replace("{{asset_type}}", input.assetType)
    .replace("{{public_brief_json}}", JSON.stringify(input.publicBrief))
    .replace("{{required_properties_json}}", JSON.stringify(input.requiredProperties))
    .replace("{{forbidden_exact_labels_json}}", JSON.stringify(input.forbiddenExactLabels))}`;
  return input.provider.generateVisionStructuredObject<VisualQualityResult>({
    prompt: actualPrompt, imagePath: input.imagePath, imageMimeType: "image/png",
    schemaName: "visual_quality_assurance_v1", schema: VISUAL_QA_SCHEMA,
    model: process.env.IMX_VISUAL_QA_MODEL?.trim() || VISUAL_QA_PROMPT.model,
    maxOutputTokens: VISUAL_QA_PROMPT.max_output_tokens, trackingLabel: `${input.assetType}.visual_qa`, trackingAttribution: input.trackingAttribution,
  });
}

function heroPrompt(brief: PublicVisualBrief, repairIssues: string[] = []) {
  const base = `${HERO_INFOGRAPHIC_PROMPT_V2.systemPrompt}\n\n${HERO_INFOGRAPHIC_PROMPT_V2.userPromptTemplate.replace("{{visual_brief_json}}", JSON.stringify(brief))}`;
  return repairIssues.length ? `${base}\n\nREPAIR_REQUIREMENTS: ${JSON.stringify(repairIssues)}. Produce a new corrected image.` : base;
}

export async function generateValidatedHero(input: {
  provider: LlmProvider; definition: ResearchDefinition; design: ResearchDesign; outputPath: string; maxRepairRequests: number; trackingAttribution?: LlmUsageAttribution;
}) {
  const brief = publicVisualBrief(input.definition, input.design);
  const forbidden = [...input.definition.questions.map((item) => item.id), ...input.definition.objectives.map((item) => item.id), ...input.design.constructs.map((item) => item.id)];
  const attempts: Array<{ path: string; prompt: string; usage: unknown; quality: VisualQualityResult | null; error: string | null }> = [];
  let acceptedPath: string | null = null;
  let issues: string[] = [];
  for (let attempt = 0; attempt <= input.maxRepairRequests; attempt += 1) {
    const attemptPath = attempt === 0 ? input.outputPath.replace(/\.png$/i, ".initial.png") : input.outputPath.replace(/\.png$/i, `.repair-${attempt}.png`);
    const actualPrompt = heroPrompt(brief, issues);
    try {
      const usage = await requestGeneratedImage({ purpose: attempt === 0 ? "hero_infographic" : "hero_infographic_repair", model: HERO_INFOGRAPHIC_PROMPT_V2.model, prompt: actualPrompt, outputPath: attemptPath, size: "1024x1024", quality: "high" });
      const quality = await validateVisual({ provider: input.provider, imagePath: attemptPath, assetType: "hero_infographic", publicBrief: brief, requiredProperties: ["relevante", "legible", "sin resultados inventados", "sin identificadores internos", "sin recortes"], forbiddenExactLabels: forbidden, trackingAttribution: input.trackingAttribution });
      attempts.push({ path: attemptPath, prompt: actualPrompt, usage, quality, error: null });
      if (quality.pass && quality.relevant && quality.readable && quality.no_internal_identifiers && quality.no_invented_results && quality.no_clipping) { acceptedPath = attemptPath; break; }
      issues = quality.issues;
    } catch (error) {
      attempts.push({ path: attemptPath, prompt: actualPrompt, usage: null, quality: null, error: error instanceof Error ? error.message : "image_failure" });
      issues = [attempts.at(-1)!.error!];
      if (attempt === 0) break;
    }
  }
  const repairCount = Math.max(0, attempts.length - 1);
  const plan: MvpStep6HeroImagePlan = {
    prompt_version: HERO_INFOGRAPHIC_PROMPT_V2.version, placement: "cover", visual_type: "methodological_infographic_cover",
    prompt: attempts[0]?.prompt ?? heroPrompt(brief), negative_prompt: "Sin metadatos internos, resultados, cifras, logotipos ni texto no autorizado.",
    summary: "Problema y método propuesto", image_path: input.outputPath, image_model: acceptedPath ? HERO_INFOGRAPHIC_PROMPT_V2.model : null,
    status: acceptedPath ? "generated" : "svg_fallback", warnings: acceptedPath ? [] : [`Hero no aceptado: ${issues.join("; ") || "generación/QA fallida"}`],
  };
  if (acceptedPath) await copyFile(acceptedPath, input.outputPath); else await deterministicInfographic(input.outputPath);
  await writeFile(`${input.outputPath}.json`, `${JSON.stringify({ ...plan, public_visual_brief: brief, prompt_registry: HERO_INFOGRAPHIC_PROMPT_V2, vision_prompt_registry: VISUAL_QA_PROMPT, attempts, accepted_path: acceptedPath, repair_requests: repairCount, roles: "Images API single prompt; Responses API user input_text + input_image for QA" }, null, 2)}\n`, "utf8");
  return { plan, brief, attempts, initialRequests: 1, repairRequests: repairCount, accepted: Boolean(acceptedPath) };
}
