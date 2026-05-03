import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildBrowserLikeFetchHeaders } from "@/server/retrieval/reference-access";

import type {
  BlueprintLaunchContentMaterializationItem,
  BlueprintLaunchContentMaterializationResult,
  BlueprintLaunchEvidencePlanningResult,
  BlueprintLaunchSelectedSourceBundle,
  BlueprintLaunchSourceAccessResolutionResult,
} from "./local-playground-store";
import {
  deriveAccessCandidatesFromContext,
  extractAccessCandidatesFromHtml,
  isLikelyDownloadWrapper,
  isLikelyRichMetadataPage,
} from "./source-access-patterns";

const MATERIALIZED_DIR = path.join(
  process.cwd(),
  "artifacts-local",
  "blueprint_launch",
  "materialized_content",
);
const CONTENT_FETCH_TIMEOUT_MS = 60_000;
const MIN_VALID_PDF_BYTES = 10_000;

function buildSafeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function buildTimestampToken(value: string) {
  return value.replace(/[:.]/g, "-");
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

function buildSummary(result: {
  attemptedCount: number;
  materializedCount: number;
  pdfCount: number;
  webCount: number;
  failedCount: number;
  skippedCount: number;
}) {
  return `Se intento materializar ${result.attemptedCount} fuente(s): ${result.materializedCount} quedaron guardadas localmente, con ${result.pdfCount} PDF(s), ${result.webCount} captura(s) web, ${result.failedCount} fallo(s) y ${result.skippedCount} omitida(s).`;
}

async function ensureMaterializedDir() {
  await mkdir(MATERIALIZED_DIR, { recursive: true });
}

function bufferLooksLikePdf(buffer: Buffer) {
  return buffer.subarray(0, 5).toString("utf8") === "%PDF-";
}

function validatePdfBuffer(input: {
  buffer: Buffer;
  contentType: string | null;
}) {
  const checks: string[] = [];
  const contentType = input.contentType?.toLowerCase() ?? "";

  if (contentType.includes("pdf")) {
    checks.push("content_type_pdf");
  }

  if (bufferLooksLikePdf(input.buffer)) {
    checks.push("magic_bytes_pdf");
  }

  if (input.buffer.byteLength > MIN_VALID_PDF_BYTES) {
    checks.push("byte_size_minimum");
  }

  return {
    valid:
      checks.includes("magic_bytes_pdf") &&
      checks.includes("byte_size_minimum") &&
      (checks.includes("content_type_pdf") || input.buffer.byteLength > MIN_VALID_PDF_BYTES),
    checks,
  };
}

async function fetchContent(input: {
  url: string;
  useRangeProbe?: boolean;
}) {
  const signal = createTimeoutSignal(CONTENT_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(input.url, {
      method: "GET",
      redirect: "follow",
      headers: buildBrowserLikeFetchHeaders({
        accept: "application/pdf,text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
        referer: input.url,
        range: input.useRangeProbe ? "bytes=0-0" : null,
      }),
      signal: signal.signal,
    });

    return response;
  } finally {
    signal.clear();
  }
}

async function writePdf(input: {
  response: Response;
  runDir: string;
  baseName: string;
}) {
  const buffer = Buffer.from(await input.response.arrayBuffer());
  const contentType = input.response.headers.get("content-type");
  const validation = validatePdfBuffer({ buffer, contentType });

  if (!validation.valid) {
    throw new Error(
      `La descarga no parece un PDF valido. Checks: ${validation.checks.join(", ") || "none"}.`,
    );
  }

  const localPrimaryPath = path.join(input.runDir, `${input.baseName}.pdf`);
  await writeFile(localPrimaryPath, buffer);

  return {
    localPrimaryPath,
    byteSize: buffer.byteLength,
    validationChecks: validation.checks,
  };
}

async function retryMaterializationFromHtml(input: {
  html: string;
  responseUrl: string;
  currentUrl: string;
  baseName: string;
  runDir: string;
  warnings: string[];
}) {
  const candidates = [
    ...extractAccessCandidatesFromHtml(input.html, input.responseUrl),
    ...deriveAccessCandidatesFromContext({
      currentUrl: input.currentUrl,
      finalUrl: input.responseUrl,
      html: input.html,
    }),
  ]
    .sort((left, right) => right.score - left.score)
    .filter((candidate, index, array) => array.findIndex((item) => item.url === candidate.url) === index)
    .filter((candidate) => candidate.url !== input.currentUrl && candidate.url !== input.responseUrl)
    .slice(0, 4);

  for (const candidate of candidates) {
    try {
      const candidateResponse = await fetchContent({ url: candidate.url });
      const candidateContentType = candidateResponse.headers.get("content-type");

      if (candidateResponse.ok && candidateContentType?.toLowerCase().includes("pdf")) {
        input.warnings.push(`Se resolvio un PDF derivado desde HTML: ${candidate.label}.`);
        const pdf = await writePdf({
          response: candidateResponse,
          runDir: input.runDir,
          baseName: input.baseName,
        });

        return {
          storedKind: "pdf" as const,
          localPrimaryPath: pdf.localPrimaryPath,
          localTextPath: null,
          mimeType: candidateContentType,
          byteSize: pdf.byteSize,
          validationChecks: pdf.validationChecks,
          resolvedContentUrl: candidate.url,
        };
      }
    } catch (error) {
      input.warnings.push(
        error instanceof Error
          ? `Fallo el reintento derivado ${candidate.label}: ${error.message}`
          : `Fallo el reintento derivado ${candidate.label}.`,
      );
    }
  }

  return null;
}

async function materializeSingleSource(input: {
  bundleSource: BlueprintLaunchSelectedSourceBundle["sources"][number];
  accessResolution: BlueprintLaunchSourceAccessResolutionResult["items"][number] | undefined;
  planItem: BlueprintLaunchEvidencePlanningResult["materializationPlan"][number] | undefined;
  runDir: string;
  index: number;
}): Promise<BlueprintLaunchContentMaterializationItem> {
  const sourceId = input.bundleSource.reference.id;
  const title = input.bundleSource.reference.title;
  const warnings: string[] = [];
  const accessKind = input.accessResolution?.kind ?? "unknown";
  const resolvedContentUrl = input.planItem?.contentUrl ?? input.accessResolution?.resolvedContentUrl ?? null;

  if (!input.accessResolution?.hasCompletePublicContent || !resolvedContentUrl) {
    return {
      sourceId,
      title,
      accessKind,
      resolvedContentUrl,
      materializationStatus: "skipped",
      storedKind: "unknown",
        localPrimaryPath: null,
        localTextPath: null,
        mimeType: null,
        byteSize: null,
        languageDetected: input.accessResolution?.languageDetected ?? null,
        resolverFamily: input.planItem?.resolverFamily,
        expectedKind: input.planItem?.expectedKind,
        validationChecks: [],
        warnings: [
          "La fuente no tiene contenido publico completo resuelto; se omite en el paso 4.",
        ],
    };
  }

  try {
    const useRangeProbe =
      input.planItem?.resolverFamily === "figshare" ||
      input.planItem?.riskFlags.includes("head_may_fail_use_get_range") ||
      false;
    let response = await fetchContent({
      url: resolvedContentUrl,
      useRangeProbe,
    });
    let contentType = response.headers.get("content-type");

    if (
      response.status === 206 &&
      contentType?.toLowerCase().includes("pdf") &&
      useRangeProbe
    ) {
      response = await fetchContent({ url: resolvedContentUrl });
      contentType = response.headers.get("content-type");
    }
    const baseName = `${String(input.index + 1).padStart(2, "0")}-${buildSafeKey(title) || "source"}`;

    if (!response.ok) {
      return {
        sourceId,
        title,
        accessKind,
        resolvedContentUrl,
        materializationStatus: "failed",
        storedKind: "unknown",
        localPrimaryPath: null,
        localTextPath: null,
        mimeType: contentType,
        byteSize: null,
        languageDetected: input.accessResolution.languageDetected,
        resolverFamily: input.planItem?.resolverFamily,
        expectedKind: input.planItem?.expectedKind,
        validationChecks: [],
        warnings: [`La descarga respondio con estado ${response.status}.`],
      };
    }

    if (contentType?.toLowerCase().includes("pdf")) {
      const pdf = await writePdf({
        response,
        runDir: input.runDir,
        baseName,
      });

      return {
        sourceId,
        title,
        accessKind,
        resolvedContentUrl,
        materializationStatus: "downloaded",
        storedKind: "pdf",
        localPrimaryPath: pdf.localPrimaryPath,
        localTextPath: null,
        mimeType: contentType,
        byteSize: pdf.byteSize,
        languageDetected: input.accessResolution.languageDetected,
        resolverFamily: input.planItem?.resolverFamily,
        expectedKind: input.planItem?.expectedKind,
        validationChecks: pdf.validationChecks,
        warnings,
      };
    }

    const html = await response.text();
    const finalUrl = response.url || resolvedContentUrl;
    const plainText = stripHtml(html);
    const shouldRetryFromHtml =
      isLikelyDownloadWrapper({
        text: plainText,
        html,
        url: finalUrl,
      }) ||
      isLikelyRichMetadataPage({
        text: plainText,
        html,
        url: finalUrl,
      }) ||
      input.accessResolution.kind === "repository_fulltext";

    if (shouldRetryFromHtml) {
      const retried = await retryMaterializationFromHtml({
        html,
        responseUrl: finalUrl,
        currentUrl: resolvedContentUrl,
        baseName,
        runDir: input.runDir,
        warnings,
      });

      if (retried) {
        return {
          sourceId,
          title,
          accessKind,
          resolvedContentUrl: retried.resolvedContentUrl,
          materializationStatus: "downloaded",
          storedKind: retried.storedKind,
          localPrimaryPath: retried.localPrimaryPath,
          localTextPath: retried.localTextPath,
          mimeType: retried.mimeType,
          byteSize: retried.byteSize,
          languageDetected: input.accessResolution.languageDetected,
          resolverFamily: input.planItem?.resolverFamily,
          expectedKind: input.planItem?.expectedKind,
          validationChecks: ["derived_pdf_from_html", ...retried.validationChecks],
          warnings,
        };
      }
    }

    const localPrimaryPath = path.join(input.runDir, `${baseName}.html`);
    const localTextPath = path.join(input.runDir, `${baseName}.txt`);

    await writeFile(localPrimaryPath, html, "utf8");
    await writeFile(localTextPath, `${plainText}\n`, "utf8");

    return {
      sourceId,
      title,
      accessKind,
      resolvedContentUrl,
      materializationStatus: "captured",
      storedKind: "html",
      localPrimaryPath,
      localTextPath,
      mimeType: contentType,
      byteSize: Buffer.byteLength(html, "utf8"),
      languageDetected: input.accessResolution.languageDetected,
      resolverFamily: input.planItem?.resolverFamily,
      expectedKind: input.planItem?.expectedKind,
      validationChecks: ["html_captured", plainText.length > 500 ? "text_size_minimum" : "short_text"],
      warnings,
    };
  } catch (error) {
    warnings.push(
      error instanceof Error ? error.message : "No se pudo materializar el contenido.",
    );

    return {
      sourceId,
      title,
      accessKind,
      resolvedContentUrl,
      materializationStatus: "failed",
      storedKind: "unknown",
      localPrimaryPath: null,
      localTextPath: null,
      mimeType: null,
      byteSize: null,
      languageDetected: input.accessResolution.languageDetected ?? null,
      resolverFamily: input.planItem?.resolverFamily,
      expectedKind: input.planItem?.expectedKind,
      validationChecks: [],
      warnings,
    };
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

  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, () => worker()),
  );

  return results;
}

