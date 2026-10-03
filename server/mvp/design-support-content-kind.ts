import { createHash } from "node:crypto";
import { readFile, realpath, stat, mkdtemp, writeFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import os from "node:os";
import { htmlSupportPassages, pdfSupportPassages, METHOD_DOCUMENT_INSPECTION_VERSION, type SupportPassage } from "./design-support-document";
import type { DesignSupportSource } from "./design-support-addendum";
const normalize = (value: string) => value.normalize("NFKC").replace(/\s+/gu," ").trim();

/** Derived annotations only: no fetch, no original passage/ID/order mutation. */
export async function annotateRetainedSupportContentKind(original: DesignSupportSource, options: { artifactRoot?: string } = {}) {
  if (!original.document.privateArtifactPath) throw new Error("DESIGN_SUPPORT_RETAINED_ARTIFACT_REQUIRED");
  const root=await realpath(options.artifactRoot ?? path.resolve("artifacts-local","design-support"));
  const file=await realpath(original.document.privateArtifactPath), relative=path.relative(root,file);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("DESIGN_SUPPORT_RETAINED_ARTIFACT_OUTSIDE_ROOT");
  if ((await stat(file)).size>20*1024*1024) throw new Error("DESIGN_SUPPORT_RETAINED_ARTIFACT_TOO_LARGE");
  const bytes=await readFile(file), hash=createHash("sha256").update(bytes).digest("hex");
  if (hash!==original.document.sha256) throw new Error("DESIGN_SUPPORT_ARTIFACT_INTEGRITY");
  let inspected: SupportPassage[]=[];
  if (original.document.mediaType === "text/html") inspected=htmlSupportPassages(bytes.toString("utf8")).passages;
  else {
    if (bytes.subarray(0,5).toString()!=="%PDF-") throw new Error("DESIGN_SUPPORT_RETAINED_PDF_SIGNATURE");
    const directory=await mkdtemp(path.join(os.tmpdir(),"imx-retained-support-"));
    try {
      const verified=path.join(directory,"verified.pdf");await writeFile(verified,bytes,{mode:0o600});
      const {stdout:info}=await promisify(execFile)("pdfinfo",[verified],{timeout:15000,maxBuffer:65536,encoding:"utf8"});
      const pages=Number(/^Pages:\s+(\d+)/m.exec(info)?.[1]);
      if(!pages||pages>1000||/^Encrypted:\s+yes/m.test(info))throw new Error("DESIGN_SUPPORT_PDF_INVALID");
      const {stdout}=await promisify(execFile)("pdftotext",["-f","1","-l","60",verified,"-"],{timeout:60000,maxBuffer:2_000_000,encoding:"utf8"});
      inspected=pdfSupportPassages(stdout);
    } finally {await rm(directory,{recursive:true,force:true});}
  }
  const source=structuredClone(original);
  const matches=source.document.passages.map((passage,index)=>{
    const text=normalize(passage.text);
    const candidates=inspected.filter(item=>(original.document.mediaType!=="application/pdf"||item.page===passage.page)&&normalize(item.text)===text);
    const kinds=[...new Set(candidates.map(item=>item.contentKind))];
    // Exact text at multiple locations never broadens an abstract into full text.
    const kind=kinds.includes("ABSTRACT")?"ABSTRACT":kinds.includes("METADATA")?"METADATA":kinds.length===1&&kinds[0]==="FULL_TEXT_PASSAGE"?"FULL_TEXT_PASSAGE":"METADATA";
    passage.contentKind=kind;
    passage.contentKindBasis=candidates.length?`HASH_VERIFIED_EXACT_TEXT:${METHOD_DOCUMENT_INSPECTION_VERSION}`:"RETAINED_TEXT_NOT_EXACTLY_REIDENTIFIED";
    return {evidenceId:`${source.sourceId}:P${index+1}`,locator:passage.locator,kind,exactMatches:candidates.length};
  });
  return {source,audit:{version:METHOD_DOCUMENT_INSPECTION_VERSION,sourceId:source.sourceId,documentHash:hash,hashVerified:true,matches}};
}
