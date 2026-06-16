import type { DegreeLevel, Intake, Project, University } from "@prisma/client";

import intakeDraftBundleSchema from "@/ai/schemas/intake-draft-bundle.schema.json";
import {
  APP_DEFAULT_LANGUAGE,
  getLanguageInstruction,
  normalizeLanguageCode,
} from "@/lib/language";
import { getUniversityDisplayNameByCode } from "@/lib/peru-universities";
import { getConfiguredLlmProvider } from "@/llm";

export type IntakeDraft = {
  label: string;
  topic: string;
  problemContext: string;
  researchLine: string;
  academicConstraints: string;
  targetPopulation: string;
  availableData: string;
  preferredMethodology: string;
  advisorNotes: string;
};

type IntakeDraftBundle = {
  drafts: IntakeDraft[];
};

type ProjectForIntakeDraft = Pick<
  Project,
  | "id"
  | "title"
  | "degreeLevel"
  | "university"
  | "program"
  | "language"
  | "topicAreaLabel"
  | "topicSeedText"
> & {
  intake: Intake | null;
};

type GenerateIntakeDraftsInput = {
  project: ProjectForIntakeDraft;
  variantSeed?: string | null;
  existingDrafts?: IntakeDraft[];
};

function buildFallbackDrafts(input: GenerateIntakeDraftsInput): IntakeDraft[] {
  const language = normalizeLanguageCode(input.project.language) ?? APP_DEFAULT_LANGUAGE;
  const topic = input.project.intake?.topic?.trim() || input.project.title;
  const area =
    input.project.topicAreaLabel?.trim() ||
    (language === "en" ? "the selected academic area" : "el area academica seleccionada");
  const university = getUniversityDisplayNameByCode(input.project.university as University);
  const program = input.project.program;
  const labels = language === "en"
    ? ["Operational angle", "User/process angle", "Institutional angle"]
    : ["Enfoque operativo", "Enfoque usuario/proceso", "Enfoque institucional"];

  if (language === "en") {
    return labels.map((label, index) => ({
      label,
      topic,
      problemContext:
        index === 0
          ? `The project starts from a provisional concern around "${topic}" in ${program}. The concrete local evidence still needs to be confirmed with the student, so this context should be treated as an editable working hypothesis.`
          : `This intake frames "${topic}" as a researchable problem in ${area}, keeping the problem statement provisional until institutional or field data are confirmed.`,
      researchLine: area,
      academicConstraints:
        "Peruvian graduate research context; final scope, citation style, advisor requirements, and template constraints must be confirmed before drafting formal outputs.",
      targetPopulation:
        "Pending confirmation by the student; use the people, organizations, records, or cases directly affected by the selected topic as the initial unit of analysis.",
      availableData:
        "No verified dataset has been declared yet. Candidate data sources must be confirmed before using them as evidence.",
      preferredMethodology:
        index === 2
          ? "Qualitative or mixed design, to be selected after source review and data availability checks."
          : "Applied, descriptive or correlational design, pending validation against available data and advisor guidance.",
      advisorNotes:
        `Generated as an editable intake draft for ${university}. Assumptions are provisional and must not be treated as verified findings.`,
    }));
  }

  return labels.map((label, index) => ({
    label,
    topic,
    problemContext:
      index === 0
        ? `El proyecto parte de una preocupacion provisional sobre "${topic}" en ${program}. La evidencia local concreta aun debe confirmarse con el estudiante, por lo que este contexto debe tratarse como una hipotesis de trabajo editable.`
        : `Este intake enmarca "${topic}" como un problema investigable en ${area}, manteniendo el planteamiento como provisional hasta confirmar datos institucionales o de campo.`,
    researchLine: area,
    academicConstraints:
      "Contexto de investigacion de posgrado en Peru; el alcance final, estilo de citacion, requisitos del asesor y restricciones de plantilla deben confirmarse antes de redactar salidas formales.",
    targetPopulation:
      "Pendiente de confirmacion por el estudiante; usar como unidad inicial de analisis a las personas, organizaciones, registros o casos directamente afectados por el tema seleccionado.",
    availableData:
      "Aun no se ha declarado un conjunto de datos verificado. Las fuentes candidatas deben confirmarse antes de usarlas como evidencia.",
    preferredMethodology:
      index === 2
        ? "Diseno cualitativo o mixto, a elegir despues de revisar fuentes y disponibilidad real de datos."
        : "Diseno aplicado, descriptivo o correlacional, pendiente de validacion con datos disponibles y orientacion del asesor.",
    advisorNotes:
      `Generado como borrador editable de intake para ${university}. Los supuestos son provisionales y no deben tratarse como hallazgos verificados.`,
  }));
}

