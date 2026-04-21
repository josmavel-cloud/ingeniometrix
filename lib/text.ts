export function normalizeTitle(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildSearchQuery(parts: Array<string | undefined | null>) {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" ");
}

const SEARCH_STOPWORDS = new Set([
  "ante",
  "bajo",
  "cabe",
  "como",
  "con",
  "contra",
  "cual",
  "cuales",
  "cuando",
  "cuanto",
  "cuya",
  "cuyo",
  "de",
  "del",
  "desde",
  "donde",
  "dos",
  "el",
  "ella",
  "ellas",
  "ellos",
  "en",
  "entre",
  "era",
  "eran",
  "es",
  "esa",
  "esas",
  "ese",
  "eso",
  "esos",
  "esta",
  "estaba",
  "estado",
  "estados",
  "estan",
  "estar",
  "estas",
  "este",
  "estos",
  "fue",
  "fueron",
  "ha",
  "han",
  "hacia",
  "hasta",
  "la",
  "las",
  "le",
  "les",
  "lo",
  "los",
  "mas",
  "mediante",
  "mi",
  "mis",
  "no",
  "o",
  "para",
  "pero",
  "por",
  "que",
  "se",
  "segun",
  "si",
  "sin",
  "sobre",
  "su",
  "sus",
  "the",
  "to",
  "un",
  "una",
  "uno",
  "unos",
  "y",
]);

export function extractSearchTerms(
  input: string | null | undefined,
  options?: { maxTerms?: number; minLength?: number },
) {
  const maxTerms = options?.maxTerms ?? 8;
  const minLength = options?.minLength ?? 4;
  const seen = new Set<string>();

  return normalizeTitle(input)
    .split(" ")
    .filter((term) => term.length >= minLength && !SEARCH_STOPWORDS.has(term))
    .filter((term) => {
      if (seen.has(term)) {
        return false;
      }

      seen.add(term);
      return true;
    })
    .slice(0, maxTerms);
}

export function buildSearchQueryAttempts(parts: {
  topic?: string | null;
  problemContext?: string | null;
  program?: string | null;
}) {
  const attempts = [
    buildSearchQuery([parts.topic, parts.program]),
    buildSearchQuery([parts.topic]),
    buildSearchQuery([
      ...extractSearchTerms(parts.topic ?? "", { maxTerms: 6 }),
      ...extractSearchTerms(parts.problemContext ?? "", { maxTerms: 4 }),
    ]),
    buildSearchQuery([...extractSearchTerms(parts.topic ?? "", { maxTerms: 5 })]),
  ];

  const seen = new Set<string>();

  return attempts.filter((attempt) => {
    const normalizedAttempt = normalizeTitle(attempt);

    if (!normalizedAttempt || seen.has(normalizedAttempt)) {
      return false;
    }

    seen.add(normalizedAttempt);
    return true;
  });
}
