import { fingerprint } from "./job-execution-context";
import { METHOD_ACQUISITION_RECOVERY_VERSION } from "./method-acquisition-recovery-contract";
export const METHOD_CONTEXT_RECOVERY_VERSION="method-context-admission-recovery.v1";
export const METHOD_CONTEXT_RECOVERY_EVENT="SCIENTIFIC_CONTINUATION_CONTEXT_RECOVERY_AUTHORIZED";
export const METHOD_CONTEXT_ADMISSION_EVENT="SCIENTIFIC_CONTINUATION_CONTEXT_ADMISSION_VERIFIED";
export type CorrectedMethodAdmission={version:string;requestFingerprint:string;schemaFingerprint:string;promptVersion:string;
  effectiveEvidenceFingerprint:string;digestFingerprint:string;inputTokens:number;maxOutputTokens:number;contextLimit:number;
  countProvenance:string;maximumUsd:number};
type Proof={version:string;responsesPreserved:unknown[];preservedOperations:unknown[];reusedCheckpoints:unknown[]};
export function validateMethodContextRecovery(input:{priorMessage:string;previous:Proof;current:Proof;admission:CorrectedMethodAdmission;
  admissionVersion:string;promptVersion:string;costEntries:unknown[];stages:Array<{id:string;stageKey:string;status:string;outputJson:unknown}>}){
  if(input.priorMessage!=="METHOD_COVERAGE_CONTEXT_UNSAFE"||input.previous.version!==METHOD_ACQUISITION_RECOVERY_VERSION)
    throw new Error("METHOD_CONTEXT_RECOVERY_NOT_ELIGIBLE");
  const setHash=(rows:unknown[])=>fingerprint(rows.map(row=>fingerprint(row)).sort());
  if(setHash(input.previous.responsesPreserved)!==setHash(input.current.responsesPreserved)||
    setHash(input.previous.preservedOperations)!==setHash(input.current.preservedOperations)||
    input.previous.reusedCheckpoints.some(row=>!input.current.reusedCheckpoints.some(now=>fingerprint(now)===fingerprint(row))))
    throw new Error("METHOD_CONTEXT_NEW_CALL_OR_CHANGED_CHECKPOINT");
  const a=input.admission;
  if(a.version!==input.admissionVersion||a.promptVersion!==input.promptVersion||a.countProvenance!=="EXACT_PROVIDER_COUNT"||
    ![a.inputTokens,a.maxOutputTokens].every(n=>Number.isSafeInteger(n)&&n>0)||a.contextLimit!==65536||
    a.inputTokens+a.maxOutputTokens>a.contextLimit||!Number.isFinite(a.maximumUsd)||a.maximumUsd<=0||
    ![a.requestFingerprint,a.schemaFingerprint,a.effectiveEvidenceFingerprint,a.digestFingerprint].every(v=>/^[a-f0-9]{64}$/.test(v)))
    throw new Error("METHOD_CONTEXT_CORRECTED_ADMISSION_REQUIRED");
  const digest=input.stages.find(stage=>{if(stage.status!=="COMPLETED"||!stage.stageKey.startsWith("checkpoint:METHOD_COVERAGE_DIGEST_"))return false;
    const out=stage.outputJson as {value?:{digestFingerprint?:string;effectiveEvidenceFingerprint?:string};outputHash?:string};
    return out.value?.digestFingerprint===a.digestFingerprint&&out.value.effectiveEvidenceFingerprint===a.effectiveEvidenceFingerprint&&out.outputHash===fingerprint(out.value);});
  if(!digest)throw new Error("METHOD_CONTEXT_EVIDENCE_CHECKPOINT_INVALID");
  return {...a,version:METHOD_CONTEXT_RECOVERY_VERSION,admissionVersion:a.version, costFingerprint:fingerprint(input.costEntries),
    noNewProviderDispatch:true,noNewCost:true,previousRecoveryFingerprint:fingerprint(input.previous),
    preservedResponseFingerprint:setHash(input.current.responsesPreserved),preservedOperationsFingerprint:setHash(input.current.preservedOperations),
    digestCheckpointId:digest.id,digestCheckpointOutputHash:(digest.outputJson as {outputHash:string}).outputHash};
}
