import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { fingerprint } from "@/server/mvp/job-execution-context";
import { METHOD_CONTEXT_ADMISSION_VERSION } from "@/server/mvp/method-coverage-context";
import { authorizeMethodContextRecovery } from "@/server/mvp/scientific-continuation-recovery";
async function main(){
  const [identityPath,requestPath,countPath]=process.argv.slice(2);
  if(!identityPath||!requestPath||!countPath)throw new Error("Usage: authorize-method-context-recovery identity.json request.json exact-count.json");
  const identity=JSON.parse(await readFile(identityPath,"utf8"));
  const request=JSON.parse(await readFile(requestPath,"utf8"));
  const count=JSON.parse(await readFile(countPath,"utf8"));
  if(count.operation!=="INPUT_TOKEN_COUNT_ONLY_NO_GENERATION"||count.model!==request.model||
    count.promptVersion!==request.trackingAttribution.promptVersion||count.promptBytes!==Buffer.byteLength(request.prompt)||
    count.maxOutputTokens!==request.maxOutputTokens||count.contextTotal!==count.inputTokens+count.maxOutputTokens||!count.allowed)
    throw new Error("EXACT_COUNT_REQUEST_MISMATCH");
  const audit=await authorizeMethodContextRecovery({...identity,request,admission:{version:METHOD_CONTEXT_ADMISSION_VERSION,
    requestFingerprint:fingerprint(request),schemaFingerprint:fingerprint(request.schema),promptVersion:count.promptVersion,
    effectiveEvidenceFingerprint:identity.effectiveEvidenceFingerprint,digestFingerprint:identity.digestFingerprint,
    inputTokens:count.inputTokens,maxOutputTokens:count.maxOutputTokens,contextLimit:count.contextLimit,
    countProvenance:count.provenance,maximumUsd:count.maximumUsd}});
  console.log(JSON.stringify({auditId:audit.id,eventType:audit.eventType,requestFingerprint:fingerprint(request),enqueued:false,providerDispatches:0}));
}
main().catch(error=>{console.error(error instanceof Error?error.message:"METHOD_CONTEXT_RECOVERY_FAILED");process.exitCode=1;}).finally(()=>prisma.$disconnect());
