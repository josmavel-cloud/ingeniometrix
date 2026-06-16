import { readFileSync } from "node:fs";
import path from "node:path";

import type { BlueprintLaunchSearchMetadata } from "@/blueprint_launch/server/local-playground-store";
import {
  buildDeterministicBlueprintLaunchSearchMetadata,
} from "@/blueprint_launch/server/reference-search-lab";
import {
  buildExpandedQueryVariantsFromMetadata,
  inspectExpandedQueryContamination,
} from "./run-evidence-candidate-search";

type TestResult = {
  name: string;
  passed: boolean;
  details: string;
};

function test(name: string, passed: boolean, details: string): TestResult {
  return { name, passed, details };
}

function fakeFixture() {
  return {
    case_id: "synthetic-shaking-table",
    case_name: "Synthetic shaking table control case",
    project_id: "synthetic-project",
    user_id: "synthetic-user",
    project_context: {
      title: "Control systems for multi degree shaking tables",
      degree_level: "maestria",
      university: "Synthetic University",
      program: "Graduate program in structural dynamics",
      knowledge_area_label: "Structural dynamics, control, and experimental testing",
      template_key: "GENERIC",
      country: "PE",
      language: "es",
    },
    intake: {
      topic: "Design of control systems for multi degree of freedom shaking tables.",
      problemContext:
        "Experimental laboratories need accurate seismic signal reproduction with tracking and coupled axes.",
      researchLine: "Experimental dynamics, multivariable control, and earthquake simulation.",
      academicConstraints: "Conceptual design only.",
      targetPopulation: "Academic shaking tables with two or more degrees of freedom.",
      availableData:
        "Literature about servo hydraulic actuators, tracking control, MDOF dynamics, validation protocols.",
      preferredMethodology: "Technical review and comparative assessment of control strategies.",
      advisorNotes: "Do not claim experimental validation without a test bench.",
    },
    source_policy: {
      mode: "auto_search",
      max_selected_sources: 6,
      min_selected_sources: 4,
      providers: ["openalex", "crossref"],
      allow_public_pdf_download: true,
      allow_web_fulltext_capture: true,
      require_complete_public_content: true,
    },
    selected_reference_ids: [],
    execution_options: {
      run_steps: [1, 2, 3, 4, 5, 6],
      force_rerun: false,
      use_llm: false,
      persist_debug_prompts: true,
      persist_full_text: true,
      persist_pdfs: true,
      cache_namespace: "synthetic",
      prompt_version: "test",
    },
    source_selection_checkpoint: {
      required: true,
      selection_mode: "manual_pending",
      future_options: ["frontend_basic"],
      instructions_es: "Revision humana requerida.",
      selected_reference_ids: [],
      notes_es: "Synthetic test fixture.",
    },
    expected_focus: [],
    expected_risks: [],
  };
}

function fakeMetadata(): BlueprintLaunchSearchMetadata {
  return {
    planSource: "fallback",
    plannerStatus: "fallback",
    plannerErrorStage: null,
    plannerErrorMessage: null,
    knowledgeArea: "Structural Engineering",
    subdomain: "Experimental control systems for seismic simulation",
    primarySystem: "multi degree of freedom shaking table",
    primaryPhenomenon: "earthquake simulation",
    primaryGoal: "control design for accurate seismic reproduction",
    normalizedTopic: "shaking table control earthquake simulation multi degree of freedom",
    intentSummary:
      "multi degree shaking table control design with tracking validation and actuator constraints",
    keywordGroups: {
      necessary: [
        {
          label: "experimental platform",
          variants: ["shaking table", "seismic shaking table", "earthquake simulator table"],
        },
        {
          label: "control system",
          variants: ["control system", "multivariable control", "tracking control"],
        },
        {
          label: "simulation target",
          variants: ["earthquake simulation", "seismic simulation", "ground motion reproduction"],
        },
        {
          label: "dynamic architecture",
          variants: ["multi degree of freedom", "MDOF", "multi-axis"],
        },
      ],
      complementary: [
        {
          label: "actuation technology",
          variants: ["servo-hydraulic actuator", "electrohydraulic actuator"],
        },
        {
          label: "performance metrics",
          variants: ["tracking error", "acceleration tracking"],
        },
      ],
      optional: [
        {
          label: "numerical validation",
          variants: ["numerical simulation", "robust control"],
        },
      ],
    },
    queryPack: {
      necessaryOnly: ["shaking table control earthquake simulation"],
      complementaryBoosted: ["shaking table control servo-hydraulic actuator tracking error"],
      optionalBackups: ["shaking table robust control numerical simulation"],
    },
    focusTerms: [
      "shaking table",
      "control system",
      "earthquake simulation",
      "multi degree of freedom",
      "servo-hydraulic actuator",
      "tracking error",
    ],
    scoringRules: [],
  };
}