export async function materializeBlueprintLaunchSourceContent(input: {
  bundle: BlueprintLaunchSelectedSourceBundle;
  sourceAccessResolution: BlueprintLaunchSourceAccessResolutionResult;
  evidencePlanning?: BlueprintLaunchEvidencePlanningResult | null;
}): Promise<BlueprintLaunchContentMaterializationResult> {
  await ensureMaterializedDir();
  const savedAt = new Date().toISOString();
  const runDir = path.join(MATERIALIZED_DIR, `run-${buildTimestampToken(savedAt)}`);
  await mkdir(runDir, { recursive: true });
  const accessBySourceId = new Map(
    input.sourceAccessResolution.items.map((item) => [item.sourceId, item]),
  );
  const planBySourceId = new Map(
    (input.evidencePlanning?.materializationPlan ?? []).map((item) => [item.sourceId, item]),
  );

  const items = await mapWithConcurrency(input.bundle.sources, 3, (source, index) =>
    materializeSingleSource({
        bundleSource: source,
        accessResolution: accessBySourceId.get(source.reference.id),
        planItem: planBySourceId.get(source.reference.id),
        runDir,
        index,
    }),
  );

  const materializedCount = items.filter(
    (item) => item.materializationStatus === "downloaded" || item.materializationStatus === "captured",
  ).length;
  const pdfCount = items.filter((item) => item.storedKind === "pdf").length;
  const webCount = items.filter((item) => item.storedKind === "html" || item.storedKind === "text").length;
  const failedCount = items.filter((item) => item.materializationStatus === "failed").length;
  const skippedCount = items.filter((item) => item.materializationStatus === "skipped").length;
  const totalByteSize = items.reduce((sum, item) => sum + (item.byteSize ?? 0), 0);
  const manifestPath = path.join(runDir, "manifest.json");
  const latestManifestPath = path.join(MATERIALIZED_DIR, "latest-manifest.json");
  const result: BlueprintLaunchContentMaterializationResult = {
    savedAt,
    summary: buildSummary({
      attemptedCount: items.length,
      materializedCount,
      pdfCount,
      webCount,
      failedCount,
      skippedCount,
    }),
    runDir,
    manifestPath,
    latestManifestPath,
    attemptedCount: items.length,
    materializedCount,
    pdfCount,
    webCount,
    failedCount,
    skippedCount,
    totalByteSize,
    readyForStep5: failedCount === 0 && skippedCount === 0 && materializedCount === items.length,
    items,
  };

  await writeFile(manifestPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await writeFile(latestManifestPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  return result;
}
