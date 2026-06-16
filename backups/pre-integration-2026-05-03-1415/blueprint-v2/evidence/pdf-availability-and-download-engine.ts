import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  BlueprintRunManifest,
  BlueprintSourceRecord,
  PdfAccessStrategy,
  PdfDownloadRecord,
  PdfDownloadResult,
} from "@/server/blueprint-v2/types";

const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;

function buildPdfOutputPath(runId: string, sourceId: string) {
  return path.join(
    process.cwd(),
    "artifacts-local",
    "master-blueprint-engine",
    runId,
    "pdfs",
    `${sourceId.replace(/[^a-z0-9_-]/gi, "_")}.pdf`,
  );
}

function normalizeCandidateUrl(url: string | null | undefined) {
  const trimmed = url?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function buildBrowserHeaders() {
  return {
    accept:
      "application/pdf,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "es-PE,es;q=0.9,en;q=0.8",
    "cache-control": "no-cache",
    pragma: "no-cache",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 Ingeniometrix/0.1",
  } satisfies Record<string, string>;
}

function parseHtmlForPdfLinks(html: string, baseUrl: string) {
  const candidates = new Set<string>();
  const metaPatterns = [
    /<meta[^>]+name=["']citation_pdf_url["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+\.pdf[^"']*)["']/gi,
  ];

  for (const pattern of metaPatterns) {
    let match: RegExpExecArray | null = null;
    while ((match = pattern.exec(html))) {
      try {
        candidates.add(new URL(match[1], baseUrl).toString());
      } catch {
        // Ignore malformed links.
      }
    }
  }

  const linkPattern =
    /<(?:a|iframe|embed|object)[^>]+(?:href|src|data)=["']([^"']+)["'][^>]*>/gi;
  let linkMatch: RegExpExecArray | null = null;

  while ((linkMatch = linkPattern.exec(html))) {
    const rawHref = linkMatch[1];
    if (!/pdf|download|fulltext|view/i.test(rawHref) && !rawHref.toLowerCase().endsWith(".pdf")) {
      continue;
    }

    try {
      candidates.add(new URL(rawHref, baseUrl).toString());
    } catch {
      // Ignore malformed links.
    }
  }

  return Array.from(candidates);
}

function extractOpenAccessFallbacks(source: BlueprintSourceRecord) {
  const record =
    source.raw_openalex_json &&
    typeof source.raw_openalex_json === "object" &&
    !Array.isArray(source.raw_openalex_json)
      ? (source.raw_openalex_json as Record<string, unknown>)
      : null;
  const openAccess =
    record &&
    typeof record.open_access === "object" &&
    record.open_access !== null
      ? (record.open_access as Record<string, unknown>)
      : null;
  const bestLocation =
    record &&
    typeof record.best_oa_location === "object" &&
    record.best_oa_location !== null
      ? (record.best_oa_location as Record<string, unknown>)
      : null;
  const primaryLocation =
    record &&
    typeof record.primary_location === "object" &&
    record.primary_location !== null
      ? (record.primary_location as Record<string, unknown>)
      : null;

  return [
    normalizeCandidateUrl(
      typeof openAccess?.oa_url === "string" ? openAccess.oa_url : null,
    ),
    normalizeCandidateUrl(
      typeof bestLocation?.landing_page_url === "string" ? bestLocation.landing_page_url : null,
    ),
    normalizeCandidateUrl(
      typeof primaryLocation?.landing_page_url === "string"
        ? primaryLocation.landing_page_url
        : null,
    ),
  ].filter((value): value is string => Boolean(value));
}

function buildCandidateQueue(source: BlueprintSourceRecord) {
  const queue: Array<{ url: string; strategy: PdfAccessStrategy }> = [];
  const directPdf = normalizeCandidateUrl(source.pdf_url);
  const landingPage = normalizeCandidateUrl(source.landing_page_url);

  if (directPdf) {
    queue.push({ url: directPdf, strategy: "direct_pdf_url" });
  }

  if (landingPage) {
    queue.push({ url: landingPage, strategy: "landing_page_discovery" });
  }

  for (const fallbackUrl of extractOpenAccessFallbacks(source)) {
    queue.push({ url: fallbackUrl, strategy: "open_access_fallback" });
  }

  if (source.doi) {
    queue.push({
      url: `https://doi.org/${source.doi}`,
      strategy: "doi_resolution",
    });
  }

  const seen = new Set<string>();
  return queue.filter((candidate) => {
    if (seen.has(candidate.url)) {
      return false;
    }

    seen.add(candidate.url);
    return true;
  });
}

async function fetchCandidate(url: string) {
  const response = await fetch(url, {
    headers: buildBrowserHeaders(),
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });

  const finalUrl = response.url || url;
  const contentType = response.headers.get("content-type") ?? "";

  return {
    response,
    finalUrl,
    contentType: contentType.toLowerCase(),
  };
}

async function resolveAccessiblePdfCandidate(source: BlueprintSourceRecord) {
  const queue = buildCandidateQueue(source);
  const visited = new Set<string>();
  let lastFailure:
    | {
        accessStrategy: PdfAccessStrategy | null;
        httpStatus: number | null;
        reason: string;
      }
    | null = null;

  while (queue.length > 0) {
    const candidate = queue.shift();

    if (!candidate || visited.has(candidate.url)) {
      continue;
    }

    visited.add(candidate.url);

    try {
      const fetched = await fetchCandidate(candidate.url);

      if (
        fetched.response.ok &&
        (fetched.contentType.includes("pdf") || fetched.finalUrl.toLowerCase().endsWith(".pdf"))
      ) {
        return {
          status: "resolved" as const,
          resolvedPdfUrl: fetched.finalUrl,
          accessStrategy: candidate.strategy,
          httpStatus: fetched.response.status,
        };
      }

      if (
        fetched.response.ok &&
        fetched.contentType.includes("html") &&
        candidate.strategy !== "websearch_pdf_url"
      ) {
        const html = await fetched.response.text();
        const discovered = parseHtmlForPdfLinks(html, fetched.finalUrl);

        for (const discoveredUrl of discovered) {
          if (!visited.has(discoveredUrl)) {
            queue.push({
              url: discoveredUrl,
              strategy: candidate.strategy === "doi_resolution"
                ? "doi_resolution"
                : "landing_page_discovery",
            });
          }
        }
      }

      if (!fetched.response.ok) {
        lastFailure = {
          accessStrategy: candidate.strategy,
          httpStatus: fetched.response.status,
          reason: `La descarga devolvio estado ${fetched.response.status}.`,
        };
        continue;
      }
    } catch (error) {
      lastFailure = {
        accessStrategy: candidate.strategy,
        httpStatus: null,
        reason: error instanceof Error ? error.message : "No se pudo resolver el PDF.",
      };
    }
  }

  return {
    status: "failed" as const,
    resolvedPdfUrl: null,
    accessStrategy: lastFailure?.accessStrategy ?? null,
    httpStatus: lastFailure?.httpStatus ?? null,
    reason:
      lastFailure?.reason ??
      "No se encontro un PDF publico accesible desde los enlaces disponibles.",
  };
}

async function downloadResolvedPdf(input: {
  source: BlueprintSourceRecord;
  outputPath: string;
  resolvedPdfUrl: string;
  accessStrategy: PdfAccessStrategy | null;
  httpStatus: number | null;
}) {
  const response = await fetch(input.resolvedPdfUrl, {
    headers: buildBrowserHeaders(),
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    return {
      status: "failed" as const,
      resolvedPdfUrl: input.resolvedPdfUrl,
      accessStrategy: input.accessStrategy,
      httpStatus: response.status,
      reason: `La descarga devolvio estado ${response.status}.`,
      storedFilePath: null,
      fileSizeBytes: null,
    };
  }

  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  const bytes = Buffer.from(await response.arrayBuffer());

  if (bytes.byteLength > MAX_DOWNLOAD_BYTES) {
    return {
      status: "failed" as const,
      resolvedPdfUrl: input.resolvedPdfUrl,
      accessStrategy: input.accessStrategy,
      httpStatus: response.status,
      reason: "El PDF excede el limite operativo del engine.",
      storedFilePath: null,
      fileSizeBytes: bytes.byteLength,
    };
  }

  if (!contentType.includes("pdf") && !input.resolvedPdfUrl.toLowerCase().endsWith(".pdf")) {
    return {
      status: "failed" as const,
      resolvedPdfUrl: input.resolvedPdfUrl,
      accessStrategy: input.accessStrategy,
      httpStatus: response.status,
      reason: "La URL final no devolvio un PDF identificable.",
      storedFilePath: null,
      fileSizeBytes: bytes.byteLength,
    };
  }

  await mkdir(path.dirname(input.outputPath), { recursive: true });
  await writeFile(input.outputPath, bytes);

  return {
    status: "downloaded" as const,
    resolvedPdfUrl: input.resolvedPdfUrl,
    accessStrategy: input.accessStrategy,
    httpStatus: response.status,
    reason: null,
    storedFilePath: input.outputPath,
    fileSizeBytes: bytes.byteLength,
  };
}

async function downloadPdf(source: BlueprintSourceRecord, outputPath: string) {
  const resolved = await resolveAccessiblePdfCandidate(source);

  if (resolved.status !== "resolved" || !resolved.resolvedPdfUrl) {
    return {
      status: source.pdf_url || source.landing_page_url ? "failed" : "skipped",
      resolvedPdfUrl: null,
      accessStrategy: resolved.accessStrategy,
      httpStatus: resolved.httpStatus,
      reason:
        resolved.reason ??
        "La fuente no expone un PDF publico directo ni se logro descubrir uno accesible.",
      storedFilePath: null,
      fileSizeBytes: null,
    } as const;
  }

  return downloadResolvedPdf({
    source,
    outputPath,
    resolvedPdfUrl: resolved.resolvedPdfUrl,
    accessStrategy: resolved.accessStrategy,
    httpStatus: resolved.httpStatus,
  });
}

export async function runPdfAvailabilityAndDownloadEngine(input: {
  manifest: BlueprintRunManifest;
  sourceRegistry: BlueprintSourceRecord[];
}): Promise<PdfDownloadResult> {
  const records: PdfDownloadRecord[] = [];
  const warnings: string[] = [];

  for (const source of input.sourceRegistry) {
    const result = await downloadPdf(
      source,
      buildPdfOutputPath(input.manifest.run_id, source.source_id),
    ).catch((error) => ({
      status: "failed" as const,
      resolvedPdfUrl: null,
      accessStrategy: null,
      httpStatus: null,
      reason: error instanceof Error ? error.message : "No se pudo descargar el PDF.",
      storedFilePath: null,
      fileSizeBytes: null,
    }));

    if (result.status === "failed" && result.reason) {
      warnings.push(`${source.title}: ${result.reason}`);
    }

    records.push({
      source_id: source.source_id,
      title: source.title,
      pdf_url: source.pdf_url,
      resolved_pdf_url: result.resolvedPdfUrl,
      access_strategy: result.accessStrategy,
      http_status: result.httpStatus,
      status: result.status,
      reason: result.reason,
      stored_file_path: result.storedFilePath,
      file_size_bytes: result.fileSizeBytes,
    });
  }

  return {
    records,
    warnings,
  };
}
