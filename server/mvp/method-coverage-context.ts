import { fingerprint } from "./job-execution-context";
import type { MethodCoverageMatrix } from "./method-coverage-contracts";

const COLUMNS = ["cellId","operation","required","requiredWhen","claim","strategy","supportPointers",
  "applicabilityJustification","assumptions","futureRequirements","limitations","coverageStatus"] as const;
type Json = null | boolean | number | string | Json[] | { [key:string]:Json };
export type MethodCoverageContext = {
  version:"method-coverage-context.v1";
  reconstructionRule:"Read cell values in cellColumns order. Objects with only textRef mean the exact string at textTable[textRef]. No text is omitted or paraphrased.";
  originalFingerprint:string;
  matrixHeader:Omit<MethodCoverageMatrix,"corpusClasses"|"crossClassIntegration">;
  cellColumns:readonly string[];
  textTable:string[];
  corpusClasses:Array<{classHeader:Omit<MethodCoverageMatrix["corpusClasses"][number],"operations">;cellValues:Json[][]}>;
  crossClassIntegration:Json[];
};

/** Lossless request transport only. The persisted matrix remains canonical. */
export function projectMethodCoverageContext(matrix:MethodCoverageMatrix):MethodCoverageContext {
  const cells=[...matrix.corpusClasses.flatMap(row=>row.operations),matrix.crossClassIntegration];
  for(const cell of cells) if(Object.keys(cell).some(key=>!COLUMNS.includes(key as typeof COLUMNS[number])) || COLUMNS.some(key=>!(key in cell)))
    throw new Error("METHOD_COVERAGE_CONTEXT_UNRECOGNIZED_CELL");
  const counts=new Map<string,number>();
  const visit=(value:unknown)=>{
    if(typeof value==="string"&&value.length>=32)counts.set(value,(counts.get(value)??0)+1);
    else if(Array.isArray(value))value.forEach(visit);
    else if(value&&typeof value==="object")Object.values(value).forEach(visit);
  };
  cells.forEach(visit);
  const textTable=[...counts].filter(([text,count])=>count>1&&Buffer.byteLength(text)*(count-1)>32+count*16).map(([text])=>text).sort();
  const refs=new Map(textTable.map((text,index)=>[text,index]));
  const encode=(value:unknown):Json=>{
    if(typeof value==="string")return refs.has(value)?{textRef:refs.get(value)!}:value;
    if(value===null||typeof value==="boolean"||typeof value==="number")return value;
    if(Array.isArray(value))return value.map(encode);
    if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,encode(v)]));
    throw new Error("METHOD_COVERAGE_CONTEXT_UNSERIALIZABLE");
  };
  const row=(cell:typeof cells[number])=>COLUMNS.map(key=>encode(cell[key]));
  const {corpusClasses:_,crossClassIntegration:__,...matrixHeader}=matrix;
  return {version:"method-coverage-context.v1",reconstructionRule:"Read cell values in cellColumns order. Objects with only textRef mean the exact string at textTable[textRef]. No text is omitted or paraphrased.",
    originalFingerprint:fingerprint(matrix),matrixHeader,cellColumns:COLUMNS,textTable,
    corpusClasses:matrix.corpusClasses.map(({operations,...classHeader})=>({classHeader,cellValues:operations.map(row)})),
    crossClassIntegration:row(matrix.crossClassIntegration)};
}

export function reconstructMethodCoverageContext(context:MethodCoverageContext):MethodCoverageMatrix {
  if(context.version!=="method-coverage-context.v1" || fingerprint(context.cellColumns)!==fingerprint(COLUMNS))throw new Error("METHOD_COVERAGE_CONTEXT_CONTRACT_INVALID");
  const decode=(value:Json):unknown=>{
    if(Array.isArray(value))return value.map(decode);
    if(value&&typeof value==="object"){
      if(Object.keys(value).length===1&&"textRef"in value){const index=value.textRef;
        if(typeof index!=="number"||!Number.isSafeInteger(index)||index<0||index>=context.textTable.length)throw new Error("METHOD_COVERAGE_CONTEXT_TEXT_REFERENCE_INVALID");
        return context.textTable[index];}
      return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,decode(v)]));
    }
    return value;
  };
  const row=(values:Json[])=>{if(values.length!==COLUMNS.length)throw new Error("METHOD_COVERAGE_CONTEXT_ROW_INVALID");
    return Object.fromEntries(COLUMNS.map((key,index)=>[key,decode(values[index])]));};
  const matrix={...context.matrixHeader,corpusClasses:context.corpusClasses.map(cls=>({...cls.classHeader,operations:cls.cellValues.map(row)})),crossClassIntegration:row(context.crossClassIntegration)} as MethodCoverageMatrix;
  if(fingerprint(matrix)!==context.originalFingerprint)throw new Error("METHOD_COVERAGE_CONTEXT_INTEGRITY");
  return matrix;
}

