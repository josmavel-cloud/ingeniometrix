import { AcademicFieldResolutionStatus, ClassificationSource, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const TAXONOMY_CODE = "FORD-2015";

export function normalizeAcademicFieldText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

type ConceptRow = {
  id: string;
  conceptCode: string;
  prefLabel: string;
  labelEs: string | null;
  altLabelsJson: unknown;
  normalizedSearchText: string | null;
  parent: { conceptCode: string } | null;
  scheme: { code: string; version: string | null };
};

export type AcademicFieldResolution = {
  topicAreaId: string | null;
  topicAreaLabel: string;
  canonicalAreaId: string | null;
  canonicalAreaLabel: string | null;
  conceptId: string | null;
  taxonomyCode: string;
  taxonomyVersion: string | null;
  parentCode: string | null;
  source: "catalog" | "custom";
  resolutionStatus: AcademicFieldResolutionStatus;
  submittedLabel: string;
  normalizedSubmittedLabel: string;
  matchedAlias: string | null;
  confidence: "high" | "low";
};

function aliases(concept: ConceptRow) {
  return Array.isArray(concept.altLabelsJson)
    ? concept.altLabelsJson.filter((value): value is string => typeof value === "string")
    : [];
}

function displayLabel(concept: ConceptRow) {
  return concept.labelEs?.trim() || concept.prefLabel;
}

function exactMatch(concept: ConceptRow, rawCode: string | null, normalizedLabel: string) {
  if (rawCode && concept.conceptCode.toLowerCase() === rawCode.toLowerCase()) {
    return { matchedAlias: null as string | null, byCode: true };
  }
  const labels = [displayLabel(concept), concept.prefLabel, ...aliases(concept)];
  const matched = labels.find((label) => normalizeAcademicFieldText(label) === normalizedLabel);
  return matched ? { matchedAlias: matched === displayLabel(concept) ? null : matched, byCode: false } : null;
}

async function fordConcepts(): Promise<ConceptRow[]> {
  return prisma.taxonomyConcept.findMany({
    where: { scheme: { code: TAXONOMY_CODE }, isActive: true },
    include: { parent: { select: { conceptCode: true } }, scheme: { select: { code: true, version: true } } },
    orderBy: { conceptCode: "asc" },
  });
}

function canonicalResolution(concept: ConceptRow, submittedLabel: string, matchedAlias: string | null): AcademicFieldResolution {
  const label = displayLabel(concept);
  return {
    topicAreaId: concept.conceptCode,
    topicAreaLabel: label,
    canonicalAreaId: concept.conceptCode,
    canonicalAreaLabel: label,
    conceptId: concept.id,
    taxonomyCode: concept.scheme.code,
    taxonomyVersion: concept.scheme.version,
    parentCode: concept.parent?.conceptCode ?? null,
    source: "catalog",
    resolutionStatus: AcademicFieldResolutionStatus.CANONICAL,
    submittedLabel,
    normalizedSubmittedLabel: normalizeAcademicFieldText(submittedLabel),
    matchedAlias,
    confidence: "high",
  };
}

function customResolution(submittedLabel: string, version: string | null): AcademicFieldResolution {
  return {
    topicAreaId: null,
    topicAreaLabel: submittedLabel,
    canonicalAreaId: null,
    canonicalAreaLabel: null,
    conceptId: null,
    taxonomyCode: TAXONOMY_CODE,
    taxonomyVersion: version,
    parentCode: null,
    source: "custom",
    resolutionStatus: AcademicFieldResolutionStatus.CUSTOM_UNRESOLVED,
    submittedLabel,
    normalizedSubmittedLabel: normalizeAcademicFieldText(submittedLabel),
    matchedAlias: null,
    confidence: "low",
  };
}

export async function listTopicAreaSuggestions(query?: string) {
  const concepts = await fordConcepts();
  const normalizedQuery = normalizeAcademicFieldText(query ?? "");
  return concepts
    .map((concept) => {
      const label = displayLabel(concept);
      const search = concept.normalizedSearchText || normalizeAcademicFieldText([concept.conceptCode, label, concept.prefLabel, ...aliases(concept)].join(" "));
      let score = normalizedQuery ? 0 : concept.parent ? 5 : 1;
      if (normalizedQuery) {
        if (concept.conceptCode.toLowerCase() === normalizedQuery) score = 100;
        else if (normalizeAcademicFieldText(label) === normalizedQuery) score = 95;
        else if (aliases(concept).some((alias) => normalizeAcademicFieldText(alias) === normalizedQuery)) score = 90;
        else if (search.includes(normalizedQuery)) score = 50;
        else score = normalizedQuery.split(" ").filter((token) => token.length > 2 && search.includes(token)).length * 8;
      }
      return {
        label,
        canonicalAreaId: concept.conceptCode,
        canonicalAreaLabel: label,
        code: concept.conceptCode,
        parentCode: concept.parent?.conceptCode ?? null,
        taxonomyVersion: concept.scheme.version,
        source: "catalog" as const,
        score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label, "es"))
    .slice(0, normalizedQuery ? 12 : 60)
    .map(({ score: _score, ...item }) => item);
}

export async function resolveAcademicField(input: { topicAreaId?: string | null; topicAreaLabel?: string | null }) {
  const submittedLabel = input.topicAreaLabel?.trim() || input.topicAreaId?.trim() || "";
  if (!submittedLabel) return null;
  const concepts = await fordConcepts();
  const normalized = normalizeAcademicFieldText(submittedLabel);
  const requestedCode = input.topicAreaId?.trim();
  if (requestedCode) {
    const byCode = concepts.find((concept) => concept.conceptCode.toLowerCase() === requestedCode.toLowerCase());
    if (byCode) return canonicalResolution(byCode, submittedLabel, null);
  }
  for (const concept of concepts) {
    const match = exactMatch(concept, null, normalized);
    if (match) return canonicalResolution(concept, submittedLabel, match.matchedAlias);
  }
  return customResolution(submittedLabel, concepts[0]?.scheme.version ?? null);
}

// Compatibility name: resolution is read-only and never mutates the canonical catalog.
export async function resolveAndRecordTopicArea(input: { topicAreaId?: string | null; topicAreaLabel?: string | null }) {
  const resolved = await resolveAcademicField(input);
  return resolved ?? {
    topicAreaId: null,
    topicAreaLabel: null,
    canonicalAreaId: null,
    canonicalAreaLabel: null,
    conceptId: null,
    taxonomyCode: TAXONOMY_CODE,
    taxonomyVersion: null,
    parentCode: null,
    source: "custom" as const,
    resolutionStatus: AcademicFieldResolutionStatus.CUSTOM_UNRESOLVED,
    submittedLabel: "",
    normalizedSubmittedLabel: "",
    matchedAlias: null,
    confidence: "low" as const,
  };
}

export async function normalizeTopicAreaInRealTime(rawLabel: string) {
  return resolveAcademicField({ topicAreaLabel: rawLabel });
}

export async function assignPrimaryAcademicField(
  tx: Prisma.TransactionClient,
  projectId: string,
  resolution: AcademicFieldResolution | null,
) {
  if (!resolution) return null;
  const existing = await tx.projectKnowledgeField.findFirst({
    where: resolution.conceptId
      ? { projectId, conceptId: resolution.conceptId }
      : { projectId, conceptId: null, normalizedSubmittedLabel: resolution.normalizedSubmittedLabel },
    select: { id: true },
  });
  await tx.projectKnowledgeField.updateMany({ where: { projectId, isPrimary: true }, data: { isPrimary: false } });
  const data = {
      projectId,
      conceptId: resolution.conceptId,
      isPrimary: true,
      source: ClassificationSource.USER,
      resolutionStatus: resolution.resolutionStatus,
      submittedLabel: resolution.submittedLabel,
      normalizedSubmittedLabel: resolution.normalizedSubmittedLabel,
      customLabel: resolution.resolutionStatus === AcademicFieldResolutionStatus.CUSTOM_UNRESOLVED ? resolution.submittedLabel : null,
      matchedAlias: resolution.matchedAlias,
      taxonomyCodeSnapshot: resolution.taxonomyCode,
      taxonomyVersionSnapshot: resolution.taxonomyVersion,
      confidence: resolution.confidence === "high" ? 1 : null,
      evidenceJson: {
        source: "USER_SELECTION",
        canonicalCode: resolution.canonicalAreaId,
        parentCode: resolution.parentCode,
      },
    } satisfies Prisma.ProjectKnowledgeFieldUncheckedCreateInput;
  return existing
    ? tx.projectKnowledgeField.update({ where: { id: existing.id }, data })
    : tx.projectKnowledgeField.create({ data });
}
