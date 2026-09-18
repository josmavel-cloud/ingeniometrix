import assert from "node:assert/strict";
import { searchOpenAlexWorks } from "@/server/retrieval/openalex-client";
import { createOpenAiProvider } from "@/llm/providers/openai";

async function main() {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response("Rate limited", { status: 429, headers: { "retry-after": "12056" } }); };
  try {
    await assert.rejects(searchOpenAlexWorks("synthetic regression query"), /Retry-After 12056/);
    assert.equal(calls, 1, "No insistir contra el limite externo ni esperar horas");
    process.env.IMX_LLM_RUN_BUDGET_USD = "0.000001";
    process.env.LLM_REQUEST_MAX_RETRIES = "0";
    const provider = createOpenAiProvider({ apiKey: "offline-invalid-key", defaultModel: "gpt-5.4-mini" });
    await assert.rejects(provider.generateText({ prompt: "Synthetic budget test", maxOutputTokens: 8000 }), /LLM_BUDGET_BLOCKED/);
    assert.equal(calls, 1, "Presupuesto bloqueado antes de tocar el proveedor");
    console.log("PASS B2 provider boundaries: 4 assertions; Retry-After respected and spend blocked before transport.");
  } finally { globalThis.fetch = originalFetch; delete process.env.IMX_LLM_RUN_BUDGET_USD; }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
