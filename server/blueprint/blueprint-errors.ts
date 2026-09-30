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
  const message = error instanceof Error ? error.message : "";
  const code = message.split(":", 1)[0];
  const known: Record<string, { error: string; nextAction: string }> = {
    GENERATION_CONTRACT_INCOMPLETE: { error: "Falta el contexto de generación.", nextAction: "Actualiza la página y vuelve a continuar." },
    GENERATION_CONTEXT_UNAVAILABLE: { error: "No se pudo verificar la investigación actual.", nextAction: "Vuelve a abrir el proyecto." },
    DEFINITION_CONFIRMATION_REQUIRED: { error: "Hay cambios en la definición pendientes de confirmar.", nextAction: "Revisa y confirma la definición antes de continuar." },
    DRAFT_CONFIRMATION_REQUIRED: { error: "Hay cambios en la definición pendientes de confirmar.", nextAction: "Revisa y confirma la definición antes de continuar." },
    DEFINITION_REVISION_CONFLICT: { error: "La definición cambió desde que abriste esta página.", nextAction: "Revisa la definición actual antes de continuar." },
    DRAFT_REVISION_CONFLICT: { error: "Hay una versión más reciente del borrador.", nextAction: "Actualiza el proyecto y revisa los cambios antes de continuar." },
    SOURCE_SELECTION_CONFLICT: { error: "La selección de fuentes cambió.", nextAction: "Revisa las fuentes elegidas y vuelve a continuar." },
    EVIDENCE_SET_CHANGED: { error: "El conjunto de evidencia cambió.", nextAction: "Revisa las fuentes actuales y vuelve a continuar." },
    SOURCE_SELECTION_REQUIRED: { error: "Selecciona fuentes para continuar.", nextAction: "Elige las fuentes que deseas utilizar." },
    EVIDENCE_SET_BLOCKED: { error: "Aún no hay evidencia suficiente para continuar.", nextAction: "Revisa las limitaciones de las fuentes seleccionadas." },
    EVIDENCE_SET_STALE: { error: "La evidencia ya no corresponde a la selección actual.", nextAction: "Vuelve a continuar con las fuentes actuales." },
    BUDGET_LIMIT: { error: "El presupuesto configurado no permite iniciar este plan.", nextAction: "Revisa el saldo y el límite actual antes de intentarlo de nuevo." },
  };
  if (known[code]) return { code, ...known[code] };
  if (error instanceof BlueprintGenerationError) {
    return {
      code: error.code,
      error: error.message,
      nextAction: error.nextAction,
    };
  }

  if (error instanceof Error) {
    return {
      code: "GENERATION_FAILED" as const,
      error: "No se pudo iniciar el plan.",
      nextAction: "Comprueba el estado del proyecto y vuelve a intentarlo si no hay una operación en curso.",
    };
  }

  return {
    code: "GENERATION_FAILED" as const,
    error: "No se pudo generar el blueprint.",
    nextAction: "Comprueba el estado del proyecto y vuelve a intentarlo si no hay una operación en curso.",
  };
}
