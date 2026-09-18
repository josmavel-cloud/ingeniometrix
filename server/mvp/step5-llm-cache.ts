import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type Step5LlmCacheKind =
  | "source_evidence_extraction"
  | "asset_visual_localization"
  | "equation_latex_ocr";

type CacheEnvelope<T> = {
  cache_version: "step5-llm-cache-v1";
  kind: Step5LlmCacheKind;
  cache_key: string;
  created_at: string;
  model: string;
  prompt_version: string;
  payload: T;
};

const CACHE_ROOT = path.join(process.cwd(), "artifacts-local", "mvp-step5-llm-cache");

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashStep5Prompt(value: string) {
  return sha256(value);
}

export async function hashStep5File(filePath: string | null | undefined) {
  if (!filePath) return null;
  return sha256(await readFile(filePath));
}

export function buildStep5LlmCacheKey(input: {
  kind: Step5LlmCacheKind;
  model: string;
  promptVersion: string;
  schemaName: string;
  promptHash: string;
  imageHash?: string | null;
  sourceId?: string | null;
  assetId?: string | null;
}) {
  return sha256(JSON.stringify({
    cache_version: "step5-llm-cache-v1",
    ...input,
  }));
}

function cachePath(kind: Step5LlmCacheKind, cacheKey: string) {
  return path.join(CACHE_ROOT, kind, `${cacheKey}.json`);
}

export async function readStep5LlmCache<T>(input: {
  kind: Step5LlmCacheKind;
  cacheKey: string;
}) {
  try {
    const raw = await readFile(cachePath(input.kind, input.cacheKey), "utf8");
    const envelope = JSON.parse(raw) as CacheEnvelope<T>;
    return envelope.payload;
  } catch {
    return null;
  }
}

export async function writeStep5LlmCache<T>(input: {
  kind: Step5LlmCacheKind;
  cacheKey: string;
  model: string;
  promptVersion: string;
  payload: T;
}) {
  const filePath = cachePath(input.kind, input.cacheKey);
  await mkdir(path.dirname(filePath), { recursive: true });
  const envelope: CacheEnvelope<T> = {
    cache_version: "step5-llm-cache-v1",
    kind: input.kind,
    cache_key: input.cacheKey,
    created_at: new Date().toISOString(),
    model: input.model,
    prompt_version: input.promptVersion,
    payload: input.payload,
  };
  await writeFile(filePath, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
}
