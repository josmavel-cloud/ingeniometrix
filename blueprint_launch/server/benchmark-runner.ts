import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  type BlueprintLaunchBenchmarkCase,
  blueprintLaunchBenchmarkCases,
} from "@/blueprint_launch/benchmarks/benchmark-cases";
import {
  type BlueprintLaunchBenchmarkEvaluation,
  evaluateBlueprintLaunchBenchmarkCase,
} from "@/blueprint_launch/server/benchmark-evaluator";
import { searchBlueprintLaunchReferences } from "@/blueprint_launch/server/local-reference-search";

type BenchmarkCaseResult = {
  caseId: string;
  knowledgeAreaLabel: string;
  title: string;
  status: "ok" | "error";
  plannerStatus: string | null;
  evaluation: BlueprintLaunchBenchmarkEvaluation | null;
  snapshot: Awaited<ReturnType<typeof searchBlueprintLaunchReferences>> | null;
  errorMessage: string | null;
};

type BenchmarkSuiteSummary = {
  suiteId: string;
  savedAt: string;
  totalCases: number;
  okCases: number;
  errorCases: number;
  plannerStatusBreakdown: {
    llm: number;
    fallback: number;
    other: number;
  };
  averages: {
    overallScore: number;
    knowledgeAreaFit: number;
    subdomainFit: number;
    necessaryKeywordFit: number;
    complementaryKeywordFit: number;
    optionalKeywordFit: number;
    queryQuality: number;
    retrievalTop5Quality: number;
    noiseControl: number;
    traceability: number;
  };
  caseResults: Array<{
    caseId: string;
    knowledgeAreaLabel: string;
    status: "ok" | "error";
    plannerStatus: string | null;
    overallScore: number | null;
    relevantTop5Count: number | null;
    notes: string[];
    errorMessage: string | null;
  }>;
  reportPath: string;
};

const BENCHMARK_ROOT = path.join(
  process.cwd(),
  "artifacts-local",
  "blueprint_launch",
  "benchmarks",
  "runs",
);

