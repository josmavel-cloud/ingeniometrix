import { validateMethodAcquisitionRecovery } from "@/server/mvp/method-acquisition-recovery-contract";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createConversationalProject, readDefinition, changeDefinition, confirmDefinition } from "@/server/projects/conversational-definition-service";
import { prepareSelectedSources } from "@/server/projects/source-preparation-service";
import { confirmEvidenceSet } from "@/server/projects/evidence-set-service";
import { generationContextForUser } from "@/server/projects/generation-context-service";
import { fixtureSourceAssessments } from "./fixtures/source-sufficiency-test-context";
import { updateSelectedProjectReferences } from "@/server/retrieval/reference-service";
import { enqueueBlueprintJobForUser, runNextBlueprintJobStage, resumeLatestBlueprintJobForUser, type ReleaseJobExecutor } from "@/server/blueprint-v2/jobs/blueprint-job-service";
import { authorizeScientificContinuationQa, enqueueScientificContinuationForUser, readScientificContinuation, validateContinuationCheckpoint } from "@/server/mvp/scientific-continuation";
import { recoverScientificContinuationForUser, validateMethodAssessmentRecovery, scientificContinuationAttemptLimit } from "@/server/mvp/scientific-continuation-recovery";
import { fingerprint, stageCheckpoint } from "@/server/mvp/job-execution-context";
import { decisionContextFingerprint } from "@/server/mvp/scientific-decision-contracts";
import { assertQaCommitment, qaJobPolicy, QA_COST_POLICY_VERSION } from "@/server/mvp/qa-acceptance-policy";
import { reserveInternalGenerationJob } from "@/server/commercial/internal-generation";
import { ledger } from "./test-b3-scientific-contracts";
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55440"); assert.equal(url.pathname, "/imx_b4_validation_rc4");
  global.fetch = async () => { throw new Error("No provider calls permitted"); };
  const user = await prisma.user.create({ data: { email: `continuation-${randomUUID()}@example.test` } });
  const other = await prisma.user.create({ data: { email: `continuation-other-${randomUUID()}@example.test` } });
  const references: string[] = [];
  try {
    const capability = await prisma.internalGenerationCapability.create({ data: { userId: user.id, grantKey: randomUUID(), issuedBy: "isolated-test", reason: "Continuation authorization fixture" } });
    const campaign = await prisma.qaAcceptanceCampaign.create({ data: { id: randomUUID(), userId: user.id, issuedBy: "isolated-test",
      reason: "Scientific continuation fixture", expiresAt: new Date(Date.now() + 3600_000), totalCapMicros: 10000000, jobCapMicros: 5000000, maxJobs: 2 } });
    const created = await createConversationalProject(user.id, { intakeMode: "conversation", idea: "Feedback in digital mathematics", degreeLevel: "MAESTRIA", requestId: randomUUID() });
    const view = (await readDefinition(user.id, created.id))!;
    const edited = await changeDefinition(user.id, created.id, { requestId: randomUUID(), baseRevision: view.revision, etag: view.etag,
      action: { kind: "EDIT", field: "concepts", value: "feedback; digital mathematics", knowledge: "KNOWN" } });
    await confirmDefinition(user.id, created.id, edited.revision, edited.definitionHash);
    const project = await prisma.project.findUniqueOrThrow({ where: { id: created.id }, include: { intake: true } });
    for (const index of [1, 2, 3]) {
      const reference = await prisma.reference.create({ data: { title: `Evidencia de aprendizaje ${index}`, normalizedTitle: `continuation fixture ${randomUUID()}`,
        authorsJson: ["Autor sintético"], abstract: `Estudio sintético sobre experiencias de aprendizaje digital ${index}.`, year: 2020 + index } });
      references.push(reference.id);
      await prisma.projectReference.create({ data: { projectId: project.id, referenceId: reference.id, selected: false, sourceProvider: "SYSTEM", relevanceScore: 50 } });
    }
    await fixtureSourceAssessments(user.id, project.id, references);
    await updateSelectedProjectReferences(user.id, project.id, references);
    await prepareSelectedSources(user.id, project.id);
    await confirmEvidenceSet(user.id, project.id);
    const expectedContext = await generationContextForUser(user.id, project.id);
    const base = structuredClone(ledger); base.project_id = project.id;
    const executor: ReleaseJobExecutor = {
      materialize: async () => {
        const step = await prisma.mvpStepRun.create({ data: { projectId: project.id, userId: user.id, stepKey: "step_5_source_health", status: "COMPLETED" } });
        base.step_run_id = step.id;
        await prisma.projectEvidenceLedger.create({ data: { projectId: project.id, stepRunId: step.id, citationStyle: "APA7",
          sourceRegistryJson: json(base.source_registry), referencesJson: json(base.references), ledgerJson: json(base) } });
        return { status: "completed", project_id: project.id, step_run_id: step.id, artifact_manifest_path: "/tmp/continuation-fixture-manifest" } as never;
      },
      recommend: async () => stageCheckpoint("SCIENTIFIC_DECISION", { fixture: true }, async () => {
        const value = { contextFingerprint: decisionContextFingerprint(project.intake, base), intent: {}, decision: { alternatives: [] }, evidence_pack: {} };
        return { ...value, decisionFingerprint: fingerprint(value) } as never;
      }),
      resolve: async () => { throw new Error("AUTONOMOUS_DESIGN_UNRESOLVED: fixture, not scientific acceptance"); },
      generate: async () => { throw new Error("Must not generate in continuation infrastructure fixture"); },
    };
    const parent = await enqueueBlueprintJobForUser(user.id, project.id, { scientificProfile: "rc4", expectedContext, operationId: randomUUID() });
    for (let i = 0; i < 4; i++) await runNextBlueprintJobStage(parent.id, executor);
    await prisma.blueprintJob.update({ where: { id: parent.id }, data: { attempts: 8, maxAttempts: 8 } });
    await prisma.blueprintJobStage.create({ data: { jobId: parent.id, stageKey: "control:cost", status: "FAILED", progress: 100,
      outputJson: { entries: [{ estimate: 0.35, maximum: 0.5, status: "completed", stage: "HISTORICAL_FIXTURE" }] } } });
    const old = await prisma.blueprintJob.create({ data: { projectId: project.id, userId: user.id, status: "FAILED",
      metadataJson: { qaCampaignId: campaign.id, costPolicyVersion: QA_COST_POLICY_VERSION } } });
    await prisma.blueprintJobStage.create({ data: { jobId: old.id, stageKey: "control:cost", status: "FAILED", progress: 100,
      outputJson: { entries: [{ estimate: null, maximum: 0.41215, status: "failed_unknown_usage" }] } } });
    const beforeParent = await prisma.blueprintJob.findUniqueOrThrow({ where: { id: parent.id } });
    const beforeCost = await prisma.$transaction(tx => assertQaCommitment(tx, user.id, 0));
    assert.equal(beforeCost?.committedBefore, 0.76215);
    await assert.rejects(() => enqueueScientificContinuationForUser(other.id, project.id, parent.id), /PROJECT_NOT_FOUND/);
    await assert.rejects(() => enqueueScientificContinuationForUser(user.id, project.id, parent.id), /NOT_AUTHORIZED/);
    const grant = await authorizeScientificContinuationQa({ userId: user.id, projectId: project.id, parentJobId: parent.id,
      issuedBy: "isolated-test", reason: "New methodological contract explicitly authorized", extendCampaign48Hours: true });
    const replayGrant = await authorizeScientificContinuationQa({ userId: user.id, projectId: project.id, parentJobId: parent.id,
      issuedBy: "isolated-test", reason: "Duplicate request", extendCampaign48Hours: true });
    assert.equal(grant.id, replayGrant.id);
    assert.equal((await prisma.qaAcceptanceCampaign.findUniqueOrThrow({ where: { id: campaign.id } })).expiresAt.getTime(), campaign.expiresAt.getTime() + 48 * 3600_000);
    const results = await Promise.all(Array.from({ length: 4 }, () => enqueueScientificContinuationForUser(user.id, project.id, parent.id)));
    assert.equal(new Set(results.map(row => row.jobId)).size, 1, "One child for concurrent requests");
    const childId = results[0].jobId;
    const continuation = await readScientificContinuation(childId);
    assert.equal(continuation?.contract.parentJobId, parent.id);
    assert.equal(continuation?.contract.reason, "METHOD_COVERAGE_RECONSTRUCTION");
    assert.equal(await prisma.blueprintJobStage.count({ where: { jobId: childId } }), 0, "No copied checkpoints or costs");
    assert.deepEqual(await prisma.blueprintJob.findUniqueOrThrow({ where: { id: parent.id } }), beforeParent, "Exhausted historical parent unchanged");
    assert.equal((await prisma.$transaction(tx => assertQaCommitment(tx, user.id, 0)))?.committedBefore, beforeCost?.committedBefore, "Historical unknown counted exactly once");
    // The real assessment failed terminally with known usage; correcting its
    // output contract permits exactly one explicit continuation of THIS child.
    const usage = { input_tokens: 15540, output_tokens: 8192, total_tokens: 23732 };
    const reservationId = randomUUID();
    const failedResponse = { version: "background-response.v1", provider: "openai", model: "gpt-6-astra",
      actualModel: "gpt-6-astra", localCallId: randomUUID(), logicalAttemptKey: "assessment-v1", requestFingerprint: "request-v1",
      reservedCost: 0.6034, reservationId, responseId: "resp_fixture_incomplete", status: "INCOMPLETE", providerStatus: "incomplete",
      error: "max_output_tokens", usage, outputText: "{incomplete", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      correlation: { stage: "method_coverage", promptVersion: "method-coverage-assessment.v1", projectId: project.id,
        runId: `secure-pilot-${childId}` } };
    const entries = [{ id: reservationId, estimate: 0.60385, maximum: 0.6034, status: "completed", usage,
      model: "gpt-6-astra", actualModel: "gpt-6-astra", stage: "METHOD_COVERAGE_ASSESSMENT_V1" }];
    await prisma.blueprintJobStage.create({ data: { jobId: childId, stageKey: "provider:background:assessment-v1", status: "FAILED", progress: 100,
      outputJson: json(failedResponse) } });
    const childCost = await prisma.blueprintJobStage.create({ data: { jobId: childId, stageKey: "control:cost", status: "FAILED", progress: 100,
      outputJson: json({ policy: { hard: 5, soft: 2.5, mandatoryReserve: .25 }, entries, terminal: { jobStatus: "FAILED" } }) } });
    await prisma.blueprintJobStage.create({ data: { jobId: childId, stageKey: "checkpoint:METHOD_COVERAGE_ASSESSMENT_V1", status: "FAILED", progress: 0,
      inputJson: { fingerprint: "old-assessment-input", attempts: 1 }, errorJson: { message: "STRUCTURED_OUTPUT_INCOMPLETE: max_output_tokens" } } });
    await prisma.blueprintJob.update({ where: { id: childId }, data: { status: "FAILED", currentStage: "resolving_design", attempts: 1,
      completedAt: new Date(), errorJson: { message: "STRUCTURED_OUTPUT_INCOMPLETE: max_output_tokens", category: "PROVIDER_OUTPUT_INVALID" } } });
    const priorChild = await prisma.blueprintJob.findUniqueOrThrow({ where: { id: childId } });
    await assert.rejects(() => recoverScientificContinuationForUser(other.id, project.id, childId), /PROJECT_NOT_FOUND/);
    const validation = { priorMessage: "STRUCTURED_OUTPUT_INCOMPLETE: max_output_tokens", responses: [failedResponse] as never,
      entries, targetPromptVersion: "method-coverage-assessment.v2", projectId: project.id, runId: `secure-pilot-${childId}` };
    assert.throws(() => validateMethodAssessmentRecovery({ ...validation, targetPromptVersion: "method-coverage-assessment.v1" }), /NOT_ELIGIBLE/);
    assert.throws(() => validateMethodAssessmentRecovery({ ...validation, entries: [{ ...entries[0], estimate: null }] }), /USAGE_UNCERTAIN/);
    assert.throws(() => validateMethodAssessmentRecovery({ ...validation, entries: [{ ...entries[0], usage: {} }] }), /NOT_RECOVERABLE/);
    assert.throws(() => validateMethodAssessmentRecovery({ ...validation, runId: "foreign-job" }), /NOT_RECOVERABLE/);
    assert.throws(() => validateMethodAssessmentRecovery({ ...validation, responses: [{ ...failedResponse, status: "CREATE_UNCERTAIN", responseId: null }] as never }), /NOT_RECOVERABLE/);
    await prisma.blueprintJobStage.update({ where: { id: childCost.id }, data: { outputJson: json({ entries: [{ ...entries[0], estimate: null }] }) } });
    await assert.rejects(() => recoverScientificContinuationForUser(user.id, project.id, childId), /USAGE_UNCERTAIN/);
    await prisma.blueprintJobStage.update({ where: { id: childCost.id }, data: { outputJson: childCost.outputJson as Prisma.InputJsonValue } });
    const priorResponses = await prisma.blueprintJobStage.findMany({ where: { jobId: childId }, orderBy: { id: "asc" } });
    const recovered = await Promise.all(Array.from({ length: 3 }, () => resumeLatestBlueprintJobForUser(user.id, project.id)));
    assert.ok(recovered.every(result => result.shouldContinue));
    const recoveredChild = await prisma.blueprintJob.findUniqueOrThrow({ where: { id: childId } });
    assert.equal(recoveredChild.id, childId); assert.equal(recoveredChild.attempts, 1); assert.equal(recoveredChild.maxAttempts, priorChild.maxAttempts);
    assert.equal(await prisma.auditLog.count({ where: { userId: user.id, eventType: "SCIENTIFIC_CONTINUATION_CONTRACT_RECOVERY_AUTHORIZED" } }), 1);
    assert.deepEqual(await prisma.blueprintJobStage.findMany({ where: { jobId: childId }, orderBy: { id: "asc" } }), priorResponses,
      "Recovery preserves incomplete response, failed checkpoint and exact cost including known overrun");
    assert.deepEqual(await prisma.blueprintJob.findUniqueOrThrow({ where: { id: parent.id } }), beforeParent, "Parent still 8/8 unchanged");
    await prisma.blueprintJob.update({ where: { id: childId }, data: { status: "FAILED" } });
    await assert.rejects(() => recoverScientificContinuationForUser(user.id, project.id, childId), /ALREADY_USED/);
    // Second proved product defect: four rejected preflights did not dispatch,
    // assessment and reconstruction outputs completed and must be retained.
    const completedEntries = [];
    for (const phase of ["assessment", "reconstruction"]) {
      const reservation = randomUUID(), consumed = { input_tokens: 100, output_tokens: 200, total_tokens: 300 };
      const complete = { ...failedResponse, logicalAttemptKey: phase+"-v2", reservationId: reservation,
        responseId: "resp_fixture_"+phase, requestFingerprint: phase+"-request-v2", status: "COMPLETED", providerStatus: "completed",
        error: null, usage: consumed, outputText: "{}", correlation: { ...failedResponse.correlation,
          promptVersion: "method-coverage-"+phase+".v2" } };
      await prisma.blueprintJobStage.create({ data: { jobId: childId, stageKey: "provider:background:"+phase+"-v2",
        status: "COMPLETED", progress: 100, outputJson: json(complete) } });
      completedEntries.push({ ...entries[0], id: reservation, estimate: .1, maximum: .2, usage: consumed });
    }
    for (const stageKey of [`METHOD_COVERAGE_ASSESSMENT_V1:context:${fingerprint("v2")}`, "METHOD_RECONSTRUCTION_V1_1", "CORPUS_METHOD_PROFILE_V1", "METHOD_COVERAGE_BEFORE_V1"]) {
      const value={fixture:stageKey};
      await prisma.blueprintJobStage.create({ data: { jobId: childId, stageKey:"checkpoint:"+stageKey,status:"COMPLETED",progress:100,
        outputJson:json({fingerprint:fingerprint([stageKey,"input"]),value,outputHash:fingerprint(value),files:[]}) } });
    }
    for (const ordinal of [1,2,3,4]) await prisma.blueprintJobStage.create({data:{jobId:childId,stageKey:`checkpoint:METHOD_COVERAGE_RESEARCH_V1_${ordinal}`,
      status:"FAILED",progress:0,inputJson:{fingerprint:fingerprint(["predispatch",ordinal]),attempts:1},
      errorJson:{message:"COST_LIMIT_REACHED: el trabajo restante completo no cabe bajo el tope del job."}}});
    await prisma.blueprintJobStage.update({where:{id:childCost.id},data:{outputJson:json({entries:[...entries,...completedEntries]})}});
    await prisma.blueprintJob.update({where:{id:childId},data:{status:"FAILED",attempts:2,errorJson:{message:"METHOD_HANDOFF_INVALID"}}});
    const uncertainOp=await prisma.paidOperation.create({data:{userId:user.id,projectId:project.id,revision:"fixture",requestId:randomUUID(),
      purpose:"DESIGN_SUPPORT_MINI_RESEARCH",inputFingerprint:"fixture",hardCapMicros:1,status:"RUNNING"}});
    await assert.rejects(()=>recoverScientificContinuationForUser(user.id,project.id,childId),/PRE_DISPATCH_PROOF_MISSING/);
    await prisma.paidOperation.delete({where:{id:uncertainOp.id}});
    const beforeExecutionRecovery=await prisma.blueprintJobStage.findMany({where:{jobId:childId},orderBy:{id:"asc"}});
    const secondRecovered=await Promise.all(Array.from({length:3},()=>resumeLatestBlueprintJobForUser(user.id,project.id)));
    assert.ok(secondRecovered.every(result=>result.shouldContinue));
    assert.equal(await prisma.auditLog.count({where:{userId:user.id,eventType:"SCIENTIFIC_CONTINUATION_EXECUTION_RECOVERY_AUTHORIZED"}}),1);
    const resumedAgain=await prisma.blueprintJob.findUniqueOrThrow({where:{id:childId}});
    assert.equal(resumedAgain.attempts,2);assert.equal(resumedAgain.maxAttempts,3);
    assert.deepEqual(await prisma.blueprintJobStage.findMany({where:{jobId:childId},orderBy:{id:"asc"}}),beforeExecutionRecovery);
    assert.deepEqual(await prisma.blueprintJob.findUniqueOrThrow({where:{id:parent.id}}),beforeParent);
    await prisma.blueprintJob.update({where:{id:childId},data:{status:"FAILED",errorJson:{message:"METHOD_HANDOFF_INVALID"}}});
    await assert.rejects(()=>recoverScientificContinuationForUser(user.id,project.id,childId),/ALREADY_USED/);
    // Acquisition-quality correction is a separately audited execution cycle.
    // Keep the historical 3/3 unchanged; completed discovery must not be paid twice.
    const latestUsage = { input_tokens: 120, output_tokens: 300, total_tokens: 420 };
    const latestReservation = randomUUID();
    const latestResponse = { ...failedResponse, logicalAttemptKey: "reconstruction-v3", reservationId: latestReservation,
      responseId: "resp_fixture_reconstruction_v3", requestFingerprint: "reconstruction-request-v3", status: "COMPLETED", providerStatus: "completed",
      error: null, usage: latestUsage, outputText: "{}", correlation: { ...failedResponse.correlation, promptVersion: "method-coverage-reconstruction.v3" } };
    await prisma.blueprintJobStage.create({data:{jobId:childId,stageKey:"provider:background:reconstruction-v3",status:"COMPLETED",progress:100,outputJson:json(latestResponse)}});
    const scientificValue={fixture:"reconstruction-v3"};
    await prisma.blueprintJobStage.create({data:{jobId:childId,stageKey:`checkpoint:METHOD_RECONSTRUCTION_V1_1:context:${fingerprint("v3")}`,status:"COMPLETED",progress:100,
      outputJson:json({fingerprint:fingerprint("v3"),value:scientificValue,outputHash:fingerprint(scientificValue),files:[]})}});
    const acquisitionEntries: unknown[] = [];
    for(const ordinal of [1,2]) {
      const opId=randomUUID(),callId=randomUUID();
      const usage={inputTokens:200,outputTokens:50,cachedInputTokens:0,reasoningTokens:5,webSearchToolCalls:1};
      const operation={operationId:opId,responseId:"resp_web_"+ordinal,state:ordinal===1?"PARTIAL":"COMPLETED",candidates:[]};
      await prisma.paidOperation.create({data:{id:opId,userId:user.id,projectId:project.id,revision:"fixture",requestId:randomUUID(),
        purpose:"DESIGN_SUPPORT_MINI_RESEARCH",inputFingerprint:fingerprint(operation),hardCapMicros:200000,committedMicros:100000,status:"COMPLETED",resultJson:operation,
        calls:{create:{id:callId,purpose:"DESIGN_SUPPORT_MINI_RESEARCH",model:"gpt-6-astra",actualModel:"gpt-6-astra",reservedMicros:200000,estimatedMicros:100000,status:"COMPLETED",usageJson:usage,
          attributionJson:{jobId:childId,funding:"JOB_LINKED"}}}}});
      acquisitionEntries.push({...entries[0],id:callId,estimate:.1,maximum:.2,usage,paidOperationId:opId,
        qaAuthorization:{grantId:"prior-fixture-grant",effectiveHardCapUsd:5}});
      const value={support:[],operation:{operationId:opId,state:operation.state},limitation:ordinal===1?"No verified support":null};
      await prisma.blueprintJobStage.update({where:{jobId_stageKey:{jobId:childId,stageKey:`checkpoint:METHOD_COVERAGE_RESEARCH_V1_${ordinal}`}},
        data:{status:"COMPLETED",errorJson:Prisma.DbNull,outputJson:json({fingerprint:fingerprint(["research",ordinal]),value,
          outputHash:ordinal===2?fingerprint("corrupt-derived-checkpoint"):fingerprint(value),files:[]})}});
    }
    await prisma.blueprintJobStage.create({data:{jobId:childId,stageKey:`checkpoint:METHOD_COVERAGE_RESEARCH_V1_3:context:${fingerprint("preflight-rejected")}`,
      status:"FAILED",progress:0,inputJson:{fingerprint:fingerprint("preflight-rejected")},errorJson:{message:"COST_LIMIT_REACHED: el trabajo restante completo no cabe bajo el tope del job."}}});
    await prisma.blueprintJobStage.update({where:{id:childCost.id},data:{outputJson:json({entries:[...entries,...completedEntries,
      {...entries[0],id:latestReservation,estimate:.2,maximum:.3,usage:latestUsage},...acquisitionEntries]})}});
    await prisma.blueprintJob.update({where:{id:childId},data:{status:"FAILED",attempts:3,errorJson:{message:"COST_LIMIT_REACHED: el trabajo restante completo no cabe bajo el tope del job."}}});
    await assert.rejects(()=>recoverScientificContinuationForUser(user.id,project.id,childId),/PROSPECTIVE_QA_REQUIRED/);
    await prisma.auditLog.create({data:{userId:user.id,projectId:project.id,actorType:"SYSTEM",eventType:"SCIENTIFIC_QA_OVERAGE_AUTHORIZED",payloadJson:{
      version:"scientific-closure-overage.v1",campaignId:campaign.id,jobId:childId,projectId:project.id,
      frozenInputFingerprint:continuation!.contract.frozenInputFingerprint,issuedBy:"isolated-test",reason:"Bounded acquisition correction fixture",jobHardUsd:6,campaignCapUsd:15,
      expiresAt:new Date(Date.now()+3600_000).toISOString()}}});
    // Unrelated known account history still counts; only this explicit job's
    // audited campaign overage can permit recovery above the original campaign10.
    await prisma.paidOperation.create({data:{userId:user.id,projectId:project.id,revision:"fixture",requestId:randomUUID(),
      purpose:"OTHER_KNOWN_QA_HISTORY",inputFingerprint:fingerprint("known-history"),hardCapMicros:9000000,committedMicros:9000000,status:"COMPLETED"}});
    await assert.rejects(()=>prisma.$transaction(tx=>assertQaCommitment(tx,user.id,0)),/QA_COMMITMENT_LIMIT_REACHED/);
    const scopedCommitment=await prisma.$transaction(tx=>assertQaCommitment(tx,user.id,0,childId));
    assert.ok(scopedCommitment!.committedBefore>10);assert.equal(scopedCommitment!.ceiling,15);
    const beforeAcquisition=await prisma.blueprintJobStage.findMany({where:{jobId:childId},orderBy:{id:"asc"}});
    const acquisitionProofInput={priorMessage:"COST_LIMIT_REACHED: el trabajo restante completo no cabe bajo el tope del job.",
      jobId:childId,userId:user.id,projectId:project.id,runId:`secure-pilot-${childId}`,
      responses:beforeAcquisition.filter(s=>s.stageKey.startsWith("provider:background:")).map(s=>s.outputJson) as any,
      entries:(beforeAcquisition.find(s=>s.stageKey==="control:cost")!.outputJson as any).entries,stages:beforeAcquisition,
      operations:await prisma.paidOperation.findMany({where:{userId:user.id,projectId:project.id,purpose:"DESIGN_SUPPORT_MINI_RESEARCH"},include:{calls:true}}),
      priorAssessmentRecovery:(resumedAgain.metadataJson as any).methodAssessmentContractRecovery,
      priorExecutionRecovery:(resumedAgain.metadataJson as any).methodCoverageExecutionRecovery};
    assert.equal(validateMethodAcquisitionRecovery(acquisitionProofInput).completedDiscoveryOperations,2);
    assert.throws(()=>validateMethodAcquisitionRecovery({...acquisitionProofInput,entries:acquisitionProofInput.entries.map((e:any,i:number)=>i?e:{...e,estimate:null})}),/USAGE_UNCERTAIN/);
    assert.throws(()=>validateMethodAcquisitionRecovery({...acquisitionProofInput,operations:acquisitionProofInput.operations.map(op=>({...op,projectId:"foreign-project"}))}),/OPERATION_PROOF_MISSING/);
    assert.throws(()=>validateMethodAcquisitionRecovery({...acquisitionProofInput,stages:beforeAcquisition.map(stage=>stage.stageKey.includes("ASSESSMENT")&&stage.status==="COMPLETED"?
      {...stage,outputJson:{...(stage.outputJson as any),outputHash:"tampered"}}:stage)}),/CHECKPOINT_INVALID/);
    const finalRecovered=await Promise.all(Array.from({length:3},()=>resumeLatestBlueprintJobForUser(user.id,project.id)));
    assert.ok(finalRecovered.every(result=>result.shouldContinue));
    const finalChild=await prisma.blueprintJob.findUniqueOrThrow({where:{id:childId}});
    assert.equal(finalChild.attempts,3);assert.equal(finalChild.maxAttempts,3,"Historical attempt allowance unchanged");
    assert.equal(await scientificContinuationAttemptLimit(prisma,finalChild),4,"One distinct audited execution cycle");
    const recovery=(finalChild.metadataJson as any).methodAcquisitionRecovery;
    assert.equal(recovery.preservedInvalidCheckpoints.length,1);
    assert.equal(recovery.newDiscoveryAuthorizedByRecovery,false);
    assert.equal(recovery.completedDiscoveryOperations,2);
    assert.equal(await prisma.auditLog.count({where:{userId:user.id,eventType:"SCIENTIFIC_CONTINUATION_ACQUISITION_RECOVERY_AUTHORIZED"}}),1);
    assert.equal(await scientificContinuationAttemptLimit(prisma,{...finalChild,id:randomUUID()}),3,"Copied metadata cannot grant foreign job allowance");
    assert.deepEqual(await prisma.blueprintJobStage.findMany({where:{jobId:childId},orderBy:{id:"asc"}}),beforeAcquisition,"Preserve invalid checkpoint and all paid records exactly");
    assert.deepEqual(await prisma.blueprintJob.findUniqueOrThrow({where:{id:parent.id}}),beforeParent);
    let resolves = 0;
    const childExecutor: ReleaseJobExecutor = {
      materialize: async () => { throw new Error("Must not repeat extraction"); },
      recommend: async () => { throw new Error("Must not repeat selector/critic"); },
      resolve: async ({ jobId, runId }) => { resolves++; assert.equal(jobId, childId); assert.notEqual(runId, continuation!.contract.parentRunId);
        assert.equal((await readScientificContinuation(jobId))!.decision.decisionFingerprint, continuation!.decision.decisionFingerprint);
        if(resolves===1){const pending=new Error("Same durable response remains processing; no second create");pending.name="ProviderResponsePendingError";throw pending;} },
      generate: executor.generate,
    };
    const pending = await runNextBlueprintJobStage(childId, childExecutor);
    assert.equal(pending.state,"provider_response_pending");assert.equal(pending.job?.status,"WAITING_NEXT_STAGE");
    assert.equal(pending.job?.attempts,3);assert.equal(pending.job?.maxAttempts,3,"Pending retrieval does not consume the corrected execution allowance");
    const notDue=await runNextBlueprintJobStage(childId,childExecutor);assert.equal(notDue.state,"locked_or_finished");assert.equal(resolves,1);
    // Advance only fixture scheduling time, never counters or paid response state.
    await prisma.blueprintJob.update({where:{id:childId},data:{nextAttemptAt:new Date(Date.now()-1000)}});
    const advanced = await runNextBlueprintJobStage(childId, childExecutor);
    assert.equal(advanced.job?.currentStage, "generating_plan"); assert.equal(resolves, 2);
    assert.equal(advanced.job?.attempts,3);assert.equal(advanced.job?.maxAttempts,3);
    const exhausted=await runNextBlueprintJobStage(childId,childExecutor);
    assert.equal(exhausted.job?.status,"FAILED");assert.equal(exhausted.job?.attempts,4);assert.equal(exhausted.job?.maxAttempts,3);
    await assert.rejects(()=>recoverScientificContinuationForUser(user.id,project.id,childId),/NOT_ELIGIBLE/);
    assert.equal((await runNextBlueprintJobStage(childId,childExecutor)).shouldContinue,false,"No second contractual execution after failure");
    const ref = continuation!.contract.reusedCheckpointIds.find(row => row.stageKey === "checkpoint:SCIENTIFIC_DECISION")!;
    const original = await prisma.blueprintJobStage.findUniqueOrThrow({ where: { id: ref.id } });
    await prisma.blueprintJobStage.update({ where: { id: ref.id }, data: { outputJson: { value: {}, outputHash: "tampered", files: [], fingerprint: "bad" } } });
    await assert.rejects(() => readScientificContinuation(childId), /CHECKPOINT_INVALID/);
    await prisma.blueprintJobStage.update({ where: { id: ref.id }, data: { outputJson: original.outputJson as Prisma.InputJsonValue } });
    const costRow = await prisma.blueprintJobStage.findUniqueOrThrow({ where: { jobId_stageKey: { jobId: parent.id, stageKey: "control:cost" } } });
    await prisma.blueprintJobStage.update({ where: { id: costRow.id }, data: { outputJson: { entries: [{ estimate: null, maximum: 0.4, status: "failed_unknown_usage" }] } } });
    await assert.rejects(() => readScientificContinuation(childId), /USAGE_UNCERTAIN/);
    await prisma.blueprintJobStage.update({ where: { id: costRow.id }, data: { outputJson: costRow.outputJson as Prisma.InputJsonValue } });
    await prisma.auditLog.create({ data: { userId: user.id, projectId: project.id, actorType: "SYSTEM",
      eventType: "SCIENTIFIC_CONTINUATION_QA_REVOKED", payloadJson: { grantAuditId: grant.id, reason: "Isolated revocation regression" } } });
    await assert.rejects(() => prisma.$transaction(tx => qaJobPolicy(tx, childId)), /NOT_AUTHORIZED/);
    await prisma.internalGenerationCapability.update({ where: { id: capability.id }, data: { status: "REVOKED" } });
    await assert.rejects(() => prisma.$transaction(tx => reserveInternalGenerationJob(tx, childId)), /CAPABILITY_REQUIRED/);
    assert.throws(() => validateContinuationCheckpoint({ status: "COMPLETED", stageKey: "control:cost", outputJson: {} }), /CHECKPOINT_INVALID/);
    assert.equal(await prisma.commercialReservation.count({ where: { userId: user.id } }), 0);
    console.log("PASS continuation: parent 8/8 preserved; concurrent child identity; no repeated science or cost; immutable inherited input; ownership; tamper; QA expiry/idempotency; same-child terminal incomplete recovery; acquisition correction with one audited execution allowance; historical 3/3 intact; invalid derived checkpoint preserved; known PaidOperation reused; no second execution; cost/response/checkpoint preservation; revocation; worker advances without questions. Provider calls=0.");
  } finally {
    await prisma.internalGenerationAuthorization.deleteMany({ where: { userId: user.id } });
    await prisma.internalGenerationCapability.deleteMany({ where: { userId: user.id } });
    await prisma.qaAcceptanceCampaign.deleteMany({ where: { userId: user.id } });
    await prisma.user.deleteMany({ where: { id: { in: [user.id, other.id] } } });
    await prisma.reference.deleteMany({ where: { id: { in: references } } });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
