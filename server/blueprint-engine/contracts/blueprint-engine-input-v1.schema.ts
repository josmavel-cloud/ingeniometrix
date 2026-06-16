import { z } from "zod";

import { evidenceEngineHandoffV1Schema } from "@/server/blueprint-engine/contracts/evidence-engine-handoff-v1.schema";

export const blueprintEngineStepNumberSchema = z.union([
  z.literal(7),
  z.literal(8),
  z.literal(9),
  z.literal(10),
  z.literal(11),
  z.literal(12),
  z.literal(13),
]);

export const blueprintExecutionModeSchema = z.enum(["full", "resume", "render_only", "dry_run"]);
export const blueprintModelPolicySchema = z.enum(["default", "cost_optimized", "quality_first"]);
export const blueprintCitationStyleSchema = z.enum(["APA7", "ISO690", "VANCOUVER", "IEEE"]);

export const blueprintEngineInputV1Schema = z.object({
  schema_version: z.literal("blueprint_engine_input.v1"),
  run_request: z.object({
    blueprint_run_id: z.string().min(1).optional(),
    project_id: z.string().min(1),
    user_id: z.string().min(1),
    requested_at: z.string().min(1),
    target_steps: z.array(blueprintEngineStepNumberSchema).min(1),
    execution_mode: blueprintExecutionModeSchema,
    language: z.literal("es"),
  }),
  templates: z.object({
    master_template_key: z.literal("MASTER_TEMPLATE_LATAM"),
    master_template_version_id: z.string().min(1),
    institutional_template_key: z.string().nullable().optional(),
    institutional_template_version_id: z.string().nullable().optional(),
    citation_style: blueprintCitationStyleSchema.nullable().optional(),
  }),
  project_context: z.object({
    topic: z.string().min(1),
    problem_context: z.string().nullable(),
    research_line: z.string().nullable(),
    methodology_preference: z.string().nullable(),
    population_or_context: z.string().nullable(),
    constraints: z.string().nullable(),
    degree_level: z.string().min(1),
    university: z.string().nullable(),
    program: z.string().nullable(),
    country_context: z.string().min(1),
  }),
  evidence_handoff: evidenceEngineHandoffV1Schema,
  generation_options: z
    .object({
      allow_llm: z.boolean(),
      require_llm_for_sections: z.boolean(),
      model_policy: blueprintModelPolicySchema,
      use_prompt_cache: z.boolean(),
      reuse_cached_artifacts: z.boolean(),
      max_cost_cad: z.number().nonnegative().nullable().optional(),
      max_runtime_ms: z.number().int().positive().nullable().optional(),
    })
    .optional(),
});

