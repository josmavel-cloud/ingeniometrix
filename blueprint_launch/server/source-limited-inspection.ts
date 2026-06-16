import { execFile } from "node:child_process";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { buildBrowserLikeFetchHeaders } from "@/server/retrieval/reference-access";
import {
  findUserProvidedPdfEntryForSource,
  inspectUserProvidedPdfEntryFile,
  type UserProvidedSourcePdfManifestV1,
} from "@/server/blueprint-engine/quality/user-provided-source-pdfs";

import type {
  BlueprintLaunchEvidencePlanningResult,
  BlueprintLaunchLimitedInspectionItem,
  BlueprintLaunchLimitedSourceInspectionResult,
  BlueprintLaunchSelectedSourceBundle,
  BlueprintLaunchSourceAccessResolutionResult,
} from "./local-playground-store";

const execFileAsync = promisify(execFile);
const LIMITED_INSPECTION_ROOT = path.join(
  process.cwd(),
  "artifacts-local",
  "blueprint_launch",
  "limited_source_inspection",
);
const FETCH_TIMEOUT_MS = 45_000;
const MIN_USEFUL_TEXT_CHARS = 500;
const MIN_USABLE_INSPECTIONS = 2;
const MAX_SAMPLE_PAGES = 6;
const MAX_SAMPLE_CHARS = 18_000;

type LimitedPdfExtraction = {
  page_count: number;
  page_texts: Array<{ page_number: number; text: string }>;
  equation_candidates: Array<{ page_number: number; raw_text: string }>;
  table_captions: Array<{ page_number: number; caption: string }>;
  figure_captions: Array<{ page_number: number; caption: string }>;
  secondary_reference_candidates: string[];
  full_text: string;
};

function buildTimestampToken(value: string) {
  return value.replace(/[:.]/g, "-");
}

function buildSafeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function createTimeoutSignal(timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timeout);
    },
  };
}

function bufferLooksLikePdf(buffer: Buffer) {
  return buffer.subarray(0, 5).toString("utf8") === "%PDF-";
}

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function titleTokens(title: string) {
  const stop = new Set([
    "with",
    "from",
    "among",
    "between",
    "sobre",
    "para",
    "entre",
    "desde",
    "actual",
    "study",
    "analysis",
    "estudio",
    "analisis",
  ]);

  return normalize(title)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 5 && !stop.has(token));
}

function doiFingerprint(doi: string | null | undefined) {
  return normalize(doi).replace(/^https?:\/\/doi\.org\//, "").replace(/^doi:/, "");
}

function titleMatchRatio(input: { title: string; text: string }) {
  const tokens = titleTokens(input.title);
  if (tokens.length === 0) {
    return null;
  }

  const haystack = normalize(input.text.slice(0, 40_000));
  const matched = tokens.filter((token) => haystack.includes(token)).length;
  return matched / tokens.length;
}

function inferIdentity(input: { title: string; doi?: string | null; text: string }) {
  if (!input.text.trim()) {
    return {
      identityStatus: "unknown" as const,
      titleTokenMatchRatio: null,
      doiMatched: input.doi ? false : null,
    };
  }

  const ratio = titleMatchRatio({ title: input.title, text: input.text });
  const doi = doiFingerprint(input.doi);
  const doiMatched = doi ? normalize(input.text).includes(doi) : null;

  if (doiMatched || (ratio ?? 0) >= 0.45) {
    return {
      identityStatus: "matched" as const,
      titleTokenMatchRatio: ratio,
      doiMatched,
    };
  }

  if ((ratio ?? 0) >= 0.2) {
    return {
      identityStatus: "weak_match" as const,
      titleTokenMatchRatio: ratio,
      doiMatched,
    };
  }

  return {
    identityStatus: "mismatch" as const,
    titleTokenMatchRatio: ratio,
    doiMatched,
  };
}

function countSignals(text: string, groups: string[]) {
  const haystack = normalize(text);
  return groups.filter((term) => haystack.includes(term)).length;
}

function collectSignals(text: string, groups: string[]) {
  const haystack = normalize(text);
  return groups.filter((term) => haystack.includes(term)).slice(0, 12);
}

const METHOD_TERMS = [
  "method",
  "methods",
  "methodology",
  "study design",
  "cross sectional",
  "cohort",
  "survey",
  "interview",
  "regression",
  "protocol",
  "instrument",
  "validation",
  "sample",
  "population",
  "metodo",
  "metodologia",
  "diseno",
  "transversal",
  "cohorte",
  "encuesta",
  "entrevista",
  "regresion",
  "instrumento",
  "validacion",
  "muestra",
  "poblacion",
];
const THEORY_TERMS = [
  "theory",
  "framework",
  "conceptual",
  "model",
  "construct",
  "principle",
  "guideline",
  "teoria",
  "marco",
  "conceptual",
  "modelo",
  "constructo",
  "principio",
  "guia",
];
const VARIABLE_TERMS = [
  "variable",
  "indicator",
  "outcome",
  "exposure",
  "factor",
  "parameter",
  "measure",
  "scale",
  "score",
  "dimension",
  "covariate",
  "dependent",
  "independent",
  "indicador",
  "resultado",
  "exposicion",
  "factor",
  "parametro",
  "medicion",
  "escala",
  "puntaje",
  "dimension",
  "covariable",
];

function summarizeText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 320 ? `${normalized.slice(0, 317)}...` : normalized;
}

