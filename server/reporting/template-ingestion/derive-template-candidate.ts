import type {
  EquationAlignment,
  EquationReferenceStyle,
  CitationStyle,
  NotePosition,
  NormalizedBlock,
  NormalizedTemplateSourceDocument,
  TemplateCandidate,
  TemplateCandidateSection,
  TemplateMethodologyMode,
  TemplateSourceSemanticAnalysis,
  TemplateSourceSemanticAnalysisSection,
} from "@/server/reporting/template-ingestion-types";

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

function buildTemplateKeyGuess(document: NormalizedTemplateSourceDocument) {
  const university = slugify(document.institution.university_name || "template");
  const degree = slugify(document.institution.degree_level || "unknown");
  const program = slugify(document.institution.discipline_area || document.institution.program_name || "");

  return [university, degree, program].filter(Boolean).join("_");
}

function inferContentKindFromBlock(
  block: NormalizedBlock,
): TemplateCandidateSection["content_kind"] {
  if (block.type === "references") {
    return "references";
  }

  if (block.type === "table" || block.table) {
    return "table";
  }

  if ((block.items?.length ?? 0) > 0) {
    return "bullet_list";
  }

  return "rich_text";
}

function findSemanticSection(
  semanticAnalysis: TemplateSourceSemanticAnalysis | null,
  blockId: string,
) {
  return semanticAnalysis?.sections.find((section) => section.block_id === blockId) ?? null;
}

