import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { Prisma, Provider } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/server/audit/audit-service";
import {
  buildMvpApiUsageReport,
  captureMvpApiUsageSnapshot,
} from "@/server/mvp/api-usage-service";
import {
  buildBrowserLikeFetchHeaders,
  extractAccessSignals,
  verifyPdfAccess,
} from "@/server/retrieval/reference-access";

const execFileAsync = promisify(execFile);
const FETCH_TIMEOUT_MS = 35_000;
const MAX_PDF_BYTES = 35 * 1024 * 1024;
const MAX_SAMPLE_CHARS = 18_000;
const MIN_USEFUL_TEXT_CHARS = 500;
const MIN_USABLE_SOURCES = 3;
const MIN_DIRECT_OR_METHOD_SOURCES = 2;

export type MvpSourceInspectionDecision =
  | "READY_FOR_BLUEPRINT"
  | "READY_WITH_WARNINGS"
  | "NEEDS_SOURCE_REPLACEMENT"
  | "NEEDS_MANUAL_REVIEW"
  | "NEEDS_DEEP_RESEARCH_LIGHT"
  | "BLOCKED_INSUFFICIENT_EVIDENCE";

export type MvpSourceHealth =
  | "usable_full_text"
  | "partial_full_text"
  | "metadata_only"
  | "unresolved"
  | "unextractable_pdf"
  | "wrong_document_suspected";

export type MvpSourceTopicFit = "direct" | "methodological" | "contextual" | "weak" | "unknown";

export type MvpSourceInspectionItem = {
  source_id: string;
  selected_order: number | null;
  title: string;
  year: number | null;
  doi: string | null;
  venue: string | null;
  landing_page_url: string | null;
  pdf_url: string | null;
  pdf_available_signal: boolean;
  pdf_accessible: boolean;
  fetch_status: "downloaded" | "metadata_only" | "failed" | "skipped";
  source_health: MvpSourceHealth;
  topic_fit: MvpSourceTopicFit;
  allowed_evidence_use:
    | "central_claim_support"
    | "method_support"
    | "context_only"
    | "gap_only"
    | "do_not_use";
  identity_status: "matched" | "weak_match" | "mismatch" | "unknown";
  title_token_match_ratio: number | null;
  doi_matched: boolean | null;
  text_char_count: number;
  sample_text_path: string | null;
  downloaded_pdf_path: string | null;
  method_signal_count: number;
  theory_signal_count: number;
  variable_signal_count: number;
  equation_candidate_count: number;
  table_candidate_count: number;
  figure_candidate_count: number;
  secondary_reference_candidate_count: number;
  matched_signals: {
    method: string[];
    theory: string[];
    variable: string[];
  };
  warnings: string[];
  blockers: string[];
};

export type MvpSourceInspectionResult = {
  artifact_type: "mvp_source_inspection";
  artifact_version: "v1";
  generated_at: string;
  project_id: string;
  run_id: string;
  artifact_dir: string;
  decision: MvpSourceInspectionDecision;
  selected_source_count: number;
  inspected_source_count: number;
  usable_source_count: number;
  direct_or_method_source_count: number;
  metadata_only_source_count: number;
  source_ids_ready_for_blueprint: string[];
  source_ids_needing_replacement: string[];
  source_ids_needing_manual_review: string[];
  missing_evidence_categories: string[];
  reasons: string[];
  warnings: string[];
  blockers: string[];
  items: MvpSourceInspectionItem[];
  api_usage: {
    run_id: string;
    report: Awaited<ReturnType<typeof buildMvpApiUsageReport>>;
  };
};

type ProjectReferenceWithReference = NonNullable<Awaited<ReturnType<typeof loadSelectedReferences>>>[number];

