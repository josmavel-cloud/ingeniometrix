import { readFileSync } from "node:fs";
import path from "node:path";

type TestResult = {
  name: string;
  passed: boolean;
  details?: string;
};

function test(name: string, passed: boolean, details?: string): TestResult {
  return { name, passed, details };
}

const repoRoot = process.cwd();

const runtimeGenerationFiles = [
  "blueprint_launch/server/source-evidence-planning.ts",
  "blueprint_launch/server/consolidated-evidence.ts",
  "blueprint_launch/server/source-signal-extraction.ts",
  "blueprint_launch/server/step1-intake-context.ts",
  "blueprint_launch/server/reference-search-lab.ts",
  "scripts/run-evidence-candidate-search.ts",
  "server/blueprint-v2/lab/domain-generation-profile.ts",
];

const forbiddenSemanticFallbackPatterns = [
  /adaptive reuse/i,
  /mass timber/i,
  /overbuild/i,
  /office-to-residential/i,
  /seismic isolation/i,
  /base isolation/i,
  /peruvian buildings/i,
  /aisladores/i,
  /mesa vibratoria/i,
  /shaking table/i,
  /reutilizacion adaptativa/i,
  /vacancia/i,
  /subutilizacion/i,
  /parque edificado/i,
  /W3035409675/i,
  /W2407817002/i,
  /W1993500740/i,
  /10\.3390\/app10114037/i,
  /10\.1002\/stc/i,
  /10\.3130\/aijs/i,
];

function readRelative(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function collectForbiddenHits(relativePath: string) {
  const content = readRelative(relativePath);
  return forbiddenSemanticFallbackPatterns
    .filter((pattern) => pattern.test(content))
    .map((pattern) => String(pattern));
}

const runtimeHits = runtimeGenerationFiles.flatMap((file) =>
  collectForbiddenHits(file).map((pattern) => ({ file, pattern })),
);

const sourceEvidencePlanning = readRelative("blueprint_launch/server/source-evidence-planning.ts");
const consolidatedEvidence = readRelative("blueprint_launch/server/consolidated-evidence.ts");
const candidateSearch = readRelative("scripts/run-evidence-candidate-search.ts");
const freshRunIsolation = readRelative("server/blueprint-engine/quality/fresh-run-isolation.ts");

const results: TestResult[] = [
  test(
    "runtime generation files do not contain stale topic/source fallback terms",
    runtimeHits.length === 0,
    JSON.stringify(runtimeHits, null, 2),
  ),
  test(
    "candidate search expansion no longer injects case-specific hardcoded search presets",
    !/appendSearchTerms|Seismic isolation and base-isolated buildings|Peruvian buildings|base-isolated structures/i.test(
      candidateSearch,
    ),
    "candidate search still contains an old augmentation helper or preset",
  ),
  test(
    "Lab A evidence planning fallback uses neutral current-intake language",
    /tema actual/.test(sourceEvidencePlanning) &&
      /objeto de estudio/.test(sourceEvidencePlanning) &&
      /poblacion, muestra, caso o contexto actual/.test(sourceEvidencePlanning),
    "neutral fallback wording was not found",
  ),
  test(
    "consolidated evidence fallback does not emit old topic-specific claims",
    /Metodo aplicado pendiente de validacion/.test(consolidatedEvidence) &&
      /Marco teorico derivado del corpus recuperado/.test(consolidatedEvidence) &&
      !/adaptive reuse|reutilizacion adaptativa|vacancia|subutilizacion/i.test(consolidatedEvidence),
    "consolidated fallback still appears topic-specific",
  ),
  test(
    "stale-content guard markers remain allowed in detection module",
    /adaptive reuse/i.test(freshRunIsolation) &&
      /mass timber/i.test(freshRunIsolation) &&
      /vacancia/i.test(freshRunIsolation),
    "fresh-run isolation marker list no longer contains known stale markers",
  ),
];

const failed = results.filter((result) => !result.passed);

for (const result of results) {
  console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}`);
  if (!result.passed && result.details) {
    console.log(`  ${result.details}`);
  }
}

console.log(`\nStale fallback cleanup tests: ${results.length - failed.length}/${results.length} passed`);

if (failed.length > 0) {
  process.exit(1);
}
