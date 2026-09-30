import { z } from "zod";
export const researchIdeaOptionSchema = z.object({
  workingTitle: z.string().min(5).max(300), briefProblem: z.string().min(10).max(1200),
  purpose: z.string().min(5).max(1000), objectOrPopulation: z.string().min(3).max(600),
  context: z.string().max(600), coreConcepts: z.array(z.string().min(2).max(160)).min(1).max(8),
  whyItIsViable: z.string().min(10).max(600), uncertainties: z.array(z.string().max(400)).max(6),
  provenance: z.literal("AI_PROPOSED"),
}).strict();
export const researchIdeaOptionsSchema = z.object({ schemaVersion: z.literal("ResearchIdeaOptions.v1"),
  options: z.array(researchIdeaOptionSchema).length(3) }).strict();
export type ResearchIdeaOption = z.infer<typeof researchIdeaOptionSchema>;
export function validateIdeaOptions(raw: unknown) {
  const result = researchIdeaOptionsSchema.parse(raw);
  const titles = new Set(result.options.map(option => option.workingTitle.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\W/g, "")));
  if (titles.size !== 3) throw new Error("IDEA_OPTIONS_NOT_DISTINCT");
  return result;
}
