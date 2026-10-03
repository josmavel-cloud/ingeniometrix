import { fingerprint, type BackgroundProviderResponseRecord } from "./job-execution-context";
import { METHOD_PRIMARY_NORMALIZATION_VERSION, normalizeDeclaredPrimaryMethod } from "./method-primary-normalization";
export const METHOD_PRIMARY_RECOVERY_VERSION="method-primary-postprocess-recovery.v1";
export const METHOD_PRIMARY_RECOVERY_EVENT="SCIENTIFIC_CONTINUATION_PRIMARY_RECOVERY_AUTHORIZED";
type Prior={version:string;responsesPreserved:Array<{responseId:string|null;requestFingerprint:string;status:string;usageFingerprint:string}>;preservedOperations:unknown[]};
export function validateMethodPrimaryRecovery(input:{priorMessage:string;previous:Prior;current:Prior;responses:BackgroundProviderResponseRecord[];
  stages:Array<{id:string;stageKey:string;status:string;outputJson:unknown}>;costEntries:unknown[];contextRecovery:{version?:string;promptVersion?:string}}){
  if(input.priorMessage!=="METHOD_PRIMARY_OR_DUPLICATE_INVALID"||input.contextRecovery.version!=="method-context-admission-recovery.v1"||
    input.contextRecovery.promptVersion!=="method-coverage-reconstruction.v5"||METHOD_PRIMARY_NORMALIZATION_VERSION!=="declared-primary-method-alias.v1")
    throw new Error("METHOD_PRIMARY_RECOVERY_NOT_ELIGIBLE");
  const setHash=(rows:unknown[])=>fingerprint(rows.map(row=>fingerprint(row)).sort());
  if(setHash(input.previous.preservedOperations)!==setHash(input.current.preservedOperations)||input.previous.responsesPreserved.some(row=>
    !input.current.responsesPreserved.some(now=>fingerprint(now)===fingerprint(row))))throw new Error("METHOD_PRIMARY_PREVIOUS_USAGE_CHANGED");
  const added=input.current.responsesPreserved.filter(row=>!input.previous.responsesPreserved.some(old=>fingerprint(old)===fingerprint(row)));
  if(added.length!==1||added[0].status!=="COMPLETED")throw new Error("METHOD_PRIMARY_COMPLETED_RESPONSE_REQUIRED");
  const response=input.responses.find(row=>row.responseId===added[0].responseId);
  if(!response?.outputText||response.providerStatus!=="completed"||(response.correlation as {promptVersion?:string}).promptVersion!=="method-coverage-reconstruction.v5")
    throw new Error("METHOD_PRIMARY_COMPLETED_RESPONSE_REQUIRED");
  const raw=JSON.parse(response.outputText) as {selectedId:string;alternatives:Array<{id:string;primaryMethod:string;methodComponents:Parameters<typeof normalizeDeclaredPrimaryMethod>[1];methodHandoffs:Parameters<typeof normalizeDeclaredPrimaryMethod>[2]}>};
  const outputHash=fingerprint(raw);
  const checkpoint=input.stages.find(stage=>stage.status==="COMPLETED"&&stage.stageKey.startsWith("checkpoint:METHOD_RECONSTRUCTION_V1_1:context:")&&
    (stage.outputJson as {outputHash?:string}).outputHash===outputHash&&fingerprint((stage.outputJson as {value?:unknown}).value)===outputHash);
  if(!checkpoint)throw new Error("METHOD_PRIMARY_COMPLETED_CHECKPOINT_REQUIRED");
  const selected=raw.alternatives.find(row=>row.id===raw.selectedId);
  if(!selected||new Set(raw.alternatives.map(row=>row.id)).size!==raw.alternatives.length)throw new Error("METHOD_PRIMARY_SELECTION_INVALID");
  const normalized=normalizeDeclaredPrimaryMethod(selected.primaryMethod,selected.methodComponents,selected.methodHandoffs);
  if(fingerprint(normalized.components)===fingerprint(selected.methodComponents)||
    new Set(normalized.components.map(row=>row.name)).size!==normalized.components.length||
    normalized.components.filter(row=>row.kind==="method"&&row.name===normalized.primaryMethod).length!==1)
    throw new Error("METHOD_PRIMARY_CORRECTED_ALIAS_REQUIRED");
  return {version:METHOD_PRIMARY_RECOVERY_VERSION,normalizationVersion:METHOD_PRIMARY_NORMALIZATION_VERSION,
    completedResponseId:response.responseId,completedRequestFingerprint:response.requestFingerprint,
    completedUsageFingerprint:fingerprint(response.usage),completedCheckpointId:checkpoint.id,
    completedCheckpointInputFingerprint:(checkpoint.outputJson as {fingerprint:string}).fingerprint,completedCheckpointOutputHash:outputHash,
    selectedAlternativeId:selected.id,normalizationAudit:normalized.audit,derivedGraphFingerprint:fingerprint(normalized),
    costFingerprint:fingerprint(input.costEntries),newProviderCallsByRecovery:0,completedReconstructionMustBeReused:true,
    scientificApprovalGranted:false,priorOutputsPreserved:true};
}
