import { fingerprint } from "./job-execution-context";

export const METHOD_PRIMARY_NORMALIZATION_VERSION="declared-primary-method-alias.v1";
type Component={name:string;kind:string;dependencies:string[]};
type Handoff={from:string;to:string;transferred_output:string;use_by_next_method:string};
/** Resolve a declared composite display label to its unique leading method node.
 * The entire primary label is retained as the node name; no qualifier, support,
 * procedure or dependency is removed or invented. This does not approve science.
 */
export function normalizeDeclaredPrimaryMethod<T extends Component,H extends Handoff>(primaryMethod:string,components:T[],handoffs:H[]) {
  const originalFingerprint=fingerprint({primaryMethod,components,handoffs});
  const names=new Set(components.map(c=>c.name));
  if(names.size!==components.length)throw new Error("METHOD_PRIMARY_NORMALIZATION_DUPLICATE_COMPONENT");
  const exact=components.find(c=>c.name===primaryMethod&&c.kind==="method");
  let alias:string|null=null;
  if(!exact) {
    // Explicit composition connectors only; never arbitrary prefix/substring or
    // semantic similarity. More than one eligible node is an ambiguous graph.
    const candidates=components.filter(c=>c.kind==="method"&&[" con "," with "].some(join=>primaryMethod.startsWith(c.name+join)&&primaryMethod.length>c.name.length+join.length));
    if(candidates.length!==1||names.has(primaryMethod))throw new Error("METHOD_PRIMARY_NORMALIZATION_AMBIGUOUS_OR_UNDECLARED");
    alias=candidates[0].name;
  }
  const rename=(name:string)=>alias&&name===alias?primaryMethod:name;
  const normalized=components.map(c=>({...c,name:rename(c.name),dependencies:c.dependencies.map(rename)}));
  const edges=handoffs.map(h=>({...h,from:rename(h.from),to:rename(h.to)}));
  return {primaryMethod,components:normalized,handoffs:edges,audit:{version:METHOD_PRIMARY_NORMALIZATION_VERSION,
    originalFingerprint,normalizedFingerprint:fingerprint({primaryMethod,components:normalized,handoffs:edges}),
    alias:alias?{declaredComponentName:alias,declaredPrimaryMethod:primaryMethod}:null}};
}
