import type { LlmProvider, TextGenerationResult } from "@/llm/provider";
import type {
  AcademicDocument,
  AcademicLlmEditorialPass,
  AcademicSection,
  AcademicSectionBlock,
} from "@/server/blueprint-v2/lab/academic-document-model";
import { cleanAcademicText } from "@/server/blueprint-v2/lab/academic-document-compiler";
import { clipText } from "@/server/blueprint-v2/utils";

type LlmEditorialSection = {
  section_key: string;
  revised_title?: string | null;
  revised_content?: string | null;
  operation_summary?: string | null;
  warnings?: string[];
};

type LlmEditorialResponse = {
  sections?: LlmEditorialSection[];
  warnings?: string[];
};

const TRACKING_LABEL = "steps12_13_academic_docx_editorial_pass";
const EDITABLE_SECTION_KEYS = new Set([
  "abstract",
  "introduction",
  "problem_statement",
  "justification",
  "theoretical_justification",
  "practical_justification",
  "methodological_justification",
  "theoretical_framework",
  "research_antecedents",
  "state_of_the_art",
  "theoretical_bases",
  "methodology",
  "methodological_approach",
  "research_design",
  "population_and_sample",
  "data_collection_techniques",
  "research_procedure",
  "analysis_plan",
  "ethics",
  "scope_and_limitations",
]);

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");

    if (firstBrace < 0 || lastBrace <= firstBrace) {
      return null;
    }

    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1)) as T;
    } catch {
      return null;
    }
  }
}

function sectionPlainText(section: AcademicSection) {
  return section.blocks
    .map((block) => {
      if (block.block_type === "table") {
        return block.rows.map((row) => row.join(" | ")).join("\n");
      }

      return block.text;
    })
    .join("\n\n")
    .trim();
}

function words(value: string) {
  return cleanAcademicText(value).split(/\s+/).filter(Boolean).length;
}

function selectEditableSections(document: AcademicDocument) {
  const bodyKeys = new Set(document.editorial_plan.main_body_section_keys);

  return document.sections
    .filter((section) => bodyKeys.has(section.section_key))
    .filter((section) => EDITABLE_SECTION_KEYS.has(section.section_key))
    .filter((section) => words(sectionPlainText(section)) >= 35)
    .slice(0, document.variant === "master" ? 12 : 10);
}

function buildPrompt(input: {
  document: AcademicDocument;
  sections: AcademicSection[];
}) {
  const payload = {
    variant: input.document.variant,
    report_archetype: input.document.report_archetype,
    title: input.document.metadata.title,
    template_name: input.document.template_name,
    rules: [
      "Editar solo estilo, fluidez, redundancia y consistencia interna.",
      "No inventar citas, datos, resultados, validaciones locales, normas ni instituciones.",
      "No agregar markdown, encabezados internos, listas artificiales ni referencias entre parentesis por titulo.",
      "Mantener espanol academico de nivel maestria.",
      "Si una seccion no puede mejorar sin cambiar significado, devolverla practicamente igual.",
      "Conservar los matices de propuesta/proyecto: no presentar resultados empiricos como ya ejecutados.",
    ],
    sections: input.sections.map((section) => ({
      section_key: section.section_key,
      title: input.document.editorial_plan.title_overrides[section.section_key] ?? section.title,
      source_ids: section.source_ids.slice(0, 8),
      target_words:
        section.section_key === "abstract"
          ? "180-260"
          : input.document.report_archetype === "indexed_paper_like"
            ? "180-420"
            : "120-320",
      content: clipText(sectionPlainText(section), 2400),
    })),
  };

  return `
Eres editor academico de Ingeniometrix. Recibes secciones ya generadas y soportadas por evidencia.

Objetivo:
- Mejorar consistencia, tono academico y lectura tipo paper/proyecto.
- Reducir duplicacion dentro de cada seccion.
- Limpiar frases pobres, marcadores markdown, repeticiones y transiciones artificiales.
- No crear informacion nueva.

Devuelve exclusivamente JSON valido:
{
  "sections": [
    {
      "section_key": "clave",
      "revised_title": "titulo final opcional",
      "revised_content": "contenido editado, sin encabezados markdown",
      "operation_summary": "resumen breve de la edicion",
      "warnings": []
    }
  ],
  "warnings": []
}

Paquete:
${JSON.stringify(payload, null, 2)}
`.trim();
}

function buildUsage(result: TextGenerationResult): AcademicLlmEditorialPass["usage"] {
  return {
    provider: result.usage.provider,
    model: result.usage.model,
    input_tokens: result.usage.inputTokens,
    cached_input_tokens: result.usage.cachedInputTokens,
    output_tokens: result.usage.outputTokens,
    total_tokens: result.usage.totalTokens,
    cost_usd: result.usage.costUsd,
    cost_cad: result.usage.costCad,
    duration_ms: result.usage.durationMs,
  };
}

function blocksFromRevisedContent(input: {
  section: AcademicSection;
  revisedContent: string;
}): AcademicSectionBlock[] {
  const paragraphs = cleanAcademicText(input.revisedContent)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return input.section.blocks;
  }

  return paragraphs.map((text, index) => ({
    block_type: "paragraph",
    text,
    citation_anchor_ids: input.section.citation_anchors
      .filter((anchor) => anchor.paragraph_index === index)
      .map((anchor) => anchor.anchor_id),
  }));
}

