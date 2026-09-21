import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import OpenAI from "openai";
import sharp from "sharp";
import { currentApplicationBudget, reservePaidCall } from "./application-budget";
import { HERO_INFOGRAPHIC_PROMPT as prompt } from "./prompts/hero-infographic.v1";
import type { MvpStep6HeroImagePlan } from "./step6-blueprint-docx-types";
import type { ResearchDefinition, ResearchDesign } from "./research-plan-contracts";

export function infographicContext(definition: ResearchDefinition, design: ResearchDesign) {
  return { problem: definition.problem, subject: design.unit_population_corpus,
    constructs: design.constructs.map(({ name, kind, operational_definition }) => ({ name, kind, operational_definition })),
    methodology: design.design, comparison: definition.hypotheses_or_propositions.map((h) => h.text), analysis_workflow: design.analysis_method };
}
export function infographicFingerprint(definition: ResearchDefinition, design: ResearchDesign, title: string) {
  return createHash("sha256").update(JSON.stringify({ context: infographicContext(definition, design), title })).digest("hex");
}

// Official image-token calculator: GPT Image 2.5, high, 1024 square = 1756 output tokens.
// https://developers.openai.com/api/docs/guides/image-generation
export const HERO_OUTPUT_TOKEN_BOUND = Math.ceil(48 * 48 * (2_000_000 + 1024 * 1024) / 4_000_000);
export async function deterministicInfographic(outputPath: string) {
  const labels = ["Problema", "Preguntas", "Evidencia", "Método", "Análisis propuesto"];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="white"/>${labels.map((label, i) => `<rect x="180" y="${95 + i * 170}" width="664" height="110" rx="16" fill="${i % 2 ? "#edf4f2" : "#d4e5e1"}"/><text x="512" y="${162 + i * 170}" text-anchor="middle" font-family="sans-serif" font-size="30" fill="#243c3a">${label}</text>${i < 4 ? `<path d="M512 ${212 + i * 170}v42m-9-9 9 9 9-9" fill="none" stroke="#467269" stroke-width="4"/>` : ""}`).join("")}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(outputPath);
}
export async function generateFinalInfographic(context: unknown, outputPath: string): Promise<MvpStep6HeroImagePlan> {
  const actualPrompt = `${prompt.systemPrompt}\n\n${prompt.userPromptTemplate.replace("{{context_json}}", JSON.stringify(context))}`;
  const plan: MvpStep6HeroImagePlan = { prompt_version: prompt.version, placement: "cover", visual_type: "methodological_infographic_cover", prompt: actualPrompt, negative_prompt: "", summary: "Relaciones conceptuales y metodo propuesto", image_path: outputPath, image_model: prompt.model, status: "generated", warnings: [] };
  let reservation: Awaited<ReturnType<typeof reservePaidCall>> | undefined;
  let usage: unknown = null, estimatedCost: number | null = null;
  const started = Date.now();
  try {
    const budget = currentApplicationBudget();
    if (!budget) throw new Error("IMAGE_BUDGET_REQUIRED");
    // UTF-8 bytes conservatively bound input tokens; no input images, one non-streaming output.
    reservation = await reservePaidCall("hero_infographic", prompt.model, ((Buffer.byteLength(actualPrompt) + 2048) * 5 + HERO_OUTPUT_TOKEN_BOUND * 30) / 1e6);
    const response = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: 180_000 }).images.generate({ model: prompt.model, prompt: actualPrompt, quality: "high", size: "1024x1024", n: 1, output_format: "png" });
    usage = response.usage ?? null;
    if (response.usage) {
      estimatedCost = (response.usage.input_tokens * 5 + response.usage.output_tokens * 30) / 1e6;
      await reservation.complete(estimatedCost, response.usage);
    } else await reservation.fail();
    const encoded = response.data?.[0]?.b64_json;
    if (!encoded) throw new Error("IMAGE_OUTPUT_MISSING");
    const buffer = Buffer.from(encoded, "base64");
    await sharp(buffer).metadata();
    await writeFile(outputPath, buffer);
  } catch (error) {
    await reservation?.fail();
    plan.status = "svg_fallback"; plan.image_model = null;
    plan.warnings.push(`Infografia determinista: ${error instanceof Error ? error.message : "image_failure"}`);
    await deterministicInfographic(outputPath);
  }
  await writeFile(`${outputPath}.json`, JSON.stringify({ ...plan, configured_model: prompt.model, actual_model: plan.image_model, prompt_registry: prompt, usage, estimated_cost_usd: estimatedCost, duration_ms: Date.now() - started, retry_policy: "none", parameters: { size: "1024x1024", quality: "high", n: 1 }, roles: "Images API single prompt" }, null, 2));
  return plan;
}