function buildSampleText(extraction: LimitedPdfExtraction) {
  const firstPages = extraction.page_texts
    .slice(0, MAX_SAMPLE_PAGES)
    .map((page) => `[p.${page.page_number}] ${page.text}`)
    .join("\n\n");
  return firstPages.slice(0, MAX_SAMPLE_CHARS);
}

function findWorkspacePythonExecutable() {
  const candidates = [
    path.join(
      os.homedir(),
      ".cache",
      "codex-runtimes",
      "codex-primary-runtime",
      "dependencies",
      "python",
      "python.exe",
    ),
    "python",
  ];

  return candidates.find((candidate) => candidate === "python" || existsSync(candidate)) ?? "python";
}

async function runLimitedPdfExtraction(pdfPath: string): Promise<LimitedPdfExtraction> {
  const scriptPath = path.join(process.cwd(), "blueprint_launch", "server", "pdf_limited_extract_runtime.py");
  const { stdout } = await execFileAsync(findWorkspacePythonExecutable(), [
    scriptPath,
    "--pdf",
    pdfPath,
  ], {
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });

  return JSON.parse(stdout) as LimitedPdfExtraction;
}

async function fetchContent(url: string) {
  const signal = createTimeoutSignal(FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: buildBrowserLikeFetchHeaders({
        accept: "application/pdf,text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
        referer: url,
      }),
      signal: signal.signal,
    });

    return response;
  } finally {
    signal.clear();
  }
}

export function buildLimitedInspectionItemFromText(input: {
  sourceId: string;
  title: string;
  doi?: string | null;
  plannedContentUrl?: string | null;
  status?: BlueprintLaunchLimitedInspectionItem["status"];
  inspectedKind?: BlueprintLaunchLimitedInspectionItem["inspectedKind"];
  localPrimaryPath?: string | null;
  localSampleTextPath?: string | null;
  byteSize?: number | null;
  pageCount?: number | null;
  sampledPageCount?: number;
  text: string;
  sampleText?: string;
  equationCandidateCount?: number;
  tableCandidateCount?: number;
  figureCandidateCount?: number;
  secondaryReferenceCandidateCount?: number;
  secondaryReferenceCandidates?: string[];
  warnings?: string[];
}): BlueprintLaunchLimitedInspectionItem {
  const identity = inferIdentity({
    title: input.title,
    doi: input.doi,
    text: input.text,
  });
  const methodSignals = collectSignals(input.text, METHOD_TERMS);
  const theorySignals = collectSignals(input.text, THEORY_TERMS);
  const variableSignals = collectSignals(input.text, VARIABLE_TERMS);
  const warnings = [...(input.warnings ?? [])];

  if (identity.identityStatus === "mismatch") {
    warnings.push("La identidad del documento no coincide de forma suficiente con titulo/DOI.");
  } else if (identity.identityStatus === "weak_match") {
    warnings.push("La identidad del documento requiere revision manual por coincidencia debil.");
  }

  if (input.text.length < MIN_USEFUL_TEXT_CHARS && input.status !== "skipped") {
    warnings.push("Texto extraido insuficiente para decidir suficiencia de evidencia.");
  }

  return {
    sourceId: input.sourceId,
    title: input.title,
    plannedContentUrl: input.plannedContentUrl ?? null,
    status: input.status ?? "inspected",
    inspectedKind: input.inspectedKind ?? "unknown",
    localPrimaryPath: input.localPrimaryPath ?? null,
    localSampleTextPath: input.localSampleTextPath ?? null,
    byteSize: input.byteSize ?? null,
    pageCount: input.pageCount ?? null,
    sampledPageCount: input.sampledPageCount ?? 0,
    textCharCount: input.text.length,
    sampleTextCharCount: (input.sampleText ?? input.text).length,
    identityStatus: identity.identityStatus,
    titleTokenMatchRatio: identity.titleTokenMatchRatio,
    doiMatched: identity.doiMatched,
    methodSignalCount: countSignals(input.text, METHOD_TERMS),
    theorySignalCount: countSignals(input.text, THEORY_TERMS),
    variableSignalCount: countSignals(input.text, VARIABLE_TERMS),
    equationCandidateCount: input.equationCandidateCount ?? 0,
    tableCandidateCount: input.tableCandidateCount ?? 0,
    figureCandidateCount: input.figureCandidateCount ?? 0,
    secondaryReferenceCandidateCount: input.secondaryReferenceCandidateCount ?? 0,
    secondaryReferenceCandidates: input.secondaryReferenceCandidates?.slice(0, 40) ?? [],
    inspectionSummary: summarizeText(input.sampleText ?? input.text),
    methodSignals,
    theorySignals,
    variableSignals,
    warnings: Array.from(new Set(warnings)),
  };
}

