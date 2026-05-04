export function buildBrowserLikeFetchHeaders(input?: {
  accept?: string;
  referer?: string | null;
  range?: string | null;
}) {
  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    Accept: input?.accept ?? "application/pdf,text/html,application/xhtml+xml,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,es;q=0.8",
  };

  if (input?.referer) {
    headers.Referer = input.referer;
  }

  if (input?.range) {
    headers.Range = input.range;
  }

  return headers;
}

export async function verifyPdfAccess(pdfUrl: string | null) {
  if (!pdfUrl) {
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_500);

  try {
    const headResponse = await fetch(pdfUrl, {
      method: "HEAD",
      redirect: "follow",
      headers: buildBrowserLikeFetchHeaders({
        accept: "application/pdf,text/html,application/xhtml+xml,*/*;q=0.8",
        referer: pdfUrl,
      }),
      signal: controller.signal,
    });

    const contentType = headResponse.headers.get("content-type") ?? "";

    if (headResponse.ok && contentType.toLowerCase().includes("pdf")) {
      return true;
    }
  } catch {
    // Intentamos un GET corto como respaldo.
  } finally {
    clearTimeout(timeout);
  }

  const fallbackController = new AbortController();
  const fallbackTimeout = setTimeout(() => fallbackController.abort(), 4_500);

  try {
    const getResponse = await fetch(pdfUrl, {
      method: "GET",
      headers: buildBrowserLikeFetchHeaders({
        accept: "application/pdf,text/html,application/xhtml+xml,*/*;q=0.8",
        referer: pdfUrl,
        range: "bytes=0-0",
      }),
      redirect: "follow",
      signal: fallbackController.signal,
    });
    const contentType = getResponse.headers.get("content-type") ?? "";

    return (
      (getResponse.ok || getResponse.status === 206) &&
      contentType.toLowerCase().includes("pdf")
    );
  } catch {
    return false;
  } finally {
    clearTimeout(fallbackTimeout);
  }
}

export function extractAccessSignals(input: {
  rawOpenAlexJson: unknown | null;
  landingPageUrl: string | null;
  doi: string | null;
}) {
  const record =
    typeof input.rawOpenAlexJson === "object" &&
    input.rawOpenAlexJson !== null &&
    !Array.isArray(input.rawOpenAlexJson)
      ? (input.rawOpenAlexJson as Record<string, unknown>)
      : null;
  const bestOaLocation =
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
  const openAccess =
    record &&
    typeof record.open_access === "object" &&
    record.open_access !== null
      ? (record.open_access as Record<string, unknown>)
      : null;
  const pdfUrl =
    (typeof bestOaLocation?.pdf_url === "string" && bestOaLocation.pdf_url) ||
    (typeof primaryLocation?.pdf_url === "string" && primaryLocation.pdf_url) ||
    null;

  return {
    pdfUrl,
    hasPdfUrl: Boolean(pdfUrl),
    isOpenAccess:
      openAccess?.is_oa === true ||
      Boolean(pdfUrl) ||
      Boolean(input.landingPageUrl) ||
      Boolean(input.doi),
  };
}
