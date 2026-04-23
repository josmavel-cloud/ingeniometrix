import { homedir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

type PythonRuntimeCandidate = {
  command: string;
  baseArgs: string[];
  label: string;
};

export type PythonRuntimeHandle = PythonRuntimeCandidate & {
  hasPypdf: boolean;
  hasPillow: boolean;
};

function buildPythonCandidates(): PythonRuntimeCandidate[] {
  const bundledWindows = path.join(
    homedir(),
    ".cache",
    "codex-runtimes",
    "codex-primary-runtime",
    "dependencies",
    "python",
    "python.exe",
  );
  const bundledUnix = path.join(
    homedir(),
    ".cache",
    "codex-runtimes",
    "codex-primary-runtime",
    "dependencies",
    "python",
    "python",
  );
  const candidates: PythonRuntimeCandidate[] = [];
  const envPaths = [
    process.env.IMX_PYTHON_PATH,
    process.env.CODEX_BUNDLED_PYTHON_PATH,
    process.env.PYTHON,
  ].filter((value): value is string => Boolean(value?.trim()));

  for (const envPath of envPaths) {
    candidates.push({
      command: envPath,
      baseArgs: [],
      label: "env",
    });
  }

  candidates.push(
    {
      command: process.platform === "win32" ? bundledWindows : bundledUnix,
      baseArgs: [],
      label: "codex_bundled",
    },
    {
      command: "python3",
      baseArgs: [],
      label: "python3",
    },
    {
      command: "python",
      baseArgs: [],
      label: "python",
    },
  );

  if (process.platform === "win32") {
    candidates.push({
      command: "py",
      baseArgs: ["-3"],
      label: "py_launcher",
    });
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.command}|${candidate.baseArgs.join(" ")}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function runPythonJson<T>(runtime: PythonRuntimeCandidate, script: string, args: string[]) {
  return new Promise<T | null>((resolve) => {
    const child = spawn(runtime.command, [...runtime.baseArgs, "-c", script, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.on("error", () => resolve(null));
    child.on("close", () => {
      try {
        resolve(JSON.parse(stdout) as T);
      } catch {
        resolve(null);
      }
    });
  });
}

async function inspectRuntime(candidate: PythonRuntimeCandidate) {
  const script = [
    "import importlib.util, json, sys",
    "print(json.dumps({",
    "  'ok': True,",
    "  'version': sys.version.split()[0],",
    "  'has_pypdf': bool(importlib.util.find_spec('pypdf')),",
    "  'has_pillow': bool(importlib.util.find_spec('PIL')),",
    "}))",
  ].join("\n");
  return runPythonJson<{
    ok: boolean;
    version: string;
    has_pypdf: boolean;
    has_pillow: boolean;
  }>(candidate, script, []);
}

async function installPdfDependencies(runtime: PythonRuntimeCandidate) {
  const installArgs = [
    ...runtime.baseArgs,
    "-m",
    "pip",
    "install",
    "--disable-pip-version-check",
    "--quiet",
    "pypdf",
    "pillow",
  ];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(runtime.command, installArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `pip devolvio codigo ${code}.`));
    });
  });
}

export async function ensurePdfPythonRuntime(): Promise<PythonRuntimeHandle> {
  const candidates = buildPythonCandidates();

  for (const candidate of candidates) {
    const inspection = await inspectRuntime(candidate);

    if (!inspection?.ok) {
      continue;
    }

    if (!inspection.has_pypdf || !inspection.has_pillow) {
      try {
        await installPdfDependencies(candidate);
      } catch {
        // Ignore and re-check below.
      }
    }

    const finalInspection = (await inspectRuntime(candidate)) ?? inspection;

    return {
      ...candidate,
      hasPypdf: finalInspection.has_pypdf,
      hasPillow: finalInspection.has_pillow,
    };
  }

  throw new Error(
    "No se encontro un runtime de Python utilizable para el pipeline PDF del MasterBlueprintEngine.",
  );
}

export async function runPythonJsonWithResolvedRuntime<T>(
  script: string,
  args: string[],
): Promise<{
  runtime: PythonRuntimeHandle;
  payload: T | null;
}> {
  const runtime = await ensurePdfPythonRuntime();
  const payload = await runPythonJson<T>(runtime, script, args);

  return {
    runtime,
    payload,
  };
}
