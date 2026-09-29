import { mkdir, writeFile, rename } from "node:fs/promises";
import path from "node:path";
let writing = false;
export async function writeWorkerHeartbeat(state: "IDLE" | "RUNNING" | "STOPPING") {
  const root = process.env.IMX_OPERATIONS_DIR;
  if (!root || writing) return;
  writing = true;
  try {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const file = path.join(root, "worker.json");
  await writeFile(`${file}.tmp`, JSON.stringify({ at: new Date().toISOString(), state }), { mode: 0o600 });
  await rename(`${file}.tmp`, file);
  } finally { writing = false; }
}
