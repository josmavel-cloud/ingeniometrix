import { prisma } from "@/lib/prisma";
import type { ResearchBlueprintRecord } from "@/server/blueprint/blueprint-types";
import type { CanonicalReportDocument } from "@/server/reporting/canonical-report-types";
import { loadTemplateVersionRuntime } from "@/server/reporting/template-runtime/load-template-version";
import { resolveBlueprintTemplateRuntime } from "@/server/reporting/template-runtime/resolve-blueprint-template-runtime";

import { buildBlueprintAnnexes } from "./build-blueprint-annexes";
import { buildBlueprintCover } from "./build-blueprint-cover";
import { buildBlueprintReferenceList } from "./build-blueprint-reference-list";
import { mapBlueprintSectionToTemplate } from "./map-blueprint-section-to-template";
import { validateBlueprintReportInput } from "./validate-blueprint-report-input";

export async function buildCanonicalReportFromBlueprint(input: {
  projectId: string;
  blueprintVersionId: string;
  templateVersionId?: string;
  templateKey?: string;
}) {
  const blueprintVersion = await prisma.blueprintVersion.findFirst({
    where: {
      id: input.blueprintVersionId,
      projectId: input.projectId,
    },
    include: {
      project: true,
    },
  });

  if (!blueprintVersion) {
    throw new Error("No se encontro la version de blueprint solicitada.");
  }

  const blueprint = blueprintVersion.blueprintJson as unknown as ResearchBlueprintRecord;
  const resolvedRuntime =
    input.templateVersionId || input.templateKey
      ? null
      : await resolveBlueprintTemplateRuntime({
          projectTemplateKey:
            blueprint.template_context?.template_key ??
            blueprint.template_key ??
            blueprintVersion.project.templateKey,
          projectUniversity: blueprint.university ?? blueprintVersion.project.university,
          projectDegreeLevel: blueprint.degree_level ?? blueprintVersion.project.degreeLevel,
          projectProgram: blueprint.program ?? blueprintVersion.project.program,
        });
  const runtime =
    resolvedRuntime?.runtime ??
    (await loadTemplateVersionRuntime({
      templateVersionId: input.templateVersionId,
      templateKey: input.templateKey,
    }));
  const validation = validateBlueprintReportInput({
    runtime,
    blueprint,
  });

  if (!validation.valid) {
    throw new Error(validation.errors.join(" "));
  }

  const references = buildBlueprintReferenceList({
    blueprint,
    selectedReferencesSnapshotJson: blueprintVersion.selectedReferencesSnapshotJson,
  });
  const warnings = [...validation.warnings];
  const sections = runtime.templateCandidate.sections
    .map((section) => mapBlueprintSectionToTemplate(section, { blueprint, references, warnings }))
    .filter((section): section is NonNullable<typeof section> => Boolean(section));
  const annexes = buildBlueprintAnnexes(blueprint);
  const presentation = {
    ...runtime.effectiveElementRules,
    caption: runtime.effectiveElementRules.caption ?? {
      prefix_style: "label_period_title",
      separator: ". ",
      font_style: "inherit",
    },
  };

  const canonicalDocument = {
    document_id: `canonical-blueprint-${blueprintVersion.id}`,
    document_kind: "thesis_plan",
    derivation: {
      template_version_id: runtime.versionId,
      template_key: runtime.templateKey,
      template_family: runtime.templateCandidate.template_family,
      source_kind: "blueprint",
      synthetic: false,
    },
    language: runtime.language,
    institution: {
      university_name:
        runtime.templateCandidate.institution.university_name ?? blueprint.university,
      school_name: runtime.templateCandidate.institution.school_name ?? null,
      program_name: runtime.templateCandidate.institution.program_name ?? blueprint.program,
      mention: runtime.templateCandidate.institution.mention ?? null,
      degree_level: runtime.templateCandidate.institution.degree_level ?? blueprint.degree_level,
      discipline_area: runtime.templateCandidate.institution.discipline_area ?? blueprint.research_line,
    },
    presentation,
    cover: buildBlueprintCover({
      blueprint,
      runtime,
    }),
    body: {
      sections,
    },
    references,
    annexes,
    assets: runtime.assets.map((asset) => ({
      asset_key: asset.assetKey,
      kind: asset.kind,
      role:
        asset.assetKey === runtime.templateCandidate.logo_policy.primary_asset_key
          ? "cover_logo"
          : "generic",
      stored_path: asset.storedFilePath ?? null,
      mime_type: asset.mimeType ?? null,
      width_px: asset.widthPx ?? null,
      height_px: asset.heightPx ?? null,
    })),
    warnings: Array.from(
      new Set([
        ...runtime.runtimeWarnings,
        ...(blueprint.engine_warnings ?? []),
        ...(resolvedRuntime
          ? [
              `TemplateVersion resuelta para reporting: ${runtime.versionId} (${runtime.templateKey}) via ${resolvedRuntime.resolution.source}.`,
              ...resolvedRuntime.resolution.guidanceNotes,
            ]
          : []),
        ...warnings,
      ]),
    ),
  } satisfies CanonicalReportDocument;

  return {
    runtime,
    blueprintVersion,
    canonicalDocument,
    validation: {
      valid: true,
      errors: [],
      warnings: canonicalDocument.warnings,
    },
  };
}
