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
  const match = value.match(/\p{L}/u);
  return match?.index ?? -1;
}

function isQuotedSourceExcerpt(value: string) {
  const trimmed = value.trim();
  return (
    /^["'\u201c\u201d\u2018\u2019]/.test(trimmed) ||
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

const COMMON_SPANISH_ACCENT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\binvestigacion(es)?\b/gi, "investigaci\u00f3n$1"],
  [/\bjustificacion(es)?\b/gi, "justificaci\u00f3n$1"],
  [/\bmetodologia(s)?\b/gi, "metodolog\u00eda$1"],
  [/\bmetodologico(s)?\b/gi, "metodol\u00f3gico$1"],
  [/\bmetodologica(s)?\b/gi, "metodol\u00f3gica$1"],
  [/\bformulacion(es)?\b/gi, "formulaci\u00f3n$1"],
  [/\bdefinicion(es)?\b/gi, "definici\u00f3n$1"],
  [/\binfografia(s)?\b/gi, "infograf\u00eda$1"],
  [/\brevision(es)?\b/gi, "revisi\u00f3n$1"],
  [/\bteorico(s)?\b/gi, "te\u00f3rico$1"],
  [/\bteorica(s)?\b/gi, "te\u00f3rica$1"],
  [/\banalisis\b/gi, "an\u00e1lisis"],
  [/\banalitico(s)?\b/gi, "anal\u00edtico$1"],
  [/\banalitica(s)?\b/gi, "anal\u00edtica$1"],
  [/\bdiseno(s)?\b/gi, "dise\u00f1o$1"],
  [/\bsismico(s)?\b/gi, "s\u00edsmico$1"],
  [/\bsismica(s)?\b/gi, "s\u00edsmica$1"],
  [/\bacademico(s)?\b/gi, "acad\u00e9mico$1"],
  [/\bacademica(s)?\b/gi, "acad\u00e9mica$1"],
  [/\bcientifico(s)?\b/gi, "cient\u00edfico$1"],
  [/\bcientifica(s)?\b/gi, "cient\u00edfica$1"],
  [/\btecnica(s)?\b/gi, "t\u00e9cnica$1"],
  [/\btecnico(s)?\b/gi, "t\u00e9cnico$1"],
  [/\bespecifico(s)?\b/gi, "espec\u00edfico$1"],
  [/\bespecifica(s)?\b/gi, "espec\u00edfica$1"],
  [/\bmetodo(s)?\b/gi, "m\u00e9todo$1"],
  [/\bhipotesis\b/gi, "hip\u00f3tesis"],
  [/\bvalidacion(es)?\b/gi, "validaci\u00f3n$1"],
  [/\bingenieria(s)?\b/gi, "ingenier\u00eda$1"],
  [/\bdinamica(s)?\b/gi, "din\u00e1mica$1"],
  [/\bdinamico(s)?\b/gi, "din\u00e1mico$1"],
  [/\bactuacion(es)?\b/gi, "actuaci\u00f3n$1"],
  [/\baccion(es)?\b/gi, "acci\u00f3n$1"],
  [/\becuacion(es)?\b/gi, "ecuaci\u00f3n$1"],
  [/\bformula(s)?\b/gi, "f\u00f3rmula$1"],
  [/\bvalvula(s)?\b/gi, "v\u00e1lvula$1"],
  [/\bnumero(s)?\b/gi, "n\u00famero$1"],
  [/\bmaestria(s)?\b/gi, "maestr\u00eda$1"],
  [/\bmencion(es)?\b/gi, "menci\u00f3n$1"],
  [/\bconfiguracion(es)?\b/gi, "configuraci\u00f3n$1"],
  [/\bpreparacion(es)?\b/gi, "preparaci\u00f3n$1"],
  [/\boperacion(es)?\b/gi, "operaci\u00f3n$1"],
  [/\bproduccion(es)?\b/gi, "producci\u00f3n$1"],
  [/\bpublicacion(es)?\b/gi, "publicaci\u00f3n$1"],
  [/\bejecucion(es)?\b/gi, "ejecuci\u00f3n$1"],
  [/\bcomparacion(es)?\b/gi, "comparaci\u00f3n$1"],
  [/\bintegracion(es)?\b/gi, "integraci\u00f3n$1"],
  [/\bsimbolo(s)?\b/gi, "s\u00edmbolo$1"],
  [/\bdescripcion(es)?\b/gi, "descripci\u00f3n$1"],
  [/\bcuadratico(s)?\b/gi, "cuadr\u00e1tico$1"],
  [/\bcuadratica(s)?\b/gi, "cuadr\u00e1tica$1"],
  [/\braiz(es)?\b/gi, "ra\u00edz$1"],
  [/\bservohidraulico(s)?\b/gi, "servohidr\u00e1ulico$1"],
  [/\bservohidraulica(s)?\b/gi, "servohidr\u00e1ulica$1"],
  [/\binformacion(es)?\b/gi, "informaci\u00f3n$1"],
  [/\bseleccion(es)?\b/gi, "selecci\u00f3n$1"],
  [/\brecoleccion(es)?\b/gi, "recolecci\u00f3n$1"],
  [/\brecuperacion(es)?\b/gi, "recuperaci\u00f3n$1"],
  [/\bsenal(es)?\b/gi, "se\u00f1al$1"],
  [/\bprogramacion(es)?\b/gi, "programaci\u00f3n$1"],
  [/\baprobacion(es)?\b/gi, "aprobaci\u00f3n$1"],
  [/\bevaluacion(es)?\b/gi, "evaluaci\u00f3n$1"],
  [/\bevalua\b/gi, "eval\u00faa"],
  [/\bevaluan\b/gi, "eval\u00faan"],
  [/\belaboracion(es)?\b/gi, "elaboraci\u00f3n$1"],
  [/\baplicacion(es)?\b/gi, "aplicaci\u00f3n$1"],
  [/\bexplicacion(es)?\b/gi, "explicaci\u00f3n$1"],
  [/\borganizacion(es)?\b/gi, "organizaci\u00f3n$1"],
  [/\bsimulacion(es)?\b/gi, "simulaci\u00f3n$1"],
  [/\bpublico(s)?\b/gi, "p\u00fablico$1"],
  [/\bpublica(s)?\b/gi, "p\u00fablica$1"],
  [/\bpublicos\b/gi, "p\u00fablicos"],
  [/\bpublicas\b/gi, "p\u00fablicas"],
  [/\bgestion(es)?\b/gi, "gesti\u00f3n$1"],
  [/\bproposito(s)?\b/gi, "prop\u00f3sito$1"],
  [/\bsistematica(s)?\b/gi, "sistem\u00e1tica$1"],
  [/\bsistematico(s)?\b/gi, "sistem\u00e1tico$1"],
  [/\bmatematica(s)?\b/gi, "matem\u00e1tica$1"],
  [/\bmatematico(s)?\b/gi, "matem\u00e1tico$1"],
  [/\bmaximo(s)?\b/gi, "m\u00e1ximo$1"],
  [/\bminimo(s)?\b/gi, "m\u00ednimo$1"],
  [/\bperiodo(s)?\b/gi, "per\u00edodo$1"],
  [/\bdecision(es)?\b/gi, "decisi\u00f3n$1"],
  [/\brelaciones\b/gi, "relaciones"],
  [/\brelacion\b/gi, "relaci\u00f3n"],
  [/\bambito(s)?\b/gi, "\u00e1mbito$1"],
  [/\bpoblacion(es)?\b/gi, "poblaci\u00f3n$1"],
  [/\bsegun\b/gi, "seg\u00fan"],
  [/\bdelimitacion(es)?\b/gi, "delimitaci\u00f3n$1"],
  [/\binterpretacion(es)?\b/gi, "interpretaci\u00f3n$1"],
  [/\bambiguedad(es)?\b/gi, "ambig\u00fcedad$1"],
  [/\boracion(es)?\b/gi, "oraci\u00f3n$1"],
  [/\bparrafo(s)?\b/gi, "p\u00e1rrafo$1"],
  [/\bvineta(s)?\b/gi, "vi\u00f1eta$1"],
  [/\bsubtitulo(s)?\b/gi, "subt\u00edtulo$1"],
  [/\bcapitulo(s)?\b/gi, "cap\u00edtulo$1"],
  [/\blinea(s)?\b/gi, "l\u00ednea$1"],
  [/\bitem(s)?\b/gi, "\u00edtem$1"],
  [/\btermino(s)?\b/gi, "t\u00e9rmino$1"],
  [/\bcategoria(s)?\b/gi, "categor\u00eda$1"],
  [/\bdimension(es)?\b/gi, "dimensi\u00f3n$1"],
  [/\bclinico(s)?\b/gi, "cl\u00ednico$1"],
  [/\bclinica(s)?\b/gi, "cl\u00ednica$1"],
  [/\bcronico(s)?\b/gi, "cr\u00f3nico$1"],
  [/\bcronica(s)?\b/gi, "cr\u00f3nica$1"],
  [/\bbibliografico(s)?\b/gi, "bibliogr\u00e1fico$1"],
  [/\bbibliografica(s)?\b/gi, "bibliogr\u00e1fica$1"],
  [/\bsemantico(s)?\b/gi, "sem\u00e1ntico$1"],
  [/\bsemantica(s)?\b/gi, "sem\u00e1ntica$1"],
  [/\bdiagnostico(s)?\b/gi, "diagn\u00f3stico$1"],
  [/\bdiagnostica(s)?\b/gi, "diagn\u00f3stica$1"],
  [/\bortografico(s)?\b/gi, "ortogr\u00e1fico$1"],
  [/\bortografica(s)?\b/gi, "ortogr\u00e1fica$1"],
  [/\bmas\b/gi, "m\u00e1s"],
  [/\bpais(es)?\b/gi, "pa\u00eds$1"],
  [/\bperu\b/gi, "Per\u00fa"],
];

const PUBLIC_SPANISH_LABEL_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bdirect\b/gi, "directo"],
  [/\boptional\b/gi, "opcional"],
  [/\bcontingency\b/gi, "contingencia"],
  [/\bassumption(s)?\b/gi, "supuesto$1"],
  [/\bworkflow(s)?\b/gi, "flujo metodol\u00f3gico$1"],
  [/\bframework(s)?\b/gi, "marco$1"],
  [/\boutput(s)?\b/gi, "salida$1"],
  [/\binput(s)?\b/gi, "entrada$1"],
  [/\bdeliverable(s)?\b/gi, "entregable$1"],
  [/\bdata collection\b/gi, "recolecci\u00f3n de datos"],
  [/\bvalidation\b/gi, "validaci\u00f3n"],
  [/\bsource-backed\b/gi, "con respaldo de fuente"],
  [/\bmodel-based\b/gi, "basado en modelo"],
  [/\broot mean square\b/gi, "ra\u00edz media cuadr\u00e1tica"],
  [/\bfeedback\b/gi, "retroalimentaci\u00f3n"],
  [/\bfeedforward\b/gi, "prealimentaci\u00f3n"],
  [/\btesting\b/gi, "ensayo"],
];

