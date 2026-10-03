import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { currentJobExecution, fingerprint, stageCheckpoint, versionedCheckpointKey } from './job-execution-context';
import { METHOD_DOCUMENT_INSPECTION_VERSION } from './design-support-document';

export const METHOD_COVERAGE_APPROVAL_VERSION='method-coverage-approval.v1';
const publicationPrefix='checkpoint:METHOD_COVERAGE_APPROVAL';
type ResolutionInput={decisionFingerprint:string;policyVersion:string;inspectionVersion:string;maxResearchOperations:number;support:unknown[]};
type Resolved={decisionFingerprint:string;contextFingerprint:string;academicLevel:string;effectiveEvidenceFingerprint:string;
  supportAddendum:{checksum:string;userId:string;projectId:string;jobId:string;definitionHash:string};
  alternative:unknown;targetedReview:{intentPreserved:boolean;methodCoherent:boolean;evidenceSupported:boolean;blockingScientificIssue:boolean};
  coverageResult:{evidenceSupported:boolean};methodCoverage:unknown;};
type Publication={version:string;jobId:string;projectId:string;userId:string;decisionFingerprint:string;contextFingerprint:string;academicLevel:string;
  checkpointId:string;stageKey:string;inputFingerprint:string;outputHash:string;resolutionInput:ResolutionInput;effectiveEvidenceFingerprint:string;};
type Row={id:string;jobId:string;stageKey:string;status:string;outputJson:unknown};
type Envelope<T>={value:T;fingerprint:string;outputHash:string};

export function validatePublishedMethodCoverage(publicationRow:Row,target:Row,expected:{jobId:string;userId:string;projectId:string;contextFingerprint:string;academicLevel:string;decisionFingerprint:string}){
  const publication=publicationRow.outputJson as Envelope<Publication>;
  const selected=target.outputJson as Envelope<Resolved>;
  if(publicationRow.status!=='COMPLETED'||publicationRow.jobId!==expected.jobId||!publicationRow.stageKey.startsWith(publicationPrefix)||
    !publication?.value||fingerprint(publication.value)!==publication.outputHash)throw new Error('METHOD_APPROVAL_PUBLICATION_INVALID');
  const p=publication.value;
  const expectedPublicationFingerprint=fingerprint({version:'b4.v1',jobId:expected.jobId,inputs:p});
  if(publication.fingerprint!==expectedPublicationFingerprint||p.version!==METHOD_COVERAGE_APPROVAL_VERSION||p.jobId!==expected.jobId||
    p.userId!==expected.userId||p.projectId!==expected.projectId||p.contextFingerprint!==expected.contextFingerprint||p.academicLevel!==expected.academicLevel||
    p.decisionFingerprint!==expected.decisionFingerprint||p.resolutionInput.decisionFingerprint!==p.decisionFingerprint||
    p.resolutionInput.inspectionVersion!==METHOD_DOCUMENT_INSPECTION_VERSION||p.resolutionInput.policyVersion!=='method-coverage-reconstruction.v1')
    throw new Error('METHOD_APPROVAL_IDENTITY_CHANGED');
  if(target.id!==p.checkpointId||target.jobId!==expected.jobId||target.stageKey!==p.stageKey||target.status!=='COMPLETED'||
    !/^checkpoint:AUTONOMOUS_DESIGN(?::context:[a-f0-9]{64})?$/.test(target.stageKey)||!selected?.value||
    selected.fingerprint!==p.inputFingerprint||selected.fingerprint!==fingerprint({version:'b4.v1',jobId:expected.jobId,inputs:p.resolutionInput})||
    selected.outputHash!==p.outputHash||fingerprint(selected.value)!==selected.outputHash)
    throw new Error('METHOD_APPROVAL_CHECKPOINT_INVALID');
  const result=selected.value,review=result.targetedReview;
  if(result.decisionFingerprint!==p.decisionFingerprint||result.contextFingerprint!==p.contextFingerprint||result.academicLevel!==p.academicLevel||
    result.effectiveEvidenceFingerprint!==p.effectiveEvidenceFingerprint||result.supportAddendum?.checksum!==p.effectiveEvidenceFingerprint||
    result.supportAddendum.jobId!==expected.jobId||result.supportAddendum.userId!==expected.userId||result.supportAddendum.projectId!==expected.projectId||
    result.supportAddendum.definitionHash!==expected.contextFingerprint||!review?.intentPreserved||!review.methodCoherent||!review.evidenceSupported||
    review.blockingScientificIssue||!result.coverageResult?.evidenceSupported||!result.methodCoverage)
    throw new Error('METHOD_APPROVAL_SCIENTIFIC_RESULT_INVALID');
  return result;
}

