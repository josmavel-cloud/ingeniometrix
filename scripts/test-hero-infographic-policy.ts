import {
  sentenceStyleCapitalizePublicText,
} from "../server/blueprint-v2/editorial/capitalization-hygiene";
import {
  buildHeroInfographicPlan,
  heroInfographicPolicy,
} from "../server/blueprint-v2/editorial/hero-infographic-policy";
import {
  buildAcademicHeroImageFileName,
  DEFAULT_ACADEMIC_HERO_IMAGE_MODEL,
  resolveAcademicHeroImageModel,
} from "../server/blueprint-v2/lab/academic-document-hero-image";
import { buildCoverInfographicSvg } from "../server/blueprint-v2/lab/docx-renderer";
import type {
  AcademicDocument,
  CoverVisualPlan,
} from "../server/blueprint-v2/lab/academic-document-model";

type TestResult = {
  name: string;
  passed: boolean;
  details?: string;
};

function test(name: string, passed: boolean, details?: string): TestResult {
  return { name, passed, details };
}

const plan = buildHeroInfographicPlan({
  finalTitle:
    "Revision sistematica aplicada y analisis comparativo para evaluar aisladores sismicos en edificios peruanos de mediana altura",
  shortMethodTitle:
    "Revision sistematica aplicada y analisis comparativo para aisladores sismicos",
  keywordsLine:
    "revision sistematica aplicada; aisladores sismicos; edificios peruanos; alta amenaza sismica",
  knowledgeArea: "ingenieria sismorresistente",
  countryContext: "PE",
  topicOrObject: "aisladores sismicos en edificios peruanos",
  methodology:
    "Revision sistematica aplicada, analisis comparativo y matriz multicriterio.",
  workflowSummary:
    "problema, revision de evidencia, diseno metodologico, analisis comparativo y entrega academica",
  evidenceSummary:
    "fuentes con trazabilidad y limitaciones declaradas",
  sourceHealthSummary:
    "dos fuentes con texto completo usable y fuentes contextuales downgraded",
  sectionPlanSummary:
    "problema; objetivos; metodologia; analisis; cronograma; presupuesto",
  handoffId: "evidence-handoff-test-current",
  evidenceRunId: "run-2026-05-05T00-00-00-000Z",
  snapshotHash: "abc123current",
  variant: "master",
});

function fakeDocument(variant: "master" | "university"): AcademicDocument {
  const coverVisual: CoverVisualPlan = {
    ...plan,
    image_path: null,
    image_model: null,
    image_generation_status: "not_requested",
    image_generation_warnings: [],
    image_layout: {
      width_px: 1024,
      height_px: 1536,
      min_first_page_height_pct: 60,
    },
    palette: {
      background: "F6F1EA",
      primary: "1F2937",
      accent: "7A4E2A",
      muted: "C9B8A7",
    },
  };

  return {
    variant,
    layout_plan: {
      cover_visual: coverVisual,
    },
  } as AcademicDocument;
}

const masterSvg = buildCoverInfographicSvg(fakeDocument("master"));
const universitySvg = buildCoverInfographicSvg(fakeDocument("university"));
const sharedMasterHeroFileName = buildAcademicHeroImageFileName(fakeDocument("master"));
const sharedUniversityHeroFileName = buildAcademicHeroImageFileName(fakeDocument("university"));

const lowerHeading = sentenceStyleCapitalizePublicText(
  "cronograma de investigacion para BIM e IA aplicada",
  "heading",
);
const doi = "10.14483/udistrital.jour.tecnura.2012.4.a08";
const url = "https://doi.org/10.14483/udistrital.jour.tecnura.2012.4.a08";
const quoted = "\"aislamiento sismico en edificios\"";
const spanishSentence = sentenceStyleCapitalizePublicText(
  "analisis comparativo para aisladores sismicos en edificios peruanos",
  "title",
);
const originalModelEnv = process.env.OPENAI_IMAGE_MODEL;
process.env.OPENAI_IMAGE_MODEL = "custom-image-model-test";
const overriddenImageModel = resolveAcademicHeroImageModel();
if (originalModelEnv === undefined) {
  delete process.env.OPENAI_IMAGE_MODEL;
} else {
  process.env.OPENAI_IMAGE_MODEL = originalModelEnv;
}

