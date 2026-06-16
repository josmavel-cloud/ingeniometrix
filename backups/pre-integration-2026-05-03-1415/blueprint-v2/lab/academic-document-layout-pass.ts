import type { LlmProvider, TextGenerationResult } from "@/llm/provider";
import { cleanAcademicText } from "@/server/blueprint-v2/lab/academic-document-compiler";
import type {
  AcademicDocument,
  AcademicLlmLayoutPass,
  EquationLayoutPlan,
  FigureLayoutPlan,
} from "@/server/blueprint-v2/lab/academic-document-model";
import { clipText } from "@/server/blueprint-v2/utils";

type LlmFigureUpdate = {
  asset_key: string;
  source_id: string;
  caption?: string | null;
  body_reference?: string | null;
};

type LlmEquationUpdate = {
  asset_key: string;
  source_id: string;
  caption?: string | null;
  body_reference?: string | null;
};

type LlmCoverVisualUpdate = {
  title?: string | null;
  subtitle?: string | null;
  concept?: string | null;
};

type LlmLayoutResponse = {
  figures?: LlmFigureUpdate[];
  equations?: LlmEquationUpdate[];
  cover_visual?: LlmCoverVisualUpdate | null;
  warnings?: string[];
};

const TRACKING_LABEL = "steps12_13_academic_docx_layout_pass";

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

function buildPrompt(document: AcademicDocument) {
  const payload = {
    variant: document.variant,
    archetype: document.report_archetype,
    title: document.metadata.title,
    template_name: document.template_name,
    rules: [
      "Trabajar solo con la informacion provista.",
      "No inventar datos, resultados, validaciones locales ni fuentes.",
      "Generar captions academicos breves, descriptivos y en espanol.",
      "Cada caption debe poder leerse debajo de una figura o ecuacion en un proyecto de maestria.",
      "Cada body_reference debe mencionar explicitamente Figura N o Ecuacion N segun corresponda.",
      "No incluir source_id, asset_key, OpenAlex, rutas, hashes ni detalles backend.",
      "No insertar citas bibliograficas nuevas; la nota de fuente se gestionara por codigo.",
    ],
    figures: document.layout_plan.figures.map((figure) => ({
      asset_key: figure.asset_key,
      source_id: figure.source_id,
      figure_number: figure.figure_number,
      section_key: figure.section_key,
      current_caption: clipText(figure.caption, 260),
      current_body_reference: clipText(figure.body_reference, 260),
      source_note: figure.source_note,
    })),
    equations: document.layout_plan.equations.map((equation) => ({
      asset_key: equation.asset_key,
      source_id: equation.source_id,
      equation_number: equation.equation_number,
      section_key: equation.section_key,
      latex: equation.latex,
      current_caption: clipText(equation.caption, 260),
      current_body_reference: clipText(equation.body_reference, 260),
      source_note: equation.source_note,
    })),
    cover_visual: document.layout_plan.cover_visual,
  };

  return `
Eres editor academico de Ingeniometrix especializado en armado de informes DOCX.

Objetivo:
- Refinar captions y referencias internas de assets para que el documento se parezca a un paper/proyecto academico serio.
- Proponer un concepto visual sobrio para la portada, sin prometer resultados no ejecutados.

Devuelve exclusivamente JSON valido:
{
  "figures": [
    {
      "asset_key": "clave",
      "source_id": "fuente",
      "caption": "Caption final sin 'Figura N.'",
      "body_reference": "Frase que menciona Figura N y explica por que se incluye."
    }
  ],
  "equations": [
    {
      "asset_key": "clave",
      "source_id": "fuente",
      "caption": "Caption final sin 'Ecuacion N.'",
      "body_reference": "Frase que menciona Ecuacion N y explica su uso prudente."
    }
  ],
  "cover_visual": {
    "title": "Titulo breve",
    "subtitle": "Subtitulo breve",
    "concept": "Concepto visual para infografia sobria"
  },
  "warnings": []
}

Paquete:
${JSON.stringify(payload, null, 2)}
`.trim();
}

