import {
  DegreeLevel,
  ProjectStatus,
  TemplateKey,
  TopicOriginType,
  University,
} from "@prisma/client";

import { getProjectPresetById } from "@/lib/project-presets";
import { getProjectTemplateKeyForUniversity } from "@/lib/peru-universities";

export type CreateProjectInput = {
  catalogTopicId?: string;
  customIdeaText?: string;
  title: string;
  degreeLevel: DegreeLevel;
  university: University;
  program: string;
  templateKey: TemplateKey;
  topicAreaId?: string;
  topicAreaLabel?: string;
  topicOriginType: TopicOriginType;
};

export type IntakeInput = {
  topic: string;
  problemContext?: string;
  researchLine?: string;
  academicConstraints?: string;
  targetPopulation?: string;
  availableData?: string;
  preferredMethodology?: string;
  advisorNotes?: string;
};

const DEGREE_LEVEL_VALUES = new Set(Object.values(DegreeLevel));
const UNIVERSITY_VALUES = new Set(Object.values(University));
const TEMPLATE_KEY_VALUES = new Set(Object.values(TemplateKey));

function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.replace(/\u0000/g, "").trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeRequiredText(value: unknown, fieldName: string) {
  if (typeof value !== "string") {
    throw new Error(`El campo ${fieldName} es obligatorio.`);
  }

  const normalized = value.replace(/\u0000/g, "").trim();

  if (normalized.length === 0) {
    throw new Error(`El campo ${fieldName} es obligatorio.`);
  }

  return normalized;
}

export function parseCreateProjectInput(raw: unknown): CreateProjectInput {
  if (!raw || typeof raw !== "object") {
    throw new Error("Payload invalido para crear proyecto.");
  }

  const payload = raw as Record<string, unknown>;
  const catalogTopicId = normalizeOptionalText(payload.catalogTopicId);
  const customIdeaText = normalizeOptionalText(payload.customIdeaText);
  const topicAreaId = normalizeOptionalText(payload.topicAreaId);
  const topicAreaLabel = normalizeOptionalText(payload.topicAreaLabel);
  const degreeLevel = payload.degreeLevel;
  const university = payload.university;
  const templateKey = payload.templateKey;

  if (!DEGREE_LEVEL_VALUES.has(degreeLevel as DegreeLevel)) {
    throw new Error("degreeLevel invalido.");
  }

  if (!UNIVERSITY_VALUES.has(university as University)) {
    throw new Error("university invalida.");
  }

  if (!TEMPLATE_KEY_VALUES.has(templateKey as TemplateKey)) {
    throw new Error("templateKey invalida.");
  }

  const title = normalizeRequiredText(payload.title, "title");
  const program = normalizeRequiredText(payload.program, "program");
  const expectedTemplateKey = getProjectTemplateKeyForUniversity(university as University);
  const topicOriginType = customIdeaText
    ? catalogTopicId
      ? TopicOriginType.HYBRID
      : TopicOriginType.CUSTOM
    : TopicOriginType.CATALOG;

  if (expectedTemplateKey !== (templateKey as TemplateKey)) {
    throw new Error("templateKey no coincide con la universidad seleccionada.");
  }

  if (catalogTopicId && !customIdeaText) {
    const preset = getProjectPresetById(catalogTopicId);

    if (!preset) {
      throw new Error("catalogTopicId invalido.");
    }

    if (preset.title !== title) {
      throw new Error("title no coincide con el catalogo seleccionado.");
    }

  }

  return {
    catalogTopicId: catalogTopicId ?? undefined,
    customIdeaText: customIdeaText ?? undefined,
    title,
    degreeLevel: degreeLevel as DegreeLevel,
    university: university as University,
    program,
    templateKey: templateKey as TemplateKey,
    topicAreaId: topicAreaId ?? undefined,
    topicAreaLabel: topicAreaLabel ?? undefined,
    topicOriginType,
  };
}

export function parseIntakeInput(raw: unknown): IntakeInput {
  if (!raw || typeof raw !== "object") {
    throw new Error("Payload invalido para intake.");
  }

  const payload = raw as Record<string, unknown>;

  return {
    topic: normalizeRequiredText(payload.topic, "topic"),
    problemContext: normalizeOptionalText(payload.problemContext),
    researchLine: normalizeOptionalText(payload.researchLine),
    academicConstraints: normalizeOptionalText(payload.academicConstraints),
    targetPopulation: normalizeOptionalText(payload.targetPopulation),
    availableData: normalizeOptionalText(payload.availableData),
    preferredMethodology: normalizeOptionalText(payload.preferredMethodology),
    advisorNotes: normalizeOptionalText(payload.advisorNotes),
  };
}

export function resolveProjectStatusFromIntake(input: IntakeInput) {
  const minimumReady =
    input.topic.trim().length > 0 &&
    Boolean(input.problemContext) &&
    Boolean(input.targetPopulation);

  return minimumReady ? ProjectStatus.INTAKE_READY : ProjectStatus.DRAFT;
}
