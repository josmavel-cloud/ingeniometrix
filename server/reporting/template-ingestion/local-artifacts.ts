import path from "node:path";

export function getArtifactsRoot() {
  const override = process.env.IMX_ARTIFACTS_DIR?.trim() || process.env.ARTIFACTS_DIR?.trim();
  return override && override.length > 0
    ? path.resolve(process.cwd(), override)
    : path.join(process.cwd(), "artifacts-local");
}
