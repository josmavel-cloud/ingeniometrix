import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import type {
  MasterBlueprintLabEngineeringCase,
  MasterBlueprintLabRepoPdfExample,
  MasterBlueprintLabSyntheticOverview,
} from "@/lib/labs/master-blueprint/types";
import type { LoadedMasterBlueprintLabFixtureSet } from "@/server/blueprint-v2/lab/types";

const SIGNAL_KEYS = [
  "problem_signal",
  "method_signal",
  "context_signal",
  "finding_signal",
  "limitation_signal",
  "future_line_signal",
] as const;

const ENGINEERING_TOPIC_PATTERN =
  /ingenier|civil|industrial|mecanic|electr|sism|estructur|hidraul|transporte|ambiental|software|sistemas|operaciones|construcci/i;
const PREFERRED_REFERENCE_TITLE =
  "Production Practices for High Reliability in Concrete Construction";

function getEngineeringPriority(searchableText: string) {
  if (/sism|sismorres|estructur|estructura|civil|construcci|edificaci|obra/i.test(searchableText)) {
    return 5;
  }

  if (/industrial|operaciones|mecanic|electr|hidraul|transporte|ambiental/i.test(searchableText)) {
    return 4;
  }

  if (/sistemas|software|tecnolog|informaci/i.test(searchableText)) {
    return 2;
  }

  return 1;
}

type EvalSyntheticCase = {
  projectTitle?: string;
  topicAreaLabel?: string;
  topic?: string;
  problemContext?: string;
  program?: string;
  university?: string;
  templateKey?: string;
};

type EvalSelection = {
  selectedReferenceIds?: string[];
};

type EvalReferences = {
  references?: Array<{
    referenceId?: string;
    reference?: {
      id?: string;
      title?: string;
      year?: number | null;
      authorsJson?: string[];
      landingPageUrl?: string | null;
    };
  }>;
};

type MasterPdfRun = {
  runId: string;
  pdfDir: string;
  pdfFiles: string[];
  pdfBaseNames: Set<string>;
};

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

async function findFilesByName(rootDir: string, fileName: string): Promise<string[]> {
  const results: string[] = [];

  async function visit(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });

    await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          await visit(entryPath);
          return;
        }

        if (entry.isFile() && entry.name === fileName) {
          results.push(entryPath);
        }
      }),
    );
  }

  try {
    await visit(rootDir);
  } catch {
    return [];
  }

  return results.sort((left, right) => left.localeCompare(right));
}

async function listMasterPdfRuns(rootDir: string): Promise<MasterPdfRun[]> {
  try {
    const runEntries = await readdir(rootDir, { withFileTypes: true });
    const runs = await Promise.all(
      runEntries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const runId = entry.name;
          const pdfDir = path.join(rootDir, runId, "pdfs");

          try {
            const pdfEntries = await readdir(pdfDir, { withFileTypes: true });
            const pdfFiles = pdfEntries
              .filter((pdfEntry) => pdfEntry.isFile() && pdfEntry.name.toLowerCase().endsWith(".pdf"))
              .map((pdfEntry) => pdfEntry.name)
              .sort((left, right) => left.localeCompare(right));

            if (pdfFiles.length === 0) {
              return null;
            }

            return {
              runId,
              pdfDir,
              pdfFiles,
              pdfBaseNames: new Set(pdfFiles.map((fileName) => fileName.replace(/\.pdf$/i, ""))),
            } satisfies MasterPdfRun;
          } catch {
            return null;
          }
        }),
    );

    return runs.filter((run): run is MasterPdfRun => run !== null);
  } catch {
    return [];
  }
}

function incrementCount(counter: Record<string, number>, key: string | null | undefined) {
  if (!key) {
    return;
  }

  counter[key] = (counter[key] ?? 0) + 1;
}

