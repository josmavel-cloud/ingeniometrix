import os from "node:os";
import path from "node:path";

function resolveRuntimePath(value: string) {
  if (path.isAbsolute(value)) {
    return value;
  }

  return path.resolve(/* turbopackIgnore: true */ process.cwd(), value);
}

export function getArtifactsRoot() {
  const override = process.env.IMX_ARTIFACTS_DIR?.trim() || process.env.ARTIFACTS_DIR?.trim();
  if (override && override.length > 0) {
    return resolveRuntimePath(override);
  }

  if (process.env.VERCEL) {
    return path.join(os.tmpdir(), "ingeniometrix-artifacts");
  }

  return path.join(/* turbopackIgnore: true */ process.cwd(), "artifacts-local");
}