function buildTimestampToken(value: string) {
  return value.replace(/[:.]/g, "-");
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function buildMarkdownReport(summary: BenchmarkSuiteSummary) {
  const lines = [
    "# Blueprint Launch Benchmark Report",
    "",
    `- Suite: ${summary.suiteId}`,
    `- Saved at: ${summary.savedAt}`,
    `- Total cases: ${summary.totalCases}`,
    `- OK cases: ${summary.okCases}`,
    `- Error cases: ${summary.errorCases}`,
    `- Planner llm: ${summary.plannerStatusBreakdown.llm}`,
    `- Planner fallback: ${summary.plannerStatusBreakdown.fallback}`,
    "",
    "## Averages",
    "",
    `- Overall score: ${summary.averages.overallScore}`,
    `- Knowledge area fit: ${summary.averages.knowledgeAreaFit}`,
    `- Subdomain fit: ${summary.averages.subdomainFit}`,
    `- Necessary keyword fit: ${summary.averages.necessaryKeywordFit}`,
    `- Complementary keyword fit: ${summary.averages.complementaryKeywordFit}`,
    `- Optional keyword fit: ${summary.averages.optionalKeywordFit}`,
    `- Query quality: ${summary.averages.queryQuality}`,
    `- Retrieval top 5 quality: ${summary.averages.retrievalTop5Quality}`,
    `- Noise control: ${summary.averages.noiseControl}`,
    `- Traceability: ${summary.averages.traceability}`,
    "",
    "## Cases",
    "",
  ];

  for (const caseResult of summary.caseResults) {
    lines.push(`### ${caseResult.caseId}`);
    lines.push(`- Area: ${caseResult.knowledgeAreaLabel}`);
    lines.push(`- Status: ${caseResult.status}`);
    lines.push(`- Planner: ${caseResult.plannerStatus ?? "n/a"}`);
    lines.push(`- Overall score: ${caseResult.overallScore ?? "n/a"}`);
    lines.push(`- Relevant top 5: ${caseResult.relevantTop5Count ?? "n/a"}`);

    if (caseResult.errorMessage) {
      lines.push(`- Error: ${caseResult.errorMessage}`);
    }

    if (caseResult.notes.length > 0) {
      lines.push("- Notes:");
      for (const note of caseResult.notes) {
        lines.push(`  - ${note}`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

async function writeJsonFile(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function runBlueprintLaunchBenchmarkSuite(params?: {
  cases?: BlueprintLaunchBenchmarkCase[];
  suiteLabel?: string;
}) {
  const cases = params?.cases ?? blueprintLaunchBenchmarkCases;
  const savedAt = new Date().toISOString();
  const suiteId = `${params?.suiteLabel ?? "core"}-${buildTimestampToken(savedAt)}`;
  const suiteDir = path.join(BENCHMARK_ROOT, suiteId);
  const casesDir = path.join(suiteDir, "cases");

  await mkdir(casesDir, { recursive: true });

  const results: BenchmarkCaseResult[] = [];

  for (const benchmarkCase of cases) {
    try {
      const snapshot = await searchBlueprintLaunchReferences({
        intake: benchmarkCase.intake,
        knowledgeAreaLabel: benchmarkCase.knowledgeAreaLabel,
        desiredTotal: 5,
      });
      const evaluation = evaluateBlueprintLaunchBenchmarkCase({
        benchmarkCase,
        snapshot,
      });
      const result: BenchmarkCaseResult = {
        caseId: benchmarkCase.id,
        knowledgeAreaLabel: benchmarkCase.knowledgeAreaLabel,
        title: benchmarkCase.title,
        status: "ok",
        plannerStatus: snapshot.metadata?.plannerStatus ?? null,
        evaluation,
        snapshot,
        errorMessage: null,
      };

      results.push(result);
      await writeJsonFile(path.join(casesDir, `${benchmarkCase.id}.json`), {
        benchmarkCase,
        result,
      });
    } catch (error) {
      const result: BenchmarkCaseResult = {
        caseId: benchmarkCase.id,
        knowledgeAreaLabel: benchmarkCase.knowledgeAreaLabel,
        title: benchmarkCase.title,
        status: "error",
        plannerStatus: null,
        evaluation: null,
        snapshot: null,
        errorMessage: error instanceof Error ? error.message : "Error no identificado.",
      };

      results.push(result);
      await writeJsonFile(path.join(casesDir, `${benchmarkCase.id}.json`), {
        benchmarkCase,
        result,
      });
    }
  }

  const okResults = results.filter((result) => result.status === "ok" && result.evaluation);
  const summary: BenchmarkSuiteSummary = {
    suiteId,
    savedAt,
    totalCases: results.length,
    okCases: okResults.length,
    errorCases: results.length - okResults.length,
    plannerStatusBreakdown: {
      llm: okResults.filter((result) => result.plannerStatus === "llm").length,
      fallback: okResults.filter((result) => result.plannerStatus === "fallback").length,
      other: okResults.filter(
        (result) => result.plannerStatus !== "llm" && result.plannerStatus !== "fallback",
      ).length,
    },
    averages: {
      overallScore: average(okResults.map((result) => result.evaluation!.scores.overallScore)),
      knowledgeAreaFit: average(
        okResults.map((result) => result.evaluation!.scores.knowledgeAreaFit),
      ),
      subdomainFit: average(okResults.map((result) => result.evaluation!.scores.subdomainFit)),
      necessaryKeywordFit: average(
        okResults.map((result) => result.evaluation!.scores.necessaryKeywordFit),
      ),
      complementaryKeywordFit: average(
        okResults.map((result) => result.evaluation!.scores.complementaryKeywordFit),
      ),
      optionalKeywordFit: average(
        okResults.map((result) => result.evaluation!.scores.optionalKeywordFit),
      ),
      queryQuality: average(okResults.map((result) => result.evaluation!.scores.queryQuality)),
      retrievalTop5Quality: average(
        okResults.map((result) => result.evaluation!.scores.retrievalTop5Quality),
      ),
      noiseControl: average(okResults.map((result) => result.evaluation!.scores.noiseControl)),
      traceability: average(okResults.map((result) => result.evaluation!.scores.traceability)),
    },
    caseResults: results.map((result) => ({
      caseId: result.caseId,
      knowledgeAreaLabel: result.knowledgeAreaLabel,
      status: result.status,
      plannerStatus: result.plannerStatus,
      overallScore: result.evaluation?.scores.overallScore ?? null,
      relevantTop5Count: result.evaluation?.relevantTop5Count ?? null,
      notes: result.evaluation?.notes ?? [],
      errorMessage: result.errorMessage,
    })),
    reportPath: path.join(suiteDir, "report.md"),
  };

  await writeJsonFile(path.join(suiteDir, "summary.json"), summary);
  await writeFile(summary.reportPath, `${buildMarkdownReport(summary)}\n`, "utf8");
  await writeJsonFile(path.join(BENCHMARK_ROOT, "latest-suite.json"), summary);

  return {
    summary,
    suiteDir,
    results,
  };
}
