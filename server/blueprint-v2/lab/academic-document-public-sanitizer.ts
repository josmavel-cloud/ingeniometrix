import type {
  AcademicDocument,
  AcademicPublicSanitizationPass,
  AcademicReference,
  AcademicSection,
  AcademicSectionBlock,
  CitationAnchor,
} from "@/server/blueprint-v2/lab/academic-document-model";
import { cleanAcademicText } from "@/server/blueprint-v2/lab/academic-document-compiler";

type SourceTitleHit = {
  source_id: string;
  title: string;
  variants: string[];
  citationLabel: string;
};

const PUBLIC_SKIP_SECTION_KEYS = new Set(["references", "bibliography"]);

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalize(value: string) {
  return cleanAcademicText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildTitleVariants(title: string) {
  const words = title.split(/\s+/).filter(Boolean);
  const variants = new Set<string>([title]);
  const colonPrefix = title.split(":")[0]?.trim();

  if (colonPrefix && colonPrefix.length >= 10) {
    variants.add(colonPrefix);
  }

  for (const count of [8, 6, 5, 4, 3]) {
    if (words.length < count) {
      continue;
    }

    const prefix = words.slice(0, count).join(" ").trim();
    if (prefix.length >= 12) {
      variants.add(prefix);
    }
  }

  return Array.from(variants).sort((left, right) => right.length - left.length);
}

function buildTitleHits(references: AcademicReference[]): SourceTitleHit[] {
  return references
    .map((reference) => {
      const title = cleanAcademicText(reference.title);
      return {
        source_id: reference.source_id,
        title,
        variants: buildTitleVariants(title),
        citationLabel: reference.apa_label,
      };
    })
    .filter((item) => item.title.length >= 18)
    .sort((left, right) => right.title.length - left.title.length);
}

function replacementPatterns(titleVariant: string) {
  const escaped = escapeRegExp(titleVariant);
  const optionalEllipsis = String.raw`\s*(?:\.\.\.|\u2026)?`;
  const safeEnd = String.raw`(?=\W|$)`;

  return [
    {
      pattern: new RegExp(
        String.raw`\s*[\(\["']\s*${escaped}${optionalEllipsis}\s*["']?\s*[\)\]]`,
        "gi",
      ),
      replacement: "",
    },
    {
      pattern: new RegExp(
        String.raw`\b(?:En esa linea,\s*)?(?:la revision|el estudio|el antecedente|la fuente)\s+${escaped}${optionalEllipsis}\s+(plantea|sostiene|muestra|propone|reporta|senala|advierte)\b`,
        "gi",
      ),
      replacement: "La literatura revisada $1",
    },
    {
      pattern: new RegExp(
        String.raw`\b${escaped}${optionalEllipsis}\s+(plantea|sostiene|muestra|propone|reporta|senala|advierte)\b`,
        "gi",
      ),
      replacement: "La literatura revisada $1",
    },
    {
      pattern: new RegExp(
        String.raw`\b(?:en|segun)\s+${escaped}${optionalEllipsis}${safeEnd}`,
        "gi",
      ),
      replacement: "segun la evidencia revisada",
    },
    {
      pattern: new RegExp(String.raw`\b${escaped}${optionalEllipsis}${safeEnd}`, "gi"),
      replacement: "la evidencia revisada",
    },
  ];
}

function sanitizeText(input: {
  text: string;
  titleHits: SourceTitleHit[];
}) {
  let text = input.text;
  const matched = new Map<string, SourceTitleHit>();
  let replacements = 0;

  for (const titleHit of input.titleHits) {
    const normalizedText = normalize(text);
    if (!titleHit.variants.some((variant) => normalizedText.includes(normalize(variant)))) {
      continue;
    }

    for (const variant of titleHit.variants) {
      for (const pattern of replacementPatterns(variant)) {
        text = text.replace(pattern.pattern, () => {
          replacements += 1;
          matched.set(titleHit.source_id, titleHit);
          return pattern.replacement;
        });
      }
    }
  }

  text = cleanAcademicText(text)
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+\./g, ".")
    .trim();

  return {
    text,
    matched: Array.from(matched.values()),
    replacements,
  };
}

