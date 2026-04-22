export type BlueprintGenerationErrorCode =
  | "PROJECT_NOT_READY"
  | "INTAKE_INCOMPLETE"
  | "REFERENCES_OUT_OF_RANGE"
  | "MODEL_OUTPUT_INVALID"
  | "TRACEABILITY_FAILED"
  | "CITATION_PLAN_INVALID";

export class BlueprintGenerationError extends Error {
  code: BlueprintGenerationErrorCode;
  nextAction: string;

  constructor(params: {
    code: BlueprintGenerationErrorCode;
    message: string;
    nextAction: string;
  }) {
    super(params.message);
    this.name = "BlueprintGenerationError";
    this.code = params.code;
    this.nextAction = params.nextAction;
  }
}

export function toBlueprintApiError(error: unknown) {
  if (error instanceof BlueprintGenerationError) {
    return {
      code: error.code,
      error: error.message,
      nextAction: error.nextAction,
    };
  }

  if (error instanceof Error) {
    return {
      code: "MODEL_OUTPUT_INVALID" as const,
      error: error.message,
      nextAction:
        "Vuelve a intentar con un intake mas claro o un set mas representativo de fuentes.",
    };
  }

  return {
    code: "MODEL_OUTPUT_INVALID" as const,
    error: "No se pudo generar el blueprint.",
    nextAction:
      "Vuelve a intentar con un intake mas claro o un set mas representativo de fuentes.",
  };
}
