// One isolated account-compatibility request. This file has no project discovery path.
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { createOpenAiWebDiscoveryProvider } from "@/server/retrieval/web-discovery-provider";
import { runWebDiscoveryOperation } from "@/server/retrieval/web-discovery-operation";

const fixture = "Find the original RFC Editor record for RFC 9110 HTTP Semantics.";
async function main() {
  if (process.env.IMX_RUN_WEB_DISCOVERY_SMOKE !== "1" || process.env.IMX_ENVIRONMENT !== "staging" ||
      new URL(process.env.DATABASE_URL ?? "").pathname !== "/imx_g5_staging" ||
      process.env.IMX_PAYMENT_MODE !== "sandbox" || process.env.IMX_ENABLE_ASTRA_WEB_DISCOVERY === "1") {
    throw new Error("ISOLATED_STAGING_SMOKE_CONTEXT_REQUIRED");
  }
  const apiKey = process.env.OPENAI_API_KEY;
  const billingProjectId = process.env.IMX_WEB_SMOKE_BILLING_PROJECT_ID;
  if (!apiKey || !billingProjectId) throw new Error("SMOKE_CREDENTIAL_OR_BILLING_OWNER_MISSING");
  const owner = await prisma.project.findUnique({where:{id:billingProjectId},select:{userId:true}});
  if (!owner) throw new Error("SMOKE_BILLING_OWNER_NOT_FOUND");
  const scientificState = async () => ({ referenceCount: await prisma.reference.count(),
    projectReferences: await prisma.projectReference.findMany({select:{id:true,projectId:true,referenceId:true,selected:true,selectedOrder:true},orderBy:{id:"asc"}}) });
  const before = createHash("sha256").update(JSON.stringify(await scientificState())).digest("hex");
  const intentHash = createHash("sha256").update(fixture).digest("hex");
  const provider = createOpenAiWebDiscoveryProvider({apiKey});
  const result = await runWebDiscoveryOperation({userId:owner.userId,smoke:true,
    gapSetHash:createHash("sha256").update("isolated-rfc9110-gap.v1").digest("hex"),
    seenSetHash:createHash("sha256").update("isolated-empty-seen-set.v1").digest("hex"),
    researchIntentProjection:{searchIntentHash:intentHash,scientificSignals:[{field:"purpose",value:fixture}]},
    evidenceGaps:[{gapId:"isolated-public-technical-reference",searchIntentHash:intentHash,
      kind:"DISCOVERY",importance:"MATERIAL",requiredDimension:"Original public RFC Editor technical record",
      desiredEvidenceRole:"DIRECT",preferredSourceTypes:["SCHOLARLY"],unresolvedPremises:[],webDiscoveryEligible:true}],
    seenSourceIdentities:[],policy:{maxToolCalls:1,maxCandidates:1,maxOutputTokens:2048},provider});
  const operation = await prisma.paidOperation.findUniqueOrThrow({where:{id:result.operationId},
    select:{status:true,calls:{select:{status:true,estimatedMicros:true,reservedMicros:true}}}});
  const after = createHash("sha256").update(JSON.stringify(await scientificState())).digest("hex");
  if (before !== after) throw new Error("SMOKE_SCIENTIFIC_STATE_CHANGED");
  console.log(JSON.stringify({state:result.state,responseId:result.responseId,model:result.model,
    toolCalls:result.toolCallCount,searchActions:result.searchActionCount,
    observedSourceCount:result.observations.length,validatedCandidateCount:result.candidates.length,
    rejectedProposalReasons:result.rejectedProposals.map(p=>p.reason),
    usage:result.usage,estimatedCostUsd:result.estimatedCostUsd,
    paidOperationStatus:operation.status,paidCallStatus:operation.calls.map(c=>c.status),
    paidCallEstimatedMicros:operation.calls.map(c=>c.estimatedMicros),
    sourcePoolMutations:0,selectionMutations:0}));
}
main().catch(error=>{
  // Never dump an API exception or request envelope; either may include credentials.
  console.error(JSON.stringify({state:"SMOKE_FAILED",category:error?.code??error?.name??"UNKNOWN",httpStatus:error?.status??null}));
  process.exitCode=1;
}).finally(()=>prisma.$disconnect());