function sanitizeDraft(draft: IntakeDraft, fallbackTopic: string): IntakeDraft {
  return {
    label: draft.label?.trim() || "Draft",
    topic: draft.topic?.trim() || fallbackTopic,
    problemContext: draft.problemContext?.trim() || "",
    researchLine: draft.researchLine?.trim() || "",
    academicConstraints: draft.academicConstraints?.trim() || "",
    targetPopulation: draft.targetPopulation?.trim() || "",
    availableData: draft.availableData?.trim() || "",
    preferredMethodology: draft.preferredMethodology?.trim() || "",
    advisorNotes: draft.advisorNotes?.trim() || "",
  };
}

function formatExistingDrafts(drafts: IntakeDraft[] | undefined) {
  if (!drafts?.length) {
    return "- No prior drafts in this request.";
  }

  return drafts
    .slice(0, 5)
    .map((draft, index) => `${index + 1}. ${draft.label}: ${draft.problemContext}`)
    .join("\n");
}

export async function generateIntakeDrafts(input: GenerateIntakeDraftsInput) {
  const language = normalizeLanguageCode(input.project.language) ?? APP_DEFAULT_LANGUAGE;
  const topic = input.project.intake?.topic?.trim() || input.project.title;
  const currentIntake = input.project.intake;
  const existingDrafts = formatExistingDrafts(input.existingDrafts);

  try {
    const provider = getConfiguredLlmProvider();
    const bundle = await provider.generateStructuredObject<IntakeDraftBundle>({
      model: process.env.LLM_FAST_MODEL?.trim() || "gpt-5.4-mini",
      schemaName: "intake_draft_bundle",
      schema: intakeDraftBundleSchema as Record<string, unknown>,
      trackingLabel: "project:intake-drafts",
      prompt: `
Act as an ethical academic research intake assistant for Ingeniometrix.

${getLanguageInstruction(language)}

Goal:
Generate 3 complete, editable intake drafts from the selected project topic. The drafts should help the user clarify the project before searching sources, not write the thesis for them.

Rules:
- Never invent citations, data, measurements, findings, or field results.
- If data, population, constraints, or access are not known, state that they are pending confirmation.
- Keep each field useful and concise.
- Do not automate thesis completion or present assumptions as facts.
- Make the three drafts meaningfully different so the user can iterate.
- Preserve the user's selected topic unless a minor clarity edit is necessary.

Project context:
- topic: ${topic}
- seed text: ${input.project.topicSeedText ?? "Not provided"}
- current problem context: ${currentIntake?.problemContext ?? "Not provided"}
- current target population: ${currentIntake?.targetPopulation ?? "Not provided"}
- area: ${input.project.topicAreaLabel ?? "Not provided"}
- degree level: ${input.project.degreeLevel as DegreeLevel}
- university: ${getUniversityDisplayNameByCode(input.project.university)}
- program: ${input.project.program}
- requested variant seed: ${input.variantSeed?.trim() || "Create a fresh intake alternative."}

Prior drafts to avoid repeating too closely:
${existingDrafts}

Return only the structured JSON object.
      `.trim(),
    });

    const drafts = bundle.drafts
      .slice(0, 3)
      .map((draft) => sanitizeDraft(draft, topic))
      .filter(
        (draft) =>
          draft.topic &&
          draft.problemContext &&
          draft.targetPopulation &&
          draft.researchLine,
      );

    if (drafts.length > 0) {
      return { drafts };
    }
  } catch {
    // Fall back below so the intake flow remains usable without blocking the user.
  }

  return {
    drafts: buildFallbackDrafts(input),
  };
}
