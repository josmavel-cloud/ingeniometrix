// Operator-only, same-response retrieval. This script never creates a response
// and never prints scientific output or the API key.
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { estimateResponseUsageCost } from "@/llm/providers/openai-cost-bound";
import { reconcileBackgroundJobUsage, recordRetrievedBackgroundResponse,
  type BackgroundProviderResponseRecord } from "@/server/mvp/job-execution-context";

const jobId = process.argv[2] ?? "";
const logicalAttemptKey = process.argv[3] ?? "";
if (!/^[0-9a-f-]{36}$/i.test(jobId) || !/^[a-f0-9]{64}$/.test(logicalAttemptKey))
  throw new Error("Provide job UUID and persisted logical attempt key");
if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY required from protected runtime configuration");

try {
  const stage = await prisma.blueprintJobStage.findUniqueOrThrow({ where: { jobId_stageKey: {
    jobId, stageKey: `provider:background:${logicalAttemptKey}` } } });
  const record = stage.outputJson as unknown as BackgroundProviderResponseRecord;
  if (record.provider !== "openai" || !record.responseId || !record.reservationId || !record.requestFingerprint)
    throw new Error("BACKGROUND_RESPONSE_NOT_RETRIEVABLE");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 });
  const response = await client.responses.retrieve(record.responseId);
  if (response.id !== record.responseId) throw new Error("BACKGROUND_RESPONSE_ID_MISMATCH");
  if (!response.status) throw new Error("BACKGROUND_RESPONSE_STATUS_MISSING");
  if (response.status === "queued" || response.status === "in_progress") {
    console.log(JSON.stringify({ jobId, responseStatus: response.status, reconciled: false }));
  } else {
    await recordRetrievedBackgroundResponse({ jobId, logicalAttemptKey, responseId: response.id,
      requestFingerprint: record.requestFingerprint, providerStatus: response.status,
      actualModel: response.model, usage: response.usage ?? null,
      outputText: response.status === "completed" ? response.output_text ?? null : null });
    if (!response.usage) console.log(JSON.stringify({ jobId, responseStatus: response.status,
      usageRecovered: false, outputRecovered: Boolean(response.output_text), reconciled: false }));
    else {
      const estimate = estimateResponseUsageCost(record.model, response.usage);
      const result = await reconcileBackgroundJobUsage({ jobId, logicalAttemptKey,
        reservationId: record.reservationId, responseId: response.id,
        requestFingerprint: record.requestFingerprint, estimate, usage: response.usage,
        actualModel: response.model });
      console.log(JSON.stringify({ jobId, responseStatus: response.status,
        usageRecovered: true, outputRecovered: Boolean(response.output_text),
        scientificOutputValid: false, reconciled: result.reconciled, estimatedCostUsd: estimate }));
    }
  }
} finally {
  await prisma.$disconnect();
}
