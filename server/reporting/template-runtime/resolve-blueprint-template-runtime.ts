import {
  getUniversityDisplayNameByCode,
  type ProjectUniversityCode,
} from "@/lib/peru-universities";
import type { LoadedTemplateVersionRuntime } from "@/server/reporting/template-runtime/load-template-version";
import { loadTemplateVersionRuntime } from "@/server/reporting/template-runtime/load-template-version";
import { resolveTemplateVersionForBlueprint } from "@/server/reporting/template-runtime/resolve-template-version-for-blueprint";

type BlueprintTemplateRuntimeInput = {
  projectTemplateKey: string;
  projectUniversity: string;
  projectDegreeLevel: string;
  projectProgram: string;
};

type BlueprintTemplateRuntimeResolution = {
  source: "ranked_match" | "template_hint" | "generic_fallback";
  selectedTemplateVersionId: string;
  selectedTemplateKey: string;
  selectedTemplateName: string;
  selectedScore: number | null;
  guidanceNotes: string[];
};

const MIN_ACCEPTABLE_TEMPLATE_SCORE = 24;
const GENERIC_FALLBACK_TEMPLATE_KEYS = ["UNIVERSIDAD_NO_IDENTIFICADA_UNKNOWN"];

const PROJECT_TEMPLATE_RUNTIME_HINTS: Record<string, string[]> = {
  UPC_POSGRADO: [],
  UCV_POSGRADO: [
    "FUNCION_ESENCIAL_Y_OBLIGATORIA_DE_LA_UNIVERSIDAD_QUE_LA_FOMENTA_Y_REALIZA_RESPONDIENDO_A_TRAVES_DE_LA_UNKNOWN",
    "FUNCI_N_ESENCIAL_Y_OBLIGATORIA_DE_LA_UNIVERSIDAD_QUE_LA_FOMENTA_Y_REALIZA_RESPONDIENDO_A_TRAV_S_DE_LA_UNKNOWN",
  ],
  USMP_POSGRADO: ["MANUAL_PARA_LA_ELABORACION_DE_LAS_TESIS_Y_LOS_UNKNOWN"],
  GENERIC_POSGRADO_PE: [...GENERIC_FALLBACK_TEMPLATE_KEYS],
};

const UNIVERSITY_RUNTIME_HINTS: Record<string, string[]> = {
  PUCP: ["PONTIFICIA_UNIVERSIDAD_CATOLICA_DEL_PERU_MAESTRIA_INGENIERIA_CIVIL"],
  UPT: [
    "UNIVERSIDAD_PRIVADA_DE_TACNA_MAESTRIA_INGENIERIA_CIVIL",
    "UNIVERSIDAD_PRIVADA_DE_TACNA_UNKNOWN",
  ],
  UNI: [
    "UNIVERSIDAD_NACIONAL_DE_INGENIERIA_UNKNOWN",
    "UNIVERSIDAD_NACIONAL_DE_INGENIER_A_UNKNOWN",
  ],
  USMP: ["MANUAL_PARA_LA_ELABORACION_DE_LAS_TESIS_Y_LOS_UNKNOWN"],
  UCV: [
    "FUNCION_ESENCIAL_Y_OBLIGATORIA_DE_LA_UNIVERSIDAD_QUE_LA_FOMENTA_Y_REALIZA_RESPONDIENDO_A_TRAVES_DE_LA_UNKNOWN",
    "FUNCI_N_ESENCIAL_Y_OBLIGATORIA_DE_LA_UNIVERSIDAD_QUE_LA_FOMENTA_Y_REALIZA_RESPONDIENDO_A_TRAV_S_DE_LA_UNKNOWN",
  ],
};

const KNOWN_PROJECT_UNIVERSITY_CODES = [
  "PUCP",
  "UPT",
  "UNMSM",
  "UNI",
  "UP",
  "UPC",
  "UPCH",
  "ULIMA",
  "UDEP",
  "USMP",
  "UCV",
  "OTHER",
] as const satisfies readonly ProjectUniversityCode[];