export function evaluateLimitedInspectionGate(input: {
  items: BlueprintLaunchLimitedInspectionItem[];
  minUsableInspections?: number;
}): Pick<
  BlueprintLaunchLimitedSourceInspectionResult,
  | "postInspectionDecision"
  | "postInspectionReasons"
  | "sourceIdsForFullExtraction"
  | "sourceIdsNeedingReplacement"
  | "sourceIdsNeedingManualReview"
  | "sourceIdsForDeepResearchLight"
  | "secondaryReferenceCandidateCount"
> {
  const minUsable = input.minUsableInspections ?? MIN_USABLE_INSPECTIONS;
  const sourceIdsNeedingManualReview = input.items
    .filter((item) => item.identityStatus === "mismatch" || item.identityStatus === "weak_match")
    .map((item) => item.sourceId);
  const sourceIdsNeedingReplacement = input.items
    .filter((item) => item.status !== "inspected" || item.textCharCount < MIN_USEFUL_TEXT_CHARS)
    .map((item) => item.sourceId);
  const usable = input.items.filter(
    (item) =>
      item.status === "inspected" &&
      item.textCharCount >= MIN_USEFUL_TEXT_CHARS &&
      item.identityStatus !== "mismatch",
  );
  const sourceIdsForFullExtraction = usable.map((item) => item.sourceId);
  const secondaryReferenceCandidateCount = input.items.reduce(
    (sum, item) => sum + item.secondaryReferenceCandidateCount,
    0,
  );
  const methodSignalCount = usable.reduce((sum, item) => sum + item.methodSignalCount, 0);
  const theoryOrVariableSignalCount = usable.reduce(
    (sum, item) => sum + item.theorySignalCount + item.variableSignalCount,
    0,
  );
  const postInspectionReasons: string[] = [];

  if (usable.length === 0) {
    postInspectionReasons.push("No hay fuentes con texto util e identidad aceptable tras inspeccion limitada.");
    return {
      postInspectionDecision: "BLOCK_NO_USABLE_EVIDENCE",
      postInspectionReasons,
      sourceIdsForFullExtraction,
      sourceIdsNeedingReplacement,
      sourceIdsNeedingManualReview,
      sourceIdsForDeepResearchLight: input.items.map((item) => item.sourceId),
      secondaryReferenceCandidateCount,
    };
  }

  if (usable.length < minUsable) {
    postInspectionReasons.push(
      `Solo ${usable.length} fuente(s) util(es) tras inspeccion limitada; minimo requerido: ${minUsable}.`,
    );
    return {
      postInspectionDecision: "NEEDS_SOURCE_REPLACEMENT",
      postInspectionReasons,
      sourceIdsForFullExtraction,
      sourceIdsNeedingReplacement,
      sourceIdsNeedingManualReview,
      sourceIdsForDeepResearchLight: usable.map((item) => item.sourceId),
      secondaryReferenceCandidateCount,
    };
  }

  if (sourceIdsNeedingManualReview.length > 0) {
    postInspectionReasons.push("Una o mas fuentes requieren revision manual de identidad documental.");
    return {
      postInspectionDecision: "NEEDS_MANUAL_PDF_REVIEW",
      postInspectionReasons,
      sourceIdsForFullExtraction,
      sourceIdsNeedingReplacement,
      sourceIdsNeedingManualReview,
      sourceIdsForDeepResearchLight: [],
      secondaryReferenceCandidateCount,
    };
  }

  if (methodSignalCount === 0 || theoryOrVariableSignalCount === 0) {
    postInspectionReasons.push(
      "La inspeccion limitada no encontro senales suficientes de metodo, teoria o variables; conviene activar busqueda Deep Research light.",
    );
    return {
      postInspectionDecision: "NEEDS_DEEP_RESEARCH_LIGHT",
      postInspectionReasons,
      sourceIdsForFullExtraction,
      sourceIdsNeedingReplacement,
      sourceIdsNeedingManualReview,
      sourceIdsForDeepResearchLight: usable.map((item) => item.sourceId),
      secondaryReferenceCandidateCount,
    };
  }

  postInspectionReasons.push("Inspeccion limitada suficiente para continuar a extraccion completa.");
  return {
    postInspectionDecision: "PROCEED_TO_FULL_EXTRACTION",
    postInspectionReasons,
    sourceIdsForFullExtraction,
    sourceIdsNeedingReplacement,
    sourceIdsNeedingManualReview,
    sourceIdsForDeepResearchLight: [],
    secondaryReferenceCandidateCount,
  };
}