function buildDefaultGuidance(block: NormalizedBlock) {
  const semanticKey = block.semantic_key ?? "";

  const purposeBySemanticKey: Record<string, string> = {
    general_data: "Agrupa metadatos academicos y administrativos del plan.",
    student_name: "Registra la identificacion principal del tesista.",
    advisors: "Registra asesor y coasesor cuando corresponda.",
    research_areas: "Declara el area general de investigacion del trabajo.",
    research_line: "Declara la linea de investigacion institucional o tematica.",
    research_location: "Define el lugar donde se desarrollara la investigacion.",
    mention: "Declara la mencion o especialidad academica.",
    research_problem: "Agrupa las secciones nucleares del problema de investigacion.",
    project_title: "Presenta el titulo exacto y defendible del plan de tesis.",
    abstract: "Resume problema, objetivo, metodo y aporte esperado del plan.",
    introduction_justification:
      "Explica el contexto del problema y justifica la relevancia academica o aplicada del estudio.",
    problem_statement: "Describe el problema central, contexto y vacio de investigacion.",
    research_questions: "Agrupa la formulacion principal y especifica de preguntas de investigacion.",
    main_research_question: "Formula la pregunta principal de investigacion.",
    specific_research_questions:
      "Lista preguntas especificas alineadas al problema y al objetivo general.",
    justification: "Expone la relevancia teorica, practica o metodologica del estudio.",
    objectives: "Presenta la estructura general de objetivos del estudio.",
    general_objective: "Declara el objetivo general central del plan.",
    specific_objectives: "Desglosa acciones concretas alineadas al objetivo general.",
    scope: "Delimita alcance tecnico, geografico, temporal o tematico.",
    hypotheses: "Formula hipotesis o supuestos verificables cuando el enfoque lo requiera.",
    general_hypothesis: "Formula la hipotesis principal del estudio.",
    specific_hypotheses: "Lista hipotesis especificas coherentes con objetivos y variables.",
    variables_indicators: "Agrupa la definicion de variables e indicadores del estudio.",
    variable_identification: "Identifica variables independientes, dependientes o categorias.",
    indicators: "Define indicadores observables o medibles por variable.",
    state_of_the_art:
      "Sintetiza antecedentes y literatura relevante que sustentan la investigacion.",
    theoretical_framework: "Agrupa los fundamentos conceptuales y teoricos del estudio.",
    problem_background: "Resume antecedentes previos relevantes para el problema investigado.",
    international_background: "Resume antecedentes internacionales relevantes.",
    national_background: "Resume antecedentes nacionales relevantes.",
    theoretical_bases: "Presenta bases teoricas o conceptuales centrales del estudio.",
    scientific_theoretical_bases:
      "Desarrolla fundamentos teorico-cientificos y definiciones especializadas.",
    methodology:
      "Describe diseno, etapas, procedimientos, tecnicas y herramientas de investigacion.",
    schedule: "Presenta el cronograma de actividades del estudio.",
    budget: "Presenta el presupuesto o costo estimado del estudio cuando aplica.",
    consistency_matrix: "Presenta la matriz de consistencia del estudio como anexo o tabla.",
    schedule_budget: "Presenta cronograma y, si aplica, presupuesto del plan.",
    references: "Lista solo las referencias efectivamente usadas en el documento.",
    annexes: "Agrupa anexos que complementan y trazan el plan de investigacion.",
  };

  const instructionsBySemanticKey: Record<string, string[]> = {
    general_data: ["Completa los datos generales institucionales y del autor con rotulos claros."],
    student_name: ["Usa el nombre completo del estudiante tal como debe figurar academicamente."],
    advisors: ["Incluye asesor y coasesor con nombres completos y rol explicito."],
    research_areas: ["Usa el area de investigacion institucional o disciplinar correspondiente."],
    research_line: ["Usa una linea de investigacion consistente con el programa y el tema."],
    research_location: ["Especifica departamento, provincia, distrito u otra delimitacion geografica aplicable."],
    mention: ["Usa la mencion oficial del programa sin abreviaturas ambiguas."],
    research_problem: ["Organiza planteamiento, formulacion y justificacion de manera coherente."],
    project_title: ["Redacta un titulo preciso, tecnico y consistente con el problema y el metodo."],
    abstract: [
      "Sintetiza el problema, objetivo principal, enfoque metodologico y resultado esperado del plan.",
      "Evita citas extensas o afirmaciones que no puedan sustentarse.",
    ],
    introduction_justification: [
      "Explica el problema en contexto y por que la investigacion es relevante.",
      "Distingue entre descripcion del problema y justificacion del estudio.",
    ],
    problem_statement: [
      "Describe el contexto, la brecha o limitacion actual y el problema concreto que se investigara.",
    ],
    research_questions: ["Agrupa preguntas principal y especificas sin mezclar objetivos."],
    main_research_question: ["Formula una pregunta principal clara, investigable y alineada al objetivo general."],
    specific_research_questions: [
      "Lista preguntas especificas claras y consistentes con los objetivos especificos.",
    ],
    justification: [
      "Explica la importancia del estudio desde el punto de vista teorico, practico o metodologico.",
    ],
    objectives: ["Mantiene coherencia entre objetivo general y objetivos especificos."],
    general_objective: ["Formula el objetivo general con un verbo rector y foco claro."],
    specific_objectives: [
      "Lista objetivos especificos verificables y alineados con el objetivo general.",
    ],
    scope: ["Delimita claramente el alcance para evitar ambiguedad en la ejecucion del estudio."],
    hypotheses: [
      "Formula hipotesis solo si el enfoque lo exige; si no aplica, documenta preguntas orientadoras.",
    ],
    general_hypothesis: ["Redacta una hipotesis principal medible o contrastable cuando corresponda."],
    specific_hypotheses: ["Redacta hipotesis especificas consistentes con variables y objetivos."],
    variables_indicators: ["Agrupa variables, dimensiones e indicadores con relacion clara al problema."],
    variable_identification: ["Distingue variables independientes, dependientes o categorias de analisis."],
    indicators: ["Lista indicadores observables y consistentes con la variable correspondiente."],
    state_of_the_art: [
      "Resume antecedentes y trabajos relacionados con trazabilidad bibliografica.",
    ],
    theoretical_framework: ["Desarrolla el marco teorico de forma ordenada y con soporte bibliografico."],
    problem_background: ["Resume antecedentes directamente relacionados con el problema estudiado."],
    international_background: ["Resume antecedentes internacionales relevantes y comparables."],
    national_background: ["Resume antecedentes nacionales relevantes para el contexto del estudio."],
    theoretical_bases: ["Expone bases teoricas o conceptuales indispensables para comprender el estudio."],
    scientific_theoretical_bases: [
      "Desarrolla conceptos y fundamentos tecnicos o cientificos clave para el analisis.",
    ],
    methodology: [
      "Describe etapas, datos, procedimientos, herramientas y criterios de validacion.",
    ],
    schedule: ["Organiza actividades, tiempos y secuencia de ejecucion del estudio."],
    budget: ["Explicita costos o recursos solo si el formato institucional lo exige."],
    consistency_matrix: ["Presenta la matriz de consistencia con correspondencia entre problema, objetivos y metodo."],
    schedule_budget: [
      "Organiza actividades y tiempos de forma secuencial y verificable.",
    ],
    references: ["Usa una lista bibliografica consistente y trazable al contenido citado."],
    annexes: ["Incluye anexos solo cuando aporten evidencia, trazabilidad o soporte metodologico."],
  };

  return {
    purpose: purposeBySemanticKey[semanticKey] ?? "Desarrolla el contenido academico esperado para esta seccion.",
    instructions:
      instructionsBySemanticKey[semanticKey] ??
      ["Completa esta seccion con contenido academico claro, defendible y consistente con el resto del plan."],
    min_words: null,
    recommended_words: null,
    max_words: null,
    source_kind: "system_default" as const,
  };
}

