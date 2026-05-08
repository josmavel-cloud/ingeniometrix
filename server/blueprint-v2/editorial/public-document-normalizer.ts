import {
  capitalizeKeywordLine,
  capitalizePublicTableRows,
  normalizeSpanishPublicText,
  sentenceStyleCapitalizePublicText,
  type PublicTextKind,
} from "@/server/blueprint-v2/editorial/capitalization-hygiene";
import type {
  AcademicDocument,
  AcademicSectionBlock,
} from "@/server/blueprint-v2/lab/academic-document-model";
import type { ConsistencyMatrixArtifact } from "@/server/blueprint-v2/sections/consistency-matrix-engine";

function publicText(value: string, kind: PublicTextKind = "sentence") {
  return sentenceStyleCapitalizePublicText(value, kind);
}

function optionalPublicText(value: string | null | undefined, kind: PublicTextKind = "sentence") {
  return value === null || value === undefined ? null : publicText(value, kind);
}

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function splitIntoSentenceChunks(value: string, maxWords = 115) {
  const sentences = value
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current: string[] = [];
  let currentWords = 0;

  for (const sentence of sentences.length > 0 ? sentences : [value]) {
    const sentenceWords = wordCount(sentence);
    if (current.length > 0 && currentWords + sentenceWords > maxWords) {
      chunks.push(current.join(" "));
      current = [];
      currentWords = 0;
    }
    current.push(sentence);
    currentWords += sentenceWords;
  }

  if (current.length > 0) {
    chunks.push(current.join(" "));
  }

  return chunks.length > 0 ? chunks : [value];
}

function questionText(value: string | null | undefined) {
  const normalized = optionalPublicText(value);
  if (!normalized?.includes("?")) {
    return normalized;
  }

  return normalized
    .replace(/^Como\b/, "C\u00f3mo")
    .replace(/^Que\b/, "Qu\u00e9")
    .replace(/^Cual\b/, "Cu\u00e1l")
    .replace(/^Cuales\b/, "Cu\u00e1les");
}

function normalizeBlock(block: AcademicSectionBlock): AcademicSectionBlock[] {
  if (block.block_type === "table") {
    return [{
      ...block,
      rows: capitalizePublicTableRows(block.rows),
      caption: optionalPublicText(block.caption, "caption"),
    }];
  }

  const text = publicText(block.text, "sentence");
  const bulletMatch = /^[-*•]\s+(.+)/.exec(text);
  if (block.block_type === "paragraph" && bulletMatch?.[1]) {
    return [{
      ...block,
      block_type: "bullet",
      text: publicText(bulletMatch[1], "sentence"),
    }];
  }

  if (block.block_type === "paragraph" && wordCount(text) > 150) {
    return splitIntoSentenceChunks(text).map((chunk, index) => ({
      ...block,
      text: publicText(chunk, "sentence"),
      citation_anchor_ids: index === 0 ? block.citation_anchor_ids : [],
    }));
  }

  return [{
    ...block,
    text,
  }];
}

function normalizeMatrix(matrix: ConsistencyMatrixArtifact): ConsistencyMatrixArtifact {
  const variablesBlock = matrix.variables_block ?? {
    variable_independiente: null,
    indicadores_independiente: [],
    variable_dependiente: null,
    indicadores_dependiente: [],
    categorias: [],
  };
  const methodologyBlock = matrix.methodology_block ?? {
    tipo_investigacion: null,
    diseno_investigacion: null,
    ambito_estudio: null,
    poblacion: null,
    muestra: null,
    tecnicas_recoleccion: [],
    instrumentos: [],
    plan_analisis: null,
  };

  return {
    ...matrix,
    general_block: {
      problema_principal: questionText(matrix.general_block.problema_principal),
      objetivo_general: optionalPublicText(matrix.general_block.objetivo_general),
      hipotesis_general: optionalPublicText(matrix.general_block.hipotesis_general),
    },
    specific_rows: matrix.specific_rows.map((row) => ({
      ...row,
      interrogante_especifica: questionText(row.interrogante_especifica),
      objetivo_especifico: optionalPublicText(row.objetivo_especifico),
      hipotesis_especifica: optionalPublicText(row.hipotesis_especifica),
      variable_o_categoria: optionalPublicText(row.variable_o_categoria),
      dimension_o_criterio: optionalPublicText(row.dimension_o_criterio),
      metodo_vinculado: optionalPublicText(row.metodo_vinculado),
      tecnica: optionalPublicText(row.tecnica),
      instrumento: optionalPublicText(row.instrumento),
    })),
    variables_block: {
      variable_independiente: optionalPublicText(variablesBlock.variable_independiente),
      indicadores_independiente: variablesBlock.indicadores_independiente.map((item) =>
        publicText(item),
      ),
      variable_dependiente: optionalPublicText(variablesBlock.variable_dependiente),
      indicadores_dependiente: variablesBlock.indicadores_dependiente.map((item) =>
        publicText(item),
      ),
      categorias: variablesBlock.categorias.map((item) => publicText(item)),
    },
    methodology_block: {
      tipo_investigacion: optionalPublicText(methodologyBlock.tipo_investigacion),
      diseno_investigacion: optionalPublicText(methodologyBlock.diseno_investigacion),
      ambito_estudio: optionalPublicText(methodologyBlock.ambito_estudio),
      poblacion: optionalPublicText(methodologyBlock.poblacion),
      muestra: optionalPublicText(methodologyBlock.muestra),
      tecnicas_recoleccion: methodologyBlock.tecnicas_recoleccion.map((item) =>
        publicText(item),
      ),
      instrumentos: methodologyBlock.instrumentos.map((item) => publicText(item)),
      plan_analisis: optionalPublicText(methodologyBlock.plan_analisis),
    },
    table_model: matrix.table_model
      ? {
          ...matrix.table_model,
          caption: publicText(matrix.table_model.caption, "caption"),
          columns: matrix.table_model.columns.map((column) => ({
            ...column,
            label: publicText(column.label, "label"),
          })),
          header_rows: capitalizePublicTableRows(matrix.table_model.header_rows),
          body_rows: matrix.table_model.body_rows.map((row) => ({
            ...row,
            cells: capitalizePublicTableRows([row.cells])[0] ?? row.cells,
          })),
        }
      : matrix.table_model,
  };
}

