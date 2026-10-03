import assert from "node:assert/strict";
import { fingerprint } from "../server/mvp/job-execution-context";
import { validateMethodCriticRecovery } from "../server/mvp/method-critic-recovery-contract";
import { critiqueFor, fixture } from "./test-method-coverage";

const matrix = fixture(["EMPIRICAL_QUALITATIVE", "SYSTEMATIC_OR_SCOPING_REVIEW"]).matrix;
const {version: _v,profileFingerprint: _p,effectiveEvidenceFingerprint: _e,...proposal} = critiqueFor(matrix);
proposal.cellAssessments[0].coverageStatus = "UNSUPPORTED";
proposal.cellAssessments[0].transferSupported = false;
const usage = {input_tokens: 700,output_tokens: 400,total_tokens: 1100};
const response = {status:"COMPLETED",providerStatus:"completed",responseId:"resp_fixture",requestFingerprint:"request_fixture",
  reservationId:"cost_fixture",outputText:JSON.stringify(proposal),usage,actualModel:"gpt-5.6-sol",
  correlation:{projectId:"project_fixture",runId:"run_fixture",promptVersion:"method-coverage-independent-critic.v4"}};
const stage = {id:"checkpoint_fixture",stageKey:"checkpoint:METHOD_COVERAGE_CRITIC_V1_2",status:"COMPLETED",
  outputJson:{value:proposal,outputHash:fingerprint(proposal),fingerprint:"input_fixture"}};
const cost = {id:"cost_fixture",status:"completed",estimate:0.02,usage,actualModel:"gpt-5.6-sol"};
const input = {priorMessage:"METHOD_CRITIC_FINDING_COVERAGE_MISMATCH",projectId:"project_fixture",runId:"run_fixture",
  previousRecoveryFingerprint:"prior_fixture",expectedFindingCodes:["NOV","EVI"],responses:[response],stages:[stage],costEntries:[cost]};
const result = validateMethodCriticRecovery(input as never);
assert.deepEqual(result.missingHistoricalFindingCodes,["EVI"]);
assert.equal(result.scientificApprovalGranted,false);
assert.equal(result.newProviderCallsByRecovery,0);
assert.equal(result.completedCritiqueMustBeReused,true);
assert.throws(()=>validateMethodCriticRecovery({...input,costEntries:[{...cost,usage:{...usage,output_tokens:401}}]} as never),/COMPLETED_USAGE_REQUIRED/);
assert.throws(()=>validateMethodCriticRecovery({...input,stages:[{...stage,outputJson:{...stage.outputJson,outputHash:"tampered"}}]} as never),/COMPLETED_CHECKPOINT_REQUIRED/);
assert.throws(()=>validateMethodCriticRecovery({...input,priorMessage:"OTHER"} as never),/NOT_ELIGIBLE/);
console.log("Method critic recovery PASS: completed response and known usage bound, missing history unresolved, tampering rejected, no provider dispatch.");
