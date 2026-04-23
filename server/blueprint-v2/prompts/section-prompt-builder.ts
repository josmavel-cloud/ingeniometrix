import type {
  EvidenceLedger,
  MasterBlueprintEngineProject,
  MasterTemplateSectionRuntime,
  SectionGenerationPlanItem,
  SectionPromptManifestItem,
} from "@/server/blueprint-v2/types";
import { clipText } from "@/server/blueprint-v2/utils";

function formatEvidenceSnippet(text: string) {
  return clipText(text, 700) ?? "";
}

export function buildSectionPrompt(input: {
  project: MasterBlueprintEngineProject;
  section: SectionGenerationPlanItem;
  templateSection: MasterTemplateSectionRuntime | undefined;
  evidenceLedger: EvidenceLedger;
  priorSections: Array<{ section_key: string; title: string; content: string }>;
  manifestItem: Omit<SectionPromptManifestItem, "prompt">;
}) {
  const evidenceLines = input.manifestItem.evidence_snippet_ids
    .map((snippetId) => input.evidenceLedger.snippets.find((snippet) => snippet.snippet_id === snippetId))
    .filter((snippet): snippet is NonNullable<typeof snippet> => Boolean(snippet))
    .map(
      (snippet, index) =>
        [
          `Evidencia ${index + 1}:`,
          `origen: ${snippet.origin}`,
          `label: ${snippet.label}`,
          `texto: ${formatEvidenceSnippet(snippet.text)}`,
        ].join("\n"),
    )
    .join("\n\n");
  const assetLines = input.manifestItem.supporting_source_ids
    .flatMap((sourceId) =>
      input.evidenceLedger.evidence_packs
        .filter((pack) => pack.source_id === sourceId)
        .flatMap((pack) => pack.assets),
    )
    .slice(0, 6)
    .map(
      (asset, index) =>
        [
          `Elemento PDF ${index + 1}:`,
          `kind: ${asset.kind}`,
          `title: ${asset.title}`,
          `caption: ${asset.caption ?? "NO_DISPONIBLE"}`,
          `text_content: ${formatEvidenceSnippet(asset.text_content ?? "") || "NO_DISPONIBLE"}`,
          `page_number: ${asset.page_number ?? "NO_DISPONIBLE"}`,
          `origin: ${asset.extraction_origin}`,
        ].join("\n"),
    )
    .join("\n\n");
  const priorSectionBlock = input.priorSections
    .map((section) => `${section.title}:\n${clipText(section.content, 900) ?? section.content}`)
    .join("\n\n");

  return `
Eres Ingeniometrix. Debes redactar SOLO la seccion indicada de un plan de tesis de posgrado en espanol, usando como contrato la plantilla maestra del sistema.

Reglas:
- no inventes citas
- no inventes datos
- no inventes resultados
- si la evidencia no alcanza, escribe una version prudente y explicita la incertidumbre dentro del contenido
- usa texto academico claro y util para un plan de tesis
- no menciones porcentajes de procedencia ni metadatos del engine
- si hay evidencia desde PDF, priorizala frente a metadata superficial
- si hay material solo de websearch, usalo como apoyo contextual prudente, no como afirmacion academica fuerte
- puedes usar intake y assumptions operativas solo cuando sea necesario
- no trasplantes frases literales de abstracts ajenos al contexto del proyecto
- si una fuente pertenece a otro pais, sector o poblacion, usala solo como antecedente comparativo y no como descripcion del problema propio del proyecto
- para problem_statement y methodology, sintetiza primero el caso del intake y solo despues integra antecedentes compatibles
- para preguntas de investigacion, formula preguntas investigables y no instrucciones del tipo "como se puede..."

Proyecto:
- titulo: ${input.project.title}
- universidad seleccionada por el usuario: ${input.project.university}
- programa: ${input.project.program}
- grado: ${input.project.degreeLevel}
- template_key del proyecto: ${input.project.templateKey}

Intake:
- topic: ${input.project.intake.topic}
- problem_context: ${input.project.intake.problemContext ?? "NO_ESPECIFICADO"}
- research_line: ${input.project.intake.researchLine ?? "NO_ESPECIFICADA"}
- academic_constraints: ${input.project.intake.academicConstraints ?? "NO_ESPECIFICADAS"}
- target_population: ${input.project.intake.targetPopulation ?? "NO_ESPECIFICADA"}
- available_data: ${input.project.intake.availableData ?? "NO_ESPECIFICADOS"}
- preferred_methodology: ${input.project.intake.preferredMethodology ?? "NO_ESPECIFICADA"}
- advisor_notes: ${input.project.intake.advisorNotes ?? "NO_ESPECIFICADAS"}

Seccion objetivo:
- section_key: ${input.section.section_key}
- title: ${input.section.title}
- phase: ${input.section.phase}
- purpose: ${input.templateSection?.purpose ?? input.section.purpose ?? "NO_ESPECIFICADO"}
- content_kind: ${input.section.content_kind}
- min_words: ${input.section.min_words ?? "NO_ESPECIFICADO"}
- max_words: ${input.section.max_words ?? "NO_ESPECIFICADO"}
- instrucciones:
${(input.section.instructions.length > 0 ? input.section.instructions : ["Redacta una version academica coherente con el plan."])
  .map((instruction) => `  - ${instruction}`)
  .join("\n")}

Dependencias previas utiles:
${priorSectionBlock || "NO_DISPONIBLE"}

Evidencia disponible para esta seccion:
${evidenceLines || "NO_DISPONIBLE"}

Elementos estructurados del PDF:
${assetLines || "NO_DISPONIBLE"}

Devuelve unicamente el contenido final de la seccion "${input.section.title}".
`.trim();
}
