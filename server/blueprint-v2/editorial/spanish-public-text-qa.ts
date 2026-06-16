import type { AcademicDocument } from "@/server/blueprint-v2/lab/academic-document-model";
import { hasIncompleteAcademicEnding } from "@/server/blueprint-v2/editorial/academic-editorial-policy";

type FindingKind =
  | "english_public_label"
  | "missing_spanish_accent"
  | "internal_traceability_term"
  | "incomplete_public_sentence"
  | "dense_public_paragraph";

export type SpanishPublicTextQaFinding = {
  kind: FindingKind;
  label: string;
  value: string;
  suggestion: string;
};

export type SpanishPublicTextQaReport = {
  artifact_type: "spanish_public_text_qa";
  artifact_version: "v1";
  generated_at: string;
  passed: boolean;
  checked_field_count: number;
  finding_count: number;
  findings: SpanishPublicTextQaFinding[];
  warnings: string[];
};

const ENGLISH_PUBLIC_LABEL_PATTERNS: Array<[RegExp, string]> = [
  [/\bdirect\b/i, "Usar 'Directo' en campos publicos de presupuesto."],
  [/\boptional\b/i, "Usar 'Opcional' en campos publicos de presupuesto."],
  [/\bcontingency\b/i, "Usar 'Contingencia' en campos publicos de presupuesto."],
  [/\bassumption\b/i, "Usar 'Supuesto' o redactar la frase en espanol."],
  [/\bworkflow\b/i, "Usar 'flujo metodologico' o una glosa espanola."],
  [/\bframework\b/i, "Usar 'marco' salvo que sea termino tecnico aceptado y glosado."],
  [/\boutput\b/i, "Usar 'salida esperada' o 'producto esperado'."],
  [/\binput\b/i, "Usar 'entrada' o 'dato de entrada'."],
  [/\bdeliverable\b/i, "Usar 'entregable'."],
  [/\bdata collection\b/i, "Usar 'recoleccion de datos'."],
  [/\bvalidation\b/i, "Usar 'validacion'."],
  [/\bsource-backed\b/i, "Usar 'con respaldo de fuente' o una glosa espanola."],
];