function buildSanitizedAnchor(input: {
  section: AcademicSection;
  source: SourceTitleHit;
  blockIndex: number;
  existingIndex: number;
}): CitationAnchor {
  return {
    anchor_id: `${input.section.section_key}-sanitized-cite-${input.blockIndex + 1}-${input.existingIndex + 1}`,
    section_key: input.section.section_key,
    paragraph_index: input.blockIndex,
    source_ids: [input.source.source_id],
    rendered_citation: input.source.citationLabel,
    reason:
      "Cita diferida creada al retirar un titulo de fuente que se habia filtrado en la narrativa publica.",
  };
}

function sanitizeSection(input: {
  section: AcademicSection;
  titleHits: SourceTitleHit[];
}) {
  if (PUBLIC_SKIP_SECTION_KEYS.has(input.section.section_key)) {
    return {
      section: input.section,
      replacements: 0,
      anchorsAdded: 0,
      touched: false,
    };
  }

  const anchors = [...input.section.citation_anchors];
  const touchedSourceIds = new Set<string>();
  let replacements = 0;
  let anchorsAdded = 0;

  const blocks = input.section.blocks.map((block, blockIndex): AcademicSectionBlock => {
    if (block.block_type === "table") {
      const rows = block.rows.map((row) =>
        row.map((cellText) => {
          const sanitized = sanitizeText({ text: cellText, titleHits: input.titleHits });
          replacements += sanitized.replacements;
          for (const source of sanitized.matched) {
            touchedSourceIds.add(source.source_id);
          }
          return sanitized.text;
        }),
      );

      return {
        ...block,
        rows,
      };
    }

    const sanitized = sanitizeText({ text: block.text, titleHits: input.titleHits });
    replacements += sanitized.replacements;
    if (sanitized.matched.length === 0) {
      return block;
    }

    const citationAnchorIds = [...block.citation_anchor_ids];
    for (const source of sanitized.matched) {
      touchedSourceIds.add(source.source_id);
      const alreadyLinked = anchors.some(
        (anchor) =>
          anchor.paragraph_index === blockIndex &&
          anchor.source_ids.includes(source.source_id),
      );
      if (alreadyLinked) {
        continue;
      }

      const anchor = buildSanitizedAnchor({
        section: input.section,
        source,
        blockIndex,
        existingIndex: anchors.length,
      });
      anchors.push(anchor);
      citationAnchorIds.push(anchor.anchor_id);
      anchorsAdded += 1;
    }

    return {
      ...block,
      text: sanitized.text,
      citation_anchor_ids: Array.from(new Set(citationAnchorIds)),
    };
  });

  return {
    section: {
      ...input.section,
      source_ids: Array.from(new Set([...input.section.source_ids, ...touchedSourceIds])),
      citation_anchors: anchors,
      blocks,
    },
    replacements,
    anchorsAdded,
    touched: replacements > 0,
  };
}