function buildSectionNode(
  block: NormalizedBlock,
  semanticSection: TemplateSourceSemanticAnalysisSection | null,
): TemplateCandidateSection {
  const defaultGuidance = buildDefaultGuidance(block);

  return {
    id: block.id,
    title: block.label ?? block.semantic_key ?? `Bloque ${block.id}`,
    level: block.level ?? 1,
    required: semanticSection?.required ?? true,
    repeatable: false,
    semantic_key: semanticSection?.semantic_key ?? block.semantic_key ?? null,
    content_kind: semanticSection?.content_kind ?? inferContentKindFromBlock(block),
    guidance: {
      purpose: semanticSection?.notes?.[0] ?? defaultGuidance.purpose,
      instructions:
        semanticSection && semanticSection.instruction_candidates.length > 0
          ? semanticSection.instruction_candidates
          : defaultGuidance.instructions,
      min_words: semanticSection?.word_limit.min_words ?? defaultGuidance.min_words,
      recommended_words:
        semanticSection?.word_limit.recommended_words ?? defaultGuidance.recommended_words,
      max_words: semanticSection?.word_limit.max_words ?? defaultGuidance.max_words,
      source_kind: semanticSection ? "inferred_from_instance" : defaultGuidance.source_kind,
    },
    children: [],
  };
}

function buildSectionTree(
  blocks: NormalizedBlock[],
  semanticAnalysis: TemplateSourceSemanticAnalysis | null,
) {
  const roots: TemplateCandidateSection[] = [];
  const stack: TemplateCandidateSection[] = [];

  for (const block of blocks) {
    const node = buildSectionNode(block, findSemanticSection(semanticAnalysis, block.id));

    while (stack.length > 0 && (stack[stack.length - 1].level ?? 1) >= node.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      roots.push(node);
    } else {
      const parent = stack[stack.length - 1];
      parent.children = parent.children ?? [];
      parent.children.push(node);
    }

    stack.push(node);
  }

  return roots;
}