const ACCENT_PATTERNS: Array<[RegExp, string]> = [
  [/\binvestigacion\b/i, "investigaci\u00f3n"],
  [/\bmetodologia\b/i, "metodolog\u00eda"],
  [/\bmetodologico\b/i, "metodol\u00f3gico"],
  [/\bmetodologica\b/i, "metodol\u00f3gica"],
  [/\bteorico\b/i, "te\u00f3rico"],
  [/\bteorica\b/i, "te\u00f3rica"],
  [/\banalisis\b/i, "an\u00e1lisis"],
  [/\bdiseno\b/i, "dise\u00f1o"],
  [/\bacademico\b/i, "acad\u00e9mico"],
  [/\bacademica\b/i, "acad\u00e9mica"],
  [/\bhipotesis\b/i, "hip\u00f3tesis"],
  [/\bvalidacion\b/i, "validaci\u00f3n"],
  [/\bgestion\b/i, "gesti\u00f3n"],
  [/\bproposito\b/i, "prop\u00f3sito"],
  [/\bseleccion\b/i, "selecci\u00f3n"],
  [/\bevaluacion\b/i, "evaluaci\u00f3n"],
  [/\bevalua\b/i, "eval\u00faa"],
  [/\belaboracion\b/i, "elaboraci\u00f3n"],
  [/\bexplicacion\b/i, "explicaci\u00f3n"],
  [/\bmetodo\b/i, "m\u00e9todo"],
  [/\brelacion\b/i, "relaci\u00f3n"],
  [/\bambito\b/i, "\u00e1mbito"],
  [/\bpoblacion\b/i, "poblaci\u00f3n"],
  [/\bsegun\b/i, "seg\u00fan"],
  [/\bdelimitacion\b/i, "delimitaci\u00f3n"],
  [/\binterpretacion\b/i, "interpretaci\u00f3n"],
  [/\bambiguedad\b/i, "ambig\u00fcedad"],
  [/\boracion\b/i, "oraci\u00f3n"],
  [/\bparrafo\b/i, "p\u00e1rrafo"],
  [/\bvineta\b/i, "vi\u00f1eta"],
  [/\bsubtitulo\b/i, "subt\u00edtulo"],
  [/\bcategoria\b/i, "categor\u00eda"],
  [/\bdimension\b/i, "dimensi\u00f3n"],
  [/\bclinico\b/i, "cl\u00ednico"],
  [/\bcronico\b/i, "cr\u00f3nico"],
  [/\bbibliografico\b/i, "bibliogr\u00e1fico"],
  [/\bsemantico\b/i, "sem\u00e1ntico"],
  [/\bdiagnostico\b/i, "diagn\u00f3stico"],
  [/\bortografico\b/i, "ortogr\u00e1fico"],
  [/\bpais\b/i, "pa\u00eds"],
  [/\baccion\b/i, "acci\u00f3n"],
  [/\becuacion\b/i, "ecuaci\u00f3n"],
  [/\bformula\b/i, "f\u00f3rmula"],
  [/\bvalvula\b/i, "v\u00e1lvula"],
  [/\bmaestria\b/i, "maestr\u00eda"],
  [/\bmencion\b/i, "menci\u00f3n"],
  [/\bconfiguracion\b/i, "configuraci\u00f3n"],
  [/\bpreparacion\b/i, "preparaci\u00f3n"],
  [/\boperacion\b/i, "operaci\u00f3n"],
  [/\bproduccion\b/i, "producci\u00f3n"],
  [/\bpublicacion\b/i, "publicaci\u00f3n"],
  [/\binvestigacion\b/i, "investigación"],
  [/\bmetodologia\b/i, "metodología"],
  [/\bmetodologico\b/i, "metodológico"],
  [/\bmetodologica\b/i, "metodológica"],
  [/\bteorico\b/i, "teórico"],
  [/\bteorica\b/i, "teórica"],
  [/\banalisis\b/i, "análisis"],
  [/\bdiseno\b/i, "diseño"],
  [/\bsismico\b/i, "sísmico"],
  [/\bsismica\b/i, "sísmica"],
  [/\bacademico\b/i, "académico"],
  [/\bacademica\b/i, "académica"],
  [/\btecnica\b/i, "técnica"],
  [/\btecnico\b/i, "técnico"],
  [/\bespecifico\b/i, "espec\u00edfico"],
  [/\bespecifica\b/i, "espec\u00edfica"],
  [/\bhipotesis\b/i, "hipótesis"],
  [/\bvalidacion\b/i, "validación"],
  [/\bingenieria\b/i, "ingeniería"],
  [/\bdinamica\b/i, "dinámica"],
  [/\bejecucion\b/i, "ejecución"],
  [/\bevaluacion\b/i, "evaluación"],
  [/\belaboracion\b/i, "elaboración"],
  [/\bsimulacion\b/i, "simulación"],
  [/\bseleccion\b/i, "selección"],
  [/\binformacion\b/i, "información"],
  [/\bpublico\b/i, "público"],
  [/\bpublica\b/i, "pública"],
  [/\bgestion\b/i, "gestión"],
];

const INTERNAL_TRACEABILITY_PATTERNS: Array<[RegExp, string]> = [
  [/\bevidence_id\b/i, "No mostrar evidence_id en texto publico."],
  [/\bsource_id\b/i, "No mostrar source_id en texto publico."],
  [/\bartifacts-local\b/i, "No mostrar rutas internas en texto publico."],
  [/\btrazabilidad academica\b/i, "La trazabilidad academica es interna, no anexo publico."],
];

