export type CanonicalEvidenceCitationCategory =
  | "direct_quote_from_source_text"
  | "paraphrase_from_source_text"
  | "asset_reference"
  | "interpreted_signal"
  | "metadata_context"
  | "intake_context"
  | "not_citable";

export type ContractCitationEligibility =
  | "direct_quote"
  | "paraphrase_only"
  | "asset_reference"
  | "not_citable";

export type LabACitationEligibility =
  | "direct_quote"
  | "paraphrase_only"
  | "asset_reference"
  | "context_only";

export type LabAEvidenceUnitType =
  | "original_excerpt"
  | "interpreted_signal"
  | "table"
  | "equation"
  | "image"
  | "metadata_context"
  | "intake_context";

export type CitationSemanticsInput = {
  evidence_id?: string | null;
  snippet_id?: string | null;
  source_id?: string | null;
  unit_type?: string | null;
  extraction_kind?: string | null;
  label?: string | null;
  original_text?: string | null;
  source_chunk_id?: string | null;
  source_input_mode?: string | null;
  source_access_status?: string | null;
  citation_eligibility?: string | null;
  page_start?: number | null;
  char_start?: number | null;
  quote_hash?: string | null;
};

export type CitationSemanticsSummary = {
  reported_direct_quote_count: number;
  true_source_backed_direct_quote_count: number;
  metadata_context_count: number;
  intake_context_count: number;
  citation_semantics_warnings: string[];
};

function normalizedText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function hasMeaningfulText(value: string | null | undefined) {
  return Boolean(value?.trim() && value.trim().length >= 12);
}

function isIntakeLike(input: CitationSemanticsInput) {
  const joined = normalizedText(
    [
      input.evidence_id,
      input.snippet_id,
      input.source_id,
      input.unit_type,
      input.extraction_kind,
      input.label,
    ].join(" "),
  );

  return /\bintake\b|project-context|contexto declarado|tema del intake/.test(joined);
}

function isMetadataLike(input: CitationSemanticsInput) {
  const joined = normalizedText(
    [
      input.evidence_id,
      input.snippet_id,
      input.unit_type,
      input.extraction_kind,
      input.label,
    ].join(" "),
  );

  return /\bmetadata\b|\bmeta\b|\btitle\b|\btitulo\b|titulo de la fuente|source title/.test(joined);
}

function isSourceTextExtractionKind(value: string | null | undefined) {
  return value === "original_excerpt" || value === "llm_selected_original";
}

function isSourceTextExtractionKindOrLegacyMissing(input: CitationSemanticsInput) {
  if (isSourceTextExtractionKind(input.extraction_kind)) {
    return true;
  }

  return !input.extraction_kind && input.citation_eligibility === "direct_quote";
}

function isOriginalUnitType(value: string | null | undefined) {
  return value === "original_excerpt";
}

function isMetadataOnlyOrUnresolved(input: CitationSemanticsInput) {
  const inputMode = normalizedText(input.source_input_mode);
  const accessStatus = normalizedText(input.source_access_status);
  return (
    inputMode === "abstract_metadata" ||
    inputMode === "metadata" ||
    inputMode === "abstract_only" ||
    accessStatus === "metadata_only" ||
    accessStatus === "unresolved" ||
    accessStatus === "abstract_only"
  );
}

function hasChunkBackedSourceText(input: CitationSemanticsInput) {
  const chunkId = input.source_chunk_id ?? "";
  const evidenceId = input.evidence_id ?? input.snippet_id ?? "";

  if (chunkId.trim().length > 0) {
    return true;
  }

  return /(?:^|-)chunk-|(?:^|-)llm-chunk-/.test(evidenceId);
}

export function classifyEvidenceCitation(
  input: CitationSemanticsInput,
): CanonicalEvidenceCitationCategory {
  const unitType = input.unit_type ?? null;
  const extractionKind = input.extraction_kind ?? null;

  if (unitType === "table" || unitType === "equation" || unitType === "image") {
    return "asset_reference";
  }

  if (isIntakeLike(input)) {
    return "intake_context";
  }

  if (isMetadataLike(input) || isMetadataOnlyOrUnresolved(input)) {
    return "metadata_context";
  }

  if (unitType === "interpreted_signal" || extractionKind === "interpreted_signal") {
    return "interpreted_signal";
  }

  if (
    isOriginalUnitType(unitType) &&
    isSourceTextExtractionKindOrLegacyMissing(input) &&
    hasChunkBackedSourceText(input) &&
    hasMeaningfulText(input.original_text) &&
    input.quote_hash
  ) {
    return "direct_quote_from_source_text";
  }

  if (
    isOriginalUnitType(unitType) &&
    hasChunkBackedSourceText(input) &&
    hasMeaningfulText(input.original_text)
  ) {
    return "paraphrase_from_source_text";
  }

  return "not_citable";
}

export function citationCategoryToContractEligibility(
  category: CanonicalEvidenceCitationCategory,
): ContractCitationEligibility {
  if (category === "direct_quote_from_source_text") return "direct_quote";
  if (category === "paraphrase_from_source_text" || category === "interpreted_signal") {
    return "paraphrase_only";
  }
  if (category === "asset_reference") return "asset_reference";
  return "not_citable";
}

export function citationCategoryToLabAEligibility(
  category: CanonicalEvidenceCitationCategory,
): LabACitationEligibility {
  if (category === "direct_quote_from_source_text") return "direct_quote";
  if (category === "paraphrase_from_source_text" || category === "interpreted_signal") {
    return "paraphrase_only";
  }
  if (category === "asset_reference") return "asset_reference";
  return "context_only";
}

export function citationCategoryToLabAUnitType(
  category: CanonicalEvidenceCitationCategory,
  fallbackUnitType: LabAEvidenceUnitType,
): LabAEvidenceUnitType {
  if (category === "metadata_context") return "metadata_context";
  if (category === "intake_context") return "intake_context";
  return fallbackUnitType;
}

export function isTrueSourceBackedDirectQuote(input: CitationSemanticsInput) {
  return classifyEvidenceCitation(input) === "direct_quote_from_source_text";
}

export function summarizeCitationSemantics(
  units: CitationSemanticsInput[],
): CitationSemanticsSummary {
  let reportedDirectQuoteCount = 0;
  let trueSourceBackedDirectQuoteCount = 0;
  let metadataContextCount = 0;
  let intakeContextCount = 0;
  let downgradedCount = 0;

  for (const unit of units) {
    const category = classifyEvidenceCitation(unit);
    const reportedDirect = unit.citation_eligibility === "direct_quote";

    if (reportedDirect) {
      reportedDirectQuoteCount += 1;
    }

    if (category === "direct_quote_from_source_text") {
      trueSourceBackedDirectQuoteCount += 1;
    }

    if (category === "metadata_context") {
      metadataContextCount += 1;
    }

    if (category === "intake_context") {
      intakeContextCount += 1;
    }

    if (reportedDirect && category !== "direct_quote_from_source_text") {
      downgradedCount += 1;
    }
  }

  return {
    reported_direct_quote_count: reportedDirectQuoteCount,
    true_source_backed_direct_quote_count: trueSourceBackedDirectQuoteCount,
    metadata_context_count: metadataContextCount,
    intake_context_count: intakeContextCount,
    citation_semantics_warnings:
      downgradedCount > 0
        ? [
            `${downgradedCount} reported direct_quote unit(s) are metadata/intake/non-source-text and should not count as true source-backed direct quotes.`,
          ]
        : [],
  };
}