export function buildMasterBlueprintSyntheticOverview(
  fixtures: LoadedMasterBlueprintLabFixtureSet,
): MasterBlueprintLabSyntheticOverview {
  const snippetOriginCounts: Record<string, number> = {};
  const sectionHintCounts: Record<string, number> = {};
  const pdfStatusBySourceId = new Map(
    fixtures.pdfDownloads.records.map((record) => [record.source_id, record.status]),
  );
  const ledgerPackBySourceId = new Map(
    fixtures.evidenceLedger.evidence_packs.map((pack) => [pack.source_id, pack]),
  );

  for (const snippet of fixtures.evidenceLedger.snippets) {
    incrementCount(snippetOriginCounts, snippet.origin);

    for (const sectionKey of snippet.section_hint_keys ?? []) {
      incrementCount(sectionHintCounts, sectionKey);
    }
  }

  const signalCounts = Object.fromEntries(
    SIGNAL_KEYS.map((signalKey) => [
      signalKey,
      fixtures.evidencePacks.filter((pack) => Boolean(pack[signalKey])).length,
    ]),
  );
  const downloadedBytes = fixtures.pdfDownloads.records.reduce(
    (total, record) => total + (record.file_size_bytes ?? 0),
    0,
  );

  return {
    caseName: fixtures.caseName,
    fixtureDir: fixtures.fixtureDir,
    project: {
      title: fixtures.project.title,
      university: fixtures.project.university ?? null,
      program: fixtures.project.program ?? null,
      degreeLevel: fixtures.project.degreeLevel ?? null,
      templateKey: fixtures.project.templateKey ?? null,
    },
    intake: {
      problemSummary: fixtures.project.intake.problemContext ?? null,
      objectiveSummary: fixtures.project.intake.topic ?? null,
      methodologyPreference: fixtures.project.intake.preferredMethodology ?? null,
      populationSummary: fixtures.project.intake.targetPopulation ?? null,
    },
    sourceMix: {
      total: fixtures.acquisition.source_registry.length,
      selected: fixtures.acquisition.source_registry.filter(
        (source) => source.origin === "selected_source",
      ).length,
      providerExpansion: fixtures.acquisition.source_registry.filter(
        (source) => source.origin === "provider_expansion",
      ).length,
      websearch: fixtures.acquisition.source_registry.filter(
        (source) => source.origin === "websearch_source",
      ).length,
      formalReferences: fixtures.acquisition.source_registry.filter(
        (source) => source.eligible_for_formal_reference,
      ).length,
      pdfCandidates: fixtures.acquisition.source_registry.filter((source) => Boolean(source.pdf_url))
        .length,
    },
    pdfCoverage: {
      total: fixtures.pdfDownloads.records.length,
      downloaded: fixtures.pdfDownloads.records.filter(
        (record) => record.status === "downloaded",
      ).length,
      skipped: fixtures.pdfDownloads.records.filter((record) => record.status === "skipped").length,
      bytesDownloaded: downloadedBytes,
      warnings: fixtures.pdfDownloads.warnings,
    },
    evidenceCoverage: {
      packs: fixtures.evidencePacks.length,
      snippets: fixtures.evidenceLedger.snippets.length,
      assets: fixtures.evidenceLedger.assets.length,
      assumptions: fixtures.evidenceLedger.assumptions.length,
      signals: signalCounts,
      snippetOrigins: snippetOriginCounts,
    },
    sectionHintCoverage: Object.entries(sectionHintCounts)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 10)
      .map(([sectionKey, snippetCount]) => ({
        sectionKey,
        snippetCount,
      })),
    sourceCards: fixtures.acquisition.source_registry.map((source) => {
      const sourcePack = ledgerPackBySourceId.get(source.source_id);

      return {
        sourceId: source.source_id,
        title: source.title,
        origin: source.origin,
        year: source.year ?? null,
        hasPdfUrl: Boolean(source.pdf_url),
        pdfStatus: pdfStatusBySourceId.get(source.source_id) ?? "not_requested",
        snippetCount: sourcePack?.snippets?.length ?? 0,
        assetCount: sourcePack?.assets?.length ?? 0,
      };
    }),
  };
}

export async function loadMasterBlueprintRepoPdfExamples(input?: {
  maxRuns?: number;
  maxFilesPerRun?: number;
}): Promise<MasterBlueprintLabRepoPdfExample[]> {
  const rootDir = path.join(process.cwd(), "artifacts-local", "master-blueprint-engine");
  const maxRuns = input?.maxRuns ?? 4;
  const maxFilesPerRun = input?.maxFilesPerRun ?? 3;

  try {
    const runEntries = await readdir(rootDir, { withFileTypes: true });
    const runDirectories = runEntries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => right.localeCompare(left))
      .slice(0, maxRuns);
    const examples = await Promise.all(
      runDirectories.map(async (runId) => {
        const pdfDir = path.join(rootDir, runId, "pdfs");

        try {
          const pdfEntries = await readdir(pdfDir, { withFileTypes: true });
          const pdfFiles = pdfEntries
            .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
            .map((entry) => entry.name)
            .sort((left, right) => left.localeCompare(right));

          if (pdfFiles.length === 0) {
            return null;
          }

          return {
            runId,
            pdfCount: pdfFiles.length,
            pdfFiles: pdfFiles.slice(0, maxFilesPerRun),
            sampleFileName: pdfFiles[0],
            pdfDir,
          };
        } catch {
          return null;
        }
      }),
    );

    return examples.filter(
      (example): example is MasterBlueprintLabRepoPdfExample => example !== null,
    );
  } catch {
    return [];
  }
}