function normalize(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function shouldSkipValue(value: string, label: string) {
  const trimmed = value.trim();
  const normalizedLabel = label.toLowerCase();
  return (
    !trimmed ||
    /^https?:\/\//i.test(trimmed) ||
    /^10\.\d{4,9}\//i.test(trimmed) ||
    /references|referencias|apa_reference|doi|url|source_titles?/i.test(label) ||
    /\.generated_at$/.test(normalizedLabel) ||
    /\.warnings\[\d+\]$/.test(normalizedLabel) ||
    /\.blockers\[\d+\]$/.test(normalizedLabel) ||
    /\.cover_visual\.(prompt|negative_prompt|source_handoff_id|source_evidence_run_id|source_snapshot_hash|image_path|image_model|image_generation_status|image_generation_warnings|deterministic_template_asset)$/.test(normalizedLabel) ||
    /\.budget_rows\[\d+\]\.cost_type$/.test(normalizedLabel) ||
    /\.schedule_visual\.tasks\[\d+\]\.phase$/.test(normalizedLabel) ||
    /\.schedule_gantt_rows\[\d+\]\.phase$/.test(normalizedLabel)
  );
}

function wordCount(value: string) {
  return normalize(value).split(/\s+/).filter(Boolean).length;
}

function shouldCheckSentenceIntegrity(label: string) {
  return /\.(text|caption|purpose|subtitle|body_reference|hero_visual_caption|hero_prompt_summary)$/.test(label) ||
    /\.blocks\[\d+\]\.text$/.test(label);
}

function shouldCheckDenseParagraph(label: string, value: string) {
  return /\.blocks\[\d+\]\.text$/.test(label) && !/^\s*[-*]/.test(value);
}

function collectTextFields(value: unknown, label: string, output: Array<{ label: string; text: string }>) {
  if (typeof value === "string") {
    const text = normalize(value);
    if (text && !shouldSkipValue(text, label)) {
      output.push({ label, text });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectTextFields(item, `${label}[${index}]`, output));
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    collectTextFields(child, `${label}.${key}`, output);
  }
}

function collectDocumentFields(document: AcademicDocument, label: string) {
  const fields: Array<{ label: string; text: string }> = [];
  collectTextFields(document.metadata, `${label}.metadata`, fields);
  collectTextFields(document.layout_plan.cover_visual, `${label}.cover_visual`, fields);
  collectTextFields(document.layout_plan.schedule_visual, `${label}.schedule_visual`, fields);
  collectTextFields(document.layout_plan.schedule_gantt_rows ?? [], `${label}.schedule_gantt_rows`, fields);
  collectTextFields(document.layout_plan.budget_rows ?? [], `${label}.budget_rows`, fields);
  collectTextFields(document.layout_plan.appendix_public_items ?? [], `${label}.appendix_public_items`, fields);
  collectTextFields(document.layout_plan.figures, `${label}.figures`, fields);
  collectTextFields(document.layout_plan.equations, `${label}.equations`, fields);
  for (const section of document.sections) {
    collectTextFields(
      {
        title: section.title,
        blocks: section.blocks,
      },
      `${label}.section.${section.section_key}`,
      fields,
    );
  }
  return fields;
}

export function buildSpanishPublicTextQaReport(input: {
  documents: Array<{ label: string; document: AcademicDocument }>;
}): SpanishPublicTextQaReport {
  const fields = input.documents.flatMap((item) => collectDocumentFields(item.document, item.label));
  const findings: SpanishPublicTextQaFinding[] = [];
  const seen = new Set<string>();

  const push = (finding: SpanishPublicTextQaFinding) => {
    const key = `${finding.kind}:${finding.label}:${finding.value}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push(finding);
  };

  for (const field of fields) {
    for (const [pattern, suggestion] of ENGLISH_PUBLIC_LABEL_PATTERNS) {
      if (pattern.test(field.text)) {
        push({ kind: "english_public_label", label: field.label, value: field.text, suggestion });
      }
    }
    for (const [pattern, replacement] of ACCENT_PATTERNS) {
      if (pattern.test(field.text)) {
        push({
          kind: "missing_spanish_accent",
          label: field.label,
          value: field.text,
          suggestion: `Revisar acentuacion: posible forma esperada '${replacement}'.`,
        });
      }
    }
    for (const [pattern, suggestion] of INTERNAL_TRACEABILITY_PATTERNS) {
      if (pattern.test(field.text)) {
        push({ kind: "internal_traceability_term", label: field.label, value: field.text, suggestion });
      }
    }
    if (shouldCheckSentenceIntegrity(field.label) && hasIncompleteAcademicEnding(field.text)) {
      push({
        kind: "incomplete_public_sentence",
        label: field.label,
        value: field.text,
        suggestion: "Revisar cierre de frase: el texto termina con conector o estructura incompleta.",
      });
    }
    if (shouldCheckDenseParagraph(field.label, field.text) && wordCount(field.text) > 150) {
      push({
        kind: "dense_public_paragraph",
        label: field.label,
        value: field.text,
        suggestion: "Dividir este bloque en parrafo breve, vinetas o subtitulos para lectura academica mas clara.",
      });
    }
  }

  return {
    artifact_type: "spanish_public_text_qa",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    passed: findings.length === 0,
    checked_field_count: fields.length,
    finding_count: findings.length,
    findings: findings.slice(0, 120),
    warnings: findings.length > 0 ? ["spanish_public_text_qa_findings_require_review"] : [],
  };
}
