import type {
  SyntheticCaption,
} from "@/server/reporting/synthetic-document-types";
import type { EffectiveTemplateElementRules } from "@/server/reporting/template-ingestion-types";

function buildCaptionLabel(prefix: string, numbered: boolean, sequence: number) {
  if (!numbered) {
    return prefix;
  }

  return `${prefix} ${sequence}`;
}

export function generateSyntheticCaption(input: {
  rules: EffectiveTemplateElementRules;
  kind: "table" | "figure";
  title: string;
  sequence: number;
}) {
  const { rules, kind, title, sequence } = input;
  const kindRules = kind === "table" ? rules.table : rules.figure;
  const labelBase = kind === "table" ? kindRules.label : kindRules.label;
  const label = buildCaptionLabel(labelBase, kindRules.numbering, sequence);
  const captionRules = rules.caption;

  const note =
    kindRules.source_note_required === false
      ? null
      : "Nota. Bloque sintetico de prueba para verificar renderizacion y layout.";

  const sourceLabel =
    kindRules.source_note_required === false ? null : "Fuente: contenido sintetico de prueba";

  const separator = captionRules.separator;
  const prefixStyle = captionRules.prefix_style;

  const formattedTitle =
    prefixStyle === "label_colon_title"
      ? `${label}:${separator === ": " ? "" : " "}${title}`
      : prefixStyle === "label_title"
        ? `${label}${separator}${title}`
        : `${label}.${separator === ". " ? " " : separator}${title}`;

  return {
    label,
    title: formattedTitle,
    note,
    source_label: sourceLabel,
    position: kindRules.caption_position,
  } satisfies SyntheticCaption;
}
