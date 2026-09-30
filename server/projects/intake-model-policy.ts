// Existing priced model; no GPT-6 activation or automatic escalation.
import { responseCostBound } from "@/llm/providers/openai-cost-bound";
export function intakeModelPolicy() {
  const model = process.env.IMX_INTAKE_MODEL?.trim() || "gpt-5.4-mini";
  const reasoning = process.env.IMX_INTAKE_REASONING?.trim() || "low";
  if (!["low", "medium"].includes(reasoning)) throw new Error("INVALID_INTAKE_MODEL_POLICY");
  if (!responseCostBound({ model, max_output_tokens: 3000 })) throw new Error("UNPRICED_INTAKE_MODEL");
  return { model, reasoningEffort: reasoning as "low" | "medium", maxOutputTokens: 3000, maxModelTurns: 12 };
}
