import { normalizeTitle } from "@/lib/text";
import type {
  MasterBlueprintEngineProject,
  BlueprintSourceRecord,
  SourceIntakeGateResult,
} from "@/server/blueprint-v2/types";

const MINIMUM_REQUIRED_SOURCES = 3;

function buildSelectedSourceRecord(
  item: MasterBlueprintEngineProject["projectReferences"][number],
): BlueprintSourceRecord {
  const rawOpenAlex =
    item.reference.rawOpenAlexJson &&
    typeof item.reference.rawOpenAlexJson === "object" &&
    !Array.isArray(item.reference.rawOpenAlexJson)
      ? (item.reference.rawOpenAlexJson as Record<string, unknown>)
      : null;
  const bestOaLocation =
    rawOpenAlex &&
    typeof rawOpenAlex.best_oa_location === "object" &&
    rawOpenAlex.best_oa_location !== null
      ? (rawOpenAlex.best_oa_location as Record<string, unknown>)
      : null;
  const primaryLocation =
    rawOpenAlex &&
    typeof rawOpenAlex.primary_location === "object" &&
    rawOpenAlex.primary_location !== null
      ? (rawOpenAlex.primary_location as Record<string, unknown>)
      : null;

  return {
    source_id: item.reference.id,
    reference_id: item.reference.id,
    origin: "selected_source",
    label: "Fuente seleccionada por el usuario",
    title: item.reference.title,
    normalized_title: normalizeTitle(item.reference.title),
    doi: item.reference.doi ?? null,
    authors: Array.isArray(item.reference.authorsJson)
      ? item.reference.authorsJson.filter(
          (author): author is string => typeof author === "string" && author.trim().length > 0,
        )
      : [],
    year: item.reference.year ?? null,
    venue: item.reference.venue ?? null,
    abstract: item.reference.abstract ?? null,
    landing_page_url: item.reference.landingPageUrl ?? null,
    pdf_url:
      (typeof bestOaLocation?.pdf_url === "string" && bestOaLocation.pdf_url) ||
      (typeof primaryLocation?.pdf_url === "string" && primaryLocation.pdf_url) ||
      null,
    query: null,
    snippet: null,
    selected_order: item.selectedOrder ?? null,
    citation_count: item.reference.citationCount ?? null,
    is_open_access: Boolean(
      bestOaLocation?.pdf_url ||
        primaryLocation?.pdf_url ||
        item.reference.landingPageUrl ||
        item.reference.doi,
    ),
    raw_openalex_json: item.reference.rawOpenAlexJson,
    raw_crossref_json: item.reference.rawCrossrefJson,
    eligible_for_formal_reference: true,
  };
}

export function runSourceIntakeGate(
  project: MasterBlueprintEngineProject,
): SourceIntakeGateResult {
  const selectedSources = project.projectReferences
    .slice()
    .sort((left, right) => (left.selectedOrder ?? 999) - (right.selectedOrder ?? 999))
    .map(buildSelectedSourceRecord);
  const coverageWarnings: string[] = [];
  const abstractCount = selectedSources.filter((source) => source.abstract?.trim()).length;
  const pdfCount = selectedSources.filter((source) => source.pdf_url?.trim()).length;

  if (abstractCount < Math.min(selectedSources.length, 2)) {
    coverageWarnings.push(
      "Hay pocas fuentes seleccionadas con abstract disponible; conviene complementar evidencia antes de redactar.",
    );
  }

  if (pdfCount === 0) {
    coverageWarnings.push(
      "No se detectaron PDFs publicos en las fuentes seleccionadas. El run seguira con metadata y abstracts donde alcance.",
    );
  }

  return {
    minimum_required_sources: MINIMUM_REQUIRED_SOURCES,
    selected_source_count: selectedSources.length,
    missing_source_count: Math.max(0, MINIMUM_REQUIRED_SOURCES - selectedSources.length),
    fallback_required: selectedSources.length < MINIMUM_REQUIRED_SOURCES || coverageWarnings.length > 0,
    coverage_warnings: coverageWarnings,
    selected_sources: selectedSources,
  };
}
