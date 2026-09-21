import { z } from "zod";

export const INTAKE_DRAFT_FIELDS = ["topic", "problemContext", "researchLine", "academicConstraints", "targetPopulation", "availableData", "preferredMethodology", "advisorNotes"] as const;
const field = z.string().max(8000).refine((value) => !value.includes("\u0000"));
export const draftIntakeSchema = z.object({ topic: field, problemContext: field, researchLine: field, academicConstraints: field, targetPopulation: field, availableData: field, preferredMethodology: field, advisorNotes: field }).strict();
export type DraftIntake = z.infer<typeof draftIntakeSchema>;
export function draftIntakeFrom(raw: unknown): DraftIntake {
  const source = (raw ?? {}) as Record<string, unknown>;
  return draftIntakeSchema.parse(Object.fromEntries(INTAKE_DRAFT_FIELDS.map((key) => [key, typeof source[key] === "string" ? source[key] : ""])));
}
export type DraftView = { id: string; revision: number; confirmedRevision: number | null; intake: DraftIntake; updatedAt: string };
