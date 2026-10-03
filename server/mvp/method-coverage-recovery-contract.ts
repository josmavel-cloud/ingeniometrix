import { fingerprint, type BackgroundProviderResponseRecord } from './job-execution-context';

export const METHOD_COVERAGE_EXECUTION_RECOVERY_VERSION = 'method-coverage-execution-recovery.v1';
type Stage = { id: string; stageKey: string; status: string; inputJson: unknown; outputJson: unknown; errorJson: unknown };
type Entry = { id: string; status: string; estimate: number | null; usage?: unknown; actualModel?: string | null };
type PriorRecovery = { priorResponseId?: string; priorRequestFingerprint?: string; priorUsageFingerprint?: string };

/** A corrected execution policy may consume intact completed outputs. Failed
 * preflights are not provider operations. Never infer zero usage from an error. */
export function validateMethodExecutionRecovery(input: { priorMessage: string; projectId: string; runId: string;
  responses: BackgroundProviderResponseRecord[]; entries: Entry[]; stages: Stage[];
  priorAssessmentRecovery: PriorRecovery | null; discoveryOperationsSinceJobCreated: number;
}) {
  if (input.priorMessage !== 'METHOD_HANDOFF_INVALID' || !input.priorAssessmentRecovery)
    throw new Error('METHOD_EXECUTION_RECOVERY_NOT_ELIGIBLE');
  if (!input.entries.length || input.entries.some(e=>e.status!=='completed'||e.estimate===null||!Number.isFinite(e.estimate)||e.estimate<0))
    throw new Error('SCIENTIFIC_CONTINUATION_USAGE_UNCERTAIN');
  const responseIds = new Set<string>();
  for (const r of input.responses) {
    const c=r.correlation as {projectId?:string;runId?:string;promptVersion?:string;stage?:string};
    const e=input.entries.find(x=>x.id===r.reservationId);
    if (!r.responseId || !r.requestFingerprint || !r.actualModel || !r.usage || !e?.usage || fingerprint(r.usage)!==fingerprint(e.usage) ||
      e.actualModel!==r.actualModel || c.stage!=="method_coverage" || c.projectId!==input.projectId || c.runId!==input.runId ||
      !['COMPLETED','INCOMPLETE'].includes(r.status)) throw new Error('METHOD_EXECUTION_RESPONSE_UNCERTAIN');
    if (r.status==='INCOMPLETE' && (r.providerStatus!=='incomplete'||r.responseId!==input.priorAssessmentRecovery.priorResponseId||
      r.requestFingerprint!==input.priorAssessmentRecovery.priorRequestFingerprint || fingerprint(r.usage)!==input.priorAssessmentRecovery.priorUsageFingerprint))
      throw new Error('METHOD_EXECUTION_UNAUTHORIZED_INCOMPLETE_RESPONSE');
    if(r.status==='COMPLETED'&&r.providerStatus!=='completed')throw new Error('METHOD_EXECUTION_RESPONSE_UNCERTAIN');
    responseIds.add(r.reservationId!);
  }
  if(input.entries.some(e=>!responseIds.has(e.id)))throw new Error('METHOD_EXECUTION_CALL_PROOF_MISSING');
  for(const prompt of ['method-coverage-assessment.v2','method-coverage-reconstruction.v2'])
    if(!input.responses.some(r=>r.status==='COMPLETED'&&(r.correlation as {promptVersion?:string}).promptVersion===prompt))
      throw new Error('METHOD_EXECUTION_COMPLETED_RESPONSE_MISSING');
  const retained=input.stages.filter(s=> /^checkpoint:METHOD_COVERAGE_ASSESSMENT_V1(?::context:[a-f0-9]{64})?$/.test(s.stageKey)&&s.status==='COMPLETED' ||
    /^checkpoint:METHOD_RECONSTRUCTION_V1_1(?::context:[a-f0-9]{64})?$/.test(s.stageKey)&&s.status==='COMPLETED' ||
    ['checkpoint:CORPUS_METHOD_PROFILE_V1','checkpoint:METHOD_COVERAGE_BEFORE_V1'].includes(s.stageKey));
  if(retained.length!==4)throw new Error('METHOD_EXECUTION_CHECKPOINTS_MISSING');
  const reusedCheckpoints=retained.map(s=>{
    const saved=s.outputJson as {fingerprint?:string;outputHash?:string;value?:unknown};
    if(s.status!=='COMPLETED'||!saved?.fingerprint||!saved.outputHash||fingerprint(saved.value)!==saved.outputHash)
      throw new Error('METHOD_EXECUTION_CHECKPOINT_INVALID');
    return {id:s.id,stageKey:s.stageKey,inputFingerprint:saved.fingerprint,outputHash:saved.outputHash};
  });
  const denied=input.stages.filter(s=>/^checkpoint:METHOD_COVERAGE_RESEARCH_V1_[1-4]$/.test(s.stageKey));
  if(!denied.length||denied.length>4||input.discoveryOperationsSinceJobCreated!==0)
    throw new Error('METHOD_EXECUTION_PRE_DISPATCH_PROOF_MISSING');
  const preservedFailedPreflights=denied.map(s=>{
    const old=s.inputJson as {fingerprint?:string;attempts?:number};
    const error=s.errorJson as {message?:string};
    if(s.status!=='FAILED'||!old?.fingerprint||!error?.message?.startsWith('COST_LIMIT_REACHED: el trabajo restante completo'))
      throw new Error('METHOD_EXECUTION_PRE_DISPATCH_PROOF_MISSING');
    return {id:s.id,stageKey:s.stageKey,inputFingerprint:old.fingerprint,attempts:old.attempts,error:error.message};
  });
  return {version:METHOD_COVERAGE_EXECUTION_RECOVERY_VERSION,reusedCheckpoints,preservedFailedPreflights,
    responsesPreserved:input.responses.map(r=>({responseId:r.responseId,requestFingerprint:r.requestFingerprint,status:r.status,usageFingerprint:fingerprint(r.usage)})),
    providerDiscoveryDispatches:0,completedOutputsReusedOnlyForMatchingInputs:true};
}
