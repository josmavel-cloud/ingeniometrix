import type {
  EffectiveTemplateElementRules,
  TemplateCandidate,
} from "@/server/reporting/template-ingestion-types";

export type EditorialProfileKey =
  | "PE_THESIS_DEFAULT"
  | "ENGINEERING_RESEARCH_DEFAULT";

type EditorialProfile = {
  key: EditorialProfileKey;
  label: string;
  rationale: string;
  elementRules: EffectiveTemplateElementRules;
};

function buildTitleLevels(
  defaults: Array<{
    level: number;
    numbered: boolean;
    uppercase: boolean;
    numbering_format: "plain" | "level_decimal";
    spacing_before_pt: number;
    spacing_after_pt: number;
  }>,
) {
  return defaults.map((item) => ({ ...item }));
}

const PE_THESIS_DEFAULT_PROFILE: EditorialProfile = {
  key: "PE_THESIS_DEFAULT",
  label: "Perfil base de tesis en Peru",
  rationale:
    "Fallback conservador para planes de tesis con formato academico sobrio y export-safe.",
  elementRules: {
    page: {
      paper_size: "A4",
      margin_left_cm: 3,
      margin_right_cm: 2.5,
      margin_top_cm: 2.5,
      margin_bottom_cm: 2.5,
      page_numbering: true,
      page_number_position: "bottom_center",
    },
    titles: buildTitleLevels([
      {
        level: 1,
        numbered: true,
        uppercase: false,
        numbering_format: "level_decimal",
        spacing_before_pt: 18,
        spacing_after_pt: 12,
      },
      {
        level: 2,
        numbered: true,
        uppercase: false,
        numbering_format: "level_decimal",
        spacing_before_pt: 14,
        spacing_after_pt: 8,
      },
      {
        level: 3,
        numbered: true,
        uppercase: false,
        numbering_format: "level_decimal",
        spacing_before_pt: 12,
        spacing_after_pt: 6,
      },
      {
        level: 4,
        numbered: false,
        uppercase: false,
        numbering_format: "level_decimal",
        spacing_before_pt: 10,
        spacing_after_pt: 4,
      },
      {
        level: 5,
        numbered: false,
        uppercase: false,
        numbering_format: "level_decimal",
        spacing_before_pt: 8,
        spacing_after_pt: 3,
      },
    ]),
    paragraph: {
      font_family: "Times New Roman",
      font_size_pt: 12,
      line_spacing: 1.5,
      alignment: "justify",
      space_before_pt: 0,
      space_after_pt: 6,
      first_line_indent_cm: 1.25,
    },
    equation: {
      numbering: true,
      alignment: "center",
      reference_style: "parenthetical",
      numbering_format: "plain",
      label_prefix: "Ecuacion",
    },
    table: {
      caption_position: "top",
      allow_vertical_lines: false,
      numbering: true,
      source_note_required: true,
      note_position: "bottom",
      numbering_format: "plain",
      label: "Tabla",
    },
    figure: {
      caption_position: "bottom",
      numbering: true,
      source_note_required: true,
      note_position: "bottom",
      numbering_format: "plain",
      label: "Figura",
    },
    caption: {
      prefix_style: "label_period_title",
      separator: ". ",
      font_style: "inherit",
    },
    citation: {
      numbering: false,
      inline_style: "author_year",
    },
    reference_list: {
      numbering: false,
      ordering: "alphabetical",
      heading_title: "Referencias",
      require_cited_only: true,
      doi_policy: "preferred",
    },
  },
};