const METHOD_TERMS = [
  "method", "methodology", "form", "first-order reliability", "first order reliability",
  "monte carlo", "simulation", "reliability index", "beta", "probability of failure",
  "limit state", "sensitivity", "sampling", "metodo", "metodologia", "simulacion",
  "indice de confiabilidad", "probabilidad de falla", "estado limite", "confiabilidad",
];
const THEORY_TERMS = [
  "theory", "framework", "model", "structural reliability", "reliability", "fragility",
  "seismic", "fatigue", "steel bridge", "bridge", "truss", "teoria", "marco", "modelo",
  "confiabilidad estructural", "fragilidad", "sismica", "puente", "acero",
];
const VARIABLE_TERMS = [
  "variable", "indicator", "parameter", "load", "resistance", "failure", "deflection",
  "corrosion", "fatigue", "seismic demand", "capacity", "uncertainty", "parametro",
  "carga", "resistencia", "falla", "deflexion", "incertidumbre", "capacidad",
];
const DIRECT_TOPIC_TERMS = [
  "bridge", "steel", "structural reliability", "reliability index", "seismic", "fatigue",
  "puente", "acero", "confiabilidad estructural", "sismica", "fatiga",
];

function safeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "source";
}

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function titleTokens(title: string) {
  const stop = new Set(["with", "from", "using", "based", "analysis", "study", "sobre", "para", "basados", "analisis"]);
  return normalize(title)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 5 && !stop.has(token));
}

function identityFromText(input: { title: string; doi: string | null; text: string }) {
  if (!input.text.trim()) {
    return { identity_status: "unknown" as const, title_token_match_ratio: null, doi_matched: input.doi ? false : null };
  }
  const haystack = normalize(input.text.slice(0, 50_000));
  const tokens = titleTokens(input.title);
  const matched = tokens.filter((token) => haystack.includes(token)).length;
  const ratio = tokens.length ? Math.round((matched / tokens.length) * 100) / 100 : null;
  const doi = normalize(input.doi).replace(/^https?:\/\/doi\.org\//, "").replace(/^doi:/, "");
  const doiMatched = doi ? haystack.includes(doi) : null;
  if (doiMatched || (ratio ?? 0) >= 0.45) {
    return { identity_status: "matched" as const, title_token_match_ratio: ratio, doi_matched: doiMatched };
  }
  if ((ratio ?? 0) >= 0.2) {
    return { identity_status: "weak_match" as const, title_token_match_ratio: ratio, doi_matched: doiMatched };
  }
  return { identity_status: "mismatch" as const, title_token_match_ratio: ratio, doi_matched: doiMatched };
}

function countSignals(text: string, terms: string[]) {
  const haystack = normalize(text);
  const matched = terms.filter((term) => haystack.includes(normalize(term)));
  return { count: matched.length, matched: matched.slice(0, 12) };
}

function countPattern(text: string, pattern: RegExp) {
  return (text.match(pattern) ?? []).length;
}

function resolveTopicFit(input: { title: string; abstract: string | null; text: string; methodCount: number; theoryCount: number }) {
  const haystack = normalize([input.title, input.abstract, input.text.slice(0, 10_000)].join("\n"));
  const directMatches = DIRECT_TOPIC_TERMS.filter((term) => haystack.includes(normalize(term))).length;
  if (directMatches >= 4 && input.methodCount > 0) return "direct" as const;
  if (input.methodCount >= 3) return "methodological" as const;
  if (directMatches >= 2 || input.theoryCount >= 2) return "contextual" as const;
  if (directMatches > 0 || input.methodCount > 0 || input.theoryCount > 0) return "weak" as const;
  return "unknown" as const;
}

function allowedUse(input: { health: MvpSourceHealth; identity: MvpSourceInspectionItem["identity_status"]; topicFit: MvpSourceTopicFit }) {
  if (input.identity === "mismatch" || input.health === "wrong_document_suspected" || input.health === "unresolved") {
    return "do_not_use" as const;
  }
  if (input.topicFit === "direct" && ["usable_full_text", "partial_full_text"].includes(input.health)) {
    return "central_claim_support" as const;
  }
  if (input.topicFit === "methodological") return "method_support" as const;
  if (input.topicFit === "contextual" || input.health === "metadata_only") return "context_only" as const;
  return "gap_only" as const;
}

function healthFromInspection(input: { pdfUrl: string | null; pdfAccessible: boolean; fetchStatus: MvpSourceInspectionItem["fetch_status"]; textCharCount: number; identityStatus: MvpSourceInspectionItem["identity_status"] }) {
  if (input.identityStatus === "mismatch") return "wrong_document_suspected" as const;
  if (input.fetchStatus === "failed") return input.pdfUrl ? "unextractable_pdf" as const : "unresolved" as const;
  if (input.textCharCount >= MIN_USEFUL_TEXT_CHARS) return "usable_full_text" as const;
  if (input.textCharCount > 0) return "partial_full_text" as const;
  if (!input.pdfUrl || !input.pdfAccessible) return "metadata_only" as const;
  return "unextractable_pdf" as const;
}

async function loadSelectedReferences(userId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    include: {
      projectReferences: {
        where: { selected: true },
        orderBy: { selectedOrder: "asc" },
        include: { reference: true },
      },
    },
  });
  if (!project) throw new Error("Proyecto no encontrado.");
  return project.projectReferences;
}

