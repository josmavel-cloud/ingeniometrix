import { NextResponse } from "next/server";

import { loadMasterBlueprintLabFixtureSet } from "@/server/blueprint-v2/lab/fixture-loader";
import { planMasterTemplateSectionPromptsForLab } from "@/server/blueprint-v2/lab/prompt-planning-hybrid";
import { buildMasterTemplateImportContextArtifact } from "@/server/blueprint-v2/lab/template-import-context";
import { generateSectionDraftsForKeys } from "@/server/blueprint-v2/sections/section-generation-engine";
import { loadMasterTemplateRuntimeV2 } from "@/server/blueprint-v2/template/master-template-runtime";
import type { MasterSectionDraft } from "@/server/blueprint-v2/types";

type GenerateSectionRequestBody = {
  caseName?: string;
  sectionKey?: string;
  allowLlm?: boolean;
  existingDrafts?: MasterSectionDraft[];
  includeDependencies?: boolean;
};

function collectDependencyKeys(
  sectionKey: string,
  generationPlan: Array<{ section_key: string; depends_on_keys: string[] }>,
): string[] {
  const byKey = new Map(generationPlan.map((item) => [item.section_key, item]));
  const visited = new Set<string>();
  const ordered: string[] = [];

  function visit(key: string) {
    if (visited.has(key)) {
      return;
    }

    visited.add(key);
    const item = byKey.get(key);

    if (!item) {
      return;
    }

    for (const dependencyKey of item.depends_on_keys ?? []) {
      visit(dependencyKey);
    }

    ordered.push(key);
  }

  visit(sectionKey);
  return ordered;
}

export async function POST(request: Request) {
  const previousProvider = process.env.LLM_PROVIDER;

  try {
    const body = (await request.json()) as GenerateSectionRequestBody;

    if (!body.sectionKey) {
      return NextResponse.json({ error: "Falta sectionKey para generar la seccion." }, { status: 400 });
    }

    if (!body.allowLlm) {
      process.env.LLM_PROVIDER = "lab-disabled";
    }

    const fixtures = await loadMasterBlueprintLabFixtureSet({
      caseName: body.caseName || "blueprint-launch-latest",
    });
    const masterTemplate = await loadMasterTemplateRuntimeV2();
    const templateImportContext = await buildMasterTemplateImportContextArtifact({
      fixtures,
      masterTemplate,
    });
    const promptPlan = await planMasterTemplateSectionPromptsForLab({
      project: fixtures.project,
      masterTemplate,
      evidenceLedger: fixtures.evidenceLedger,
      templateImportContext,
      allowLlm: body.allowLlm ?? false,
    });
    const requestedKeys = body.includeDependencies === false
      ? [body.sectionKey]
      : collectDependencyKeys(
          body.sectionKey,
          promptPlan.generation_plan.map((item) => ({
            section_key: item.section_key,
            depends_on_keys: item.depends_on_keys,
          })),
        );
    const generatedDrafts = await generateSectionDraftsForKeys({
      project: fixtures.project,
      masterTemplate,
      evidenceLedger: fixtures.evidenceLedger,
      promptPlan,
      templateImportContext,
      sectionKeys: requestedKeys,
      existingDrafts: body.existingDrafts ?? [],
    });

    return NextResponse.json({
      sectionKey: body.sectionKey,
      requestedKeys,
      generatedDrafts,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo generar la seccion solicitada del lab.",
      },
      { status: 500 },
    );
  } finally {
    if (previousProvider === undefined) {
      delete process.env.LLM_PROVIDER;
    } else {
      process.env.LLM_PROVIDER = previousProvider;
    }
  }
}
