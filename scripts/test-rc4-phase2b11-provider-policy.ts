import assert from "node:assert/strict";
import { searchOpenAlexWorks } from "@/server/retrieval/openalex-client";

async function main() {
  let calls = 0;
  global.fetch = async request => {
    const url = new URL(String(request));
    assert.equal(url.hostname, "api.openalex.org");
    assert.equal(url.searchParams.get("search"), '("seismic response") AND ("masonry")');
    calls++;
    return new Response("bounded test", { status: 429, headers: { "retry-after": "0" } });
  };
  await assert.rejects(searchOpenAlexWorks('("seismic response") AND ("masonry")', { retryRateLimit: false }), /HTTP 429/);
  assert.equal(calls, 1, "explicit acceptance cannot spend a hidden retry");
  console.log("PASS bounded OpenAlex transport: one failed attempt, zero retry/other hosts");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
