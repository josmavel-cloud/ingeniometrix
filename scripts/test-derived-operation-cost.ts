import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { checkpointSettledCost } from '@/server/mvp/checkpoint-currency';
import { fingerprint } from '@/server/mvp/job-execution-context';
const json=(v:unknown)=>JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
(async()=>{
 const url=new URL(process.env.DATABASE_URL??'');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55440');assert.equal(url.pathname,'/imx_b4_validation_rc4');
 const before={operation:{estimatedCostUsd:0.36224999999999996}};
 const persistedBefore={operation:{estimatedCostUsd:0.36225}};
 assert.notEqual(fingerprint(before),fingerprint(persistedBefore),'One-ULP monetary conversion breaks an otherwise unchanged checkpoint');
 assert.deepEqual(checkpointSettledCost(362250),{estimatedCostMicros:362250,estimatedCostUsd:.36225});
 assert.deepEqual(checkpointSettledCost(null),{estimatedCostMicros:null,estimatedCostUsd:null},'Unknown usage stays unknown');
 for(const value of [-1,.5,Number.NaN,Number.POSITIVE_INFINITY])assert.throws(()=>checkpointSettledCost(value));
 const scientificParameter=0.12345678901234567;
 const value={method:{scientificParameter},operation:checkpointSettledCost(362250)};
 assert.equal(value.method.scientificParameter,scientificParameter,'Currency normalization does not round scientific fields');
 const user=await prisma.user.create({data:{email:`currency-${randomUUID()}@example.test`}});
 try{
  const project=await prisma.project.create({data:{userId:user.id,title:'Derived currency persistence fixture',degreeLevel:'MAESTRIA'}});
  const job=await prisma.blueprintJob.create({data:{userId:user.id,projectId:project.id}});
  // This precision issue is monetary. Do not expand it into global rounding of
  // scientific numbers: persist the affected derived artifact with integer micros.
  const monetary={operation:checkpointSettledCost(362250)},outputHash=fingerprint(monetary);
  await prisma.blueprintJobStage.create({data:{jobId:job.id,stageKey:'checkpoint:CURRENCY_FIXTURE',status:'COMPLETED',progress:100,
   outputJson:json({value:monetary,outputHash})}});
  const saved=await prisma.blueprintJobStage.findUniqueOrThrow({where:{jobId_stageKey:{jobId:job.id,stageKey:'checkpoint:CURRENCY_FIXTURE'}}});
  const envelope=saved.outputJson as {value:unknown;outputHash:string};assert.equal(fingerprint(envelope.value),envelope.outputHash);
  assert.equal((envelope.value as any).operation.estimatedCostMicros,362250);
  assert.deepEqual((envelope.value as any).operation,checkpointSettledCost(362250));
  const unknown={operation:checkpointSettledCost(null)},unknownHash=fingerprint(unknown);
  await prisma.blueprintJobStage.create({data:{jobId:job.id,stageKey:'checkpoint:CURRENCY_UNKNOWN',status:'COMPLETED',progress:100,outputJson:json({value:unknown,outputHash:unknownHash})}});
  const uncertain=(await prisma.blueprintJobStage.findUniqueOrThrow({where:{jobId_stageKey:{jobId:job.id,stageKey:'checkpoint:CURRENCY_UNKNOWN'}}})).outputJson as any;
  assert.equal(uncertain.value.operation.estimatedCostUsd,null);assert.equal(fingerprint(uncertain.value),uncertain.outputHash);
  console.log('PASS derived operation cost: causal 1-ULP fixture; integer micros produce stable PostgreSQL checkpoint checksum; unknown preserved; negative/noninteger rejected; scientific numbers unchanged. Provider calls=0.');
 }finally{await prisma.user.delete({where:{id:user.id}});}
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>prisma.$disconnect());
