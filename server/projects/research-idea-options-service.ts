import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { researchIdeaOptionsSchema, validateIdeaOptions } from "@/lib/research-idea-options";
import { getConfiguredLlmProvider } from "@/llm";
import { withPaidOperation } from "@/server/mvp/pre-job-budget";
import { fingerprint } from "@/server/mvp/job-execution-context";
import { resolveAcademicField } from "./topic-area-service";
import { RESEARCH_IDEA_OPTIONS_PROMPT as prompt } from "./prompts/research-idea-options.v1";
export const ideaOptionsInputSchema = z.object({ topicAreaId: z.string().min(1).max(40),
  degreeLevel: z.enum(["PREGRADO", "MAESTRIA", "PROYECTO_INVESTIGACION"]) }).strict();
export async function generateResearchIdeaOptions(userId: string, raw: unknown) {
  const input = ideaOptionsInputSchema.parse(raw);
  const area = await resolveAcademicField({ topicAreaId: input.topicAreaId });
  if (!area?.conceptId) throw new Error("AREA_NOT_IN_CATALOG");
  const identity = fingerprint({ userId, input, promptVersion: prompt.version, taxonomyVersion: area.taxonomyVersion });
  const requestId = `idea-options:${identity}`;
  const result = await withPaidOperation({ userId, requestId, purpose: prompt.id, revision: identity,
    inputs: { input, promptVersion: prompt.version, taxonomyVersion: area.taxonomyVersion } }, async () => {
    const rawResult = await getConfiguredLlmProvider().generateStructuredObject({ maxRetries: 0,
      model: process.env.IMX_INTAKE_MODEL || "gpt-5.4-mini", reasoningEffort: "low", maxOutputTokens: 4000,
      prompt: `${prompt.instructions}\nINPUT_JSON\n${JSON.stringify({ area: area.topicAreaLabel, code: area.topicAreaId, degreeLevel: input.degreeLevel })}`,
      schemaName: "research_idea_options_v1", schema: z.toJSONSchema(researchIdeaOptionsSchema),
      trackingLabel: "research-idea-options.v1", trackingAttribution: { promptVersion: prompt.version },
    });
    return validateIdeaOptions(rawResult);
  });
  const operation = await prisma.paidOperation.findUniqueOrThrow({ where: { userId_requestId: { userId, requestId } } });
  return { ...result, operationId: operation.id };
}