function buildUsage(result: TextGenerationResult): AcademicLlmLayoutPass["usage"] {
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

function updateFigures(input: {
  figures: FigureLayoutPlan[];
  updates: LlmFigureUpdate[];
}) {
  const updatesByKey = new Map(
    input.updates.map((update) => [`${update.source_id}|${update.asset_key}`, update]),
  );
  let count = 0;

  const figures = input.figures.map((figure) => {
    const update = updatesByKey.get(`${figure.source_id}|${figure.asset_key}`);
    const caption = cleanAcademicText(update?.caption);
    const bodyReference = cleanAcademicText(update?.body_reference);

    if (!caption && !bodyReference) {
      return figure;
    }

    count += 1;
    return {
      ...figure,
      caption: caption || figure.caption,
      body_reference: bodyReference || figure.body_reference,
    };
  });

  return { figures, count };
}

function updateEquations(input: {
  equations: EquationLayoutPlan[];
  updates: LlmEquationUpdate[];
}) {
  const updatesByKey = new Map(
    input.updates.map((update) => [`${update.source_id}|${update.asset_key}`, update]),
  );
  let count = 0;

  const equations = input.equations.map((equation) => {
    const update = updatesByKey.get(`${equation.source_id}|${equation.asset_key}`);
    const caption = cleanAcademicText(update?.caption);
    const bodyReference = cleanAcademicText(update?.body_reference);

    if (!caption && !bodyReference) {
      return equation;
    }

    count += 1;
    return {
      ...equation,
      caption: caption || equation.caption,
      body_reference: bodyReference || equation.body_reference,
    };
  });

  return { equations, count };
}

function buildSkippedPass(reason: string, model: string | null): AcademicLlmLayoutPass {
  return {
    artifact_type: "academic_llm_layout_pass",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    llm_used: false,
    status: "skipped",
    model,
    tracking_label: TRACKING_LABEL,
    usage: null,
    figure_updates: 0,
    equation_updates: 0,
    cover_visual_updated: false,
    warnings: [reason],
  };
}

function buildFailedPass(input: {
  error: unknown;
  model: string;
}): AcademicLlmLayoutPass {
  return {
    artifact_type: "academic_llm_layout_pass",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    llm_used: true,
    status: "failed",
    model: input.model,
    tracking_label: TRACKING_LABEL,
    usage: null,
    figure_updates: 0,
    equation_updates: 0,
    cover_visual_updated: false,
    warnings: [
      `No se pudo aplicar el pase LLM de layout DOCX: ${
        input.error instanceof Error ? input.error.message : "error desconocido"
      }`,
    ],
  };
}

export async function applyAcademicDocumentLayoutPass(input: {
  document: AcademicDocument;
  provider: LlmProvider | null;
  model?: string | null;
}) {
  const model = input.model?.trim() || process.env.LLM_FAST_MODEL?.trim() || "gpt-5.4-mini";
  const hasTargets =
    input.document.layout_plan.figures.length > 0 ||
    input.document.layout_plan.equations.length > 0;

  if (!hasTargets) {
    return {
      ...input.document,
      llm_layout_passes: [
        ...input.document.llm_layout_passes,
        buildSkippedPass("No hubo figuras ni ecuaciones elegibles para refinar captions.", model),
      ],
    } satisfies AcademicDocument;
  }

  if (!input.provider) {
    return {
      ...input.document,
      llm_layout_passes: [
        ...input.document.llm_layout_passes,
        buildSkippedPass("No se recibio proveedor LLM para captions y layout.", model),
      ],
    } satisfies AcademicDocument;
  }

  try {
    const detailedResult = await input.provider.generateTextDetailed({
      prompt: buildPrompt(input.document),
      model,
      trackingLabel: `${TRACKING_LABEL}:${input.document.variant}`,
    });
    const response = safeJsonParse<LlmLayoutResponse>(detailedResult.text);

    if (!response) {
      throw new Error("El LLM no devolvio JSON valido para layout DOCX.");
    }

    const figureUpdate = updateFigures({
      figures: input.document.layout_plan.figures,
      updates: response.figures ?? [],
    });
    const equationUpdate = updateEquations({
      equations: input.document.layout_plan.equations,
      updates: response.equations ?? [],
    });
    const coverTitle = cleanAcademicText(response.cover_visual?.title);
    const coverSubtitle = cleanAcademicText(response.cover_visual?.subtitle);
    const coverConcept = cleanAcademicText(response.cover_visual?.concept);
    const coverVisualUpdated = Boolean(coverTitle || coverSubtitle || coverConcept);
    const pass: AcademicLlmLayoutPass = {
      artifact_type: "academic_llm_layout_pass",
      artifact_version: "v1",
      generated_at: new Date().toISOString(),
      llm_used: true,
      status: "applied",
      model,
      tracking_label: TRACKING_LABEL,
      usage: buildUsage(detailedResult),
      figure_updates: figureUpdate.count,
      equation_updates: equationUpdate.count,
      cover_visual_updated: coverVisualUpdated,
      warnings: response.warnings ?? [],
    };

    return {
      ...input.document,
      layout_plan: {
        ...input.document.layout_plan,
        source: "llm_refined",
        figures: figureUpdate.figures,
        equations: equationUpdate.equations,
        cover_visual: {
          ...input.document.layout_plan.cover_visual,
          title: coverTitle || input.document.layout_plan.cover_visual.title,
          subtitle: coverSubtitle || input.document.layout_plan.cover_visual.subtitle,
          concept: coverConcept || input.document.layout_plan.cover_visual.concept,
        },
        warnings: Array.from(
          new Set([...input.document.layout_plan.warnings, ...(response.warnings ?? [])]),
        ),
      },
      llm_layout_passes: [...input.document.llm_layout_passes, pass],
      warnings: Array.from(new Set([...input.document.warnings, ...(response.warnings ?? [])])),
    } satisfies AcademicDocument;
  } catch (error) {
    return {
      ...input.document,
      llm_layout_passes: [
        ...input.document.llm_layout_passes,
        buildFailedPass({ error, model }),
      ],
      warnings: Array.from(
        new Set([...input.document.warnings, `Pase LLM de layout fallido para ${input.document.variant}.`]),
      ),
    } satisfies AcademicDocument;
  }
}