function sanitizeMatrix(input: {
  matrix: AcademicDocument["matrix"];
  titleHits: SourceTitleHit[];
}) {
  let replacements = 0;

  const sanitizeRequired = (text: string) => {
    const sanitized = sanitizeText({ text, titleHits: input.titleHits });
    replacements += sanitized.replacements;
    return sanitized.text || text;
  };
  const sanitizeNullable = (text: string | null | undefined) => {
    if (!text) {
      return text ?? null;
    }

    return sanitizeRequired(text);
  };
  const sanitizeArray = (values: string[]) => values.map((value) => sanitizeRequired(value));

  const tableModel = input.matrix.table_model
    ? {
        ...input.matrix.table_model,
        caption: sanitizeRequired(input.matrix.table_model.caption),
        header_rows: input.matrix.table_model.header_rows.map((row) => sanitizeArray(row)),
        body_rows: input.matrix.table_model.body_rows.map((row) => ({
          ...row,
          cells: sanitizeArray(row.cells),
          warnings: sanitizeArray(row.warnings),
        })),
      }
    : input.matrix.table_model;

  const validation = {
    ...input.matrix.validation,
    blocked_reasons: sanitizeArray(input.matrix.validation.blocked_reasons),
    warnings: sanitizeArray(input.matrix.validation.warnings),
    row_alignment_scores: input.matrix.validation.row_alignment_scores?.map((row) => ({
      ...row,
      warnings: sanitizeArray(row.warnings),
    })),
    llm_validation_warnings: input.matrix.validation.llm_validation_warnings
      ? sanitizeArray(input.matrix.validation.llm_validation_warnings)
      : input.matrix.validation.llm_validation_warnings,
  };

  return {
    matrix: {
      ...input.matrix,
      general_block: {
        problema_principal: sanitizeNullable(input.matrix.general_block.problema_principal),
        objetivo_general: sanitizeNullable(input.matrix.general_block.objetivo_general),
        hipotesis_general: sanitizeNullable(input.matrix.general_block.hipotesis_general),
      },
      specific_rows: input.matrix.specific_rows.map((row) => ({
        ...row,
        interrogante_especifica: sanitizeNullable(row.interrogante_especifica),
        objetivo_especifico: sanitizeNullable(row.objetivo_especifico),
        hipotesis_especifica: sanitizeNullable(row.hipotesis_especifica),
        variable_o_categoria: sanitizeNullable(row.variable_o_categoria),
        dimension_o_criterio: sanitizeNullable(row.dimension_o_criterio),
        metodo_vinculado: sanitizeNullable(row.metodo_vinculado),
        tecnica: sanitizeNullable(row.tecnica),
        instrumento: sanitizeNullable(row.instrumento),
        warnings: sanitizeArray(row.warnings),
      })),
      variables_block: {
        variable_independiente: sanitizeNullable(input.matrix.variables_block.variable_independiente),
        indicadores_independiente: sanitizeArray(input.matrix.variables_block.indicadores_independiente),
        variable_dependiente: sanitizeNullable(input.matrix.variables_block.variable_dependiente),
        indicadores_dependiente: sanitizeArray(input.matrix.variables_block.indicadores_dependiente),
        categorias: sanitizeArray(input.matrix.variables_block.categorias),
      },
      methodology_block: {
        tipo_investigacion: sanitizeNullable(input.matrix.methodology_block.tipo_investigacion),
        diseno_investigacion: sanitizeNullable(input.matrix.methodology_block.diseno_investigacion),
        ambito_estudio: sanitizeNullable(input.matrix.methodology_block.ambito_estudio),
        poblacion: sanitizeNullable(input.matrix.methodology_block.poblacion),
        muestra: sanitizeNullable(input.matrix.methodology_block.muestra),
        tecnicas_recoleccion: sanitizeArray(input.matrix.methodology_block.tecnicas_recoleccion),
        instrumentos: sanitizeArray(input.matrix.methodology_block.instrumentos),
        plan_analisis: sanitizeNullable(input.matrix.methodology_block.plan_analisis),
      },
      validation,
      table_model: tableModel,
      legacy_rows: input.matrix.legacy_rows.map((row) => ({
        objective: sanitizeRequired(row.objective),
        question: sanitizeRequired(row.question),
        method: sanitizeRequired(row.method),
        technique: sanitizeRequired(row.technique),
      })),
    },
    replacements,
    touched: replacements > 0,
  };
}

function matrixTexts(matrix: AcademicDocument["matrix"]) {
  return [
    matrix.general_block.problema_principal,
    matrix.general_block.objetivo_general,
    matrix.general_block.hipotesis_general,
    ...matrix.specific_rows.flatMap((row) => [
      row.interrogante_especifica,
      row.objetivo_especifico,
      row.hipotesis_especifica,
      row.variable_o_categoria,
      row.dimension_o_criterio,
      row.metodo_vinculado,
      row.tecnica,
      row.instrumento,
      ...row.warnings,
    ]),
    matrix.variables_block.variable_independiente,
    ...matrix.variables_block.indicadores_independiente,
    matrix.variables_block.variable_dependiente,
    ...matrix.variables_block.indicadores_dependiente,
    ...matrix.variables_block.categorias,
    matrix.methodology_block.tipo_investigacion,
    matrix.methodology_block.diseno_investigacion,
    matrix.methodology_block.ambito_estudio,
    matrix.methodology_block.poblacion,
    matrix.methodology_block.muestra,
    ...matrix.methodology_block.tecnicas_recoleccion,
    ...matrix.methodology_block.instrumentos,
    matrix.methodology_block.plan_analisis,
    ...(matrix.table_model?.header_rows.flat() ?? []),
    ...(matrix.table_model?.body_rows.flatMap((row) => [...row.cells, ...row.warnings]) ?? []),
  ].filter((text): text is string => Boolean(text));
}