/** Publish a pointer to the exact validated output, never overwrite its history.
 * This is bookkeeping after independent review, not an approval shortcut. */
export async function publishMethodCoverageApproval<T>(resolutionKey:string,resolutionInput:ResolutionInput,resolved:T):Promise<T>{
  const execution=currentJobExecution();
  if(!execution)return resolved;
  const job=await prisma.blueprintJob.findUniqueOrThrow({where:{id:execution.jobId},select:{id:true,userId:true,projectId:true}});
  const target=await prisma.blueprintJobStage.findUniqueOrThrow({where:{jobId_stageKey:{jobId:job.id,stageKey:`checkpoint:${resolutionKey}`}}});
  const saved=target.outputJson as Envelope<Resolved>,result=resolved as Resolved;
  if(target.status!=='COMPLETED'||!saved?.value||fingerprint(resolved)!==saved.outputHash||fingerprint(saved.value)!==saved.outputHash)
    throw new Error('METHOD_APPROVAL_CHECKPOINT_INVALID');
  const value:Publication={version:METHOD_COVERAGE_APPROVAL_VERSION,jobId:job.id,userId:job.userId,projectId:job.projectId,
    decisionFingerprint:result.decisionFingerprint,contextFingerprint:result.contextFingerprint,academicLevel:result.academicLevel,
    checkpointId:target.id,stageKey:target.stageKey,inputFingerprint:saved.fingerprint,outputHash:saved.outputHash,
    resolutionInput,effectiveEvidenceFingerprint:result.effectiveEvidenceFingerprint};
  const key=await versionedCheckpointKey('METHOD_COVERAGE_APPROVAL',value);
  // Validate before writing the publication using the same consumer contract.
  validatePublishedMethodCoverage({id:'prospective',jobId:job.id,stageKey:`checkpoint:${key}`,status:'COMPLETED',
    outputJson:{value,fingerprint:fingerprint({version:'b4.v1',jobId:job.id,inputs:value}),outputHash:fingerprint(value)}},target,
    {...job,jobId:job.id,contextFingerprint:result.contextFingerprint,academicLevel:result.academicLevel,decisionFingerprint:result.decisionFingerprint});
  await stageCheckpoint(key,value,async()=>value);
  return resolved;
}

export async function readPublishedMethodCoverage(db:Pick<Prisma.TransactionClient,'blueprintJobStage'>,
  expected:{jobId:string;userId:string;projectId:string;contextFingerprint:string;academicLevel:string;decisionFingerprint:string}){
  const publication=await db.blueprintJobStage.findFirst({where:{jobId:expected.jobId,status:'COMPLETED',stageKey:{startsWith:publicationPrefix}},
    orderBy:[{completedAt:'desc'},{id:'desc'}]});
  if(!publication)return null;
  const value=(publication.outputJson as unknown as Envelope<Publication>)?.value;
  if(!value?.checkpointId)throw new Error('METHOD_APPROVAL_PUBLICATION_INVALID');
  const target=await db.blueprintJobStage.findFirst({where:{id:value.checkpointId,jobId:expected.jobId}});
  if(!target)throw new Error('METHOD_APPROVAL_CHECKPOINT_INVALID');
  return {row:target,value:validatePublishedMethodCoverage(publication,target,expected),publicationId:publication.id};
}
