import { prisma } from "@/lib/prisma";
import { currentJobExecution, fingerprint, stageCheckpoint, versionedCheckpointKey } from "./job-execution-context";
import { buildCorpusMethodProfile, methodCoverageAssessmentSchema, type MethodCoverageMatrixProposal } from "./method-coverage-contracts";
import type { ScientificDecisionBundle } from "./scientific-decision-service";
import type { MethodEvidencePack } from "./scientific-decision-contracts";
import { permitsMethodologicalSupport } from "./evidence-coverage";

export const METHOD_ASSESSMENT_REUSE_VERSION = "method-assessment-revalidation.v1";
type SavedRow = { id:string; stageKey:string; status:string; outputJson:unknown };
type Saved = { value:unknown; outputHash:string; fingerprint:string; files?:unknown[] };
/** Only the initial corpus classification/questions are reused. This is not a new
 * scientific approval. A corrected evidence type can only downgrade coverage. */
export function validateHistoricalMethodAssessment(rows:SavedRow[], jobId:string, bundle:ScientificDecisionBundle) {
  const profileRow = rows.find(row=>row.stageKey === "checkpoint:CORPUS_METHOD_PROFILE_V1" && row.status === "COMPLETED");
  const profile = profileRow?.outputJson as Saved | null;
  if (!profileRow || !profile || fingerprint(profile.value)!==profile.outputHash) return null;
  for (const row of rows.filter(row=>row.status === "COMPLETED" && /^checkpoint:METHOD_COVERAGE_ASSESSMENT_V1(?::context:[a-f0-9]+)?$/.test(row.stageKey))) {
    const saved=row.outputJson as Saved | null;
    if (!saved || fingerprint(saved.value)!==saved.outputHash || saved.files?.length) continue;
    const parsed=methodCoverageAssessmentSchema.safeParse(saved.value);
    if (!parsed.success) continue;
    const expected=fingerprint({version:"b4.v1",jobId,inputs:{source:fingerprint(parsed.data),context:bundle.contextFingerprint}});
    if (profile.fingerprint!==expected) continue;
    const rebuilt=buildCorpusMethodProfile({intent:bundle.intent,pack:bundle.evidence_pack,
      frozenInputFingerprint:bundle.contextFingerprint,proposal:parsed.data.corpusProposal});
    if (fingerprint(rebuilt)!==profile.outputHash) continue;
    return { assessment:parsed.data, profile:rebuilt, audit:{ version:METHOD_ASSESSMENT_REUSE_VERSION,
      jobId, frozenInputFingerprint:bundle.contextFingerprint, assessmentCheckpointId:row.id,
      assessmentOutputHash:saved.outputHash, profileCheckpointId:profileRow.id, profileOutputHash:profile.outputHash,
      status:"HISTORICAL_CLASSIFICATION_REVALIDATED_NOT_SCIENTIFIC_APPROVAL" as const } };
  }
  return null;
}

export async function reuseHistoricalMethodAssessment(bundle:ScientificDecisionBundle) {
  const execution=currentJobExecution();
  if (!execution) return null;
  const rows=await prisma.blueprintJobStage.findMany({where:{jobId:execution.jobId,status:"COMPLETED",
    OR:[{stageKey:{startsWith:"checkpoint:METHOD_COVERAGE_ASSESSMENT_V1"}},{stageKey:"checkpoint:CORPUS_METHOD_PROFILE_V1"}]},
    select:{id:true,stageKey:true,status:true,outputJson:true}});
  const reused=validateHistoricalMethodAssessment(rows,execution.jobId,bundle);
  if (!reused) return null;
  const key=await versionedCheckpointKey("METHOD_ASSESSMENT_REVALIDATION",reused.audit);
  await stageCheckpoint(key,reused.audit,async()=>reused.audit);
  return reused.assessment;
}

export function revalidateHistoricalCoverage(proposal:MethodCoverageMatrixProposal,pack:MethodEvidencePack) {
  const next=structuredClone(proposal), invalidated:Array<{cellId:string;removedPointers:unknown[];reason:string}>=[];
  for (const cell of [...next.corpusClasses.flatMap(row=>row.operations),next.crossClassIntegration]) {
    const rejected=cell.supportPointers.filter(pointer=>{
      const item=pack.items.find(item=>item.source_id===pointer.source_id && item.evidence_id===pointer.evidence_id);
      return !item || !permitsMethodologicalSupport(item.allowed_use) || ["ABSTRACT_METADATA","VERIFIED_METADATA_ONLY","NONE"].includes(item.evidence_level);
    });
    if (!rejected.length) continue;
    cell.supportPointers=cell.supportPointers.filter(pointer=>!rejected.some(bad=>bad.source_id===pointer.source_id&&bad.evidence_id===pointer.evidence_id));
    // Remaining pointers require a new independent assessment; never assume one
    // of them proves the same claim after a relied-on passage was downgraded.
    if(cell.required) cell.coverageStatus="UNSUPPORTED";
    cell.limitations.push("Una representación anterior incluía evidencia cuya tipificación fue corregida; el respaldo de esta operación debe reevaluarse.");
    invalidated.push({cellId:cell.cellId,removedPointers:rejected,reason:"PROCEDURAL_EVIDENCE_TYPE_REVALIDATION"});
  }
  return {proposal:next,audit:{version:METHOD_ASSESSMENT_REUSE_VERSION,invalidated}};
}
