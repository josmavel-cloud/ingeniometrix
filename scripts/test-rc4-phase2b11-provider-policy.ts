import assert from "node:assert/strict";
import { classifyOpenAlexFailure, getOpenAlexRateLimitStatus, openAlexCapability, searchOpenAlexWorks } from "@/server/retrieval/openalex-client";

async function main() {
  const originalFetch = global.fetch;
  const originalKey = process.env.OPENALEX_API_KEY;
  let calls = 0;
  try {
    process.env.OPENALEX_API_KEY = "test-only-not-a-real-key";
    assert.equal(openAlexCapability(), "CONFIGURED");
    global.fetch = async request => {
      const url = new URL(String(request));
      assert.equal(url.hostname, "api.openalex.org");
      assert.equal(url.searchParams.get("search"), '("seismic response") AND ("masonry")');
      assert.equal(url.searchParams.get("api_key"), "test-only-not-a-real-key");
      calls++;
      return new Response("bounded test", { status: 429, headers: { "retry-after": "0" } });
    };
    await assert.rejects(searchOpenAlexWorks('("seismic response") AND ("masonry")', { retryRateLimit: false }),
      (error: unknown) => error instanceof Error && error.message === "OPENALEX_RATE_LIMIT_BURST");
    assert.equal(calls, 1, "explicit acceptance cannot spend a hidden retry");
    assert.equal(classifyOpenAlexFailure(401, new Headers()).code, "OPENALEX_AUTH_ERROR");
    assert.equal(classifyOpenAlexFailure(429, new Headers({ "x-ratelimit-remaining": "0", "retry-after": "3600" })).code,
      "OPENALEX_DAILY_BUDGET_EXHAUSTED");
    global.fetch = async request => {
      const url = new URL(String(request));
      assert.equal(url.pathname, "/rate-limit");
      assert.equal(url.searchParams.get("api_key"), "test-only-not-a-real-key");
      return Response.json({ limit: 1000, remaining: 800, reset: 120 });
    };
    assert.deepEqual(await getOpenAlexRateLimitStatus(), { limit: 1000, remaining: 800, resetSeconds: 120 });
    console.log("PASS OpenAlex auth, safe rate-limit classification, status and bounded acceptance transport");
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENALEX_API_KEY;
    else process.env.OPENALEX_API_KEY = originalKey;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
