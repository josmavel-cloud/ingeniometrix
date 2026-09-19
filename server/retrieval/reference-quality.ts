const PLACEHOLDER_TITLE_PATTERNS = [
  /^title pending\b/i,
  /^untitled\b/i,
  /^no title\b/i,
  /^missing title\b/i,
  /^tbd\b/i,
];

export type ReferenceQualityInput = {
  title: string | null | undefined;
  sourceProvider?: string | null;
  year?: number | null;
  authors?: string[] | null;
  abstract?: string | null;
  venue?: string | null;
  doi?: string | null;
  landingPageUrl?: string | null;
  citationCount?: number | null;
  rawOpenAlexJson?: unknown | null;
  rawCrossrefJson?: unknown | null;
};

export type ReferenceQualityResult = {
  accepted: boolean;
  reason: string | null;
};

function cleanText(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() || "";
}

export function isPlaceholderReferenceTitle(title: string | null | undefined) {
  const normalized = cleanText(title);

  if (!normalized) {
    return true;
  }

  return PLACEHOLDER_TITLE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isImplausiblePublicationYear(year: number | null | undefined) {
  if (!year) {
    return false;
  }

  const currentYear = new Date().getFullYear();
  return year < 1900 || year > currentYear + 1;
}

export function evaluateReferenceQuality(
  input: ReferenceQualityInput,
): ReferenceQualityResult {
  if (isPlaceholderReferenceTitle(input.title)) {
    return {
      accepted: false,
      reason: "placeholder_title",
    };
  }

  if (isImplausiblePublicationYear(input.year)) {
    return {
      accepted: false,
      reason: "implausible_year",
    };
  }

  const hasOpenAlexRecord = Boolean(input.rawOpenAlexJson);
  const hasAbstract = Boolean(cleanText(input.abstract));
  const hasAuthors = Boolean(input.authors?.some((author) => cleanText(author)));
  const hasVenue = Boolean(cleanText(input.venue));
  const hasDoi = Boolean(cleanText(input.doi));
  const hasLandingPage = Boolean(cleanText(input.landingPageUrl));
  const hasCitationSignal = (input.citationCount ?? 0) > 0;

  if (
    !hasOpenAlexRecord &&
    !hasAbstract &&
    !hasAuthors &&
    !hasVenue &&
    !hasCitationSignal &&
    !hasDoi &&
    !hasLandingPage
  ) {
    return {
      accepted: false,
      reason: "insufficient_bibliographic_signal",
    };
  }

  return {
    accepted: true,
    reason: null,
  };
}
