import type { CanonicalReferenceEntry } from "@/server/reporting/canonical-report-types";
import type { ResearchBlueprintRecord } from "@/server/blueprint/blueprint-types";

type SelectedReferenceSnapshot = {
  reference_id: string;
  title: string;
  doi?: string | null;
  authors?: unknown;
  year?: number | null;
  venue?: string | null;
};

function stringifyAuthors(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const authors = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);

  return authors.length > 0 ? authors.join(", ") : null;
}

function buildReferenceText(snapshot: SelectedReferenceSnapshot) {
  const segments = [
    stringifyAuthors(snapshot.authors),
    snapshot.year ? `(${snapshot.year}).` : null,
    snapshot.title ? `${snapshot.title}.` : null,
    snapshot.venue ? `${snapshot.venue}.` : null,
    snapshot.doi ? `DOI: ${snapshot.doi}` : null,
  ].filter((item): item is string => Boolean(item));

  return segments.length > 0 ? segments.join(" ") : snapshot.title;
}

export function buildBlueprintReferenceList(input: {
  blueprint: ResearchBlueprintRecord;
  selectedReferencesSnapshotJson: unknown;
}) {
  const selectedSnapshots = Array.isArray(input.selectedReferencesSnapshotJson)
    ? (input.selectedReferencesSnapshotJson as SelectedReferenceSnapshot[])
    : [];
  const selectedById = new Map(
    selectedSnapshots.map((item) => [item.reference_id, item] satisfies [string, SelectedReferenceSnapshot]),
  );

  return input.blueprint.references_used.map((reference) => {
    const snapshot = selectedById.get(reference.reference_id);
    return {
      id: reference.reference_id,
      text: snapshot ? buildReferenceText(snapshot) : reference.title,
      synthetic: false,
    } satisfies CanonicalReferenceEntry;
  });
}