async function inspectPdf(input: {
  pdfPath: string;
  sourceId: string;
  title: string;
  doi?: string | null;
  plannedContentUrl: string | null;
  runDir: string;
  baseName: string;
  byteSize: number | null;
  inspectedKind: BlueprintLaunchLimitedInspectionItem["inspectedKind"];
  warnings?: string[];
}) {
  const extracted = await runLimitedPdfExtraction(input.pdfPath);
  const sampleText = buildSampleText(extracted);
  const localSampleTextPath = path.join(input.runDir, `${input.baseName}-limited-sample.txt`);
  await writeFile(localSampleTextPath, `${sampleText}\n`, "utf8");

  return buildLimitedInspectionItemFromText({
    sourceId: input.sourceId,
    title: input.title,
    doi: input.doi,
    plannedContentUrl: input.plannedContentUrl,
    inspectedKind: input.inspectedKind,
    localPrimaryPath: input.pdfPath,
    localSampleTextPath,
    byteSize: input.byteSize,
    pageCount: extracted.page_count,
    sampledPageCount: Math.min(extracted.page_texts.length, MAX_SAMPLE_PAGES),
    text: extracted.full_text,
    sampleText,
    equationCandidateCount: extracted.equation_candidates.length,
    tableCandidateCount: extracted.table_captions.length,
    figureCandidateCount: extracted.figure_captions.length,
    secondaryReferenceCandidateCount: extracted.secondary_reference_candidates.length,
    secondaryReferenceCandidates: extracted.secondary_reference_candidates,
    warnings: input.warnings,
  });
}