function fakeHealthFixture() {
  return {
    ...fakeFixture(),
    case_id: "synthetic-public-health",
    case_name: "Synthetic public health case",
    project_context: {
      ...fakeFixture().project_context,
      title: "Therapeutic adherence in chronic disease services",
      program: "Graduate program in public health",
      knowledge_area_label: "Medicina / salud publica",
    },
    intake: {
      topic:
        "Factores asociados a la adherencia al tratamiento en pacientes adultos con enfermedad renal cronica atendidos en servicios de salud.",
      problemContext:
        "La enfermedad renal cronica requiere seguimiento sostenido, adherencia farmacologica, continuidad de controles y coordinacion del cuidado.",
      researchLine:
        "Gestion de enfermedades cronicas, salud publica, adherencia terapeutica y calidad de atencion.",
      academicConstraints: "No clinical records in this phase.",
      targetPopulation:
        "Pacientes adultos con enfermedad renal cronica en atencion ambulatoria o programas de seguimiento.",
      availableData:
        "Literatura sobre adherencia terapeutica, enfermedad renal cronica, autocuidado, barreras de acceso y estudios epidemiologicos.",
      preferredMethodology:
        "Revision aplicada de literatura y propuesta de diseno observacional transversal.",
      advisorNotes: "Distinguir evidencia internacional de evidencia local.",
    },
  };
}

function main() {
  const fixture = fakeFixture();
  const intake = fixture.intake;
  const metadata = fakeMetadata();
  const variants = buildExpandedQueryVariantsFromMetadata({ fixture, intake, metadata });
  const joinedVariants = variants
    .map((variant) => `${variant.name} ${variant.query} ${variant.focusTerms.join(" ")} ${variant.rationale}`)
    .join(" ")
    .toLowerCase();
  const contaminationReport = inspectExpandedQueryContamination({
    fixture,
    intake,
    metadata,
    variants,
  });
  const badVariantReport = inspectExpandedQueryContamination({
    fixture,
    intake,
    metadata,
    variants: [
      {
        name: "base-isolation-reinforced-concrete-buildings",
        query: "base isolation reinforced concrete buildings",
        language: "en",
        focusTerms: ["base isolation", "reinforced concrete", "buildings"],
        rationale: "Old unrelated replacement query.",
      },
    ],
  });
  const scriptText = readFileSync(
    path.join(process.cwd(), "scripts", "run-evidence-candidate-search.ts"),
    "utf8",
  );
  const healthFixture = fakeHealthFixture();
  const healthMetadata = buildDeterministicBlueprintLaunchSearchMetadata({
    intake: healthFixture.intake,
    knowledgeAreaLabel: healthFixture.project_context.knowledge_area_label,
  });
  const healthNecessary = healthMetadata.keywordGroups.necessary
    .flatMap((group) => group.variants)
    .join(" ")
    .toLowerCase();
  const healthOptional = healthMetadata.keywordGroups.optional
    .flatMap((group) => group.variants)
    .join(" ")
    .toLowerCase();
  const healthVariants = buildExpandedQueryVariantsFromMetadata({
    fixture: healthFixture,
    intake: healthFixture.intake,
    metadata: healthMetadata,
  });
  const healthJoinedVariants = healthVariants
    .map((variant) => `${variant.name} ${variant.query} ${variant.focusTerms.join(" ")}`)
    .join(" ")
    .toLowerCase();

  const results = [
    test("builds multiple current-intake expansion variants", variants.length >= 4, `${variants.length} variants`),
    test(
      "uses necessary shaking-table/category terms",
      /shaking table/.test(joinedVariants) &&
        /control system/.test(joinedVariants) &&
        /multi degree of freedom/.test(joinedVariants),
      joinedVariants.slice(0, 240),
    ),
    test(
      "uses complementary method/technology terms",
      /servo-hydraulic actuator/.test(joinedVariants) || /tracking error/.test(joinedVariants),
      joinedVariants.slice(0, 240),
    ),
    test(
      "does not generate stale case-specific expansion terms",
      !/aislador|base isolation|isolated building|cost-benefit buildings|edificios peru/.test(
        joinedVariants,
      ),
      "No old expansion markers in generated variants.",
    ),
    test(
      "current variants pass contamination scan",
      contaminationReport.status === "pass",
      JSON.stringify(contaminationReport),
    ),
    test(
      "foreign old-topic variant is blocked",
      badVariantReport.status === "blocked",
      JSON.stringify(badVariantReport),
    ),
    test(
      "script no longer contains old replacement rationale phrase",
      !scriptText.includes("Mantiene ajuste tematico con aislamiento"),
      "Old case-specific rationale removed.",
    ),
    test(
      "candidate runner no longer disables the LLM planner by deleting OPENAI_API_KEY",
      !scriptText.includes("delete process.env.OPENAI_API_KEY"),
      "Candidate search should use auto/LLM/off planner modes instead of forced LLM deletion.",
    ),
    test(
      "health fallback keeps condition and adherence in necessary groups",
      /chronic kidney disease|chronic renal disease|ckd/.test(healthNecessary) &&
        /therapeutic adherence|treatment adherence|medication adherence/.test(healthNecessary),
      healthNecessary,
    ),
    test(
      "health fallback does not demote the central condition to optional-only",
      !/chronic kidney disease/.test(healthOptional) || /chronic kidney disease/.test(healthNecessary),
      `necessary=${healthNecessary}; optional=${healthOptional}`,
    ),
    test(
      "health expanded variants include disease and adherence terms",
      /chronic kidney disease|chronic renal disease|ckd/.test(healthJoinedVariants) &&
        /therapeutic adherence|treatment adherence|medication adherence/.test(healthJoinedVariants),
      healthJoinedVariants.slice(0, 260),
    ),
  ];

  for (const result of results) {
    console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name} - ${result.details}`);
  }

  const failures = results.filter((result) => !result.passed);
  if (failures.length > 0) {
    process.exit(1);
  }
}

main();
