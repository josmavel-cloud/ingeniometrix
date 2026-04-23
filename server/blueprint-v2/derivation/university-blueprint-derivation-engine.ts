import { getConfiguredLlmProvider } from "@/llm";
import { resolveBlueprintTemplateRuntime } from "@/server/reporting/template-runtime/resolve-blueprint-template-runtime";
import type {
  MasterBlueprintEngineProject,
  MasterSectionDraft,
  UniversityBlueprintPackage,
  UniversityBlueprintSection,
} from "@/server/blueprint-v2/types";
import { clipText } from "@/server/blueprint-v2/utils";

type TemplateSectionNode = {
  title?: string | null;
  semantic_key?: string | null;
  children?: TemplateSectionNode[];
};

function flattenTemplateSectionKeys(
  sections: TemplateSectionNode[],
  entries: Array<{ title: string; semanticKey: string }> = [],
) {
  for (const section of sections) {
    const title = section.title?.trim();
    const semanticKey = section.semantic_key?.trim();

    if (title && semanticKey) {
      entries.push({ title, semanticKey });
    }

    if (Array.isArray(section.children) && section.children.length > 0) {
      flattenTemplateSectionKeys(section.children, entries);
    }
  }

  return entries;
}

function mapMasterSection(
  selectedTemplateEntry: { title: string; semanticKey: string },
  masterDrafts: MasterSectionDraft[],
) {
  const exact = masterDrafts.find(
    (draft) => draft.section_key === selectedTemplateEntry.semanticKey,
  );

  if (exact) {
    return {
      section_key: selectedTemplateEntry.semanticKey,
      title: selectedTemplateEntry.title,
      content: exact.content,
      derived_from_master_keys: [exact.section_key],
      generated_for_template: false,
    } satisfies UniversityBlueprintSection;
  }

  return null;
}

async function generateMissingSection(input: {
  title: string;
  semanticKey: string;
  project: MasterBlueprintEngineProject;
  masterDrafts: MasterSectionDraft[];
}) {
  const provider = getConfiguredLlmProvider();
  const contextBlock = input.masterDrafts
    .slice(0, 8)
    .map(
      (draft) =>
        `${draft.title}:\n${clipText(draft.content, 600) ?? draft.content}`,
    )
    .join("\n\n");

  return provider
    .generateText({
      prompt: `
Eres Ingeniometrix. Debes derivar una seccion corta para una plantilla universitaria a partir del contenido maestro existente.

Reglas:
- no inventes citas
- no inventes datos
- si el contenido maestro no alcanza, redacta una version prudente y breve
- no agregues encabezados extras

Proyecto:
- titulo: ${input.project.title}
- universidad: ${input.project.university}
- programa: ${input.project.program}

Seccion destino:
- semantic_key: ${input.semanticKey}
- title: ${input.title}

Contenido maestro disponible:
${contextBlock}

Devuelve solo el contenido final de la seccion.
`.trim(),
    })
    .catch(
      () =>
        `Seccion derivada de forma prudente a partir del blueprint maestro para ${input.project.title}.`,
    );
}

export async function deriveUniversityBlueprint(input: {
  project: MasterBlueprintEngineProject;
  masterDrafts: MasterSectionDraft[];
}): Promise<UniversityBlueprintPackage> {
  const { runtime } = await resolveBlueprintTemplateRuntime({
    projectTemplateKey: input.project.templateKey,
    projectUniversity: input.project.university,
    projectDegreeLevel: input.project.degreeLevel,
    projectProgram: input.project.program,
  });
  const templateEntries = flattenTemplateSectionKeys(
    runtime.templateCandidate.sections as TemplateSectionNode[],
  );
  const sections: UniversityBlueprintSection[] = [];
  const warnings: string[] = [];

  for (const entry of templateEntries) {
    const mapped = mapMasterSection(entry, input.masterDrafts);

    if (mapped) {
      sections.push(mapped);
      continue;
    }

    const generated = await generateMissingSection({
      title: entry.title,
      semanticKey: entry.semanticKey,
      project: input.project,
      masterDrafts: input.masterDrafts,
    });
    sections.push({
      section_key: entry.semanticKey,
      title: entry.title,
      content: generated.trim(),
      derived_from_master_keys: [],
      generated_for_template: true,
    });
    warnings.push(
      `La seccion ${entry.semanticKey} no existia de forma explicita en el MasterTemplate y fue derivada con LLM para la plantilla universitaria.`,
    );
  }

  return {
    template_key: runtime.templateKey,
    template_name: runtime.templateName,
    template_version_id: runtime.versionId,
    sections,
    warnings,
  };
}