async function inspectSingleSource(input: {
  source: BlueprintLaunchSelectedSourceBundle["sources"][number];
  planItem: BlueprintLaunchEvidencePlanningResult["materializationPlan"][number] | undefined;
  access: BlueprintLaunchSourceAccessResolutionResult["items"][number] | undefined;
  runDir: string;
  index: number;
  userProvidedPdfManifest?: UserProvidedSourcePdfManifestV1 | null;
}) {
  const sourceId = input.source.reference.id;
  const title = input.source.reference.title;
  const baseName = `${String(input.index + 1).padStart(2, "0")}-${buildSafeKey(title) || "source"}`;
  const plannedContentUrl = input.planItem?.contentUrl ?? input.access?.resolvedContentUrl ?? null;
  const userProvided = findUserProvidedPdfEntryForSource(input.userProvidedPdfManifest, sourceId);

  try {
    if (userProvided) {
      const inspection = await inspectUserProvidedPdfEntryFile(userProvided);
      if (!inspection.valid_for_import) {
        return buildLimitedInspectionItemFromText({
          sourceId,
          title,
          doi: input.source.reference.doi,
          plannedContentUrl,
          status: "failed",
          inspectedKind: "user_provided_pdf",
          text: "",
          warnings: ["PDF local proporcionado por usuario no valido para importacion.", ...inspection.warnings],
        });
      }

      const localPdfPath = path.join(input.runDir, `${baseName}.pdf`);
      await copyFile(userProvided.local_pdf_path, localPdfPath);
      return inspectPdf({
        pdfPath: localPdfPath,
        sourceId,
        title,
        doi: input.source.reference.doi,
        plannedContentUrl,
        runDir: input.runDir,
        baseName,
        byteSize: inspection.byte_size,
        inspectedKind: "user_provided_pdf",
        warnings: [
          "PDF local proporcionado por usuario; inspeccion permitida para diagnostico.",
          ...inspection.warnings,
        ],
      });
    }

    if (!plannedContentUrl || !input.access?.hasCompletePublicContent) {
      return buildLimitedInspectionItemFromText({
        sourceId,
        title,
        doi: input.source.reference.doi,
        plannedContentUrl,
        status: "skipped",
        inspectedKind: "unknown",
        text: "",
        warnings: ["Fuente sin texto completo/PDF inspeccionable en Step 4A."],
      });
    }

    const response = await fetchContent(plannedContentUrl);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!response.ok) {
      return buildLimitedInspectionItemFromText({
        sourceId,
        title,
        doi: input.source.reference.doi,
        plannedContentUrl,
        status: "failed",
        inspectedKind: "unknown",
        text: "",
        warnings: [`Inspeccion limitada fallo con HTTP ${response.status}.`],
      });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (contentType.includes("pdf") || bufferLooksLikePdf(buffer)) {
      const localPdfPath = path.join(input.runDir, `${baseName}.pdf`);
      await writeFile(localPdfPath, buffer);
      return inspectPdf({
        pdfPath: localPdfPath,
        sourceId,
        title,
        doi: input.source.reference.doi,
        plannedContentUrl,
        runDir: input.runDir,
        baseName,
        byteSize: buffer.byteLength,
        inspectedKind: "pdf",
      });
    }

    const html = buffer.toString("utf8");
    const text = stripHtml(html);
    const localHtmlPath = path.join(input.runDir, `${baseName}.html`);
    const localSampleTextPath = path.join(input.runDir, `${baseName}-limited-sample.txt`);
    const sampleText = text.slice(0, MAX_SAMPLE_CHARS);
    await writeFile(localHtmlPath, html, "utf8");
    await writeFile(localSampleTextPath, `${sampleText}\n`, "utf8");

    return buildLimitedInspectionItemFromText({
      sourceId,
      title,
      doi: input.source.reference.doi,
      plannedContentUrl,
      inspectedKind: "web_text",
      localPrimaryPath: localHtmlPath,
      localSampleTextPath,
      byteSize: buffer.byteLength,
      pageCount: null,
      sampledPageCount: 0,
      text,
      sampleText,
    });
  } catch (error) {
    return buildLimitedInspectionItemFromText({
      sourceId,
      title,
      doi: input.source.reference.doi,
      plannedContentUrl,
      status: "failed",
      inspectedKind: "unknown",
      text: "",
      warnings: [
        error instanceof Error
          ? `Fallo la inspeccion limitada: ${error.message}`
          : "Fallo la inspeccion limitada.",
      ],
    });
  }
}

async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  mapper: (value: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(values[currentIndex] as T, currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, () => worker()));
  return results;
}

function buildSummary(input: {
  attemptedCount: number;
  inspectedCount: number;
  usableInspectionCount: number;
  postInspectionDecision: BlueprintLaunchLimitedSourceInspectionResult["postInspectionDecision"];
}) {
  return `Step 4A ${input.postInspectionDecision}: ${input.inspectedCount}/${input.attemptedCount} fuente(s) inspeccionada(s), ${input.usableInspectionCount} util(es) para decidir extraccion completa.`;
}

