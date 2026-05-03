type SectionOutputInspection = {
  has_markdown_heading: boolean;
  has_markdown_emphasis: boolean;
  has_double_period: boolean;
  has_visible_reference_marker: boolean;
  source_title_mentions: string[];
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeSpacing(value: string) {
  return value
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+\)/g, ")")
    .replace(/\(\s+/g, "(")
    .replace(/\.\s*\./g, ".")
    .trim();
}

function normalizeMarkdownTables(value: string) {
  const lines = value.split(/\r?\n/);
  const normalized = lines.map((line) => {
    const trimmed = line.trim();

    if (!/^\|.+\|$/.test(trimmed)) {
      return line;
    }

    if (/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(trimmed)) {
      return "";
    }

    return trimmed
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim())
      .join("\t");
  });

  return normalized.filter((line) => line.trim().length > 0).join("\n");
}

function stripMarkdownFormatting(value: string, title: string) {
  const titlePattern = escapeRegExp(title.trim());

  return normalizeMarkdownTables(value)
    .split(/\r?\n/)
    .map((line) => {
      const headingMatch = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);

      if (headingMatch) {
        const headingText = headingMatch[1].trim();
        if (
          headingText.localeCompare(title.trim(), undefined, {
            sensitivity: "base",
          }) === 0
        ) {
          return "";
        }

        return headingText;
      }

      if (
        titlePattern &&
        new RegExp(`^\\s*#{1,6}\\s+${titlePattern}\\s*$`, "i").test(line)
      ) {
        return "";
      }

      return line;
    })
    .join("\n")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/(^|[\s([{])\*([^*\n]{2,120})\*(?=[\s.,;:)\]}]|$)/g, "$1$2")
    .replace(/__([^_\n]+)__/g, "$1");
}

function stripVisibleSourceTitles(input: {
  value: string;
  sectionKey: string;
  sourceTitles: string[];
}) {
  if (input.sectionKey === "references") {
    return input.value;
  }

  let next = input.value;
  const titles = uniqueStrings(
    input.sourceTitles
      .map((title) => title.trim())
      .filter((title) => title.length >= 18),
  ).sort((left, right) => right.length - left.length);

  for (const title of titles) {
    const escaped = escapeRegExp(title);
    next = next
      .replace(new RegExp(`\\s*\\([^()]*${escaped}[^()]*\\)`, "gi"), "")
      .replace(new RegExp(`[\"“”]${escaped}[\"“”]`, "gi"), "")
      .replace(new RegExp(escaped, "gi"), "");
  }

  return next;
}

function stripEngineOrCitationMarkers(input: {
  value: string;
  sectionKey: string;
}) {
  const base = input.value
    .split(/\r?\n/)
    .filter((line) => !/^\s*(reference_id|source_id|evidence_id|snippet_id)\s*:/i.test(line))
    .join("\n")
    .replace(/\b(reference_id|source_id|evidence_id|snippet_id)\s*:\s*\S+/gi, "")
    .replace(/\[[A-Z_:-]*?(?:ref|source|evidence|snippet)[A-Z0-9_:-]*?\]/gi, "")
    .replace(/\((?:ref|source|evidence|snippet)[^)]{0,80}\)/gi, "");

  if (input.sectionKey === "references") {
    return base;
  }

  return base
    .replace(/\s*\((?:[^)]{0,160}\b\d{4}\b[^)]{0,160})\)/g, "")
    .replace(/\s*\[(?:\d+(?:,\s*)?)+\]/g, "");
}

export function inspectSectionOutput(input: {
  content: string;
  sectionKey: string;
  sourceTitles?: string[];
}): SectionOutputInspection {
  const sourceTitles = input.sectionKey === "references" ? [] : input.sourceTitles ?? [];
  const mentionedTitles = uniqueStrings(
    sourceTitles
      .filter((title) => title.trim().length >= 18)
      .filter((title) =>
        new RegExp(escapeRegExp(title.trim()), "i").test(input.content),
      ),
  );

  return {
    has_markdown_heading: /(^|\n)\s{0,3}#{1,6}\s+\S/.test(input.content),
    has_markdown_emphasis: /\*\*|__|(^|[\s([{])\*[^*\n]{2,120}\*(?=[\s.,;:)\]}]|$)/.test(
      input.content,
    ),
    has_double_period: /\.\s*\./.test(input.content),
    has_visible_reference_marker:
      input.sectionKey !== "references" &&
      (/\((?:[^)]{0,160}\b\d{4}\b[^)]{0,160})\)/.test(input.content) ||
        /\[(?:\d+(?:,\s*)?)+\]/.test(input.content) ||
        /\b(reference_id|source_id|evidence_id|snippet_id)\s*:/i.test(input.content)),
    source_title_mentions: mentionedTitles,
  };
}

export function normalizeGeneratedSectionContent(input: {
  content: string;
  title: string;
  sectionKey: string;
  sourceTitles?: string[];
}) {
  const before = inspectSectionOutput({
    content: input.content,
    sectionKey: input.sectionKey,
    sourceTitles: input.sourceTitles,
  });
  const normalized = normalizeSpacing(
    stripEngineOrCitationMarkers({
      value: stripVisibleSourceTitles({
        value: stripMarkdownFormatting(input.content, input.title),
        sectionKey: input.sectionKey,
        sourceTitles: input.sourceTitles ?? [],
      }),
      sectionKey: input.sectionKey,
    }),
  );
  const after = inspectSectionOutput({
    content: normalized,
    sectionKey: input.sectionKey,
    sourceTitles: input.sourceTitles,
  });
  const warnings = [
    before.has_markdown_heading ? "Se removieron encabezados Markdown visibles." : null,
    before.has_markdown_emphasis ? "Se removieron marcas Markdown de enfasis." : null,
    before.has_double_period ? "Se normalizo puntuacion duplicada." : null,
    before.has_visible_reference_marker
      ? "Se removieron marcadores visibles de cita o metadatos."
      : null,
    before.source_title_mentions.length > 0
      ? "Se removieron titulos de fuentes del contenido; las citas quedan diferidas al DOCX."
      : null,
  ].filter((warning): warning is string => Boolean(warning));

  return {
    content: normalized,
    warnings,
    inspection: after,
    qualityChecks: {
      format_contamination_pass:
        !after.has_markdown_heading &&
        !after.has_markdown_emphasis &&
        !after.has_double_period,
      citation_deferred_pass:
        input.sectionKey === "references" ||
        (!after.has_visible_reference_marker &&
          after.source_title_mentions.length === 0),
      punctuation_pass: !after.has_double_period,
    },
  };
}
