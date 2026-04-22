import type { LoadedTemplateVersionRuntime } from "@/server/reporting/template-runtime/load-template-version";
import type {
  SyntheticSectionNode,
  SyntheticTemplateDocument,
} from "@/server/reporting/synthetic-document-types";

function collectSemanticKeys(sections: SyntheticSectionNode[], keys: string[] = []) {
  for (const section of sections) {
    if (section.semantic_key) {
      keys.push(section.semantic_key);
    }

    collectSemanticKeys(section.children, keys);
  }

  return keys;
}

function collectBlocks(sections: SyntheticSectionNode[]) {
  const blocks: Array<SyntheticSectionNode["blocks"][number]> = [];

  for (const section of sections) {
    blocks.push(...section.blocks);
    blocks.push(...collectBlocks(section.children));
  }

  return blocks;
}

export function validateSyntheticDocument(input: {
  runtime: LoadedTemplateVersionRuntime;
  document: SyntheticTemplateDocument;
}) {
  const { runtime, document } = input;
  const errors: string[] = [];
  const warnings = [...document.warnings];
  const blocks = collectBlocks(document.sections);

  if (!document.synthetic_flags.synthetic || !document.synthetic_flags.for_testing_only) {
    errors.push("El documento sintetico debe marcarse explicitamente como contenido de prueba.");
  }

  if (document.sections.length === 0) {
    errors.push("El documento sintetico debe contener al menos una seccion principal.");
  }

  if (
    runtime.templateCandidate.validations.requires_logo &&
    !document.cover.fields.some((field) => field.key === "institution_logo" && field.value)
  ) {
    errors.push("La plantilla requiere logo y el documento sintetico no lo incluyo en portada.");
  }

  if (
    runtime.templateCandidate.validations.requires_references &&
    document.references.length === 0
  ) {
    errors.push("La plantilla requiere referencias y el documento sintetico no genero ninguna.");
  }

  const generatedKeys = new Set(collectSemanticKeys(document.sections));
  for (const requiredKey of runtime.templateCandidate.validations.required_section_keys) {
    if (!generatedKeys.has(requiredKey) && requiredKey !== "annexes") {
      warnings.push(`No se detecto la seccion requerida ${requiredKey} en el documento sintetico.`);
    }
  }

  const figureBlocks = blocks.filter((block) => block.kind === "figure");
  const tableBlocks = blocks.filter((block) => block.kind === "table");
  const equationBlocks = blocks.filter((block) => block.kind === "equation");

  for (const figureBlock of figureBlocks) {
    if (!figureBlock.figure?.caption?.title) {
      errors.push("Toda figura sintetica debe incluir caption.");
    }
  }

  for (const tableBlock of tableBlocks) {
    if (!tableBlock.table?.caption?.title) {
      errors.push("Toda tabla sintetica debe incluir caption.");
    }
  }

  if (runtime.effectiveElementRules.equation.numbering) {
    for (const equationBlock of equationBlocks) {
      if (!equationBlock.equation?.label) {
        errors.push("La regla editorial efectiva exige numeracion de ecuaciones y falta un label.");
      }
    }
  }

  if (
    runtime.effectiveElementRules.reference_list.heading_title &&
    !document.sections.some(
      (section) => section.semantic_key === "references" || section.title === runtime.effectiveElementRules.reference_list.heading_title,
    )
  ) {
    warnings.push("No se detecto una seccion final explicita de referencias en el documento sintetico.");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: Array.from(new Set(warnings)),
  };
}