export async function inspectBlueprintLaunchSourcesLimited(input: {
  bundle: BlueprintLaunchSelectedSourceBundle;
  sourceAccessResolution: BlueprintLaunchSourceAccessResolutionResult;
  evidencePlanning: BlueprintLaunchEvidencePlanningResult;
  userProvidedPdfManifest?: UserProvidedSourcePdfManifestV1 | null;
}): Promise<BlueprintLaunchLimitedSourceInspectionResult> {
  const savedAt = new Date().toISOString();
  const runDir = path.join(LIMITED_INSPECTION_ROOT, `run-${buildTimestampToken(savedAt)}`);
  await mkdir(runDir, { recursive: true });

  const plannedInspectable = new Set(input.evidencePlanning.inspectableSourceIds ?? []);
  const identityBlocked = new Set(input.evidencePlanning.identityBlockedSourceIds ?? []);
  const userProvidedIds = new Set(
    (input.userProvidedPdfManifest?.entries ?? []).map((entry) => entry.source_id),
  );
  const sourcesToInspect = input.bundle.sources.filter((source) => {
    const sourceId = source.reference.id;
    return (
      !identityBlocked.has(sourceId) &&
      (plannedInspectable.has(sourceId) || userProvidedIds.has(sourceId))
    );
  });
  const accessBySourceId = new Map(
    input.sourceAccessResolution.items.map((item) => [item.sourceId, item]),
  );
  const planBySourceId = new Map(
    input.evidencePlanning.materializationPlan.map((item) => [item.sourceId, item]),
  );
  const items = await mapWithConcurrency(sourcesToInspect, 2, (source, index) =>
    inspectSingleSource({
      source,
      planItem: planBySourceId.get(source.reference.id),
      access: accessBySourceId.get(source.reference.id),
      runDir,
      index,
      userProvidedPdfManifest: input.userProvidedPdfManifest,
    }),
  );
  const gate = evaluateLimitedInspectionGate({ items });
  const inspectedCount = items.filter((item) => item.status === "inspected").length;
  const usableInspectionCount = gate.sourceIdsForFullExtraction.length;
  const failedCount = items.filter((item) => item.status === "failed").length;
  const skippedCount = items.filter((item) => item.status === "skipped").length;
  const warnings = Array.from(
    new Set([
      ...items.flatMap((item) => item.warnings),
      ...gate.postInspectionReasons,
      ...(input.evidencePlanning.replacementRecommendedSourceIds ?? []).map(
        (sourceId) => `Fuente recomendada para reemplazo antes de inspeccion: ${sourceId}.`,
      ),
      ...(input.evidencePlanning.identityBlockedSourceIds ?? []).map(
        (sourceId) => `Fuente excluida de inspeccion limitada por riesgo de identidad: ${sourceId}.`,
      ),
    ]),
  );
  const result: BlueprintLaunchLimitedSourceInspectionResult = {
    artifact_type: "limited_source_inspection",
    artifact_version: "v1",
    savedAt,
    summary: buildSummary({
      attemptedCount: sourcesToInspect.length,
      inspectedCount,
      usableInspectionCount,
      postInspectionDecision: gate.postInspectionDecision,
    }),
    runDir,
    attemptedCount: sourcesToInspect.length,
    inspectedCount,
    usableInspectionCount,
    failedCount,
    skippedCount,
    ...gate,
    items,
    warnings,
  };

  await writeFile(path.join(runDir, "limited-inspection.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return result;
}

export function renderLimitedInspectionReport(result: BlueprintLaunchLimitedSourceInspectionResult) {
  const lines = [
    "# Limited Source Inspection",
    "",
    `Decision: ${result.postInspectionDecision}`,
    `Inspected sources: ${result.inspectedCount}/${result.attemptedCount}`,
    `Usable sources: ${result.usableInspectionCount}`,
    `Secondary reference candidates: ${result.secondaryReferenceCandidateCount}`,
    "",
    "## Reasons",
    "",
    ...result.postInspectionReasons.map((reason) => `- ${reason}`),
    "",
    "## Sources",
    "",
    ...result.items.map((item) =>
      [
        `### ${item.sourceId}`,
        "",
        `- Title: ${item.title}`,
        `- Status: ${item.status}`,
        `- Kind: ${item.inspectedKind}`,
        `- Identity: ${item.identityStatus}`,
        `- Text chars: ${item.textCharCount}`,
        `- Method signals: ${item.methodSignals.join(", ") || "none"}`,
        `- Theory signals: ${item.theorySignals.join(", ") || "none"}`,
        `- Variable signals: ${item.variableSignals.join(", ") || "none"}`,
        `- Equation candidates: ${item.equationCandidateCount}`,
        `- Table candidates: ${item.tableCandidateCount}`,
        `- Figure candidates: ${item.figureCandidateCount}`,
        `- Secondary references: ${item.secondaryReferenceCandidateCount}`,
        item.warnings.length > 0 ? `- Warnings: ${item.warnings.join(" | ")}` : "- Warnings: none",
      ].join("\n"),
    ),
    "",
  ];

  return `${lines.join("\n")}\n`;
}