function resolveProjectUniversityName(university: string) {
  if (
    KNOWN_PROJECT_UNIVERSITY_CODES.includes(university as ProjectUniversityCode)
  ) {
    return getUniversityDisplayNameByCode(university as ProjectUniversityCode);
  }

  return university;
}

async function loadRuntimeFromHints(templateKeys: string[]) {
  for (const templateKey of templateKeys) {
    try {
      const runtime = await loadTemplateVersionRuntime({ templateKey });
      return runtime;
    } catch {
      continue;
    }
  }

  return null;
}

function getRuntimeHints(input: BlueprintTemplateRuntimeInput) {
  return Array.from(
    new Set([
      ...(PROJECT_TEMPLATE_RUNTIME_HINTS[input.projectTemplateKey] ?? []),
      ...(UNIVERSITY_RUNTIME_HINTS[input.projectUniversity] ?? []),
    ]),
  );
}

export async function resolveBlueprintTemplateRuntime(
  input: BlueprintTemplateRuntimeInput,
): Promise<{
  runtime: LoadedTemplateVersionRuntime;
  resolution: BlueprintTemplateRuntimeResolution;
}> {
  if (input.projectUniversity === "OTHER") {
    const genericRuntime = await loadRuntimeFromHints(GENERIC_FALLBACK_TEMPLATE_KEYS);

    if (!genericRuntime) {
      throw new Error(
        "No se encontro una plantilla fallback generica para proyectos sin universidad especificada.",
      );
    }

    return {
      runtime: genericRuntime,
      resolution: {
        source: "generic_fallback",
        selectedTemplateVersionId: genericRuntime.versionId,
        selectedTemplateKey: genericRuntime.templateKey,
        selectedTemplateName: genericRuntime.templateName,
        selectedScore: null,
        guidanceNotes: [
          "Se uso la plantilla generica base de Peru porque el proyecto no tiene una universidad especificada en el catalogo del MVP.",
        ],
      },
    };
  }

  const ranked = await resolveTemplateVersionForBlueprint({
    ...input,
    projectUniversity: resolveProjectUniversityName(input.projectUniversity),
  });

  if (ranked.selectedScore >= MIN_ACCEPTABLE_TEMPLATE_SCORE) {
    const runtime = await loadTemplateVersionRuntime({
      templateVersionId: ranked.selectedTemplateVersionId,
    });

    return {
      runtime,
      resolution: {
        source: "ranked_match",
        selectedTemplateVersionId: runtime.versionId,
        selectedTemplateKey: runtime.templateKey,
        selectedTemplateName: runtime.templateName,
        selectedScore: ranked.selectedScore,
        guidanceNotes: [],
      },
    };
  }

  const hintedRuntime = await loadRuntimeFromHints(getRuntimeHints(input));

  if (hintedRuntime) {
    return {
      runtime: hintedRuntime,
      resolution: {
        source: "template_hint",
        selectedTemplateVersionId: hintedRuntime.versionId,
        selectedTemplateKey: hintedRuntime.templateKey,
        selectedTemplateName: hintedRuntime.templateName,
        selectedScore: ranked.selectedScore,
        guidanceNotes: [
          `Se uso una plantilla institucional disponible en base de datos porque el ranking automatico no encontro un match suficientemente fuerte para ${input.projectUniversity}.`,
        ],
      },
    };
  }

  const genericRuntime = await loadRuntimeFromHints(GENERIC_FALLBACK_TEMPLATE_KEYS);

  if (!genericRuntime) {
    throw new Error(
      "No se encontro una plantilla runtime institucional ni una fallback generica para este proyecto.",
    );
  }

  return {
    runtime: genericRuntime,
    resolution: {
      source: "generic_fallback",
      selectedTemplateVersionId: genericRuntime.versionId,
      selectedTemplateKey: genericRuntime.templateKey,
      selectedTemplateName: genericRuntime.templateName,
      selectedScore: ranked.selectedScore,
      guidanceNotes: [
        "Se uso la plantilla generica base de Peru porque no habia una plantilla institucional suficientemente alineada para este proyecto.",
      ],
    },
  };
}
