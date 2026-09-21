export type FailureClass = "SCIENTIFIC_INSUFFICIENCY" | "PROVIDER_TRANSIENT" | "PROVIDER_NONRETRYABLE" | "STRUCTURED_OUTPUT" | "PRESENTATION" | "INFRASTRUCTURE_TRANSIENT" | "INFRASTRUCTURE_FATAL" | "COST_LIMIT" | "USER_ACTION_REQUIRED";
export function publicFailureMessage(category: FailureClass) {
  const messages: Record<FailureClass, string> = {
    SCIENTIFIC_INSUFFICIENCY: "La evidencia o el diseño requieren revisión antes de continuar.",
    PROVIDER_TRANSIENT: "El proveedor no está disponible temporalmente. La recuperación es limitada y conserva el trabajo realizado.",
    PROVIDER_NONRETRYABLE: "Se requiere revisar la configuración o disponibilidad del proveedor.",
    STRUCTURED_OUTPUT: "Una respuesta no superó la validación. El trabajo válido se ha conservado para revisión.",
    PRESENTATION: "El contenido científico guardado se conserva. La presentación o exportación requiere revisión.",
    INFRASTRUCTURE_TRANSIENT: "Una interrupción temporal requiere recuperación; el trabajo guardado se conserva.",
    INFRASTRUCTURE_FATAL: "La generación se detuvo de forma segura y requiere revisión técnica.",
    COST_LIMIT: "Se alcanzó el límite preventivo de presupuesto. El trabajo guardado se conserva; continuar requiere autorización.",
    USER_ACTION_REQUIRED: "La generación requiere revisión antes de continuar. No se iniciarán nuevos consumos automáticamente.",
  };
  return messages[category];
}
export function classifyFailure(error: unknown): { category: FailureClass; autoRetry: boolean } {
  const e = error as { message?: string; status?: number; code?: string; name?: string };
  const text = `${e?.name ?? ""} ${e?.message ?? error} ${e?.code ?? ""}`;
  if (/BUDGET|COST_LIMIT/.test(text)) return { category: "COST_LIMIT", autoRetry: false };
  if (/EVIDENCE|SCIENTIFIC_REVIEW_BLOCKED|UNKNOWN_EVIDENCE_POINTER/.test(text)) return { category: "SCIENTIFIC_INSUFFICIENCY", autoRetry: false };
  if (/DECLARATIVE_DIAGRAM|PDF_|DOCX|IMAGE_|VISUAL_|SECTION_COMPACTION/.test(text)) return { category: "PRESENTATION", autoRetry: false };
  if (e?.status === 408 || e?.status === 429 && !/insufficient_quota/.test(text) || (e?.status ?? 0) >= 500 || /ETIMEDOUT|ECONNRESET|APIConnection|Request timed out/.test(text)) return { category: "PROVIDER_TRANSIENT", autoRetry: true };
  if (e?.status && e.status >= 400 || /insufficient_quota/.test(text)) return { category: "PROVIDER_NONRETRYABLE", autoRetry: false };
  if (/Zod|JSON|schema|structured output/i.test(text)) return { category: "STRUCTURED_OUTPUT", autoRetry: false };
  if (/EAGAIN|temporarily unavailable/.test(text)) return { category: "INFRASTRUCTURE_TRANSIENT", autoRetry: true };
  if (/LEASE_LOST|INPUT_CHANGED|STAGE_ATTEMPTS|USER_ACTION_REQUIRED/.test(text)) return { category: "USER_ACTION_REQUIRED", autoRetry: false };
  return { category: "INFRASTRUCTURE_FATAL", autoRetry: false }; // Unknown is not permission to pay again.
}
function positive(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid ${name}`);
  return value;
}
export function jobCostPolicy() {
  const target = positive("IMX_JOB_TARGET_USD", 1.25);
  const soft = positive("IMX_JOB_SOFT_USD", 1.50);
  const hard = positive("IMX_JOB_HARD_USD", 2.00);
  if (target > soft || soft > hard) throw new Error("Invalid job budget ordering");
  return { target, soft, hard, deep: positive("IMX_JOB_DEEP_RESEARCH_USD", 0.50), mandatoryReserve: positive("IMX_JOB_MANDATORY_RESERVE_USD", 0.25) };
}
export function pageBudgetPolicy(bodyPages: number | null) {
  const soft = positive("IMX_BODY_SOFT_MAX_PAGES", 18);
  const guard = positive("IMX_BODY_RENDER_GUARD_PAGES", 24);
  if (guard < soft) throw new Error("Invalid page budget ordering");
  return { soft, guard, status: bodyPages === null ? "UNMEASURED" : bodyPages > guard ? "RENDER_REVIEW_REQUIRED" : bodyPages > soft ? "LENGTH_WARNING" : "PASS" };
}