import type { DesignSupportDigest } from "./design-support-digest";
type PromptDigest = Omit<DesignSupportDigest,"audit">;
const PASSAGE_COLUMNS=["source_id","evidence_id","evidence_level","allowed_use","locator","excerpt","summary","supports","selectionReasons"] as const;
const LOCATOR_COLUMNS=["citation_key","reference_id","source_id","page_number","chunk_id"] as const;
export type MethodEvidenceContext = {
  version:"method-evidence-context.v1";
  reconstructionRule:string;
  originalFingerprint:string;
  digestFingerprint:string;
  effectiveEvidenceFingerprint:string;
  textTable:string[];
  header:Json;
  passageColumns:readonly string[];
  locatorColumns:readonly string[];
  passageValues:Json[][];
};
/** Same canonical digest identity for repair and critic, with every excerpt intact. */
export function projectMethodEvidenceContext(digest:PromptDigest):MethodEvidenceContext {
  const counts=new Map<string,number>();
  const visit=(value:unknown)=>{if(typeof value==="string"&&value.length>=24)counts.set(value,(counts.get(value)??0)+1);
    else if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==="object")Object.values(value).forEach(visit);};
  visit(digest);
  const textTable=[...counts].filter(([text,count])=>count>1&&Buffer.byteLength(text)*(count-1)>32+count*16).map(([text])=>text).sort();
  const refs=new Map(textTable.map((text,index)=>[text,index]));
  const encode=(value:unknown):Json=>{
    if(value===undefined)return{absent:true};
    if(typeof value==="string")return refs.has(value)?{textRef:refs.get(value)!}:value;
    if(value===null||typeof value==="boolean"||typeof value==="number")return value;
    if(Array.isArray(value))return value.map(encode);
    if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,encode(v)]));
    throw new Error("METHOD_EVIDENCE_CONTEXT_UNSERIALIZABLE");};
  const {passages,...header}=digest;
  const passageValues=passages.map(passage=>{
    if(Object.keys(passage).some(key=>!PASSAGE_COLUMNS.includes(key as typeof PASSAGE_COLUMNS[number])))throw new Error("METHOD_EVIDENCE_CONTEXT_UNRECOGNIZED_FIELD");
    return PASSAGE_COLUMNS.map(key=>{
      if(key!=="locator")return encode(passage[key]);
      if(!passage.locator)return encode(passage.locator);
      if(Object.keys(passage.locator).some(key=>!LOCATOR_COLUMNS.includes(key as typeof LOCATOR_COLUMNS[number])))throw new Error("METHOD_EVIDENCE_CONTEXT_UNRECOGNIZED_LOCATOR");
      return LOCATOR_COLUMNS.map(column=>encode(passage.locator![column]));});});
  return {version:"method-evidence-context.v1",reconstructionRule:"Read passageValues in passageColumns order; locator arrays use locatorColumns. An object with only textRef is the exact textTable entry, including original quotations. An object {absent:true} means the original field was absent. All excerpts, IDs, locations and limitations are preserved.",
    originalFingerprint:fingerprint(digest),digestFingerprint:digest.digestFingerprint,effectiveEvidenceFingerprint:digest.effectiveEvidenceFingerprint,
    textTable,header:encode(header),passageColumns:PASSAGE_COLUMNS,locatorColumns:LOCATOR_COLUMNS,passageValues};
}
export function reconstructMethodEvidenceContext(context:MethodEvidenceContext):PromptDigest {
  if(context.version!=="method-evidence-context.v1"||fingerprint(context.passageColumns)!==fingerprint(PASSAGE_COLUMNS)||fingerprint(context.locatorColumns)!==fingerprint(LOCATOR_COLUMNS))throw new Error("METHOD_EVIDENCE_CONTEXT_CONTRACT_INVALID");
  const decode=(value:Json):unknown=>{
    if(Array.isArray(value))return value.map(decode);
    if(value&&typeof value==="object"){
      if(Object.keys(value).length===1&&"absent"in value&&value.absent===true)return undefined;
      if(Object.keys(value).length===1&&"textRef"in value){const index=value.textRef;
        if(typeof index!=="number"||!Number.isSafeInteger(index)||index<0||index>=context.textTable.length)throw new Error("METHOD_EVIDENCE_CONTEXT_TEXT_REFERENCE_INVALID");
        return context.textTable[index];}
      return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,decode(v)]).filter(([,v])=>v!==undefined));}
    return value;};
  const passages=context.passageValues.map(values=>{
    if(values.length!==PASSAGE_COLUMNS.length)throw new Error("METHOD_EVIDENCE_CONTEXT_ROW_INVALID");
    return Object.fromEntries(PASSAGE_COLUMNS.map((column,index)=>{
      const value=decode(values[index]);
      if(column!=="locator"||!Array.isArray(value))return[column,value];
      if(value.length!==LOCATOR_COLUMNS.length)throw new Error("METHOD_EVIDENCE_CONTEXT_LOCATOR_INVALID");
      return[column,Object.fromEntries(LOCATOR_COLUMNS.map((field,i)=>[field,value[i]]).filter(([,v])=>v!==undefined))];
    }).filter(([,value])=>value!==undefined));});
  const digest={...(decode(context.header)as Record<string,unknown>),passages} as PromptDigest;
  if(digest.digestFingerprint!==context.digestFingerprint||digest.effectiveEvidenceFingerprint!==context.effectiveEvidenceFingerprint||fingerprint(digest)!==context.originalFingerprint)throw new Error("METHOD_EVIDENCE_CONTEXT_INTEGRITY");
  return digest;
}