export async function loadMasterBlueprintEngineeringCase(): Promise<MasterBlueprintLabEngineeringCase | null> {
  const evalRootDir = path.join(process.cwd(), "artifacts-local", "blueprint-v2-evals");
  const masterPdfRootDir = path.join(process.cwd(), "artifacts-local", "master-blueprint-engine");
  const [caseFiles, masterPdfRuns] = await Promise.all([
    findFilesByName(evalRootDir, "00-synthetic-case.json"),
    listMasterPdfRuns(masterPdfRootDir),
  ]);

  let bestCase: MasterBlueprintLabEngineeringCase | null = null;

  for (const caseFile of caseFiles) {
    try {
      const syntheticCase = await readJson<EvalSyntheticCase>(caseFile);
      const searchableText = [
        syntheticCase.projectTitle,
        syntheticCase.topicAreaLabel,
        syntheticCase.topic,
        syntheticCase.program,
      ]
        .filter(Boolean)
        .join(" ");

      if (!ENGINEERING_TOPIC_PATTERN.test(searchableText)) {
        continue;
      }
      const engineeringPriority = getEngineeringPriority(searchableText);

      const runDir = path.dirname(caseFile);
      const selectionPath = path.join(runDir, "05-selection.json");
      const referencesPath = path.join(runDir, "04-references.json");
      const selection = await readJson<EvalSelection>(selectionPath);
      const references = await readJson<EvalReferences>(referencesPath);
      const selectedReferenceIds = selection.selectedReferenceIds ?? [];

      if (selectedReferenceIds.length < 2) {
        continue;
      }

      const referenceMap = new Map(
        (references.references ?? []).map((item) => [
          item.referenceId ?? item.reference?.id ?? "",
          item.reference,
        ]),
      );
      const preferredReferenceEntry =
        (references.references ?? []).find(
          (item) => item.reference?.title === PREFERRED_REFERENCE_TITLE,
        ) ?? null;

      for (const pdfRun of masterPdfRuns) {
        const matchedReferenceIds = selectedReferenceIds.filter((referenceId) =>
          pdfRun.pdfBaseNames.has(referenceId),
        );

        if (matchedReferenceIds.length < 2) {
          continue;
      }

      const matchedPdfs = matchedReferenceIds.map((referenceId) => {
          const reference = referenceMap.get(referenceId);
          const fileName = `${referenceId}.pdf`;

          return {
            referenceId,
            title: reference?.title ?? referenceId,
            year: reference?.year ?? null,
            authors: reference?.authorsJson ?? [],
            fileName,
            runId: pdfRun.runId,
            pdfPath: path.join(pdfRun.pdfDir, fileName),
          };
        });
        const preferredReferenceId =
          preferredReferenceEntry?.referenceId ?? preferredReferenceEntry?.reference?.id ?? null;
        const preferredReferenceLocalAvailable =
          typeof preferredReferenceId === "string" && pdfRun.pdfBaseNames.has(preferredReferenceId);
        const candidate: MasterBlueprintLabEngineeringCase = {
          sourceEvalPath: caseFile,
          projectTitle: syntheticCase.projectTitle ?? "Caso de ingenieria detectado",
          topicAreaLabel: syntheticCase.topicAreaLabel ?? null,
          topic: syntheticCase.topic ?? null,
          problemContext: syntheticCase.problemContext ?? null,
          program: syntheticCase.program ?? null,
          university: syntheticCase.university ?? null,
          templateKey: syntheticCase.templateKey ?? null,
          selectedReferenceCount: selectedReferenceIds.length,
          matchedPdfRunId: pdfRun.runId,
          matchedPdfCount: matchedPdfs.length,
          matchedPdfs,
          preferredReference:
            preferredReferenceEntry && preferredReferenceId
              ? {
                  referenceId: preferredReferenceId,
                  title: preferredReferenceEntry.reference?.title ?? preferredReferenceId,
                  year: preferredReferenceEntry.reference?.year ?? null,
                  authors: preferredReferenceEntry.reference?.authorsJson ?? [],
                  landingPageUrl: preferredReferenceEntry.reference?.landingPageUrl ?? null,
                  isPreferred: true,
                  localPdfRunId: preferredReferenceLocalAvailable ? pdfRun.runId : null,
                  localPdfFileName: preferredReferenceLocalAvailable
                    ? `${preferredReferenceId}.pdf`
                    : null,
                  localPdfPath: preferredReferenceLocalAvailable
                    ? path.join(pdfRun.pdfDir, `${preferredReferenceId}.pdf`)
                    : null,
                }
              : null,
        };
        const bestPriority = bestCase
          ? getEngineeringPriority(
              [
                bestCase.projectTitle,
                bestCase.topicAreaLabel,
                bestCase.topic,
                bestCase.program,
              ]
                .filter(Boolean)
                .join(" "),
            )
          : 0;

        if (
          !bestCase ||
          (candidate.preferredReference && !bestCase.preferredReference) ||
          engineeringPriority > bestPriority ||
          ((candidate.preferredReference ? 1 : 0) === (bestCase.preferredReference ? 1 : 0) &&
            engineeringPriority === bestPriority &&
            candidate.matchedPdfCount > bestCase.matchedPdfCount) ||
          ((candidate.preferredReference ? 1 : 0) === (bestCase.preferredReference ? 1 : 0) &&
            engineeringPriority === bestPriority &&
            candidate.matchedPdfCount === bestCase.matchedPdfCount &&
            candidate.projectTitle.localeCompare(bestCase.projectTitle) < 0)
        ) {
          bestCase = candidate;
        }
      }
    } catch {
      continue;
    }
  }

  return bestCase;
}
