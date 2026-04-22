import type {
  NormalizedTemplateSourceDocument,
  TemplateSourceSemanticAnalysis,
} from "@/server/reporting/template-ingestion-types";

function compactBlockSummary(document: NormalizedTemplateSourceDocument) {
  return document.blocks.map((block) => ({
    block_id: block.id,
    title: block.label ?? null,
    level: block.level ?? null,
    semantic_key: block.semantic_key ?? null,
    type: block.type,
    has_list_items: (block.items?.length ?? 0) > 0,
    has_table: Boolean(block.table),
    reference_count: block.references?.length ?? 0,
  }));
}

export function buildTemplateConventionalFallbacksPrompt(input: {
  normalizedDocument: NormalizedTemplateSourceDocument;
  semanticAnalysis: TemplateSourceSemanticAnalysis;
}) {
  const { normalizedDocument, semanticAnalysis } = input;

  return `
Eres Planimetrix, un analista academico para plantillas de planes de tesis en Peru.

Recibiras:
- un documento normalizado extraido desde una fuente real
- un analisis semantico previo

Tu tarea es completar SOLO lo que siga ambiguo con una convencion academica tipica y prudente para este caso.

Reglas:
- no reemplaces hechos ya bien inferidos desde la fuente
- solo completa vacios o incertidumbres
- usa convenciones tipicas de planes de tesis de maestria/posgrado en Peru cuando el documento no explicite la regla
- si propones una convencion tipica, usa confidence baja o media y explicalo en notes/review_notes
- no afirmes que una regla es institucional si solo estas proponiendo una solucion tipica
- prioriza compatibilidad de exportacion y legibilidad academica

Usa esta heuristica de prudencia:
- citation_style_guess: si no hay evidencia fuerte, propone la opcion mas tipica y mantenible para este caso
- methodology_mode: si el documento incluye hipotesis, variables e indicadores, normalmente favorece quantitative salvo evidencia en contra
- page/paragraph/table/figure/citation/reference_list: si no hay regla institucional explicita, propone una configuracion academica comun y exportable
- equation numbering: usa una convencion prudente para documentos tecnicos solo si tiene sentido academico

Documento normalizado:
${JSON.stringify(
  {
    source_id: normalizedDocument.source_id,
    document_kind: normalizedDocument.document_kind,
    institution: normalizedDocument.institution,
    cover: normalizedDocument.cover,
    blocks: compactBlockSummary(normalizedDocument),
    warnings: normalizedDocument.warnings,
  },
  null,
  2,
)}

Analisis semantico previo:
${JSON.stringify(semanticAnalysis, null, 2)}
`.trim();
}
