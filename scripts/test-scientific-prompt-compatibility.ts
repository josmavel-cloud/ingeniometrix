import assert from "node:assert/strict";
import { fingerprint } from "@/server/mvp/job-execution-context";
import { APPROVED_SCIENTIFIC_PLAN_PROMPT, APPROVED_SCIENTIFIC_PLAN_LATAM_COMPACT_PROMPT } from "@/server/mvp/prompts/scientific-plan-approved.v1";
import { approvedScientificCompositionPrompt } from "@/server/mvp/prompts/scientific-plan-method-coverage.v2";

// Persisted jobs bind these v1 fingerprints. An enhancement must get a new
// contract, not retroactively make valid historical inputs unreadable.
assert.equal(fingerprint(APPROVED_SCIENTIFIC_PLAN_PROMPT), "63804ad50462ac5ffb42ab50764d1635ecc79d0bed5da9f729a0b09492ed825e");
assert.equal(fingerprint(APPROVED_SCIENTIFIC_PLAN_LATAM_COMPACT_PROMPT), "3bad2e9ff5880ae96c39ab5a2eb56974f0b29a39e25dd811162aecd3d054bbed");
for (const compact of [false, true]) {
  const legacy = approvedScientificCompositionPrompt(compact, false);
  const methodological = approvedScientificCompositionPrompt(compact, true);
  assert.ok(legacy.version.endsWith("-v1"));
  assert.ok(methodological.version.endsWith("-v2"));
  assert.notEqual(fingerprint(legacy), fingerprint(methodological));
  assert.ok(methodological.systemPrompt.includes("method_coverage"));
  assert.ok(methodological.systemPrompt.includes("No plantees preguntas o aprobaciones al usuario"));
}
console.log("PASS: historical frozen composition prompts unchanged; coverage composition explicitly v2, separate checkpoint fingerprint; no provider calls.");
