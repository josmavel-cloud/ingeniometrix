import assert from 'node:assert/strict';
import { randomUUID,createHash } from 'node:crypto';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { publishMethodCoverageApproval,readPublishedMethodCoverage,validatePublishedMethodCoverage } from '@/server/mvp/autonomous-design-approval';
import { approvedDesignForCurrentJob,approvedGenerationContextForCurrentJob } from '@/server/mvp/scientific-decision-service';
import { fingerprint,withJobExecution,stageCheckpoint,versionedCheckpointKey } from '@/server/mvp/job-execution-context';
import { sealDesignSupport } from '@/server/mvp/design-support-addendum';
import { decisionContextFingerprint } from '@/server/mvp/scientific-decision-contracts';
import { METHOD_DOCUMENT_INSPECTION_VERSION } from '@/server/mvp/design-support-document';
import { ledger,definition,design } from './test-b3-scientific-contracts';
const json=(v:unknown)=>JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
(async()=>{
 const url=new URL(process.env.DATABASE_URL??'');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55440');assert.equal(url.pathname,'/imx_b4_validation_rc4');
 global.fetch=async()=>{throw Error('NO_PROVIDERS_IN_APPROVAL_REGRESSION');};
 const user=await prisma.user.create({data:{email:`approval-${randomUUID()}@example.test`}});
 const directory=await mkdtemp(path.join(os.tmpdir(),'imx-approval-'));
 try{
  const project=await prisma.project.create({data:{userId:user.id,title:'Approval fixture, not scientific acceptance',degreeLevel:'MAESTRIA'}});
  const startedAt=new Date();const job=await prisma.blueprintJob.create({data:{userId:user.id,projectId:project.id,status:'RUNNING',startedAt,lockedAt:startedAt,
   metadataJson:{scientificProfile:'rc4',executionPolicy:'b4.v1'}}});
  const base=structuredClone(ledger);base.project_id=project.id;const intake={topic:'Synthetic approval fixture'};
  const contextFingerprint=decisionContextFingerprint(intake,base),decisionFingerprint=fingerprint('synthetic-decision');
  const documentPath=path.join(directory,'support.html'),documentBytes=Buffer.from('<p>Retained methodological passage for this isolated contract test only.</p>');
  await writeFile(documentPath,documentBytes,{mode:0o600});
  const addendum=sealDesignSupport({userId:user.id,projectId:project.id,jobId:job.id,definitionHash:contextFingerprint,policyVersion:'method-coverage-reconstruction.v1',sources:[{
   sourceId:'DS-fixture',gapId:'gap-fixture',title:'Synthetic support',authors:[],year:null,doi:null,observationIds:['observed-fixture'],provenance:'SYSTEM_DESIGN_SUPPORT',
   document:{observedUrl:'https://example.test/support',finalUrl:'https://example.test/support',sha256:createHash('sha256').update(documentBytes).digest('hex'),mediaType:'text/html',title:'Synthetic support',privateArtifactPath:documentPath,
    passages:[{text:'Retained methodological passage for this isolated contract test only.',locator:'paragraph:1',page:null,contentKind:'FULL_TEXT_PASSAGE'}]}}]});
  const alternative={id:'A1-R1',definition,research_design:design};
  const result={decisionFingerprint,contextFingerprint,academicLevel:'MAESTRIA',alternative,supportAddendum:addendum,effectiveEvidenceFingerprint:addendum.checksum,
   targetedReview:{intentPreserved:true,methodCoherent:true,evidenceSupported:true,blockingScientificIssue:false},coverageResult:{evidenceSupported:true},methodCoverage:{fixture:true}};
  const input={decisionFingerprint,policyVersion:'method-coverage-reconstruction.v1',inspectionVersion:METHOD_DOCUMENT_INSPECTION_VERSION,maxResearchOperations:4,support:[]};
  // Legacy failed key stays intact, while the actual resolution uses a new key.
  const legacy=await prisma.blueprintJobStage.create({data:{jobId:job.id,stageKey:'checkpoint:AUTONOMOUS_DESIGN',status:'FAILED',progress:0,
   inputJson:{fingerprint:'old-input'},errorJson:{message:'Historical failure retained'}}});
  await withJobExecution({jobId:job.id,startedAt,stage:'resolving_design'},async()=>{
   await stageCheckpoint('SCIENTIFIC_DECISION',{fixture:true},async()=>({decisionFingerprint}));
   const key=await versionedCheckpointKey('AUTONOMOUS_DESIGN',input);
   const resolved=await stageCheckpoint(key,input,async()=>result);
   await publishMethodCoverageApproval(key,input,resolved);
   await publishMethodCoverageApproval(key,input,resolved);
   const expected={jobId:job.id,userId:user.id,projectId:project.id,contextFingerprint,academicLevel:'MAESTRIA',decisionFingerprint};
   const published=(await readPublishedMethodCoverage(prisma,expected))!;
   assert.equal(published.row.stageKey,`checkpoint:${key}`);assert.equal(published.value.effectiveEvidenceFingerprint,addendum.checksum);
   assert.equal(await prisma.blueprintJobStage.count({where:{jobId:job.id,stageKey:{startsWith:'checkpoint:METHOD_COVERAGE_APPROVAL'}}}),1);
   const publication=await prisma.blueprintJobStage.findUniqueOrThrow({where:{id:published.publicationId}});
   assert.throws(()=>validatePublishedMethodCoverage(publication,published.row,{...expected,jobId:randomUUID()}),/PUBLICATION_INVALID/);
   assert.throws(()=>validatePublishedMethodCoverage(publication,published.row,{...expected,decisionFingerprint:'stale'}),/IDENTITY_CHANGED/);
   assert.throws(()=>validatePublishedMethodCoverage(publication,{...published.row,outputJson:{...(published.row.outputJson as any),outputHash:'tampered'}},expected),/CHECKPOINT_INVALID/);
   const dishonest={...result,targetedReview:{...result.targetedReview,evidenceSupported:false}};
   const forgedInput={...input,support:['changed-context']};const forgedKey=await versionedCheckpointKey('AUTONOMOUS_DESIGN',forgedInput);
   await stageCheckpoint(forgedKey,forgedInput,async()=>dishonest);
   await assert.rejects(()=>publishMethodCoverageApproval(forgedKey,forgedInput,dishonest),/SCIENTIFIC_RESULT_INVALID/);
   const approved=await approvedDesignForCurrentJob(intake,base);assert.deepEqual(approved,alternative);
   const composed=await approvedGenerationContextForCurrentJob(intake,base);
   assert.deepEqual(composed.design,alternative);assert.deepEqual(composed.methodCoverage,{fixture:true});
   assert.equal(composed.effectiveEvidenceFingerprint,addendum.checksum);
   assert.ok(composed.ledger.source_registry.some(source=>source.source_id==='DS-fixture'&&source.provider==='SYSTEM_DESIGN_SUPPORT'));
   assert.ok(composed.ledger.semantic_extractions.some(extraction=>extraction.source_id==='DS-fixture'));
   assert.equal(base.source_registry.length,ledger.source_registry.length,'Frozen input ledger unchanged');
   assert.deepEqual(await prisma.blueprintJobStage.findUniqueOrThrow({where:{id:legacy.id}}),legacy,'Historical failed design checkpoint unchanged');
   await assert.rejects(()=>approvedGenerationContextForCurrentJob({...intake,topic:'Different scope'},base),/IDENTITY_CHANGED/);
  });
  console.log('PASS method approval: versioned checkpoint publication; shared design/effective evidence in composition; independent rejection retained; stale/foreign/corrupt identities rejected; legacy checkpoint immutable; idempotent publication. Provider calls=0.');
 }finally{await prisma.user.delete({where:{id:user.id}});await rm(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>prisma.$disconnect());
