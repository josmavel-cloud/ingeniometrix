import fs from "node:fs/promises";
import path from "node:path";

function normalizeSegments(segments) {
  return segments.flatMap((segment) => {
    if (Array.isArray(segment)) {
      return normalizeSegments(segment);
    }

    if (typeof segment !== "string") {
      return [];
    }

    return segment.trim().length > 0 ? [segment] : [];
  });
}

export function getArtifactsRoot() {
  const override = process.env.IMX_ARTIFACTS_DIR?.trim();
  return override && override.length > 0
    ? path.resolve(process.cwd(), override)
    : path.join(process.cwd(), "artifacts-local");
}

export function resolveArtifactPath(...segments) {
  return path.join(getArtifactsRoot(), ...normalizeSegments(segments));
}

export async function ensureArtifactDir(...segments) {
  const targetDir = resolveArtifactPath(...segments);
  await fs.mkdir(targetDir, { recursive: true });
  return targetDir;
}

export function buildArtifactTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