function findRemainingLeaks(input: {
  sections: AcademicSection[];
  matrix: AcademicDocument["matrix"];
  titleHits: SourceTitleHit[];
}): AcademicPublicSanitizationPass["remaining_title_leaks"] {
  const leaks: AcademicPublicSanitizationPass["remaining_title_leaks"] = [];

  for (const section of input.sections) {
    if (PUBLIC_SKIP_SECTION_KEYS.has(section.section_key)) {
      continue;
    }

    for (const block of section.blocks) {
      const texts = block.block_type === "table" ? block.rows.flat() : [block.text];
      for (const text of texts) {
        const normalizedText = normalize(text);
        for (const titleHit of input.titleHits) {
          if (!titleHit.variants.some((variant) => normalizedText.includes(normalize(variant)))) {
            continue;
          }

          leaks.push({
            section_key: section.section_key,
            source_id: titleHit.source_id,
            title: titleHit.title,
            context: cleanAcademicText(text).slice(0, 260),
          });
        }
      }
    }
  }

  for (const text of matrixTexts(input.matrix)) {
    const normalizedText = normalize(text);
    for (const titleHit of input.titleHits) {
      if (!titleHit.variants.some((variant) => normalizedText.includes(normalize(variant)))) {
        continue;
      }

      leaks.push({
        section_key: "consistency_matrix",
        source_id: titleHit.source_id,
        title: titleHit.title,
        context: cleanAcademicText(text).slice(0, 260),
      });
    }
  }

  return leaks.slice(0, 40);
}

export function applyAcademicDocumentPublicSanitizationPass(
  document: AcademicDocument,
): AcademicDocument {
  const titleHits = buildTitleHits(document.references);
  if (titleHits.length === 0) {
    return document;
  }

  let sourceTitleReplacements = 0;
  let citationAnchorsAdded = 0;
  const sectionsTouched: string[] = [];
  const sections = document.sections.map((section) => {
    const result = sanitizeSection({ section, titleHits });
    sourceTitleReplacements += result.replacements;
    citationAnchorsAdded += result.anchorsAdded;
    if (result.touched) {
      sectionsTouched.push(section.section_key);
    }
    return result.section;
  });

  const matrixResult = sanitizeMatrix({
    matrix: document.matrix,
    titleHits,
  });
  sourceTitleReplacements += matrixResult.replacements;
  if (matrixResult.touched) {
    sectionsTouched.push("consistency_matrix");
  }

  const cleanCoverMethod = sanitizeText({
    text: document.layout_plan.cover_visual.method_summary,
    titleHits,
  });
  const cleanCoverPrompt = sanitizeText({
    text: document.layout_plan.cover_visual.prompt,
    titleHits,
  });
  sourceTitleReplacements += cleanCoverMethod.replacements + cleanCoverPrompt.replacements;

  const remainingTitleLeaks = findRemainingLeaks({
    sections,
    matrix: matrixResult.matrix,
    titleHits,
  });
  const pass: AcademicPublicSanitizationPass = {
    artifact_type: "academic_public_sanitization_pass",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    source: "deterministic",
    source_title_replacements: sourceTitleReplacements,
    citation_anchors_added: citationAnchorsAdded,
    sections_touched: Array.from(new Set(sectionsTouched)),
    remaining_title_leaks: remainingTitleLeaks,
    warnings:
      remainingTitleLeaks.length > 0
        ? [
            "Persisten posibles titulos de fuente en narrativa publica; revisar antes de entrega final.",
          ]
        : [],
  };

  return {
    ...document,
    sections,
    matrix: matrixResult.matrix,
    layout_plan: {
      ...document.layout_plan,
      cover_visual: {
        ...document.layout_plan.cover_visual,
        method_summary: cleanCoverMethod.text || document.layout_plan.cover_visual.method_summary,
        prompt: cleanCoverPrompt.text || document.layout_plan.cover_visual.prompt,
      },
    },
    public_sanitization_passes: [...document.public_sanitization_passes, pass],
    warnings: Array.from(new Set([...document.warnings, ...pass.warnings])),
  };
}
