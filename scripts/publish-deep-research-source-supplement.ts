import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  buildDeepResearchCandidateSourceSupplement,
  publishDeepResearchCandidateSupplementRun,
  type CandidateSourcesArtifactLike,
  type CandidateSourcesSupplementArtifactV1,
} from "@/server/blueprint-engine/quality/deep-research-source-supplement";
import type { RapidDeepResearchFallbackArtifactsV1 } from "@/server/blueprint-engine/quality/rapid-deep-research-fallback";

type CliArgs = {
  evidenceRunFolder: string;
};

type RunSummary = {
  case_id?: string;
  source_candidate_run_folder?: string;
  output_folder?: string;
};

function parseArgs(args = process.argv.slice(2)): CliArgs {
  let evidenceRunFolder = "";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];
    if ((arg === "--evidence-run-folder" || arg === "--run-folder") && next) {
      evidenceRunFolder = path.resolve(next);
      index += 1;
    }
  }

  if (!evidenceRunFolder) {
    throw new Error("Use --evidence-run-folder <folder>.");
  }

  return { evidenceRunFolder };
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

async function main() {
  const { evidenceRunFolder } = parseArgs();
  const runSummary = readJson<RunSummary>(path.join(evidenceRunFolder, "run-summary.json"));
  const caseId = runSummary.case_id;
  const baseCandidateRunFolder = runSummary.source_candidate_run_folder;

  if (!caseId || !baseCandidateRunFolder) {
    throw new Error("run-summary.json must include case_id and source_candidate_run_folder.");
  }

  const baseCandidateSources = readJson<CandidateSourcesArtifactLike>(
    path.join(baseCandidateRunFolder, "candidate-sources.json"),
  );
  const supplementPath = path.join(evidenceRunFolder, "candidate-sources-supplement.json");
  const rapidResultPath = path.join(evidenceRunFolder, "rapid-deep-research-result.json");
  const rapidResult = existsSync(rapidResultPath)
    ? readJson<RapidDeepResearchFallbackArtifactsV1["result"]>(rapidResultPath)
    : null;
  const supplement = existsSync(supplementPath)
    ? readJson<CandidateSourcesSupplementArtifactV1>(supplementPath)
    : buildDeepResearchCandidateSourceSupplement({
        caseId,
        baseCandidateSources,
        deepResearchEvidenceCandidates: readJson<RapidDeepResearchFallbackArtifactsV1["evidenceCandidates"]>(
          path.join(evidenceRunFolder, "deep-research-evidence-candidates.json"),
        ),
        rapidCandidateSources: existsSync(path.join(evidenceRunFolder, "rapid-deep-research-candidate-sources.json"))
          ? readJson<RapidDeepResearchFallbackArtifactsV1["candidateSources"]>(
              path.join(evidenceRunFolder, "rapid-deep-research-candidate-sources.json"),
            )
          : null,
        originatingEvidenceRunFolder: evidenceRunFolder,
        sourceArtifactPaths: {
          deepResearchEvidenceCandidates: path.join(
            evidenceRunFolder,
            "deep-research-evidence-candidates.json",
          ),
          rapidCandidateSources: path.join(
            evidenceRunFolder,
            "rapid-deep-research-candidate-sources.json",
          ),
        },
      });
  const published = await publishDeepResearchCandidateSupplementRun({
    caseId,
    baseCandidateRunFolder,
    evidenceRunFolder,
    baseCandidateSources,
    supplement,
    rapidResult,
  });

  console.log(JSON.stringify(published, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