const promptLower = plan.prompt.toLowerCase();
const promptWithNegativeLower = `${plan.prompt} ${plan.negative_prompt}`.toLowerCase();
const results: TestResult[] = [
  test(
    "hero prompt is infographic-oriented, not generic cover-only",
    /infografia metodologica academica/.test(promptLower) &&
      /cover decorativo/.test(promptLower) &&
      !/stock cover|poster sensacionalista/.test(promptLower),
    plan.prompt,
  ),
  test(
    "hero prompt includes methodology and workflow guidance",
      /metodologia|enfoque/.test(promptLower) &&
      /flujo|etapas/.test(promptLower) &&
      /3 a 5/.test(promptLower) &&
      /problema/.test(promptLower) &&
      /analisis/.test(promptLower),
    plan.prompt,
  ),
  test(
    "hero prompt contains workflow, tools/components, context and output instructions",
    /herramientas|componentes|modulos/.test(promptLower) &&
      /contexto/.test(promptLower) &&
      /salida|producto academico|entrega academica/.test(promptLower),
    plan.prompt,
  ),
  test(
    "hero prompt avoids fake results and citations",
    /no crear graficos de datos falsos/.test(promptLower) &&
      /citas falsas/.test(promptLower) &&
      /resultados inventados/.test(promptLower) &&
      /quality gates|quality gate/.test(promptLower) &&
      /no debe aparecer como texto/.test(promptLower),
    plan.prompt,
  ),
  test(
    "hero prompt forbids visible internal quality/source-health diagnostics",
    /conteos de fuentes/.test(promptWithNegativeLower) &&
      /diagnostico visible/.test(promptWithNegativeLower) &&
      /metadatos internos/.test(promptWithNegativeLower),
    plan.prompt,
  ),
  test(
    "hero prompt avoids unconfirmed named methodology overcommit",
    /no nombrar metodos/.test(promptWithNegativeLower) &&
      /matrices\/modelos no confirmados/.test(promptWithNegativeLower),
    plan.negative_prompt,
  ),
  test(
    "hero prompt includes subject/object and context",
    /aisladores sismicos/.test(promptLower) &&
      /edificios peruanos/.test(promptLower) &&
      /contexto peruano/.test(promptLower),
    plan.prompt,
  ),
  test(
    "deterministic fallback is available and infographic-like",
    masterSvg.includes("<svg") &&
      masterSvg.includes("Objeto de estudio") &&
      masterSvg.includes("Problema") &&
      masterSvg.includes("Metodo") &&
      masterSvg.includes("Analisis"),
    masterSvg.slice(0, 500),
  ),
  test(
    "fallback remains academic and non-debug",
    !/artifacts-local|source_id|asset_key|prompt trace|debug|mass timber|toronto|canada|overbuild/i.test(masterSvg) &&
      /Infografia metodologica/.test(masterSvg),
    masterSvg,
  ),
  test(
    "fallback infographic includes current topic/short title and no stale markers",
    /aisladores sismicos/i.test(masterSvg) &&
      !/mass timber|toronto|canada|overbuild/i.test(masterSvg),
    masterSvg,
  ),
  test(
    "latest image model default is GPT Image 2 and env override is respected",
    DEFAULT_ACADEMIC_HERO_IMAGE_MODEL === "gpt-image-2" &&
      overriddenImageModel === "custom-image-model-test" &&
      resolveAcademicHeroImageModel() === (originalModelEnv ?? DEFAULT_ACADEMIC_HERO_IMAGE_MODEL),
    `${DEFAULT_ACADEMIC_HERO_IMAGE_MODEL} | ${overriddenImageModel} | ${resolveAcademicHeroImageModel()}`,
  ),
  test(
    "generated hero metadata is tied to current handoff/run",
    plan.source_handoff_id === "evidence-handoff-test-current" &&
      plan.source_evidence_run_id === "run-2026-05-05T00-00-00-000Z" &&
      plan.source_snapshot_hash === "abc123current" &&
      plan.deterministic_template_asset === true,
    JSON.stringify(plan, null, 2),
  ),
  test(
    "institutional and master documents can reference a valid hero fallback",
    masterSvg.includes("<svg") && universitySvg.includes("<svg"),
    `master=${masterSvg.length}, university=${universitySvg.length}`,
  ),
  test(
    "master and institutional documents reuse one hero image per handoff/run",
    sharedMasterHeroFileName === sharedUniversityHeroFileName &&
      /^cover-hero-shared-[a-f0-9]{12}\.png$/.test(sharedMasterHeroFileName),
    `${sharedMasterHeroFileName} | ${sharedUniversityHeroFileName}`,
  ),
  test(
    "lower-case heading becomes capitalized",
    lowerHeading === "Cronograma de investigaci\u00f3n para BIM e IA aplicada",
    lowerHeading,
  ),
  test(
    "acronyms are preserved",
    /BIM/.test(lowerHeading) && /IA/.test(lowerHeading),
    lowerHeading,
  ),
  test(
    "DOI and URL are unchanged",
    sentenceStyleCapitalizePublicText(doi, "label") === doi &&
      sentenceStyleCapitalizePublicText(url, "label") === url,
    `${sentenceStyleCapitalizePublicText(doi, "label")} | ${sentenceStyleCapitalizePublicText(url, "label")}`,
  ),
  test(
    "quoted evidence text is unchanged",
    sentenceStyleCapitalizePublicText(quoted, "sentence") === quoted,
    sentenceStyleCapitalizePublicText(quoted, "sentence"),
  ),
  test(
    "Spanish sentence-style capitalization is used instead of English title case",
    spanishSentence ===
      "An\u00e1lisis comparativo para aisladores s\u00edsmicos en edificios peruanos",
    spanishSentence,
  ),
  test(
    "hero policy requires fallback infographic behavior",
    heroInfographicPolicy.fallback_rule.includes("SVG deterministico") &&
      heroInfographicPolicy.fallback_rule.includes("no usar caption") &&
      heroInfographicPolicy.visual_type === "methodological_infographic_cover",
    JSON.stringify(heroInfographicPolicy, null, 2),
  ),
];

const failed = results.filter((result) => !result.passed);

for (const result of results) {
  console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}`);
  if (!result.passed && result.details) {
    console.log(`  ${result.details}`);
  }
}

console.log(`\nHero infographic policy tests: ${results.length - failed.length}/${results.length} passed`);

if (failed.length > 0) {
  process.exit(1);
}