async function fetchPdf(input: { pdfUrl: string; referer: string | null; targetPath: string }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(input.pdfUrl, {
      method: "GET",
      redirect: "follow",
      headers: buildBrowserLikeFetchHeaders({ referer: input.referer ?? input.pdfUrl }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") ?? "";
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.byteLength > MAX_PDF_BYTES) throw new Error(`PDF demasiado grande (${buffer.byteLength} bytes).`);
    if (!contentType.toLowerCase().includes("pdf") && buffer.subarray(0, 5).toString("utf8") !== "%PDF-") {
      throw new Error(`Respuesta no parece PDF (${contentType || "sin content-type"}).`);
    }
    await writeFile(input.targetPath, buffer);
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

async function extractPdfText(pdfPath: string, txtPath: string) {
  try {
    await execFileAsync("pdftotext", ["-layout", "-f", "1", "-l", "8", pdfPath, txtPath], { timeout: 30_000 });
    return await readFile(txtPath, "utf8");
  } catch {
    try {
      await execFileAsync("pdftotext", [pdfPath, txtPath], { timeout: 30_000 });
      return await readFile(txtPath, "utf8");
    } catch {
      return "";
    }
  }
}

async function inspectOne(input: { item: ProjectReferenceWithReference; artifactDir: string }): Promise<MvpSourceInspectionItem> {
  const { item } = input;
  const access = extractAccessSignals({
    rawOpenAlexJson: item.reference.rawOpenAlexJson,
    landingPageUrl: item.reference.landingPageUrl,
    doi: item.reference.doi,
  });
  const pdfUrl = access.pdfUrl;
  const pdfAccessible = await verifyPdfAccess(pdfUrl);
  const sourceKey = `${String(item.selectedOrder ?? "x").padStart(2, "0")}-${safeKey(item.reference.title)}`;
  const pdfPath = pdfUrl ? path.join(input.artifactDir, `${sourceKey}.pdf`) : null;
  const textPath = path.join(input.artifactDir, `${sourceKey}.sample.txt`);
  const warnings: string[] = [];
  const blockers: string[] = [];
  let fetchStatus: MvpSourceInspectionItem["fetch_status"] = "skipped";
  let text = "";
  let downloadedPdfPath: string | null = null;
  let sampleTextPath: string | null = null;

  if (pdfUrl && pdfPath) {
    const fetched = await fetchPdf({ pdfUrl, referer: item.reference.landingPageUrl, targetPath: pdfPath });
    if (fetched.ok) {
      downloadedPdfPath = pdfPath;
      fetchStatus = "downloaded";
      text = await extractPdfText(pdfPath, textPath);
      if (text.trim()) {
        text = text.replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim();
        await writeFile(textPath, `${text.slice(0, MAX_SAMPLE_CHARS)}\n`, "utf8");
        sampleTextPath = textPath;
      } else {
        warnings.push("PDF descargado, pero pdftotext no extrajo texto util en la muestra.");
      }
    } else {
      fetchStatus = "failed";
      warnings.push(`PDF accesible en HEAD/GET corto, pero descarga fallo: ${fetched.error}`);
    }
  } else {
    fetchStatus = "metadata_only";
    warnings.push("No se detectó PDF público; la fuente queda en metadata/abstract hasta revisión manual o repositorio alterno.");
  }

  const fallbackText = [item.reference.title, item.reference.abstract, item.reference.venue].filter(Boolean).join("\n");
  const evidenceText = text || fallbackText;
  const identity = identityFromText({ title: item.reference.title, doi: item.reference.doi, text });
  let health = healthFromInspection({
    pdfUrl,
    pdfAccessible,
    fetchStatus,
    textCharCount: text.length,
    identityStatus: identity.identity_status,
  });
  if (!text && item.reference.abstract?.trim()) {
    health = "metadata_only";
  }
  if (identity.identity_status === "mismatch") {
    blockers.push("El texto extraído no coincide suficientemente con título/DOI; requiere revisión manual.");
  }

  const method = countSignals(evidenceText, METHOD_TERMS);
  const theory = countSignals(evidenceText, THEORY_TERMS);
  const variable = countSignals(evidenceText, VARIABLE_TERMS);
  const topicFit = resolveTopicFit({
    title: item.reference.title,
    abstract: item.reference.abstract,
    text: evidenceText,
    methodCount: method.count,
    theoryCount: theory.count,
  });

  return {
    source_id: item.referenceId,
    selected_order: item.selectedOrder,
    title: item.reference.title,
    year: item.reference.year,
    doi: item.reference.doi,
    venue: item.reference.venue,
    landing_page_url: item.reference.landingPageUrl,
    pdf_url: pdfUrl,
    pdf_available_signal: access.hasPdfUrl,
    pdf_accessible: pdfAccessible || Boolean(downloadedPdfPath),
    fetch_status: fetchStatus,
    source_health: health,
    topic_fit: topicFit,
    allowed_evidence_use: allowedUse({ health, identity: identity.identity_status, topicFit }),
    identity_status: identity.identity_status,
    title_token_match_ratio: identity.title_token_match_ratio,
    doi_matched: identity.doi_matched,
    text_char_count: text.length,
    sample_text_path: sampleTextPath,
    downloaded_pdf_path: downloadedPdfPath,
    method_signal_count: method.count,
    theory_signal_count: theory.count,
    variable_signal_count: variable.count,
    equation_candidate_count: countPattern(evidenceText, /(?:β|\bFORM\b|P\s*\(|probability of failure|reliability index|limit state|=|≤|≥)/gi),
    table_candidate_count: countPattern(evidenceText, /(?:table|tabla)\s+\d+/gi),
    figure_candidate_count: countPattern(evidenceText, /(?:figure|fig\.|figura)\s+\d+/gi),
    secondary_reference_candidate_count: countPattern(evidenceText, /\([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ-]+(?:\s+et\s+al\.)?,\s*(?:19|20)\d{2}\)/g),
    matched_signals: {
      method: method.matched,
      theory: theory.matched,
      variable: variable.matched,
    },
    warnings,
    blockers,
  };
}

function decide(items: MvpSourceInspectionItem[]) {
  const usable = items.filter((item) => ["usable_full_text", "partial_full_text"].includes(item.source_health) && item.identity_status !== "mismatch");
  const directOrMethod = usable.filter((item) => ["direct", "methodological"].includes(item.topic_fit));
  const manualReview = items.filter((item) => item.identity_status === "mismatch" || item.identity_status === "weak_match");
  const replacements = items.filter((item) =>
    ["metadata_only", "unresolved", "unextractable_pdf", "wrong_document_suspected"].includes(
      item.source_health,
    ),
  );
  const missing: string[] = [];
  const reasons: string[] = [];
  const warnings = unique(items.flatMap((item) => item.warnings));
  const blockers = unique(items.flatMap((item) => item.blockers));

  if (usable.length < MIN_USABLE_SOURCES) {
    missing.push("usable_full_text_sources");
    reasons.push(`Solo ${usable.length} fuente(s) con texto util; mínimo MVP recomendado: ${MIN_USABLE_SOURCES}.`);
  }
  if (directOrMethod.length < MIN_DIRECT_OR_METHOD_SOURCES) {
    missing.push("direct_or_methodological_sources");
    reasons.push(`Solo ${directOrMethod.length} fuente(s) directa(s)/metodológica(s); mínimo recomendado: ${MIN_DIRECT_OR_METHOD_SOURCES}.`);
  }
  if (!items.some((item) => item.method_signal_count > 0)) missing.push("method_or_design");
  if (!items.some((item) => item.theory_signal_count > 0)) missing.push("theory_or_model");
  if (!items.some((item) => item.variable_signal_count > 0)) missing.push("variables_or_parameters");

  let decision: MvpSourceInspectionDecision = "READY_FOR_BLUEPRINT";
  if (usable.length === 0) {
    decision = "BLOCKED_INSUFFICIENT_EVIDENCE";
    blockers.push("No hay texto util inspeccionado en ninguna fuente seleccionada.");
  } else if (manualReview.length > 0) {
    decision = "NEEDS_MANUAL_REVIEW";
    blockers.push("Hay fuentes con identidad débil o mismatch antes de usarlas como evidencia central.");
  } else if (usable.length < MIN_USABLE_SOURCES) {
    decision = "NEEDS_SOURCE_REPLACEMENT";
    blockers.push("No hay suficientes fuentes con texto útil para pasar limpio a blueprint.");
  } else if (missing.length > 0) {
    decision = "NEEDS_DEEP_RESEARCH_LIGHT";
    blockers.push("Tras inspección real quedan categorías de evidencia incompletas; Deep Research Light sería reparación post-inspección.");
  } else if (replacements.length > 0 || warnings.length > 0) {
    decision = "READY_WITH_WARNINGS";
  }

  if (reasons.length === 0) {
    reasons.push("La inspección limitada encontró cobertura mínima suficiente para avanzar a blueprint.");
  }

  return { usable, directOrMethod, manualReview, replacements, missing, reasons, warnings, blockers, decision };
}

export async function runMvpSourceInspection(input: { userId: string; projectId: string; runId?: string }) {
  const runId = input.runId ?? `mvp-source-inspection-${randomUUID()}`;
  const artifactDir = path.join(process.cwd(), "artifacts-local", "mvp-source-inspection", input.projectId, runId);
  await mkdir(artifactDir, { recursive: true });
  const usageBefore = await captureMvpApiUsageSnapshot();
  const selected = await loadSelectedReferences(input.userId, input.projectId);

  if (selected.length === 0) {
    throw new Error("No hay fuentes seleccionadas para inspeccionar.");
  }

  const items: MvpSourceInspectionItem[] = [];
  for (const item of selected) {
    items.push(await inspectOne({ item, artifactDir }));
  }
  const decision = decide(items);
  const reportWithoutUsage = {
    artifact_type: "mvp_source_inspection" as const,
    artifact_version: "v1" as const,
    generated_at: new Date().toISOString(),
    project_id: input.projectId,
    run_id: runId,
    artifact_dir: artifactDir,
    decision: decision.decision,
    selected_source_count: selected.length,
    inspected_source_count: items.filter((item) => item.fetch_status === "downloaded" || item.source_health === "metadata_only").length,
    usable_source_count: decision.usable.length,
    direct_or_method_source_count: decision.directOrMethod.length,
    metadata_only_source_count: items.filter((item) => item.source_health === "metadata_only").length,
    source_ids_ready_for_blueprint: decision.usable.map((item) => item.source_id),
    source_ids_needing_replacement: decision.replacements.map((item) => item.source_id),
    source_ids_needing_manual_review: decision.manualReview.map((item) => item.source_id),
    missing_evidence_categories: unique(decision.missing),
    reasons: unique(decision.reasons),
    warnings: unique(decision.warnings),
    blockers: unique(decision.blockers),
    items,
  };

  await writeFile(path.join(artifactDir, "source-inspection-report.json"), `${JSON.stringify(reportWithoutUsage, null, 2)}\n`, "utf8");
  const summary = renderMvpSourceInspectionSummary(reportWithoutUsage);
  await writeFile(path.join(artifactDir, "source-inspection-summary.md"), summary, "utf8");
  const apiUsageReport = await buildMvpApiUsageReport({
    before: usageBefore,
    label: "mvp_source_inspection",
    filter: { projectId: input.projectId, runId },
  });
  await writeFile(path.join(artifactDir, "api-usage-report.json"), `${JSON.stringify(apiUsageReport, null, 2)}\n`, "utf8");

  await logAuditEvent({
    eventType: "MVP_SOURCE_INSPECTION_COMPLETED",
    actorType: "SYSTEM",
    provider: Provider.SYSTEM,
    userId: input.userId,
    projectId: input.projectId,
    payloadJson: {
      runId,
      artifactDir,
      decision: reportWithoutUsage.decision,
      selected_source_count: reportWithoutUsage.selected_source_count,
      usable_source_count: reportWithoutUsage.usable_source_count,
      source_ids_ready_for_blueprint: reportWithoutUsage.source_ids_ready_for_blueprint,
      source_ids_needing_replacement: reportWithoutUsage.source_ids_needing_replacement,
      source_ids_needing_manual_review: reportWithoutUsage.source_ids_needing_manual_review,
      missing_evidence_categories: reportWithoutUsage.missing_evidence_categories,
      api_usage_delta: apiUsageReport.filtered_delta,
    } satisfies Prisma.InputJsonValue,
  });

  await rm(path.join(artifactDir, ".tmp"), { recursive: true, force: true }).catch(() => undefined);

  return {
    ...reportWithoutUsage,
    api_usage: { run_id: runId, report: apiUsageReport },
  } satisfies MvpSourceInspectionResult;
}

export function renderMvpSourceInspectionSummary(report: Omit<MvpSourceInspectionResult, "api_usage">) {
  return [
    "# MVP Source Inspection",
    "",
    `- project_id: ${report.project_id}`,
    `- run_id: ${report.run_id}`,
    `- decision: ${report.decision}`,
    `- selected_source_count: ${report.selected_source_count}`,
    `- usable_source_count: ${report.usable_source_count}`,
    `- direct_or_method_source_count: ${report.direct_or_method_source_count}`,
    `- metadata_only_source_count: ${report.metadata_only_source_count}`,
    "",
    "## Sources",
    ...report.items.map((item) => [
      `${item.selected_order ?? "-"}. ${item.title} (${item.year ?? "s/f"})`,
      `   - health: ${item.source_health}; topic_fit: ${item.topic_fit}; use: ${item.allowed_evidence_use}`,
      `   - pdf: ${item.pdf_url ? "signal" : "none"}; accessible: ${item.pdf_accessible}; text_chars: ${item.text_char_count}`,
      `   - identity: ${item.identity_status}; method/theory/variable: ${item.method_signal_count}/${item.theory_signal_count}/${item.variable_signal_count}`,
      item.warnings.length ? `   - warnings: ${item.warnings.join(" | ")}` : null,
      item.blockers.length ? `   - blockers: ${item.blockers.join(" | ")}` : null,
    ].filter(Boolean).join("\n")),
    "",
    "## Missing Evidence Categories",
    ...(report.missing_evidence_categories.length ? report.missing_evidence_categories.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## Reasons",
    ...report.reasons.map((item) => `- ${item}`),
    "",
    "## Blockers",
    ...(report.blockers.length ? report.blockers.map((item) => `- ${item}`) : ["- none"]),
    "",
  ].join("\n");
}
