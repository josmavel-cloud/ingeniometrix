import type {
  CitationStyle,
  EffectiveTemplateElementRules,
} from "@/server/reporting/template-ingestion-types";
import type { SyntheticReferenceEntry } from "@/server/reporting/synthetic-document-types";

const AUTHOR_GIVEN_NAMES = ["Ana", "Luis", "Mariela", "Carlos", "Rosa", "Javier", "Lucia"];
const AUTHOR_FAMILY_NAMES = [
  "Quispe",
  "Torres",
  "Vargas",
  "Flores",
  "Castillo",
  "Ramos",
  "Cruz",
];
const REFERENCE_TOPICS = [
  "validacion estructural",
  "diseno metodologico",
  "analisis aplicado",
  "sistematizacion de resultados",
  "evaluacion comparativa",
  "modelado tecnico",
];

function pickVariant<T>(values: T[], seed: number, offset = 0) {
  return values[(seed + offset) % values.length];
}

function buildAuthorName(index: number, variantSeed: number) {
  const given = pickVariant(AUTHOR_GIVEN_NAMES, variantSeed, index);
  const family = pickVariant(AUTHOR_FAMILY_NAMES, variantSeed * 2, index);
  return `${family}, ${given[0]}.`;
}

function referenceText(style: CitationStyle, index: number) {
  switch (style) {
    case "VANCOUVER":
      return `${index}. Autor de Prueba ${index}. Documento sintetico para validacion de plantilla. Lima: Ingeniometrix; 2026.`;
    case "IEEE":
      return `[${index}] A. de Prueba, "Documento sintetico para validacion de plantilla", Ingeniometrix, 2026.`;
    case "ISO690":
      return `AUTOR DE PRUEBA ${index}. Documento sintetico para validacion de plantilla. Lima: Ingeniometrix, 2026.`;
    case "CHICAGO":
      return `Autor de Prueba ${index}. 2026. Documento sintetico para validacion de plantilla. Lima: Ingeniometrix.`;
    case "APA7":
    case "UNKNOWN":
    default:
      return `Autor de Prueba, A. (${2025 + index % 2}). Documento sintetico para validacion de plantilla ${index}. Ingeniometrix Press.`;
  }
}

function referenceTextForVariant(input: {
  style: CitationStyle;
  index: number;
  variantSeed: number;
}) {
  const { style, index, variantSeed } = input;
  const year = 2024 + ((variantSeed + index) % 3);
  const author = buildAuthorName(index, variantSeed);
  const topic = pickVariant(REFERENCE_TOPICS, variantSeed, index);

  switch (style) {
    case "VANCOUVER":
      return `${index}. ${author} Documento sintetico sobre ${topic}. Lima: Ingeniometrix; ${year}.`;
    case "IEEE":
      return `[${index}] ${author} "Documento sintetico sobre ${topic}", Ingeniometrix, ${year}.`;
    case "ISO690":
      return `${author.toUpperCase()} Documento sintetico sobre ${topic}. Lima: Ingeniometrix, ${year}.`;
    case "CHICAGO":
      return `${author.replace(",", "")} ${year}. Documento sintetico sobre ${topic}. Lima: Ingeniometrix.`;
    case "APA7":
    case "UNKNOWN":
    default:
      return `${author} (${year}). Documento sintetico para ${topic} ${index}. Ingeniometrix Press.`;
  }
}

export function buildSyntheticInlineCitation(input: {
  rules: EffectiveTemplateElementRules;
  referenceIndex: number;
  variantSeed?: number;
}) {
  const { rules, referenceIndex } = input;
  const variantSeed = input.variantSeed ?? 1;
  const oneBased = referenceIndex + 1;
  const year = 2024 + ((variantSeed + referenceIndex) % 3);

  switch (rules.citation.inline_style) {
    case "numeric":
      return `[${oneBased}]`;
    case "footnote":
      return `^${oneBased}`;
    case "author_year":
    default:
      return `(${buildAuthorName(oneBased, variantSeed).replace(/\.$/, "")}, ${year})`;
  }
}

export function generateSyntheticReferences(input: {
  citationStyle: CitationStyle;
  count?: number;
  variantSeed?: number;
}) {
  const count = input.count ?? 5;
  const variantSeed = input.variantSeed ?? 1;

  return Array.from({ length: count }, (_, index) => ({
    id: `ref-${index + 1}`,
    text:
      variantSeed === 1
        ? referenceText(input.citationStyle, index + 1)
        : referenceTextForVariant({
            style: input.citationStyle,
            index: index + 1,
            variantSeed,
          }),
    synthetic: true,
  })) satisfies SyntheticReferenceEntry[];
}
