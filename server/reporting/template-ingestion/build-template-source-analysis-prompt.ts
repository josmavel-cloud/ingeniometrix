import type { NormalizedBlock, NormalizedTemplateSourceDocument } from "@/server/reporting/template-ingestion-types";

const MAX_BLOCK_EXCERPT_LENGTH = 1200;

function excerpt(value: string, maxLength = MAX_BLOCK_EXCERPT_LENGTH) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}

function summarizeBlock(block: NormalizedBlock) {
  return {
    block_id: block.id,
    type: block.type,
    label: block.label ?? null,
    ordinal: block.ordinal ?? null,
    level: block.level ?? null,
    semantic_key: block.semantic_key ?? null,
    page_span: block.page_span,
    has_list_items: (block.items?.length ?? 0) > 0,
    list_item_count: block.items?.length ?? 0,
    has_table: Boolean(block.table),
    reference_count: block.references?.length ?? 0,
    raw_excerpt: excerpt(block.raw_text),
  };
}

export function buildTemplateSourceAnalysisPrompt(input: {
  normalizedDocument: NormalizedTemplateSourceDocument;
}) {
  const { normalizedDocument } = input;

  const summary = {
    source_id: normalizedDocument.source_id,
    source_type: normalizedDocument.source_type,
    document_kind: normalizedDocument.document_kind,
    language: normalizedDocument.language,
    institution: normalizedDocument.institution,
    cover: {
      university_name: normalizedDocument.cover.university_name ?? null,
      school_name: normalizedDocument.cover.school_name ?? null,
      program_name: normalizedDocument.cover.program_name ?? null,
      document_label: normalizedDocument.cover.document_label ?? null,
      author_lines: normalizedDocument.cover.author_lines ?? [],
      advisor_lines: normalizedDocument.cover.advisor_lines ?? [],
      place_label: normalizedDocument.cover.place_label ?? null,
      date_label: normalizedDocument.cover.date_label ?? null,
      logo_asset_key: normalizedDocument.cover.logo_asset_key ?? null,
    },
    assets: normalizedDocument.assets.map((asset) => ({
      asset_key: asset.asset_key,
      kind: asset.kind,
      source_strategy: asset.source_strategy,
      width_px: asset.width_px ?? null,
      height_px: asset.height_px ?? null,
      has_transparency: asset.has_transparency ?? null,
      confidence: asset.confidence ?? null,
    })),
    blocks: normalizedDocument.blocks.map(summarizeBlock),
    warnings: normalizedDocument.warnings,
  };

  return `
Eres Planimetrix, un analista etico de plantillas academicas para planes de tesis en Peru.

Tu tarea es analizar un documento ya normalizado y devolver una evaluacion semantica estructurada para derivar una plantilla reutilizable.

Reglas no negociables:
- usa SOLO la informacion presente en el documento normalizado
- no inventes reglas de formato institucional que no aparezcan o no puedan inferirse con prudencia
- si algo no es confiable, usa null, UNKNOWN o confidence baja
- distingue entre contenido observado en una instancia real y reglas normativas de una plantilla
- agrega warnings y review_notes cuando una conclusion requiera validacion humana
- no conviertas un plan individual en una regla institucional fuerte sin advertirlo

Objetivo del analisis:
- clasificar el rol del documento
- inferir familia de plantilla
- proponer metodologia dominante
- estimar estilo de citas solo si hay evidencia razonable
- mapear cada bloque a una funcion de plantilla
- proponer instrucciones de contenido candidatas por bloque
- proponer reglas de formato solo cuando haya evidencia suficiente

Indicaciones especificas:
- en sections, incluye un item por cada bloque del documento normalizado
- semantic_key puede mantenerse igual si ya viene bien identificado
- required debe representar si el bloque parece parte estable de la plantilla
- content_kind debe reflejar la forma esperada del contenido del bloque
- instruction_candidates deben ser instrucciones breves y accionables en espanol
- word_limit solo cuando haya evidencia o una inferencia academica prudente
- en element_rule_candidates, usa confidence baja cuando la fuente no explicite formato
- si el logo viene provisto, no inventes reglas adicionales salvo ubicacion probable de portada

Documento normalizado:
${JSON.stringify(summary, null, 2)}
`.trim();
}