export function normalizeAcademicDocumentPublicFields(
  document: AcademicDocument,
): AcademicDocument {
  const cover = document.layout_plan.cover_visual;

  return {
    ...document,
    metadata: {
      ...document.metadata,
      title: publicText(document.metadata.title, "title"),
      short_header_title: optionalPublicText(document.metadata.short_header_title, "title"),
      keywords_line: document.metadata.keywords_line
        ? capitalizeKeywordLine(document.metadata.keywords_line)
        : document.metadata.keywords_line,
      subtitle: publicText(document.metadata.subtitle),
      university: optionalPublicText(document.metadata.university, "label"),
      program: optionalPublicText(document.metadata.program, "label"),
    },
    layout_plan: {
      ...document.layout_plan,
      figures: document.layout_plan.figures.map((figure) => ({
        ...figure,
        caption: publicText(figure.caption, "caption"),
        source_note: publicText(figure.source_note),
        body_reference: publicText(figure.body_reference),
      })),
      equations: document.layout_plan.equations.map((equation) => ({
        ...equation,
        caption: publicText(equation.caption, "caption"),
        purpose: publicText(equation.purpose),
        source_context_summary: optionalPublicText(equation.source_context_summary) ?? undefined,
        section_explanation: optionalPublicText(equation.section_explanation) ?? undefined,
        variable_notes: equation.variable_notes.map((note) => ({
          ...note,
          description: publicText(note.description),
          unit: optionalPublicText(note.unit, "label"),
        })),
        limitations: equation.limitations?.map((limitation) => publicText(limitation)) ?? undefined,
        source_note: publicText(equation.source_note),
        body_reference: publicText(equation.body_reference),
      })),
      schedule_visual: document.layout_plan.schedule_visual
        ? {
            ...document.layout_plan.schedule_visual,
            label: publicText(document.layout_plan.schedule_visual.label, "label"),
            caption: publicText(document.layout_plan.schedule_visual.caption, "caption"),
            source_note: publicText(document.layout_plan.schedule_visual.source_note),
            tasks: document.layout_plan.schedule_visual.tasks.map((task) => ({
              ...task,
              task: publicText(task.task),
              dependency: optionalPublicText(task.dependency),
              deliverable: optionalPublicText(task.deliverable),
              duration: optionalPublicText(task.duration, "label"),
              assumption: optionalPublicText(task.assumption),
            })),
          }
        : null,
      schedule_gantt_rows: document.layout_plan.schedule_gantt_rows?.map((row) => ({
        ...row,
        task: publicText(row.task),
        duration: publicText(row.duration, "label"),
        period_label: publicText(row.period_label, "label"),
        dependencies: publicText(row.dependencies),
        deliverable: publicText(row.deliverable),
        assumption: optionalPublicText(row.assumption),
      })),
      budget_rows: document.layout_plan.budget_rows?.map((row) => ({
        ...row,
        category: publicText(row.category, "label"),
        item: publicText(row.item),
        unit: publicText(row.unit, "label"),
        assumption: publicText(row.assumption),
      })),
      appendix_public_items: document.layout_plan.appendix_public_items?.map((item) => ({
        ...item,
        title: publicText(item.title, "heading"),
        purpose: publicText(item.purpose),
      })),
      cover_visual: {
        ...cover,
        title: publicText(cover.title, "title"),
        subtitle: publicText(cover.subtitle, "heading"),
        concept: publicText(cover.concept),
        method_summary: publicText(cover.method_summary),
        hero_prompt_summary: optionalPublicText(cover.hero_prompt_summary),
        hero_visual_caption: optionalPublicText(cover.hero_visual_caption, "caption"),
      },
      warnings: document.layout_plan.warnings.map((warning) =>
        normalizeSpanishPublicText(warning),
      ),
    },
    sections: document.sections.map((section) => ({
      ...section,
      title: publicText(section.title, "heading"),
      citation_anchors: section.citation_anchors.map((anchor) => ({
        ...anchor,
        reason: publicText(anchor.reason),
      })),
      blocks: section.blocks.flatMap(normalizeBlock),
      warnings: section.warnings.map((warning) => normalizeSpanishPublicText(warning)),
      unsupported_or_cautious_claim_warnings:
        section.unsupported_or_cautious_claim_warnings?.map((warning) =>
          normalizeSpanishPublicText(warning),
        ),
    })),
    matrix: normalizeMatrix(document.matrix),
    asset_placements: document.asset_placements.map((placement) => ({
      ...placement,
      caption: publicText(placement.caption, "caption"),
      text_content: optionalPublicText(placement.text_content),
      warnings: placement.warnings.map((warning) => normalizeSpanishPublicText(warning)),
    })),
    warnings: document.warnings.map((warning) => normalizeSpanishPublicText(warning)),
  };
}
