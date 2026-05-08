import type { MasterTemplateRuntime } from "@/server/blueprint-v2/types";

export type TemplateRuntimeMode = "local-fixture" | "database";
export type TemplateRuntimeSource = "local_fixture" | "database";

export type TemplateRuntimeResolution = {
  masterTemplate: MasterTemplateRuntime;
  template_runtime_mode: TemplateRuntimeMode;
  template_source: TemplateRuntimeSource;
  prisma_called: boolean;
  warnings: string[];
};

export async function resolveMasterTemplateRuntimeForMode(input: {
  mode: TemplateRuntimeMode;
  loadDatabaseRuntime: () => Promise<MasterTemplateRuntime>;
  buildLocalFixture: () => MasterTemplateRuntime;
}): Promise<TemplateRuntimeResolution> {
  if (input.mode === "local-fixture") {
    return {
      masterTemplate: input.buildLocalFixture(),
      template_runtime_mode: input.mode,
      template_source: "local_fixture",
      prisma_called: false,
      warnings: [],
    };
  }

  try {
    return {
      masterTemplate: await input.loadDatabaseRuntime(),
      template_runtime_mode: input.mode,
      template_source: "database",
      prisma_called: true,
      warnings: [],
    };
  } catch (error) {
    return {
      masterTemplate: input.buildLocalFixture(),
      template_runtime_mode: input.mode,
      template_source: "local_fixture",
      prisma_called: true,
      warnings: [
        `No se pudo cargar la plantilla desde BD; se uso fixture local: ${
          error instanceof Error ? error.message : "error desconocido"
        }`,
      ],
    };
  }
}