function preserveInitialCase(original: string, replacement: string) {
  if (!original) return replacement;
  return original.charAt(0) === original.charAt(0).toLocaleUpperCase("es-PE")
    ? `${replacement.charAt(0).toLocaleUpperCase("es-PE")}${replacement.slice(1)}`
    : replacement;
}

export function restoreCommonSpanishAccentsPublicText(
  value: string | null | undefined,
  kind: PublicTextKind = "sentence",
) {
  const text = value ?? "";
  if (shouldProtectEntireValue(text, kind)) {
    return text;
  }

  return COMMON_SPANISH_ACCENT_REPLACEMENTS.reduce(
    (current, [pattern, replacement]) =>
      current.replace(pattern, (match, maybeSuffix = "") => {
        const suffix = typeof maybeSuffix === "string" ? maybeSuffix : "";
        return preserveInitialCase(match, replacement.replace("$1", suffix));
      }),
    text,
  );
}

export function normalizeSpanishPublicText(
  value: string | null | undefined,
  kind: PublicTextKind = "sentence",
) {
  const text = value ?? "";
  if (shouldProtectEntireValue(text, kind)) {
    return text;
  }

  const translated = PUBLIC_SPANISH_LABEL_REPLACEMENTS.reduce(
    (current, [pattern, replacement]) =>
      current.replace(pattern, (match, maybeSuffix = "") => {
        const suffix = typeof maybeSuffix === "string" ? maybeSuffix : "";
        return preserveInitialCase(match, replacement.replace("$1", suffix));
      }),
    text,
  );

  return restoreCommonSpanishAccentsPublicText(translated, kind);
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
    return normalizeSpanishPublicText(text, kind);
  }

  const capitalized = `${text.slice(0, index)}${text.charAt(index).toLocaleUpperCase("es-PE")}${text.slice(index + 1)}`;
  return normalizeSpanishPublicText(capitalized, kind);
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
        : normalizeSpanishPublicText(cell, "table_cell"),
    ),
  );
}