function applyResponseToDocument(input: {
  document: AcademicDocument;
  response: LlmEditorialResponse;
  detailedResult: TextGenerationResult;
  model: string;
  editableSections: AcademicSection[];
}) {
  const editableKeys = new Set(input.editableSections.map((section) => section.section_key));
  const operationsByKey = new Map(
    (input.response.sections ?? []).map((section) => [section.section_key, section]),
  );
  const sectionOperations: AcademicLlmEditorialPass["section_operations"] = [];
  const revisedSections = input.document.sections.map((section) => {
    if (!editableKeys.has(section.section_key)) {
      return section;
    }

    const operation = operationsByKey.get(section.section_key);
    const revisedContent = cleanAcademicText(operation?.revised_content);
    const canApply = Boolean(revisedContent) && words(revisedContent) >= 25;

    sectionOperations.push({
      section_key: section.section_key,
      revised_title: cleanAcademicText(operation?.revised_title) || null,
      applied: canApply,
      operation_summary:
        cleanAcademicText(operation?.operation_summary) ||
        (canApply ? "Edicion ligera aplicada." : "Sin edicion aplicable."),
      warnings: operation?.warnings ?? [],
    });

    if (!canApply) {
      return section;
    }

    return {
      ...section,
      title: cleanAcademicText(operation?.revised_title) || section.title,
      blocks: blocksFromRevisedContent({
        section,
        revisedContent,
      }),
      warnings: Array.from(
        new Set([...section.warnings, ...(operation?.warnings ?? [])]),
      ),
    };
  });
  const pass: AcademicLlmEditorialPass = {
    artifact_type: "academic_llm_editorial_pass",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    llm_used: true,
    status: "applied",
    model: input.model,
    tracking_label: TRACKING_LABEL,
    usage: buildUsage(input.detailedResult),
    section_operations: sectionOperations,
    warnings: input.response.warnings ?? [],
  };

  return {
    ...input.document,
    sections: revisedSections,
    llm_editorial_passes: [...input.document.llm_editorial_passes, pass],
    warnings: Array.from(
      new Set([...input.document.warnings, ...(input.response.warnings ?? [])]),
    ),
  } satisfies AcademicDocument;
}

function buildSkippedPass(reason: string, model: string | null): AcademicLlmEditorialPass {
  return {
    artifact_type: "academic_llm_editorial_pass",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    llm_used: false,
    status: "skipped",
    model,
    tracking_label: TRACKING_LABEL,
    usage: null,
    section_operations: [],
    warnings: [reason],
  };
}

function buildFailedPass(input: {
  error: unknown;
  model: string;
}): AcademicLlmEditorialPass {
  return {
    artifact_type: "academic_llm_editorial_pass",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    llm_used: true,
    status: "failed",
    model: input.model,
    tracking_label: TRACKING_LABEL,
    usage: null,
    section_operations: [],
    warnings: [
      `No se pudo aplicar el pase editorial LLM: ${
        input.error instanceof Error ? input.error.message : "error desconocido"
      }`,
    ],
  };
}

export async function applyAcademicDocumentEditorialPass(input: {
  document: AcademicDocument;
  provider: LlmProvider | null;
  model?: string | null;
}) {
  const model = input.model?.trim() || process.env.LLM_FAST_MODEL?.trim() || "gpt-5.4-mini";
  const editableSections = selectEditableSections(input.document);

  if (editableSections.length === 0) {
    return {
      ...input.document,
      llm_editorial_passes: [
        ...input.document.llm_editorial_passes,
        buildSkippedPass("No hubo secciones narrativas elegibles para edicion LLM.", model),
      ],
    } satisfies AcademicDocument;
  }

  if (!input.provider) {
    return {
      ...input.document,
      llm_editorial_passes: [
        ...input.document.llm_editorial_passes,
        buildSkippedPass("No se recibio proveedor LLM para el pase editorial.", model),
      ],
    } satisfies AcademicDocument;
  }

  try {
    const prompt = buildPrompt({
      document: input.document,
      sections: editableSections,
    });
    const detailedResult = await input.provider.generateTextDetailed({
      prompt,
      model,
      trackingLabel: `${TRACKING_LABEL}:${input.document.variant}`,
    });
    const response = safeJsonParse<LlmEditorialResponse>(detailedResult.text);

    if (!response?.sections?.length) {
      throw new Error("El LLM no devolvio secciones editadas en JSON valido.");
    }

    return applyResponseToDocument({
      document: input.document,
      response,
      detailedResult,
      model,
      editableSections,
    });
  } catch (error) {
    return {
      ...input.document,
      llm_editorial_passes: [
        ...input.document.llm_editorial_passes,
        buildFailedPass({ error, model }),
      ],
      warnings: Array.from(
        new Set([
          ...input.document.warnings,
          `Pase editorial LLM fallido para ${input.document.variant}.`,
        ]),
      ),
    } satisfies AcademicDocument;
  }
}
