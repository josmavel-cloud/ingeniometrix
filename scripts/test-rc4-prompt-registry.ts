import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { renderVersionedPrompt } from "@/server/mvp/prompts/render-versioned-prompt";
import { QUICK_IDEA_DRAFT_GENERATOR_1_PROMPT } from "@/server/mvp/prompts/quick-idea-draft-generator.v1";
import { TOPIC_SUGGESTION_GENERATOR_1_PROMPT } from "@/server/mvp/prompts/topic-suggestion-generator.v1";
import { TOPIC_AREA_NORMALIZER_1_PROMPT } from "@/server/mvp/prompts/topic-area-normalizer.v1";
import { INTAKE_DRAFT_SERVICE_1_PROMPT } from "@/server/mvp/prompts/intake-draft-service.v1";
import { INTAKE_NORMALIZATION_SERVICE_1_PROMPT } from "@/server/mvp/prompts/intake-normalization-service.v1";
import { REFERENCE_SEARCH_V2_1_PROMPT } from "@/server/mvp/prompts/reference-search-v2.v1";
import { SEARCH_QUERY_PLANNER_1_PROMPT } from "@/server/mvp/prompts/search-query-planner.v1";
import { REFERENCE_TRANSLATION_SERVICE_1_PROMPT, REFERENCE_TRANSLATION_SERVICE_2_PROMPT } from "@/server/mvp/prompts/reference-translation-service.v1";
import { RETRIEVAL_LLM_JSON_1_PROMPT } from "@/server/mvp/prompts/retrieval-llm-json.v1";
// Hashes of the pre-extraction instruction templates, captured from reviewed G1a.
// No dependency on historical Git objects or developer artifacts at test runtime.
const cases = [
  [QUICK_IDEA_DRAFT_GENERATOR_1_PROMPT, "6766cb266816eaf2544d01b796ae4399ca96bb219ce6ee7d95751d49f1f79ac2"],
  [TOPIC_SUGGESTION_GENERATOR_1_PROMPT, "57452eedc18584badd551d02cb89a422783547432e4c92d7f064e27a0b8535e9"],
  [TOPIC_AREA_NORMALIZER_1_PROMPT, "1e1779452169ce06205a93b0e15eb00bc84fa5319ddae42b3f1721ed17a5497f"],
  [INTAKE_DRAFT_SERVICE_1_PROMPT, "fd0663f5e5dfb767fc3ca57db679d952976cc5e1b9a70fed8e3130f29d450681"],
  [INTAKE_NORMALIZATION_SERVICE_1_PROMPT, "5cf005045ed97ee11d745adad6c4ffa569c033dd2b62d092ccbe6569d00c4784"],
  [REFERENCE_SEARCH_V2_1_PROMPT, "c677deac76c81cd84cd97c941f41f33035a2b6bf65de4981e3fc6e30d2e10790"],
  [SEARCH_QUERY_PLANNER_1_PROMPT, "1665487e28f5a92f914446eb7147a9548bb55ee3f98d4178017b3c2baf92a879"],
  [REFERENCE_TRANSLATION_SERVICE_1_PROMPT, "3f2e1f763418ce0113ca32dd5265ada835b39abf43b25db90078e9020b6218a8"],
  [REFERENCE_TRANSLATION_SERVICE_2_PROMPT, "83c52a7df86dbccbd18cd2ccdd2d2c18f7a9c7f916445a32c62367a973d983af"],
  [RETRIEVAL_LLM_JSON_1_PROMPT, "443bd122cb1a161e0a7be452fb0c2a631582be36a563135112e10ae0fb6d5bbe"],
] as const;
for (const [prompt, expectedHash] of cases) {
  assert.equal(createHash("sha256").update(prompt.template).digest("hex"), expectedHash, prompt.id);
  const values = Object.fromEntries(Object.keys(prompt.variables).map((key) => [key, "Dato {{var_0}} no reinterpretar"]));
  const result = renderVersionedPrompt(prompt, values);
  assert.ok(result.includes("Dato {{var_0}} no reinterpretar"));
  assert.throws(() => renderVersionedPrompt(prompt, {}), /PROMPT_VARIABLE/);
}
console.log("PASS RC4 prompt registry: 10 instruction templates preserved; strict single-pass variable substitution.");