function buildCoverTemplate(document: NormalizedTemplateSourceDocument) {
  const fields: TemplateCandidate["cover_template"]["fields"] = [];

  if (document.cover.logo_asset_key) {
    fields.push({
      key: "institution_logo",
      label: "Logo institucional",
      value_type: "asset",
      required: true,
    });
  }

  fields.push(
    {
      key: "university_name",
      label: "Universidad",
      value_type: "text",
      required: true,
    },
    {
      key: "school_name",
      label: "Escuela o facultad",
      value_type: "text",
      required: Boolean(document.cover.school_name),
    },
    {
      key: "program_name",
      label: "Programa",
      value_type: "text",
      required: Boolean(document.cover.program_name),
    },
    {
      key: "document_label",
      label: "Tipo de documento",
      value_type: "text",
      required: Boolean(document.cover.document_label),
    },
    {
      key: "student_name",
      label: "Estudiante",
      value_type: "person_name",
      required: (document.cover.author_lines?.length ?? 0) > 0,
    },
    {
      key: "advisor_name",
      label: "Asesor",
      value_type: "person_name",
      required: (document.cover.advisor_lines?.length ?? 0) > 0,
    },
  );

  if ((document.cover.advisor_lines?.length ?? 0) > 1) {
    fields.push({
      key: "co_advisor_name",
      label: "Coasesor",
      value_type: "person_name",
      required: true,
    });
  }

  fields.push({
    key: "place_and_date",
    label: "Lugar y fecha",
    value_type: "location",
    required: Boolean(document.cover.date_label),
  });

  return {
    document_label: document.cover.document_label ?? null,
    fields,
  };
}

function uniqueLevels(blocks: NormalizedBlock[]) {
  return Array.from(new Set(blocks.map((block) => block.level ?? 1))).sort((a, b) => a - b);
}

function mergeTitleRules(
  blocks: NormalizedBlock[],
  semanticAnalysis: TemplateSourceSemanticAnalysis | null,
) {
  const semanticByLevel = new Map(
    (semanticAnalysis?.element_rule_candidates.titles ?? []).map((rule) => [rule.level, rule]),
  );

  return uniqueLevels(blocks).map((level) => {
    const blockAtLevel = blocks.filter((block) => (block.level ?? 1) === level);
    const uppercaseRatio =
      blockAtLevel.length === 0
        ? 0
        : blockAtLevel.filter((block) => (block.label ?? "") === (block.label ?? "").toUpperCase())
            .length / blockAtLevel.length;
    const semanticRule = semanticByLevel.get(level);

    return {
      level,
      numbered:
        semanticRule?.numbered ??
        (blockAtLevel.some((block) => Boolean(block.ordinal)) ? true : null),
      uppercase: semanticRule?.uppercase ?? (uppercaseRatio >= 0.75 ? true : null),
      numbering_format: semanticRule?.numbering_format ?? "level_decimal",
      spacing_before_pt: semanticRule?.spacing_before_pt ?? (level === 1 ? 18 : level === 2 ? 14 : 10),
      spacing_after_pt: semanticRule?.spacing_after_pt ?? (level === 1 ? 12 : level === 2 ? 8 : 6),
    };
  });
}

function resolveCitationNumbering(citationStyle: CitationStyle) {
  if (citationStyle === "VANCOUVER" || citationStyle === "IEEE") {
    return true;
  }

  if (citationStyle === "APA7" || citationStyle === "CHICAGO" || citationStyle === "ISO690") {
    return false;
  }

  return null;
}

function resolveCitationInlineStyle(citationStyle: CitationStyle) {
  switch (citationStyle) {
    case "APA7":
      return "author_year";
    case "VANCOUVER":
    case "IEEE":
      return "numeric";
    case "CHICAGO":
      return "author_year";
    case "ISO690":
      return "author_year";
    default:
      return "author_year";
  }
}

function resolveEquationAlignment(citationStyle: CitationStyle): EquationAlignment {
  return citationStyle === "IEEE" ? "center" : "center";
}

function resolveEquationReferenceStyle(
  citationStyle: CitationStyle,
): EquationReferenceStyle {
  return citationStyle === "IEEE" || citationStyle === "VANCOUVER"
    ? "inline"
    : "parenthetical";
}

function resolveNotePosition(): NotePosition {
  return "bottom";
}

