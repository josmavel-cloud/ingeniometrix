import assert from "node:assert/strict";
import { scientificCompositionForecast, generateAdmittedScientificComposition } from "../server/mvp/scientific-composition-admission";
import type { LlmProvider, StructuredObjectInput } from "../llm/provider";
import { responseCostBound } from "../llm/providers/openai-cost-bound";

async function main() {
  global.fetch = async () => { throw new Error("No network in composition admission regression"); };
  const fullPassage = "Un pasaje completo mantiene contexto, limitaciones y localizadores científicos sin truncar. ".repeat(900);
  const request: StructuredObjectInput = { prompt: JSON.stringify({ evidence: [{ source_id: "S1", evidence_id: "E1", excerpt: fullPassage }], method_coverage: "contexto completo" }),
    schemaName: "b3_methodology", model: "gpt-5.4", maxOutputTokens: 6500,
    schema: { type: "object", properties: { result: { type: "string" } }, required: ["result"], additionalProperties: false } };
  let creates = 0, counted: StructuredObjectInput | null = null;
  const provider = { name: "offline", estimateStructuredRequest: async (value: StructuredObjectInput) => {
    counted = value; return responseCostBound({ model: value.model, max_output_tokens: value.maxOutputTokens }, 12000)!;
  }, generateStructuredObject: async <T>(value: StructuredObjectInput) => { creates++; assert.equal(value.prompt, request.prompt); return { result: "fixture" } as T; } } as unknown as LlmProvider;
  const forecast = await scientificCompositionForecast({ provider, request, minimumRemainingMandatoryReservation: 0.3 });
  assert.ok(forecast.promptBytesDiagnostic > 60000);
  assert.equal(forecast.contextAdmissible, true);
  assert.equal(forecast.inputTokens, 12000);
  assert.equal(forecast.tokenCountProvenance, "EXACT_PROVIDER_COUNT");
  assert.equal(counted, request, "Count includes the exact request, including output schema");
  assert.equal(creates, 0, "Non-generative counting is not a scientific dispatch");
  await generateAdmittedScientificComposition({ provider, request, projectId: "synthetic", runId: "run", minimumRemainingMandatoryReservation: 0.3 });
  assert.equal(creates, 1, "A complete valid context above the previous byte guard reaches the provider once");
  const oversized = { ...provider, estimateStructuredRequest: async () => responseCostBound({ model: "gpt-5.4", max_output_tokens: 6500 }, 62000)! } as LlmProvider;
  await assert.rejects(() => generateAdmittedScientificComposition({ provider: oversized, request, projectId: "synthetic", runId: "run", minimumRemainingMandatoryReservation: 0.3 }), /CONTEXT_UNSAFE/);
  assert.equal(creates, 1, "Token context rejection occurs before dispatch");
  const fallback = { ...provider, estimateStructuredRequest: undefined } as LlmProvider;
  const shortRequest = { ...request, prompt: "Contexto científico breve" };
  const estimated = await scientificCompositionForecast({ provider: fallback, request: shortRequest, minimumRemainingMandatoryReservation: 0 });
  assert.equal(estimated.tokenCountProvenance, "LEGACY_CONSERVATIVE_BOUND");
  const schemaHeavy = { ...shortRequest, schema: { ...shortRequest.schema, description: "Required scientific output contract. ".repeat(2000) } };
  const schemaBound = await scientificCompositionForecast({ provider: fallback, request: schemaHeavy, minimumRemainingMandatoryReservation: 0 });
  assert.ok(schemaBound.inputTokens > estimated.inputTokens + 60000, "Conservative bound includes schema overhead, not only prompt bytes");
  assert.equal(schemaBound.contextAdmissible, false);
  assert.ok(estimated.inputTokens > Buffer.byteLength(shortRequest.prompt));
  await assert.rejects(() => scientificCompositionForecast({ provider, request: { ...request, maxOutputTokens: 0 }, minimumRemainingMandatoryReservation: 0 }), /FORECAST_INVALID/);
  await assert.rejects(() => scientificCompositionForecast({ provider, request, minimumRemainingMandatoryReservation: Number.NaN }), /FORECAST_INVALID/);
  assert.equal(fullPassage, JSON.parse(request.prompt).evidence[0].excerpt, "No passage, pointer or schema is truncated");
  console.log("Scientific composition admission: PASS (18 checks, no providers or DB; bytes diagnostic, full request tokens authoritative).");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
