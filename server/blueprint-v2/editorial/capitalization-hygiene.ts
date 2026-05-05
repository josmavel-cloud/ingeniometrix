export type PublicTextKind =
  | "title"
  | "heading"
  | "caption"
  | "label"
  | "sentence"
  | "table_cell"
  | "keyword_line";

const PROTECTED_FULL_VALUE_PATTERNS = [
  /^https?:\/\//i,
  /^www\./i,
  /^doi\s*:/i,
  /^10\.\d{4,9}\//i,
  /^[A-Z]:\\/,
  /^[a-z][a-z0-9+.-]*:\/\//i,
  /^[\w.-]+[/\\][\w./\\-]+$/,
  /^[A-Z_][A-Z0-9_]*(?:\s*=\s*.+)?$/,
];

function firstAlphabeticIndex(value: string) {
  const match = value.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/);
  return match?.index ?? -1;
}

function isQuotedSourceExcerpt(value: string) {
  const trimmed = value.trim();
  return (
    /^["'“”‘’]/.test(trimmed) ||
    /^cita\s+(textual|directa)\s*:/i.test(trimmed) ||
    /^excerpt\s*:/i.test(trimmed)
  );
}

function shouldProtectEntireValue(value: string, kind: PublicTextKind) {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }

  if (kind !== "keyword_line" && isQuotedSourceExcerpt(trimmed)) {
    return true;
  }

  return PROTECTED_FULL_VALUE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function sentenceStyleCapitalizePublicText(
  value: string | null | undefined,
  kind: PublicTextKind = "sentence",
) {
  const text = value ?? "";
  if (shouldProtectEntireValue(text, kind)) {
    return text;
  }

  const index = firstAlphabeticIndex(text);
  if (index < 0) {
    return text;
  }

  return `${text.slice(0, index)}${text.charAt(index).toLocaleUpperCase("es-PE")}${text.slice(index + 1)}`;
}

export function capitalizeKeywordLine(value: string | null | undefined) {
  const text = value ?? "";
  if (shouldProtectEntireValue(text, "keyword_line")) {
    return text;
  }

  return sentenceStyleCapitalizePublicText(text, "keyword_line");
}

export function capitalizePublicTableRows(rows: string[][]) {
  return rows.map((row, rowIndex) =>
    row.map((cell, cellIndex) =>
      rowIndex === 0 || cellIndex <= 2
        ? sentenceStyleCapitalizePublicText(cell, "table_cell")
        : cell,
    ),
  );
}
