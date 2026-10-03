import { fingerprint } from "@/server/mvp/job-execution-context";
import { REFERENCE_TRANSLATION_SERVICE_1_PROMPT, REFERENCE_TRANSLATION_SERVICE_2_PROMPT } from "@/server/mvp/prompts/reference-translation-service.v1";
import { DISPLAY_TRANSLATION_POLICY, referenceDisplayContentHash } from "./reference-translation-service";

export const REFERENCE_DISPLAY_JOB_POLICY = `reference-display-job.v3:${REFERENCE_TRANSLATION_SERVICE_1_PROMPT.version}:${REFERENCE_TRANSLATION_SERVICE_2_PROMPT.version}`;
export type DisplayIdentityRow = { referenceId: string; reference: { title: string; abstract: string | null } };
export function referenceDisplayBatchIdentity(projectId: string, language: string, rows: DisplayIdentityRow[], legacy = false) {
  const content = rows.map(row => [row.referenceId, referenceDisplayContentHash(row.reference)]).sort(([a], [b]) => a.localeCompare(b));
  return `reference-display:${fingerprint(legacy ? [projectId, language, DISPLAY_TRANSLATION_POLICY, content]
    : [projectId, language, DISPLAY_TRANSLATION_POLICY, REFERENCE_DISPLAY_JOB_POLICY, content])}`;
}
export function matchesReferenceDisplayBatch(key: string, projectId: string, language: string, rows: DisplayIdentityRow[]) {
  return key === referenceDisplayBatchIdentity(projectId, language, rows) || key === referenceDisplayBatchIdentity(projectId, language, rows, true);
}
