import type {
  ExtractedTemplateAssetInput,
  NormalizedAssetCandidate,
} from "@/server/reporting/template-ingestion-types";

type NormalizeTemplateAssetsInput = {
  providedAssets?: ExtractedTemplateAssetInput[];
  wantsCoverLogo: boolean;
};

type NormalizeTemplateAssetsResult = {
  assets: NormalizedAssetCandidate[];
  logoAssetKey: string | null;
  warnings: string[];
};

function normalizeProvidedAsset(input: ExtractedTemplateAssetInput): NormalizedAssetCandidate {
  return {
    asset_key: input.asset_key,
    kind: input.kind,
    source_strategy: "provided_file",
    source_path: input.source_path ?? null,
    mime_type: input.mime_type ?? null,
    width_px: input.width_px ?? null,
    height_px: input.height_px ?? null,
    has_transparency: input.has_transparency ?? null,
    confidence: 1,
  };
}

export function normalizeTemplateAssets(
  input: NormalizeTemplateAssetsInput,
): NormalizeTemplateAssetsResult {
  const warnings: string[] = [];
  const assets = (input.providedAssets ?? []).map(normalizeProvidedAsset);
  const providedLogo = assets.find((asset) => asset.kind === "logo");

  if (providedLogo) {
    return {
      assets,
      logoAssetKey: providedLogo.asset_key,
      warnings,
    };
  }

  if (!input.wantsCoverLogo) {
    return {
      assets,
      logoAssetKey: null,
      warnings,
    };
  }

  warnings.push(
    "No se proporciono un logo adjunto; el flujo debe intentar extraer el logo desde la portada del documento fuente.",
  );

  const fallbackLogo: NormalizedAssetCandidate = {
    asset_key: "cover_logo_fallback",
    kind: "logo",
    source_strategy: "extracted_from_document",
    source_path: null,
    page_number: 1,
    mime_type: null,
    width_px: null,
    height_px: null,
    has_transparency: null,
    confidence: 0.25,
  };

  return {
    assets: [...assets, fallbackLogo],
    logoAssetKey: fallbackLogo.asset_key,
    warnings,
  };
}
