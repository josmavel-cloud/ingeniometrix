type ExportReferenceSnapshot = {
  reference_id: string;
  title: string;
  doi: string | null;
  authors: unknown;
  year: number | null;
  venue: string | null;
  abstract: string | null;
};

function asObjectRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeAuthors(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function buildCitationKey(input: {
  authors: string[];
  year: number | null;
  title: string;
}) {
  const leadSurname =
    input.authors[0]?.split(" ").slice(-1)[0] ??
    input.title.split(" ").find((token) => token.length >= 4) ??
    "referencia";

  return slugify(`${leadSurname}-${input.year ?? "nd"}-${input.title.split(" ").slice(0, 3).join("-")}`);
}

export function extractExportReferences(blueprintVersion: {
  selectedReferencesSnapshotJson: unknown;
  blueprintJson: unknown;
}) {
  const selectedSnapshots = asArray(blueprintVersion.selectedReferencesSnapshotJson)
    .flatMap((value) => {
      const record = asObjectRecord(value);

      if (!record) {
        return [];
      }

      if (record.eligible_for_formal_reference === false) {
        return [];
      }

      return [{
        reference_id: normalizeText(record.reference_id) ?? "",
        title: normalizeText(record.title) ?? "Referencia sin titulo",
        doi: normalizeText(record.doi),
        authors: record.authors,
        year: typeof record.year === "number" ? record.year : null,
        venue: normalizeText(record.venue),
        abstract: normalizeText(record.abstract),
      } satisfies ExportReferenceSnapshot];
    })
    .filter((value) => value.reference_id.length > 0);

  const blueprint = asObjectRecord(blueprintVersion.blueprintJson);
  const referencesUsedIds = new Set(
    asArray(blueprint?.references_used)
      .map((value) => {
        const record = asObjectRecord(value);
        return normalizeText(record?.reference_id);
      })
      .filter((value): value is string => Boolean(value)),
  );

  const preferredReferences =
    referencesUsedIds.size > 0
      ? selectedSnapshots.filter((reference) => referencesUsedIds.has(reference.reference_id))
      : selectedSnapshots;

  return preferredReferences.length > 0 ? preferredReferences : selectedSnapshots;
}

export function renderBibtex(referenceSnapshots: ExportReferenceSnapshot[]) {
  return referenceSnapshots
    .map((reference) => {
      const authors = normalizeAuthors(reference.authors);
      const entryType = reference.abstract ? "article" : "misc";
      const key = buildCitationKey({
        authors,
        year: reference.year,
        title: reference.title,
      });
      const fields = [
        `  title = {${reference.title}}`,
        authors.length > 0 ? `  author = {${authors.join(" and ")}}` : null,
        reference.year ? `  year = {${reference.year}}` : null,
        reference.venue ? `  journal = {${reference.venue}}` : null,
        reference.doi ? `  doi = {${reference.doi}}` : null,
      ].filter((value): value is string => Boolean(value));

      return `@${entryType}{${key},\n${fields.join(",\n")}\n}`;
    })
    .join("\n\n");
}

export function renderRis(referenceSnapshots: ExportReferenceSnapshot[]) {
  return referenceSnapshots
    .map((reference) => {
      const authors = normalizeAuthors(reference.authors);
      const lines = [
        "TY  - JOUR",
        ...authors.map((author) => `AU  - ${author}`),
        `TI  - ${reference.title}`,
        reference.year ? `PY  - ${reference.year}` : null,
        reference.venue ? `JO  - ${reference.venue}` : null,
        reference.doi ? `DO  - ${reference.doi}` : null,
        "ER  - ",
      ].filter((value): value is string => Boolean(value));

      return lines.join("\n");
    })
    .join("\n\n");
}

export function buildEvidenceLog(blueprintVersion: {
  id: string;
  versionNumber: number;
  model: string;
  promptVersion: string;
  intakeSnapshotJson: unknown;
  selectedReferencesSnapshotJson: unknown;
  blueprintJson: unknown;
  coherenceReportJson: unknown;
}) {
  const blueprint = asObjectRecord(blueprintVersion.blueprintJson);
  const coherence = asObjectRecord(blueprintVersion.coherenceReportJson);

  return {
    blueprintVersionId: blueprintVersion.id,
    versionNumber: blueprintVersion.versionNumber,
    model: blueprintVersion.model,
    promptVersion: blueprintVersion.promptVersion,
    generatedAt: new Date().toISOString(),
    intakeSnapshot: blueprintVersion.intakeSnapshotJson,
    selectedReferences: extractExportReferences(blueprintVersion),
    referencesUsed: asArray(blueprint?.references_used),
    citationPlan: asArray(blueprint?.citation_plan),
    antecedentSynthesis: blueprint?.antecedent_synthesis ?? null,
    assumptions: asArray(blueprint?.assumptions),
    assumptionsDetailed: asArray(blueprint?.assumptions_detailed),
    engineWarnings: asArray(blueprint?.engine_warnings),
    readinessSnapshot: blueprint?.readiness_snapshot ?? null,
    contextCompletion: blueprint?.context_completion ?? null,
    coherenceReport: coherence ?? null,
  };
}
