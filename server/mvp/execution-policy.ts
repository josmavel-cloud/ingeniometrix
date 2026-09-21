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
  if (/DECLARATIVE_DIAGRAM|PDF_|DOCX|VISUAL_|SECTION_COMPACTION|RENDER_SANITY_FAILURE/.test(text)) return { category: "PRESENTATION", autoRetry: false };
  if (/BUDGET|COST_LIMIT/.test(text)) return { category: "COST_LIMIT", autoRetry: false };
  if (/EVIDENCE|SCIENTIFIC_REVIEW_BLOCKED|UNKNOWN_EVIDENCE_POINTER/.test(text)) return { category: "SCIENTIFIC_INSUFFICIENCY", autoRetry: false };
  if (/IMAGE_/.test(text)) return { category: "PRESENTATION", autoRetry: false };
  if (/TEMPLATE_PAGE_LIMIT/.test(text)) return { category: "USER_ACTION_REQUIRED", autoRetry: false };
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
function optionalPositiveInteger(name: string) {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`Invalid ${name}`);
  return value;
}
export function jobCostPolicy() {
  const target = positive("IMX_JOB_TARGET_USD", 1.25);
  const soft = positive("IMX_JOB_SOFT_USD", 1.50);
  const hard = positive("IMX_JOB_HARD_USD", 2.00);
  if (target > soft || soft > hard) throw new Error("Invalid job budget ordering");
  return { target, soft, hard, deep: positive("IMX_JOB_DEEP_RESEARCH_USD", 0.50), mandatoryReserve: positive("IMX_JOB_MANDATORY_RESERVE_USD", 0.25) };
}
export type LengthStatus = "WITHIN_TARGET" | "ABOVE_TARGET" | "ABOVE_SOFT_MAX" | "TEMPLATE_LIMIT_EXCEEDED" | "RENDER_SANITY_FAILURE" | "UNMEASURED";
export type RenderSanity = { status: "PASS" | "RENDER_SANITY_FAILURE"; reasons: string[]; emergencyMaxBodyPages: number };

export function templateHardMaxBodyPages(templateKey: string | null | undefined) {
  if (!templateKey || templateKey === "GENERIC_POSGRADO_PE") return null;
  const raw = process.env.IMX_TEMPLATE_HARD_MAX_BODY_PAGES_JSON?.trim();
  if (!raw) return null;
  let configured: unknown;
  try { configured = JSON.parse(raw); } catch { throw new Error("Invalid IMX_TEMPLATE_HARD_MAX_BODY_PAGES_JSON"); }
  if (!configured || typeof configured !== "object" || Array.isArray(configured)) throw new Error("Invalid IMX_TEMPLATE_HARD_MAX_BODY_PAGES_JSON");
  const value = (configured as Record<string, unknown>)[templateKey];
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value) || Number(value) <= 0) throw new Error(`Invalid hard page limit for template ${templateKey}`);
  return Number(value);
}

export function assessRenderSanity(input: { bodyPages: number | null; bodyPageTexts?: string[]; expectedBodyPages?: number | null }): RenderSanity {
  const emergencyMaxBodyPages = optionalPositiveInteger("IMX_RENDER_SANITY_MAX_BODY_PAGES") ?? 80;
  const reasons: string[] = [];
  if (input.bodyPages === null) reasons.push("BODY_PAGE_COUNT_UNMEASURED");
  if (input.bodyPages !== null && input.bodyPages > emergencyMaxBodyPages) reasons.push("EMERGENCY_RUNAWAY_PAGE_CEILING");
  if (input.bodyPages !== null && input.expectedBodyPages && input.expectedBodyPages > 0 && input.bodyPages > Math.max(54, Math.ceil(input.expectedBodyPages * 3))) reasons.push("PAGE_GROWTH_INCONSISTENT_WITH_SECTION_BUDGETS");
  const normalized = (input.bodyPageTexts ?? []).map((page) => page.replace(/^\s*\d+\s*$/gm, "").replace(/\s+/g, " ").trim()).filter((page) => page.length >= 120);
  const frequencies = new Map<string, number>();
  for (const page of normalized) frequencies.set(page, (frequencies.get(page) ?? 0) + 1);
  if ([...frequencies.values()].some((count) => count >= 3)) reasons.push("REPEATED_SUBSTANTIVE_PAGE_LOOP");
  return { status: reasons.length ? "RENDER_SANITY_FAILURE" : "PASS", reasons, emergencyMaxBodyPages };
}

export function pageBudgetPolicy(bodyPages: number | null, options: { templateHardMaxBodyPages?: number | null; renderSanity?: RenderSanity } = {}) {
  const targetMin = positive("IMX_BODY_TARGET_MIN_PAGES", 12);
  const targetMax = positive("IMX_BODY_TARGET_MAX_PAGES", 15);
  const soft = positive("IMX_BODY_SOFT_MAX_PAGES", 18);
  if (targetMin > targetMax || targetMax > soft) throw new Error("Invalid page budget ordering");
  const templateHardMax = options.templateHardMaxBodyPages ?? null;
  if (templateHardMax !== null && (!Number.isInteger(templateHardMax) || templateHardMax <= 0)) throw new Error("Invalid template hard page limit");
  const sanity = options.renderSanity ?? assessRenderSanity({ bodyPages });
  let status: LengthStatus;
  if (bodyPages === null) status = "UNMEASURED";
  else if (sanity.status === "RENDER_SANITY_FAILURE") status = "RENDER_SANITY_FAILURE";
  else if (templateHardMax !== null && bodyPages > templateHardMax) status = "TEMPLATE_LIMIT_EXCEEDED";
  else if (bodyPages > soft) status = "ABOVE_SOFT_MAX";
  else if (bodyPages > targetMax) status = "ABOVE_TARGET";
  else status = "WITHIN_TARGET";
  return {
    target: { min: targetMin, max: targetMax },
    soft,
    templateHardMax,
    renderSanity: sanity,
    status,
    publicationAllowed: !["UNMEASURED", "RENDER_SANITY_FAILURE", "TEMPLATE_LIMIT_EXCEEDED"].includes(status),
  };
}

export function maxEditorialCompressionRounds() {
  return optionalPositiveInteger("IMX_MAX_EDITORIAL_COMPRESSION_ROUNDS") ?? 1;
}