const ENGINEERING_RESEARCH_DEFAULT_PROFILE: EditorialProfile = {
  key: "ENGINEERING_RESEARCH_DEFAULT",
  label: "Perfil tecnico de ingenieria",
  rationale:
    "Fallback para documentos tecnicos con mejor densidad visual, ecuaciones numeradas y objetos siempre citables.",
  elementRules: {
    ...PE_THESIS_DEFAULT_PROFILE.elementRules,
    paragraph: {
      font_family: "Times New Roman",
      font_size_pt: 11,
      line_spacing: 1.15,
      alignment: "justify",
      space_before_pt: 0,
      space_after_pt: 6,
      first_line_indent_cm: 0.8,
    },
    equation: {
      numbering: true,
      alignment: "center",
      reference_style: "parenthetical",
      numbering_format: "plain",
      label_prefix: "Ecuacion",
    },
    table: {
      caption_position: "top",
      allow_vertical_lines: false,
      numbering: true,
      source_note_required: true,
      note_position: "bottom",
      numbering_format: "plain",
      label: "Tabla",
    },
    figure: {
      caption_position: "bottom",
      numbering: true,
      source_note_required: true,
      note_position: "bottom",
      numbering_format: "plain",
      label: "Figura",
    },
    reference_list: {
      numbering: false,
      ordering: "alphabetical",
      heading_title: "Referencias",
      require_cited_only: true,
      doi_policy: "preferred",
    },
  },
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isEngineeringContext(template: TemplateCandidate) {
  const values = [
    template.institution.program_name,
    template.institution.discipline_area,
    template.institution.mention,
    template.template_family,
  ]
    .map((value) => normalizeText(value))
    .join(" ");

  return (
    template.methodology_mode === "technical" ||
    values.includes("ingenier") ||
    values.includes("estructur") ||
    values.includes("dinamica")
  );
}

function profileForTemplate(template: TemplateCandidate) {
  return isEngineeringContext(template)
    ? ENGINEERING_RESEARCH_DEFAULT_PROFILE
    : PE_THESIS_DEFAULT_PROFILE;
}

function mergeScalar<T>(primary: T | null | undefined, fallback: T) {
  return primary ?? fallback;
}

function mergeTitleRules(template: TemplateCandidate, profile: EditorialProfile) {
  const levelMap = new Map(template.element_rules.titles.map((rule) => [rule.level, rule]));

  return profile.elementRules.titles.map((fallbackRule) => {
    const rule = levelMap.get(fallbackRule.level);
    return {
      level: fallbackRule.level,
      numbered: mergeScalar(rule?.numbered, fallbackRule.numbered),
      uppercase: mergeScalar(rule?.uppercase, fallbackRule.uppercase),
      numbering_format: mergeScalar(rule?.numbering_format, fallbackRule.numbering_format),
      spacing_before_pt: mergeScalar(rule?.spacing_before_pt, fallbackRule.spacing_before_pt),
      spacing_after_pt: mergeScalar(rule?.spacing_after_pt, fallbackRule.spacing_after_pt),
    };
  });
}

export function resolveEffectiveTemplateElementRules(template: TemplateCandidate) {
  const profile = profileForTemplate(template);

  const effectiveRules: EffectiveTemplateElementRules = {
    page: {
      paper_size: mergeScalar(
        template.element_rules.page.paper_size,
        profile.elementRules.page.paper_size,
      ),
      margin_left_cm: mergeScalar(
        template.element_rules.page.margin_left_cm,
        profile.elementRules.page.margin_left_cm,
      ),
      margin_right_cm: mergeScalar(
        template.element_rules.page.margin_right_cm,
        profile.elementRules.page.margin_right_cm,
      ),
      margin_top_cm: mergeScalar(
        template.element_rules.page.margin_top_cm,
        profile.elementRules.page.margin_top_cm,
      ),
      margin_bottom_cm: mergeScalar(
        template.element_rules.page.margin_bottom_cm,
        profile.elementRules.page.margin_bottom_cm,
      ),
      page_numbering: mergeScalar(
        template.element_rules.page.page_numbering,
        profile.elementRules.page.page_numbering,
      ),
      page_number_position: mergeScalar(
        template.element_rules.page.page_number_position,
        profile.elementRules.page.page_number_position,
      ),
    },
    titles: mergeTitleRules(template, profile),
    paragraph: {
      font_family: mergeScalar(
        template.element_rules.paragraph.font_family,
        profile.elementRules.paragraph.font_family,
      ),
      font_size_pt: mergeScalar(
        template.element_rules.paragraph.font_size_pt,
        profile.elementRules.paragraph.font_size_pt,
      ),
      line_spacing: mergeScalar(
        template.element_rules.paragraph.line_spacing,
        profile.elementRules.paragraph.line_spacing,
      ),
      alignment: mergeScalar(
        template.element_rules.paragraph.alignment,
        profile.elementRules.paragraph.alignment,
      ),
      space_before_pt: mergeScalar(
        template.element_rules.paragraph.space_before_pt,
        profile.elementRules.paragraph.space_before_pt,
      ),
      space_after_pt: mergeScalar(
        template.element_rules.paragraph.space_after_pt,
        profile.elementRules.paragraph.space_after_pt,
      ),
      first_line_indent_cm: mergeScalar(
        template.element_rules.paragraph.first_line_indent_cm,
        profile.elementRules.paragraph.first_line_indent_cm,
      ),
    },
    equation: {
      numbering: mergeScalar(
        template.element_rules.equation.numbering,
        profile.elementRules.equation.numbering,
      ),
      alignment: mergeScalar(
        template.element_rules.equation.alignment,
        profile.elementRules.equation.alignment,
      ),
      reference_style: mergeScalar(
        template.element_rules.equation.reference_style,
        profile.elementRules.equation.reference_style,
      ),
      numbering_format: mergeScalar(
        template.element_rules.equation.numbering_format,
        profile.elementRules.equation.numbering_format,
      ),
      label_prefix: mergeScalar(
        template.element_rules.equation.label_prefix,
        profile.elementRules.equation.label_prefix,
      ),
    },
    table: {
      caption_position: mergeScalar(
        template.element_rules.table.caption_position,
        profile.elementRules.table.caption_position,
      ),
      allow_vertical_lines: mergeScalar(
        template.element_rules.table.allow_vertical_lines,
        profile.elementRules.table.allow_vertical_lines,
      ),
      numbering: mergeScalar(
        template.element_rules.table.numbering,
        profile.elementRules.table.numbering,
      ),
      source_note_required: mergeScalar(
        template.element_rules.table.source_note_required,
        profile.elementRules.table.source_note_required,
      ),
      note_position: mergeScalar(
        template.element_rules.table.note_position,
        profile.elementRules.table.note_position,
      ),
      numbering_format: mergeScalar(
        template.element_rules.table.numbering_format,
        profile.elementRules.table.numbering_format,
      ),
      label: mergeScalar(template.element_rules.table.label, profile.elementRules.table.label),
    },
    figure: {
      caption_position: mergeScalar(
        template.element_rules.figure.caption_position,
        profile.elementRules.figure.caption_position,
      ),
      numbering: mergeScalar(
        template.element_rules.figure.numbering,
        profile.elementRules.figure.numbering,
      ),
      source_note_required: mergeScalar(
        template.element_rules.figure.source_note_required,
        profile.elementRules.figure.source_note_required,
      ),
      note_position: mergeScalar(
        template.element_rules.figure.note_position,
        profile.elementRules.figure.note_position,
      ),
      numbering_format: mergeScalar(
        template.element_rules.figure.numbering_format,
        profile.elementRules.figure.numbering_format,
      ),
      label: mergeScalar(template.element_rules.figure.label, profile.elementRules.figure.label),
    },
    caption: {
      prefix_style: mergeScalar(
        template.element_rules.caption.prefix_style,
        profile.elementRules.caption.prefix_style,
      ),
      separator: mergeScalar(
        template.element_rules.caption.separator,
        profile.elementRules.caption.separator,
      ),
      font_style: mergeScalar(
        template.element_rules.caption.font_style,
        profile.elementRules.caption.font_style,
      ),
    },
    citation: {
      numbering: mergeScalar(
        template.element_rules.citation.numbering,
        profile.elementRules.citation.numbering,
      ),
      inline_style: mergeScalar(
        template.element_rules.citation.inline_style,
        profile.elementRules.citation.inline_style,
      ),
    },
    reference_list: {
      numbering: mergeScalar(
        template.element_rules.reference_list.numbering,
        profile.elementRules.reference_list.numbering,
      ),
      ordering: mergeScalar(
        template.element_rules.reference_list.ordering,
        profile.elementRules.reference_list.ordering,
      ),
      heading_title: mergeScalar(
        template.element_rules.reference_list.heading_title,
        profile.elementRules.reference_list.heading_title,
      ),
      require_cited_only: mergeScalar(
        template.element_rules.reference_list.require_cited_only,
        profile.elementRules.reference_list.require_cited_only,
      ),
      doi_policy: mergeScalar(
        template.element_rules.reference_list.doi_policy,
        profile.elementRules.reference_list.doi_policy,
      ),
    },
  };

  const warnings = [
    `Se resolvieron reglas editoriales efectivas usando el perfil ${profile.key}.`,
    profile.rationale,
  ];

  return {
    profileKey: profile.key,
    profileLabel: profile.label,
    warnings,
    effectiveRules,
  };
}
