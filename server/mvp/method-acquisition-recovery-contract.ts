import { fingerprint, type BackgroundProviderResponseRecord } from './job-execution-context';

export const METHOD_ACQUISITION_RECOVERY_VERSION = 'method-acquisition-quality-recovery.v1';
export const METHOD_ACQUISITION_RECOVERY_EVENT = 'SCIENTIFIC_CONTINUATION_ACQUISITION_RECOVERY_AUTHORIZED';
type Stage = { id: string; stageKey: string; status: string; inputJson: unknown; outputJson: unknown; errorJson: unknown };
type Entry = { id: string; status: string; estimate: number | null; usage?: unknown; actualModel?: string | null; paidOperationId?: string };
type PaidCall = { id: string; status: string; estimatedMicros: number | null; actualModel: string | null; usageJson: unknown; attributionJson: unknown };
type Operation = { id: string; userId: string; projectId: string | null; status: string; inputFingerprint: string; resultJson: unknown; calls: PaidCall[] };

/** Reinspect completed web results under a corrected acquisition contract. This
 * authorizes no new discovery, changes no scientific decision, and settles no usage. */
export function validateMethodAcquisitionRecovery(input: {
  priorMessage: string; jobId: string; userId: string; projectId: string; runId: string;
  responses: BackgroundProviderResponseRecord[]; entries: Entry[]; stages: Stage[]; operations: Operation[];
  priorAssessmentRecovery: { priorResponseId?: string; priorRequestFingerprint?: string; priorUsageFingerprint?: string } | null;
  priorExecutionRecovery: { version?: string } | null;
}) {
  if (!input.priorMessage.startsWith('COST_LIMIT_REACHED: el trabajo restante completo') ||
    input.priorExecutionRecovery?.version !== 'method-coverage-execution-recovery.v1' || !input.priorAssessmentRecovery)
    throw new Error('METHOD_ACQUISITION_RECOVERY_NOT_ELIGIBLE');
  if (!input.entries.length || input.entries.some(e=>e.status!=='completed'||e.estimate===null||!Number.isFinite(e.estimate)||e.estimate<0))
    throw new Error('SCIENTIFIC_CONTINUATION_USAGE_UNCERTAIN');
  const provedIds = new Set<string>();
  for (const response of input.responses) {
    const c = response.correlation as {projectId?:string;runId?:string;stage?:string;promptVersion?:string};
    const entry=input.entries.find(e=>e.id===response.reservationId);
    if (!response.responseId || !response.requestFingerprint || !response.actualModel || !response.usage || !entry?.usage ||
      fingerprint(entry.usage)!==fingerprint(response.usage) || entry.actualModel!==response.actualModel ||
      c.projectId!==input.projectId || c.runId!==input.runId || c.stage!=='method_coverage' ||
      !['COMPLETED','INCOMPLETE'].includes(response.status)) throw new Error('METHOD_ACQUISITION_RESPONSE_UNCERTAIN');
    if(response.status==='INCOMPLETE' && (response.responseId!==input.priorAssessmentRecovery.priorResponseId ||
      response.requestFingerprint!==input.priorAssessmentRecovery.priorRequestFingerprint ||
      fingerprint(response.usage)!==input.priorAssessmentRecovery.priorUsageFingerprint || response.providerStatus!=='incomplete'))
      throw new Error('METHOD_ACQUISITION_RESPONSE_UNCERTAIN');
    if(response.status==='COMPLETED'&&response.providerStatus!=='completed')throw new Error('METHOD_ACQUISITION_RESPONSE_UNCERTAIN');
    provedIds.add(entry.id);
  }
  for(const version of ['method-coverage-assessment.v2','method-coverage-reconstruction.v3'])
    if(!input.responses.some(r=>r.status==='COMPLETED'&&(r.correlation as {promptVersion?:string}).promptVersion===version))
      throw new Error('METHOD_ACQUISITION_COMPLETED_SCIENCE_MISSING');
  if(!input.operations.length||input.operations.length>4)throw new Error('METHOD_ACQUISITION_OPERATION_PROOF_MISSING');
  const preservedOperations=input.operations.map(op=>{
    const result=op.resultJson as {responseId?:string;operationId?:string;state?:string};
    if(op.userId!==input.userId||op.projectId!==input.projectId||op.status!=='COMPLETED'||!op.inputFingerprint||
      !result?.responseId||result.operationId!==op.id||!['PARTIAL','COMPLETED'].includes(result.state??'')||!op.calls.length)
      throw new Error('METHOD_ACQUISITION_OPERATION_PROOF_MISSING');
    for(const call of op.calls){
      const attribution=call.attributionJson as {jobId?:string;funding?:string};
      const entry=input.entries.find(e=>e.id===call.id);
      if(call.status!=='COMPLETED'||call.estimatedMicros===null||call.estimatedMicros<0||!call.usageJson||!entry?.usage||
        entry.paidOperationId!==op.id||attribution.jobId!==input.jobId||attribution.funding!=='JOB_LINKED'||
        fingerprint(entry.usage)!==fingerprint(call.usageJson)||entry.actualModel!==call.actualModel||
        Math.abs(entry.estimate!-call.estimatedMicros/1e6)>0.000001)
        throw new Error('METHOD_ACQUISITION_USAGE_PROOF_MISSING');
      provedIds.add(entry.id);
    }
    return {operationId:op.id,inputFingerprint:op.inputFingerprint,resultFingerprint:fingerprint(op.resultJson),responseId:result.responseId};
  });
  if(input.entries.some(e=>!provedIds.has(e.id)))throw new Error('METHOD_ACQUISITION_CALL_PROOF_MISSING');
  const completed=input.stages.filter(s=>s.status==='COMPLETED'&& /^checkpoint:(?:METHOD_COVERAGE_ASSESSMENT_V1|METHOD_RECONSTRUCTION_V1_[1-4]|METHOD_COVERAGE_RESEARCH_V1_[1-4])(?::context:[a-f0-9]{64})?$/.test(s.stageKey));
  const preservedInvalidCheckpoints: Array<{id:string;stageKey:string;expectedHash:string;observedHash:string;requiredAction:string}> = [];
  const reusedCheckpoints=completed.flatMap(s=>{
    const saved=s.outputJson as {fingerprint?:string;outputHash?:string;value?:{operation?:{operationId?:string}}};
    if(!saved?.fingerprint||!saved.outputHash)throw new Error('METHOD_ACQUISITION_CHECKPOINT_INVALID');
    const observedHash=fingerprint(saved.value);
    if(observedHash!==saved.outputHash){
      // A corrupt derived acquisition result is never an evidence authority.
      // The completed paid web result remains separately validated above.
      if(!s.stageKey.includes('METHOD_COVERAGE_RESEARCH')||!preservedOperations.some(op=>op.operationId===saved.value?.operation?.operationId))
        throw new Error('METHOD_ACQUISITION_CHECKPOINT_INVALID');
      preservedInvalidCheckpoints.push({id:s.id,stageKey:s.stageKey,expectedHash:saved.outputHash,observedHash,
        requiredAction:'REINSPECT_VERIFIED_PAID_DISCOVERY_DO_NOT_REUSE_CHECKPOINT'});
      return [];
    }
    if(s.stageKey.includes('METHOD_COVERAGE_RESEARCH')&&!preservedOperations.some(op=>op.operationId===saved.value?.operation?.operationId))
      throw new Error('METHOD_ACQUISITION_OPERATION_PROOF_MISSING');
    return [{id:s.id,stageKey:s.stageKey,inputFingerprint:saved.fingerprint,outputHash:saved.outputHash}];
  });
  const research=completed.filter(s=>s.stageKey.includes('METHOD_COVERAGE_RESEARCH'));
  if(research.length!==input.operations.length||!completed.some(s=>s.stageKey.includes('ASSESSMENT'))||!completed.some(s=>s.stageKey.includes('RECONSTRUCTION')))
    throw new Error('METHOD_ACQUISITION_CHECKPOINT_INVALID');
  const denied=input.stages.filter(s=>s.status==='FAILED'&&/^checkpoint:METHOD_COVERAGE_RESEARCH_V1_[1-4]:context:[a-f0-9]{64}$/.test(s.stageKey)&&
    (s.errorJson as {message?:string})?.message?.startsWith('COST_LIMIT_REACHED: el trabajo restante completo'));
  if(!denied.length)throw new Error('METHOD_ACQUISITION_PREDISPATCH_PROOF_MISSING');
  return {version:METHOD_ACQUISITION_RECOVERY_VERSION,reusedCheckpoints,preservedInvalidCheckpoints,preservedOperations,
    preservedFailedPreflights:denied.map(s=>({id:s.id,stageKey:s.stageKey,inputFingerprint:(s.inputJson as {fingerprint?:string})?.fingerprint,error:s.errorJson})),
    responsesPreserved:input.responses.map(r=>({responseId:r.responseId,requestFingerprint:r.requestFingerprint,status:r.status,usageFingerprint:fingerprint(r.usage)})),
    completedDiscoveryOperations:input.operations.length,remainingDiscoveryPolicyAllowance:4-input.operations.length,
    newDiscoveryAuthorizedByRecovery:false,completedOutputsReusedOnlyForMatchingInputs:true};
}
