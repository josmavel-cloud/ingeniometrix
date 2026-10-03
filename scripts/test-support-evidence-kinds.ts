import assert from "node:assert/strict";
import {mkdtemp,writeFile,rm,symlink,stat,readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import os from "node:os";import path from "node:path";
import {annotateRetainedSupportContentKind} from "../server/mvp/design-support-content-kind";
import {supportEvidenceItems,sealDesignSupport,augmentMethodEvidencePack,effectiveGenerationLedger,type DesignSupportSource} from "../server/mvp/design-support-addendum";
import {buildDesignSupportDigest} from "../server/mvp/design-support-digest";
import {htmlSupportPassages,pdfSupportPassages,persistFetchedSupportManifest} from "../server/mvp/design-support-document";
import {ledger} from "./test-b3-scientific-contracts";
import {buildMethodEvidencePack} from "../server/mvp/scientific-decision-contracts";
async function run(){
 const directory=await mkdtemp(path.join(os.tmpdir(),"imx-kind-test-"));
 try {
  const abstract="This bibliographic abstract describes a research review and reports that guidance exists, without supplying the actual procedure or criteria.";
  const procedure="Reviewers should extract each result with its original source identifier and context, preserving disagreements and methodological limitations before synthesizing comparable claims.";
  const body=Buffer.from(`<html><head><title>Verified guide</title></head><body><article><div class="abstract"><p>${abstract}</p></div><h2>Methods</h2><p>${procedure}</p></article></body></html>`);
  const file=path.join(directory,"retained.html");await writeFile(file,body);
  const parsed=htmlSupportPassages(body.toString());
  const oldPassages=parsed.passages.map(({contentKind:_k,contentKindBasis:_b,...p})=>p);
  const source:DesignSupportSource={sourceId:"DS-fixture",gapId:"gap",title:"Verified guide",authors:[],year:null,doi:null,observationIds:["observed"],provenance:"SYSTEM_DESIGN_SUPPORT",
   document:{observedUrl:"https://example.org/guide",finalUrl:"https://example.org/guide",sha256:createHash("sha256").update(body).digest("hex"),mediaType:"text/html",title:"Verified guide",passages:oldPassages,privateArtifactPath:file}};
  const before=JSON.stringify(source);assert.ok(supportEvidenceItems(source).every(i=>i.allowed_use==="context_only"),"Unannotated legacy content cannot certify a procedure");
  const annotated=await annotateRetainedSupportContentKind(source,{artifactRoot:directory});
  assert.equal(JSON.stringify(source),before);assert.deepEqual(annotated.source.document.passages.map(p=>({text:p.text,locator:p.locator,page:p.page})),oldPassages);
  assert.equal(annotated.audit.hashVerified,true);const items=supportEvidenceItems(annotated.source);
  assert.equal(items[0].evidence_level,"ABSTRACT_METADATA");assert.equal(items[0].allowed_use,"context_only");
  assert.equal(items[1].evidence_level,"HTML_PASSAGE");assert.equal(items[1].allowed_use,"theory_or_method_support");
  assert.deepEqual(items.map(i=>i.evidence_id),["DS-fixture:P1","DS-fixture:P2"]);
  const identity={userId:"test-user",projectId:ledger.project_id,jobId:"job-test",definitionHash:"frozen"};
  const addendum=sealDesignSupport({...identity,policyVersion:"test",sources:[annotated.source]});const pack=augmentMethodEvidencePack(buildMethodEvidencePack(ledger),addendum);
  const input={pack,addendum,identity,gaps:[{gapId:"gap",findingCodes:["F1"],affectedClaim:"Extract results traceably",whyMaterial:"Method integrity"}] as any,requiredPointers:[]};
  const digest=buildDesignSupportDigest(input);assert.deepEqual(digest.passages.filter(p=>p.source_id===source.sourceId).map(p=>p.evidence_id),["DS-fixture:P2"]);
  assert.ok(digest.audit.exclusions.some(e=>e.evidenceId==="DS-fixture:P1"&&e.reason==="CONTEXT_ONLY_NOT_PROCEDURAL_SUPPORT"));
  assert.throws(()=>buildDesignSupportDigest({...input,requiredPointers:[{source_id:source.sourceId,evidence_id:"DS-fixture:P1"}]}),/REQUIRED_POINTER_INSUFFICIENT_EVIDENCE/);
  assert.equal(buildDesignSupportDigest({...input,requiredPointers:[{source_id:source.sourceId,evidence_id:"DS-fixture:P2"}]}).passages.some(p=>p.evidence_id==="DS-fixture:P2"),true);
  const selected=pack.selected_sources[0];const selectedItem=pack.items.find(i=>i.source_id===selected.source_id)!;
  const contextual={...selectedItem,evidence_level:"ABSTRACT_METADATA" as const,allowed_use:"context_only" as const};const contextPack={...pack,items:pack.items.map(i=>i===selectedItem?contextual:i)};
  const context=buildDesignSupportDigest({...input,pack:contextPack,contextPointers:[{source_id:contextual.source_id,evidence_id:contextual.evidence_id}]});
  assert.equal(context.passages.find(p=>p.evidence_id===contextual.evidence_id&&p.source_id===contextual.source_id)?.evidence_level,"ABSTRACT_METADATA");
  assert.throws(()=>buildDesignSupportDigest({...input,contextPointers:[{source_id:source.sourceId,evidence_id:"DS-fixture:P1"}]}),/CONTEXT_POINTER_INVALID/);
  const effective=effectiveGenerationLedger(ledger,addendum,identity);const semantic=effective.semantic_extractions.at(-1)!;
  assert.equal(semantic.evidence_items[0].allowed_use,"context_only");assert.equal(semantic.evidence_items[1].allowed_use,"theory_or_method_support");
  const rebuilt=buildMethodEvidencePack(effective);assert.equal(rebuilt.items.find(i=>i.evidence_id==="DS-fixture:P1")?.evidence_level,"ABSTRACT_METADATA");assert.equal(rebuilt.items.find(i=>i.evidence_id==="DS-fixture:P2")?.evidence_level,"HTML_PASSAGE");
  const bad={...source,document:{...source.document,sha256:"f".repeat(64)}};await assert.rejects(()=>annotateRetainedSupportContentKind(bad,{artifactRoot:directory}),/ARTIFACT_INTEGRITY/);
  const unavailable={...source,document:{...source.document,privateArtifactPath:undefined}};await assert.rejects(()=>annotateRetainedSupportContentKind(unavailable,{artifactRoot:directory}),/ARTIFACT_REQUIRED/);
  const outside=await mkdtemp(path.join(os.tmpdir(),"imx-kind-outside-"));
  try {const other=path.join(outside,"body.html");await writeFile(other,body);const link=path.join(directory,"outside.html");await symlink(other,link);
   await assert.rejects(()=>annotateRetainedSupportContentKind({...source,document:{...source.document,privateArtifactPath:link}},{artifactRoot:directory}),/OUTSIDE_ROOT/);
  }finally{await rm(outside,{recursive:true,force:true});}
  const altered=structuredClone(source);altered.document.passages[1].text="Invented procedural passage without an exact match in the retained source.";
  assert.equal((await annotateRetainedSupportContentKind(altered,{artifactRoot:directory})).source.document.passages[1].contentKind,"METADATA");
  // Distinct whole criterion sections survive a compact digest; bibliography cannot win by mentioning methods.
  const criteria=[
   "1.1. Are observations recorded with their original context? Apply the stated recording criteria to preserve temporal and situational provenance in each account.",
   "2.1. Are measurements calibrated against a traceable reference? Evaluate systematic error and unit comparability before interpreting numerical differences.",
   "3.1. Are comparisons justified by explicit eligibility rules? Examine selection mechanisms and confounding relationships before drawing comparative conclusions.",
   "4.1. Are narrative interpretations supported by inspected quotations? Review discrepant cases and the analytical chain connecting individual accounts to themes.",
   "5.1. Are integrated conclusions compatible with each contributing strand? Examine disagreements and preserve explanations instead of forcing convergence.",
   "6.1. Are verification thresholds prespecified? Check the reliability of instruments against independent benchmarks and disclose residual uncertainty.",
  ];
  const pdfPassages=pdfSupportPassages([...criteria,"References\nA citation listing quality appraisal, data extraction, synthesis, validation, should and must without providing a procedure."].join("\f"));
  const pdfSource:DesignSupportSource={...source,sourceId:"DS-pdf-fixture",document:{...source.document,mediaType:"application/pdf",passages:pdfPassages}};
  const pdfAddendum=sealDesignSupport({...identity,policyVersion:"test",sources:[pdfSource]});
  const pdfPack=augmentMethodEvidencePack(buildMethodEvidencePack(ledger),pdfAddendum);
  const pdfDigest=buildDesignSupportDigest({...input,pack:pdfPack,addendum:pdfAddendum});
  assert.deepEqual(pdfDigest.passages.filter(p=>p.source_id===pdfSource.sourceId).map(p=>p.locator?.page_number).sort(),[1,2,3,4,5,6]);
  assert.equal(pdfSource.document.passages.length,7);assert.equal(pdfSource.document.passages[6].contentKind,"METADATA");
  assert.ok(pdfDigest.passages.every(p=>!p.excerpt?.startsWith("References")));
  const failedBody=Buffer.from("%PDF-a broken acquired document that cannot be parsed");
  const manifest=await persistFetchedSupportManifest({body:failedBody,contentType:"application/pdf",finalUrl:"https://example.org/final.pdf"},"https://example.org/observed.pdf",directory);
  assert.equal(manifest.sha256,createHash("sha256").update(failedBody).digest("hex"));assert.equal(manifest.observedUrl,"https://example.org/observed.pdf");assert.equal(manifest.finalUrl,"https://example.org/final.pdf");assert.equal((await stat(manifest.privateArtifactPath!)).mode&0o777,0o600);assert.deepEqual(await readFile(manifest.privateArtifactPath!),failedBody);
  assert.equal((await persistFetchedSupportManifest({body:failedBody,contentType:"application/pdf",finalUrl:manifest.finalUrl},manifest.observedUrl,directory)).privateArtifactPath,manifest.privateArtifactPath);
  console.log("Typed support evidence: PASS (context-only levels, stable IDs, strict pointers, immutable hash-verified annotations, failed-body manifest).");
 }finally{await rm(directory,{recursive:true,force:true});}
}run().catch(error=>{console.error(error);process.exitCode=1;});
