import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { ActorType, Provider } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/server/audit/audit-service";
import {
  buildMvpApiUsageReport,
  captureMvpApiUsageSnapshot,
} from "@/server/mvp/api-usage-service";
import { asStepRunJson, createMvpStepRun, updateMvpStepRun } from "@/server/mvp/step-run-service";
import {
  buildBrowserLikeFetchHeaders,
  extractAccessSignals,
  verifyPdfAccess,
} from "@/server/retrieval/reference-access";
import { fetchCrossrefWorkByDoi } from "@/server/retrieval/crossref-client";

const execFileAsync = promisify(execFile);
const FETCH_TIMEOUT_MS = 35_000;
const MAX_PDF_BYTES = 35 * 1024 * 1024;
const MAX_SAMPLE_CHARS = 18_000;
const MIN_USEFUL_TEXT_CHARS = 500;
const MIN_USABLE_SOURCES = 3;
const MIN_DIRECT_OR_METHOD_SOURCES = 2;

export const MVP_SOURCE_INSPECTION_KEY = "step_4_source_inspection";
export const MVP_SOURCE_INSPECTION_PROMPT_VERSION = "deterministic-source-inspection-v1";

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
  resolved_pdf_url: string | null;
  pdf_access_strategy: string | null;
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
  "method", "methodology", "model", "simulation", "experiment", "survey", "interview",
  "regression", "case study", "systematic review", "bibliometric", "statistical",
  "qualitative", "quantitative", "mixed methods", "sampling", "analysis", "metodo",
  "metodologia", "modelo", "simulacion", "experimento", "encuesta", "entrevista",
  "revision sistematica", "bibliometrico", "estadistico", "cualitativo", "cuantitativo",
  "metodos mixtos", "muestreo", "analisis",
];
const THEORY_TERMS = [
  "theory", "framework", "model", "conceptual", "empirical", "state of the art",
  "literature", "background", "approach", "hypothesis", "construct", "teoria", "marco",
  "modelo", "conceptual", "empirico", "estado del arte", "literatura", "antecedente",
  "enfoque", "hipotesis", "constructo",
];
const VARIABLE_TERMS = [
  "variable", "indicator", "parameter", "factor", "outcome", "effect", "impact", "risk",
  "performance", "measure", "dimension", "criteria", "metric", "variable", "indicador",
  "parametro", "factor", "resultado", "efecto", "impacto", "riesgo", "desempeno",
  "medida", "dimension", "criterio", "metrica",
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

function resolveTopicFit(input: { methodCount: number; theoryCount: number; variableCount: number; relevanceScore: number }) {
  if (input.relevanceScore < 35) {
    if (input.theoryCount > 0 || input.variableCount > 0) return "contextual" as const;
    if (input.methodCount > 0) return "weak" as const;
    return "unknown" as const;
  }
  if (input.relevanceScore >= 60 && input.theoryCount >= 1 && input.variableCount >= 1) return "direct" as const;
  if (input.methodCount >= 2 && input.theoryCount >= 1) return "methodological" as const;
  if (input.theoryCount > 0 || input.variableCount > 0) return "contextual" as const;
  if (input.methodCount > 0) return "weak" as const;
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

function rawRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function rawString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseHtmlForPdfLinks(html: string, baseUrl: string) {
  const candidates = new Set<string>();
  const metaPatterns = [
    /<meta[^>]+name=["']citation_pdf_url["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+\.pdf[^"']*)["']/gi,
    /<link[^>]+type=["']application\/pdf["'][^>]+href=["']([^"']+)["']/gi,
  ];

  for (const pattern of metaPatterns) {
    let match: RegExpExecArray | null = null;
    while ((match = pattern.exec(html))) {
      try {
        candidates.add(new URL(match[1], baseUrl).toString());
      } catch {
        // ignore malformed links
      }
    }
  }

  const linkPattern = /<(?:a|iframe|embed|object)[^>]+(?:href|src|data)=["']([^"']+)["'][^>]*>/gi;
  let linkMatch: RegExpExecArray | null = null;
  while ((linkMatch = linkPattern.exec(html))) {
    const rawHref = linkMatch[1];
    if (!/pdf|download|fulltext|full-text|view/i.test(rawHref) && !rawHref.toLowerCase().endsWith(".pdf")) {
      continue;
    }
    try {
      candidates.add(new URL(rawHref, baseUrl).toString());
    } catch {
      // ignore malformed links
    }
  }

  return Array.from(candidates);
}

function openAlexLocationCandidates(raw: Record<string, unknown> | null) {
  const locations = Array.isArray(raw?.locations) ? raw.locations : [];
  return locations.flatMap((location, index) => {
    const item = rawRecord(location);
    return [
      { url: rawString(item?.pdf_url), strategy: `openalex_location_${index + 1}_pdf` },
      { url: rawString(item?.landing_page_url), strategy: `openalex_location_${index + 1}_landing` },
    ];
  });
}

async function unpaywallCandidateUrls(doi: string | null) {
  if (!doi) return [] as Array<{ url: string | null; strategy: string }>;
  const email = process.env.UNPAYWALL_EMAIL?.trim() || process.env.CROSSREF_MAILTO?.trim() || "mvp@ingeniometrix.local";
  try {
    const response = await fetch(
      `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(email)}`,
      { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(12_000) },
    );
    if (!response.ok) return [];
    const payload = rawRecord(await response.json());
    const best = rawRecord(payload?.best_oa_location);
    const oaLocations = Array.isArray(payload?.oa_locations) ? payload.oa_locations : [];
    return [
      { url: rawString(best?.url_for_pdf), strategy: "unpaywall_best_pdf" },
      { url: rawString(best?.url), strategy: "unpaywall_best_landing" },
      ...oaLocations.flatMap((location, index) => {
        const item = rawRecord(location);
        return [
          { url: rawString(item?.url_for_pdf), strategy: `unpaywall_location_${index + 1}_pdf` },
          { url: rawString(item?.url), strategy: `unpaywall_location_${index + 1}_landing` },
        ];
      }),
    ];
  } catch {
    return [];
  }
}

async function crossrefCandidateUrls(doi: string | null) {
  if (!doi) return [] as Array<{ url: string | null; strategy: string }>;
  const work = await fetchCrossrefWorkByDoi(doi).catch(() => null);
  const links = work?.link ?? [];
  return links
    .filter((link) => {
      const haystack = `${link.URL ?? ""} ${link["content-type"] ?? ""} ${link["intended-application"] ?? ""}`.toLowerCase();
      return haystack.includes("pdf") || haystack.includes("text-mining") || haystack.includes("similarity-checking");
    })
    .map((link, index) => ({ url: link.URL ?? null, strategy: `crossref_link_${index + 1}` }));
}

async function sourceCandidateUrls(item: ProjectReferenceWithReference, directPdfUrl: string | null) {
  const raw = rawRecord(item.reference.rawOpenAlexJson);
  const openAccess = rawRecord(raw?.open_access);
  const best = rawRecord(raw?.best_oa_location);
  const primary = rawRecord(raw?.primary_location);
  const urls = [
    { url: directPdfUrl, strategy: "direct_pdf_url" },
    { url: rawString(openAccess?.oa_url), strategy: "openalex_oa_url" },
    { url: rawString(best?.pdf_url), strategy: "openalex_best_pdf" },
    { url: rawString(best?.landing_page_url), strategy: "openalex_best_landing" },
    { url: rawString(primary?.pdf_url), strategy: "openalex_primary_pdf" },
    { url: rawString(primary?.landing_page_url), strategy: "openalex_primary_landing" },
    ...openAlexLocationCandidates(raw),
    ...(await unpaywallCandidateUrls(item.reference.doi)),
    ...(await crossrefCandidateUrls(item.reference.doi)),
    { url: item.reference.landingPageUrl, strategy: "reference_landing_page" },
    { url: item.reference.doi ? `https://doi.org/${item.reference.doi}` : null, strategy: "doi_resolution" },
  ];
  const seen = new Set<string>();
  return urls
    .filter((candidate): candidate is { url: string; strategy: string } => Boolean(candidate.url))
    .filter((candidate) => {
      if (seen.has(candidate.url)) return false;
      seen.add(candidate.url);
      return true;
    });
}

async function fetchWithTimeout(url: string, referer: string | null) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: buildBrowserLikeFetchHeaders({
        accept: "application/pdf,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        referer: referer ?? url,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveAndFetchPdf(input: {
  item: ProjectReferenceWithReference;
  directPdfUrl: string | null;
  targetPath: string;
}) {
  const queue = await sourceCandidateUrls(input.item, input.directPdfUrl);
  const visited = new Set<string>();
  let lastError: string | null = null;

  while (queue.length > 0) {
    const candidate = queue.shift();
    if (!candidate || visited.has(candidate.url)) continue;
    visited.add(candidate.url);

    try {
      const response = await fetchWithTimeout(candidate.url, input.item.reference.landingPageUrl);
      const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
      const finalUrl = response.url || candidate.url;

      if (response.ok && (contentType.includes("pdf") || finalUrl.toLowerCase().includes(".pdf"))) {
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.byteLength > MAX_PDF_BYTES) {
          lastError = `${candidate.strategy}: PDF demasiado grande (${buffer.byteLength} bytes).`;
          continue;
        }
        if (buffer.subarray(0, 5).toString("utf8") !== "%PDF-" && !contentType.includes("pdf")) {
          lastError = `${candidate.strategy}: respuesta no parece PDF (${contentType || "sin content-type"}).`;
          continue;
        }
        await writeFile(input.targetPath, buffer);
        return {
          ok: true as const,
          resolvedPdfUrl: finalUrl,
          strategy: candidate.strategy,
          httpStatus: response.status,
        };
      }

      if (response.ok && contentType.includes("html")) {
        const html = await response.text();
        for (const discovered of parseHtmlForPdfLinks(html, finalUrl)) {
          if (!visited.has(discovered)) {
            queue.push({ url: discovered, strategy: `${candidate.strategy}:html_pdf_discovery` });
          }
        }
        lastError = `${candidate.strategy}: HTML sin PDF descargable directo.`;
        continue;
      }

      lastError = `${candidate.strategy}: HTTP ${response.status}`;
    } catch (error) {
      lastError = `${candidate.strategy}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  return { ok: false as const, error: lastError ?? "No se encontró PDF público accesible." };
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
  let resolvedPdfUrl: string | null = null;
  let pdfAccessStrategy: string | null = null;

  if (pdfPath) {
    const fetched = await resolveAndFetchPdf({ item, directPdfUrl: pdfUrl, targetPath: pdfPath });
    if (fetched.ok) {
      downloadedPdfPath = pdfPath;
      resolvedPdfUrl = fetched.resolvedPdfUrl;
      pdfAccessStrategy = fetched.strategy;
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
      warnings.push(`No se pudo resolver/descargar PDF publico: ${fetched.error}`);
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
    methodCount: method.count,
    theoryCount: theory.count,
    variableCount: variable.count,
    relevanceScore: item.relevanceScore ?? 0,
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
    resolved_pdf_url: resolvedPdfUrl,
    pdf_access_strategy: pdfAccessStrategy,
    pdf_available_signal: access.hasPdfUrl || Boolean(resolvedPdfUrl),
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
    equation_candidate_count: countPattern(evidenceText, /(?:\b[a-z]\s*=|=|≤|≥|\bmodel\b|\bequation\b|\bformula\b|\becuaci[oó]n\b|\bf[oó]rmula\b)/gi),
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
  const artifactManifestPath = path.join(artifactDir, "source-inspection-report.json");
  const startedAt = new Date();
  await mkdir(artifactDir, { recursive: true });
  const usageBefore = await captureMvpApiUsageSnapshot();
  const stepRun = await createMvpStepRun({
    projectId: input.projectId,
    userId: input.userId,
    stepKey: MVP_SOURCE_INSPECTION_KEY,
    status: "RUNNING",
    provider: Provider.SYSTEM,
    model: null,
    promptVersion: MVP_SOURCE_INSPECTION_PROMPT_VERSION,
    inputSnapshotJson: asStepRunJson({
      project_id: input.projectId,
      run_id: runId,
    }),
    artifactDir,
    artifactManifestPath,
  });

  await logAuditEvent({
    eventType: "MVP_SOURCE_INSPECTION_STARTED",
    actorType: ActorType.SYSTEM,
    provider: Provider.SYSTEM,
    userId: input.userId,
    projectId: input.projectId,
    payloadJson: asStepRunJson({
      run_id: runId,
      step_run_id: stepRun.id,
      step_key: MVP_SOURCE_INSPECTION_KEY,
      started_at: startedAt.toISOString(),
      artifact_dir: artifactDir,
      artifact_manifest_path: artifactManifestPath,
    }),
  });

  try {
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

    await writeFile(artifactManifestPath, `${JSON.stringify(reportWithoutUsage, null, 2)}\n`, "utf8");
    const summary = renderMvpSourceInspectionSummary(reportWithoutUsage);
    await writeFile(path.join(artifactDir, "source-inspection-summary.md"), summary, "utf8");
    const apiUsageReport = await buildMvpApiUsageReport({
      before: usageBefore,
      label: "mvp_source_inspection",
      filter: { projectId: input.projectId, since: usageBefore.capturedAt },
    });
    await writeFile(path.join(artifactDir, "api-usage-report.json"), `${JSON.stringify(apiUsageReport, null, 2)}\n`, "utf8");

    const completedAt = new Date();
    const result = {
      ...reportWithoutUsage,
      api_usage: { run_id: runId, report: apiUsageReport },
    } satisfies MvpSourceInspectionResult;

    await updateMvpStepRun(stepRun.id, {
      status: reportWithoutUsage.decision === "BLOCKED_INSUFFICIENT_EVIDENCE" ? "PARTIALLY_COMPLETED" : "COMPLETED",
      provider: Provider.SYSTEM,
      model: null,
      promptVersion: MVP_SOURCE_INSPECTION_PROMPT_VERSION,
      outputSnapshotJson: asStepRunJson(result),
      warningsJson: asStepRunJson(reportWithoutUsage.warnings),
      errorsJson: asStepRunJson(reportWithoutUsage.blockers),
      fallbackUsed: false,
      artifactDir,
      artifactManifestPath,
      finishedAt: completedAt,
    });

    await logAuditEvent({
      eventType: "MVP_SOURCE_INSPECTION_COMPLETED",
      actorType: ActorType.SYSTEM,
      provider: Provider.SYSTEM,
      userId: input.userId,
      projectId: input.projectId,
      payloadJson: asStepRunJson({
        run_id: runId,
        step_run_id: stepRun.id,
        decision: reportWithoutUsage.decision,
        selected_source_count: reportWithoutUsage.selected_source_count,
        usable_source_count: reportWithoutUsage.usable_source_count,
        source_ids_ready_for_blueprint: reportWithoutUsage.source_ids_ready_for_blueprint,
        source_ids_needing_replacement: reportWithoutUsage.source_ids_needing_replacement,
        source_ids_needing_manual_review: reportWithoutUsage.source_ids_needing_manual_review,
        missing_evidence_categories: reportWithoutUsage.missing_evidence_categories,
        api_usage_delta: apiUsageReport.filtered_delta,
        completed_at: completedAt.toISOString(),
        artifact_manifest_path: artifactManifestPath,
      }),
    });

    await rm(path.join(artifactDir, ".tmp"), { recursive: true, force: true }).catch(() => undefined);

    return result;
  } catch (error) {
    const completedAt = new Date();
    const message = error instanceof Error ? error.message : "Fallo desconocido en inspección de fuentes.";
    await updateMvpStepRun(stepRun.id, {
      status: "FAILED",
      provider: Provider.SYSTEM,
      model: null,
      promptVersion: MVP_SOURCE_INSPECTION_PROMPT_VERSION,
      errorsJson: asStepRunJson([message]),
      artifactDir,
      artifactManifestPath,
      finishedAt: completedAt,
    });
    await logAuditEvent({
      eventType: "MVP_SOURCE_INSPECTION_FAILED",
      actorType: ActorType.SYSTEM,
      provider: Provider.SYSTEM,
      userId: input.userId,
      projectId: input.projectId,
      payloadJson: asStepRunJson({
        run_id: runId,
        step_run_id: stepRun.id,
        errors: [message],
        completed_at: completedAt.toISOString(),
      }),
    });
    throw error;
  }
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