function resolveReferenceOrdering(citationStyle: CitationStyle) {
  switch (citationStyle) {
    case "VANCOUVER":
    case "IEEE":
      return "citation_order";
    case "APA7":
    case "CHICAGO":
    case "ISO690":
      return "alphabetical";
    default:
      return "alphabetical";
  }
}

function resolveParagraphAlignment(): "justify" {
  return "justify";
}

function buildConventionalFallbackWarnings(
  semanticAnalysis: TemplateSourceSemanticAnalysis | null,
  citationStyle: CitationStyle,
) {
  const warnings: string[] = [];

  if (!semanticAnalysis) {
    return warnings;
  }

  if (
    semanticAnalysis.element_rule_candidates.page.paper_size == null ||
    semanticAnalysis.element_rule_candidates.page.margin_left_cm == null ||
    semanticAnalysis.element_rule_candidates.page.margin_right_cm == null ||
    semanticAnalysis.element_rule_candidates.page.margin_top_cm == null ||
    semanticAnalysis.element_rule_candidates.page.margin_bottom_cm == null
  ) {
    warnings.push(
      "Se aplico una convencion tipica de pagina para exportacion academica: A4 con margen izquierdo 3 cm y demas margenes 2.5 cm.",
    );
  }

  if (
    semanticAnalysis.element_rule_candidates.paragraph.font_family == null ||
    semanticAnalysis.element_rule_candidates.paragraph.font_size_pt == null ||
    semanticAnalysis.element_rule_candidates.paragraph.line_spacing == null
  ) {
    warnings.push(
      "Se aplico una convencion tipica de parrafo para exportacion academica: Times New Roman 12 con interlineado 1.5.",
    );
  }

  if (semanticAnalysis.element_rule_candidates.table.caption_position == null) {
    warnings.push(
      "Se aplico una convencion tipica para tablas: titulo arriba, numeracion activa y sin lineas verticales.",
    );
  }

  if (semanticAnalysis.element_rule_candidates.figure.caption_position == null) {
    warnings.push(
      "Se aplico una convencion tipica para figuras: leyenda abajo y numeracion activa.",
    );
  }

  if (
    semanticAnalysis.element_rule_candidates.caption.prefix_style == null ||
    semanticAnalysis.element_rule_candidates.caption.separator == null
  ) {
    warnings.push(
      "Se aplico una convencion tipica para captions: etiqueta seguida de titulo con separador simple.",
    );
  }

  if (semanticAnalysis.element_rule_candidates.citation.inline_style == null) {
    warnings.push(
      `Se aplico una convencion tipica de citas para estilo ${citationStyle}: ${resolveCitationInlineStyle(citationStyle)}.`,
    );
  }

  if (semanticAnalysis.element_rule_candidates.reference_list.ordering == null) {
    warnings.push(
      `Se aplico una convencion tipica de orden de referencias para estilo ${citationStyle}: ${resolveReferenceOrdering(citationStyle)}.`,
    );
  }

  return warnings;
}

function buildTemplateFamily(
  document: NormalizedTemplateSourceDocument,
  semanticAnalysis: TemplateSourceSemanticAnalysis | null,
) {
  if (semanticAnalysis?.template_family_guess?.trim()) {
    return semanticAnalysis.template_family_guess.trim();
  }

  const university = slugify(document.institution.university_name || "PE");
  const degree = slugify(document.institution.degree_level || "POSGRADO");
  return `${university}_${degree}_THESIS_PLAN`;
}

function mergeWarnings(
  document: NormalizedTemplateSourceDocument,
  semanticAnalysis: TemplateSourceSemanticAnalysis | null,
  pipelineWarnings: string[],
) {
  return Array.from(
    new Set([
      ...document.warnings,
      ...(semanticAnalysis?.warnings ?? []),
      ...(semanticAnalysis?.review_notes ?? []),
      ...pipelineWarnings,
    ]),
  );
}

