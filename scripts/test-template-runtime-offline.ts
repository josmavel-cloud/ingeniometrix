import { resolveMasterTemplateRuntimeForMode } from "@/server/blueprint-v2/lab/template-runtime-policy";
import type { MasterTemplateRuntime } from "@/server/blueprint-v2/types";

type TestResult = { name: string; passed: boolean; detail?: string };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function fakeTemplate(): MasterTemplateRuntime {
  return {
    template_key: "MASTER_TEMPLATE_LATAM",
    template_name: "Fixture local",
    template_version_id: "fixture-v1",
    methodology_mode: null,
    citation_style: "APA",
    required_section_keys: ["problem_statement"],
    sections: [
      {
        section_id: "problem_statement",
        title: "Planteamiento del problema",
        semantic_key: "problem_statement",
        path_titles: ["Planteamiento del problema"],
        level: 1,
        content_kind: "rich_text",
        required: true,
        instructions: [],
        purpose: null,
        min_words: null,
        max_words: null,
      },
    ],
    guidance_notes: [],
  };
}

async function runTest(name: string, fn: () => Promise<void> | void): Promise<TestResult> {
  try {
    await fn();
    return { name, passed: true };
  } catch (error) {
    return { name, passed: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

async function main() {
  let databaseCalls = 0;
  const results = await Promise.all([
    runTest("local fixture mode does not call database loader", async () => {
      const resolution = await resolveMasterTemplateRuntimeForMode({
        mode: "local-fixture",
        loadDatabaseRuntime: async () => {
          databaseCalls += 1;
          throw new Error("should not be called");
        },
        buildLocalFixture: fakeTemplate,
      });
      assert(resolution.template_source === "local_fixture", `source=${resolution.template_source}`);
      assert(resolution.prisma_called === false, "database loader was marked called");
      assert(databaseCalls === 0, `databaseCalls=${databaseCalls}`);
    }),
    runTest("database mode falls back clearly when loader fails", async () => {
      const resolution = await resolveMasterTemplateRuntimeForMode({
        mode: "database",
        loadDatabaseRuntime: async () => {
          throw new Error("db unavailable");
        },
        buildLocalFixture: fakeTemplate,
      });
      assert(resolution.template_source === "local_fixture", `source=${resolution.template_source}`);
      assert(resolution.prisma_called === true, "database loader was not marked called");
      assert(resolution.warnings.some((warning) => /db unavailable/.test(warning)), "fallback warning missing");
    }),
  ]);

  for (const result of results) {
    console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` :: ${result.detail}` : ""}`);
  }
  if (results.some((result) => !result.passed)) process.exit(1);
}

main();
