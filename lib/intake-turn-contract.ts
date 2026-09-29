import { z } from "zod";
import { fieldKeySchema } from "./conversational-intake";
export const intakeTurnInputSchema = z.object({ requestId: z.string().uuid(), baseRevision: z.number().int().positive(), etag: z.string().max(128), message: z.string().trim().min(1).max(8000), initial: z.literal(true).optional() }).strict();
export const intakeTurnResultSchema = z.object({
  schemaVersion: z.literal("intake-turn.v1"), baseRevision: z.number().int().positive(), assistantText: z.string().min(1).max(1000),
  proposedChanges: z.array(z.object({ field: fieldKeySchema, value: z.string().max(2000), origin: z.enum(["AI_PROPOSED", "AI_INFERRED"]),
    knowledge: z.enum(["KNOWN", "UNKNOWN", "NOT_APPLICABLE"]), sourceMessageIds: z.array(z.string()).min(1).max(8), interpretationConfidence: z.enum(["LOW", "MEDIUM", "HIGH"]) }).strict()).max(8),
  ambiguities: z.array(z.object({ field: fieldKeySchema, question: z.string().min(1).max(600), blocksSearch: z.boolean() }).strict()).max(3),
  nextQuestion: z.object({ field: fieldKeySchema, question: z.string().min(1).max(600), options: z.array(z.string().min(1).max(160)).max(4) }).strict().nullable(),
}).strict();
export type IntakeTurnResult = z.infer<typeof intakeTurnResultSchema>;