function inferMethodologyMode(
  document: NormalizedTemplateSourceDocument,
  semanticAnalysis: TemplateSourceSemanticAnalysis | null,
): TemplateMethodologyMode {
  if (semanticAnalysis && semanticAnalysis.methodology_mode !== "unknown") {
    return semanticAnalysis.methodology_mode;
  }

  const hasHypotheses = document.blocks.some((block) => block.semantic_key === "hypotheses");
  return hasHypotheses ? "quantitative" : "unknown";
}

export function deriveTemplateCandidate(input: {
  normalizedDocument: NormalizedTemplateSourceDocument;
  semanticAnalysis: TemplateSourceSemanticAnalysis | null;
  pipelineWarnings?: string[];
}) {
  const { normalizedDocument, semanticAnalysis } = input;
  const pipelineWarnings = input.pipelineWarnings ?? [];
  const citationStyle = semanticAnalysis?.citation_style_guess ?? "UNKNOWN";
  const sectionTree = buildSectionTree(normalizedDocument.blocks, semanticAnalysis);
  const logoAsset = normalizedDocument.assets.find(
    (asset) => asset.asset_key === normalizedDocument.cover.logo_asset_key,
  );

  const pageCandidate = semanticAnalysis?.element_rule_candidates.page;
  const paragraphCandidate = semanticAnalysis?.element_rule_candidates.paragraph;
  const equationCandidate = semanticAnalysis?.element_rule_candidates.equation;
  const tableCandidate = semanticAnalysis?.element_rule_candidates.table;
  const figureCandidate = semanticAnalysis?.element_rule_candidates.figure;
  const captionCandidate = semanticAnalysis?.element_rule_candidates.caption;
  const conventionalFallbackWarnings = buildConventionalFallbackWarnings(
    semanticAnalysis,
    citationStyle,
  );

  const templateCandidate: TemplateCandidate = {
    derived_from_source_id: normalizedDocument.source_id,
    template_key_guess: buildTemplateKeyGuess(normalizedDocument),
    template_family: buildTemplateFamily(normalizedDocument, semanticAnalysis),
    language: normalizedDocument.language,
    institution: {
      university_name:
        semanticAnalysis?.institution.university_name ??
        normalizedDocument.institution.university_name,
      school_name:
        semanticAnalysis?.institution.school_name ?? normalizedDocument.institution.school_name,
      program_name:
        semanticAnalysis?.institution.program_name ?? normalizedDocument.institution.program_name,
      mention: semanticAnalysis?.institution.mention ?? normalizedDocument.institution.mention,
      degree_level:
        semanticAnalysis?.institution.degree_level ?? normalizedDocument.institution.degree_level,
      discipline_area:
        semanticAnalysis?.institution.discipline_area ??
        normalizedDocument.institution.discipline_area,
    },
    methodology_mode: inferMethodologyMode(normalizedDocument, semanticAnalysis),
    citation_style: citationStyle,
    review_status: "needs_review",
    logo_policy: {
      strategy:
        logoAsset?.source_strategy === "provided_file"
          ? "provided_asset_first"
          : normalizedDocument.cover.logo_asset_key
            ? "extract_from_document_fallback"
            : "none",
      primary_asset_key: normalizedDocument.cover.logo_asset_key ?? null,
      placement: normalizedDocument.cover.logo_asset_key ? "cover_top" : "none",
      alignment: normalizedDocument.cover.logo_asset_key ? "center" : null,
    },
    cover_template: buildCoverTemplate(normalizedDocument),
    sections: sectionTree,
    element_rules: {
      page: {
        paper_size: pageCandidate?.paper_size ?? "A4",
        margin_left_cm: pageCandidate?.margin_left_cm ?? 3,
        margin_right_cm: pageCandidate?.margin_right_cm ?? 2.5,
        margin_top_cm: pageCandidate?.margin_top_cm ?? 2.5,
        margin_bottom_cm: pageCandidate?.margin_bottom_cm ?? 2.5,
        page_numbering: pageCandidate?.page_numbering ?? true,
        page_number_position: pageCandidate?.page_number_position ?? "bottom_center",
      },
      titles: mergeTitleRules(normalizedDocument.blocks, semanticAnalysis),
      paragraph: {
        font_family: paragraphCandidate?.font_family ?? "Times New Roman",
        font_size_pt: paragraphCandidate?.font_size_pt ?? 12,
        line_spacing: paragraphCandidate?.line_spacing ?? 1.5,
        alignment: paragraphCandidate?.alignment ?? resolveParagraphAlignment(),
        space_before_pt: paragraphCandidate?.space_before_pt ?? 0,
        space_after_pt: paragraphCandidate?.space_after_pt ?? 6,
        first_line_indent_cm: paragraphCandidate?.first_line_indent_cm ?? 1.25,
      },
      equation: {
        numbering: equationCandidate?.numbering ?? true,
        alignment: equationCandidate?.alignment ?? resolveEquationAlignment(citationStyle),
        reference_style:
          equationCandidate?.reference_style ?? resolveEquationReferenceStyle(citationStyle),
        numbering_format: equationCandidate?.numbering_format ?? "plain",
        label_prefix: equationCandidate?.label_prefix ?? "Ecuacion",
      },
      table: {
        caption_position:
          tableCandidate?.caption_position ??
          (normalizedDocument.blocks.some((block) => Boolean(block.table)) ? "top" : "top"),
        allow_vertical_lines: tableCandidate?.allow_vertical_lines ?? false,
        numbering: tableCandidate?.numbering ?? true,
        source_note_required: tableCandidate?.source_note_required ?? true,
        note_position: tableCandidate?.note_position ?? resolveNotePosition(),
        numbering_format: tableCandidate?.numbering_format ?? "plain",
        label: tableCandidate?.label ?? "Tabla",
      },
      figure: {
        caption_position: figureCandidate?.caption_position ?? "bottom",
        numbering: figureCandidate?.numbering ?? true,
        source_note_required: figureCandidate?.source_note_required ?? true,
        note_position: figureCandidate?.note_position ?? resolveNotePosition(),
        numbering_format: figureCandidate?.numbering_format ?? "plain",
        label: figureCandidate?.label ?? "Figura",
      },
      caption: {
        prefix_style: captionCandidate?.prefix_style ?? "label_period_title",
        separator: captionCandidate?.separator ?? ". ",
        font_style: captionCandidate?.font_style ?? "inherit",
      },
      citation: {
        numbering: resolveCitationNumbering(citationStyle),
        inline_style:
          semanticAnalysis?.element_rule_candidates.citation.inline_style ??
          resolveCitationInlineStyle(citationStyle),
      },
      reference_list: {
        numbering: false,
        ordering:
          semanticAnalysis?.element_rule_candidates.reference_list.ordering ??
          resolveReferenceOrdering(citationStyle),
        heading_title:
          semanticAnalysis?.element_rule_candidates.reference_list.heading_title ?? "Referencias",
        require_cited_only:
          semanticAnalysis?.element_rule_candidates.reference_list.require_cited_only ?? true,
        doi_policy: semanticAnalysis?.element_rule_candidates.reference_list.doi_policy ?? "preferred",
      },
    },
    validations: {
      required_section_keys: Array.from(
        new Set(
          normalizedDocument.blocks
            .map((block) => findSemanticSection(semanticAnalysis, block.id)?.semantic_key ?? block.semantic_key)
            .filter((value): value is string => Boolean(value)),
        ),
      ),
      requires_logo: Boolean(normalizedDocument.cover.logo_asset_key),
      requires_references: normalizedDocument.blocks.some((block) => block.semantic_key === "references"),
      human_review_required: true,
    },
    warnings: mergeWarnings(normalizedDocument, semanticAnalysis, [
      ...pipelineWarnings,
      ...conventionalFallbackWarnings,
    ]),
  };

  return templateCandidate;
}
