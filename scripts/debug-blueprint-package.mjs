import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { spawn } from "node:child_process";

import {
  buildArtifactTimestamp,
  ensureArtifactDir,
} from "./lib/artifact-paths.mjs";

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const SERVER_READY_TIMEOUT_MS = 120_000;
const SERVER_POLL_INTERVAL_MS = 2_000;

const DEBUG_CASE = {
  projectInput: {
    title: "Motor blueprint MVP con trazabilidad por insights",
    degreeLevel: "MAESTRIA",
    university: "UPC",
    program: "Maestria en Gestion y Direccion de Proyectos",
    templateKey: "UPC_POSGRADO",
  },
  intakeInput: {
    topic:
      "Factores que influyen en la adopcion de analitica de datos en pymes comerciales peruanas.",
    problemContext:
      "Muchas pymes invierten en datos y herramientas digitales, pero no tienen claridad sobre los factores que facilitan o dificultan su adopcion real en procesos de decision.",
    researchLine: "Transformacion digital y gestion basada en datos.",
    academicConstraints:
      "Delimitar el estudio a pymes comerciales de Lima Metropolitana y a un alcance de planeamiento de investigacion.",
    targetPopulation:
      "Propietarios, gerentes y responsables operativos de pymes comerciales en Lima Metropolitana.",
    availableData:
      "Encuestas, entrevistas semiestructuradas y bibliografia academica recuperada desde OpenAlex y Crossref.",
    preferredMethodology: "Enfoque mixto con componente descriptivo y exploratorio.",
    advisorNotes:
      "Evitar afirmaciones causales fuertes y mantener trazabilidad explicita entre evidencia, objetivos y metodo.",
  },
};

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    reuseServer: false,
    selectionCount: 7,
  };

  for (const arg of argv) {
    if (arg === "--reuse-server") {
      options.reuseServer = true;
      continue;
    }

    if (arg.startsWith("--base-url=")) {
      options.baseUrl = arg.slice("--base-url=".length);
      continue;
    }

    if (arg.startsWith("--selection-count=")) {
      options.selectionCount = Number.parseInt(arg.slice("--selection-count=".length), 10);
    }
  }

  return options;
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function buildCookieHeader(jar) {
  return Array.from(jar.entries())
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
}

function applySetCookies(jar, response) {
  const setCookies =
    response.headers.getSetCookie?.() ??
    (response.headers.get("set-cookie") ? [response.headers.get("set-cookie")] : []);

  for (const cookie of setCookies) {
    if (!cookie) {
      continue;
    }

    const [pair] = cookie.split(";");
    const [key, ...rest] = pair.split("=");
    jar.set(key, rest.join("="));
  }
}

async function requestJson(baseUrl, jar, method, routePath, body) {
  const headers = new Headers();

  if (jar.size > 0) {
    headers.set("cookie", buildCookieHeader(jar));
  }

  if (body !== undefined) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`${baseUrl}${routePath}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  applySetCookies(jar, response);

  const text = await response.text();
  let parsedBody;

  try {
    parsedBody = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    parsedBody = { rawText: text };
  }

  if (!response.ok) {
    throw new Error(
      `La solicitud ${method} ${routePath} fallo con estado ${response.status}: ${JSON.stringify(parsedBody)}`,
    );
  }

  return parsedBody;
}

async function waitForServer(baseUrl) {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= SERVER_READY_TIMEOUT_MS) {
    try {
      const response = await fetch(baseUrl, {
        method: "GET",
      });

      if (response.ok) {
        return;
      }
    } catch {
      // Wait until timeout.
    }

    await delay(SERVER_POLL_INTERVAL_MS);
  }

  throw new Error(`El servidor no estuvo disponible en ${baseUrl}.`);
}

async function stopChildProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode) {
    return;
  }

  if (process.platform === "win32" && child.pid) {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    await once(killer, "close");
    return;
  }

  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), delay(10_000)]);
}

async function closeLogStream(stream) {
  await new Promise((resolve) => {
    if (stream.destroyed || stream.closed) {
      resolve();
      return;
    }

    stream.once("finish", resolve);
    stream.once("close", resolve);
    stream.end();
  });
}

async function ensureServer(baseUrl, rootDir, reuseServer) {
  if (reuseServer) {
    await waitForServer(baseUrl);
    return { close: null };
  }

  try {
    await waitForServer(baseUrl);
    return { close: null };
  } catch {
    // Start a local server if needed.
  }

  const logPath = path.join(rootDir, "server.log");
  const errorLogPath = path.join(rootDir, "server.err.log");
  const stdoutStream = createWriteStream(logPath, { flags: "a" });
  const stderrStream = createWriteStream(errorLogPath, { flags: "a" });
  const child =
    process.platform === "win32"
      ? spawn("cmd.exe", ["/d", "/s", "/c", "npm run dev"], {
          cwd: process.cwd(),
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
          detached: false,
        })
      : spawn("npm", ["run", "dev"], {
          cwd: process.cwd(),
          stdio: ["ignore", "pipe", "pipe"],
          detached: false,
        });

  child.stdout?.pipe(stdoutStream);
  child.stderr?.pipe(stderrStream);

  await waitForServer(baseUrl);

  return {
    close: async () => {
      child.stdout?.unpipe(stdoutStream);
      child.stderr?.unpipe(stderrStream);
      await stopChildProcess(child);
      await closeLogStream(stdoutStream);
      await closeLogStream(stderrStream);
    },
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const artifactRoot = await ensureArtifactDir(
    "debug-blueprint-package",
    buildArtifactTimestamp(),
  );
  const serverHandle = await ensureServer(options.baseUrl, artifactRoot, options.reuseServer);
  const jar = new Map();

  try {
    const session = await requestJson(options.baseUrl, jar, "POST", "/api/auth/session", {
      email: "debug.blueprint@ingeniometrix.local",
      name: "Debug Blueprint",
    });
    await writeJson(path.join(artifactRoot, "01-session.json"), session);

    const projectResponse = await requestJson(
      options.baseUrl,
      jar,
      "POST",
      "/api/projects",
      DEBUG_CASE.projectInput,
    );
    await writeJson(path.join(artifactRoot, "02-project.json"), projectResponse);

    const projectId = projectResponse.project.id;
    const intakeResponse = await requestJson(
      options.baseUrl,
      jar,
      "PUT",
      `/api/projects/${projectId}/intake`,
      DEBUG_CASE.intakeInput,
    );
    await writeJson(path.join(artifactRoot, "03-intake.json"), intakeResponse);

    const searchResponse = await requestJson(
      options.baseUrl,
      jar,
      "POST",
      `/api/projects/${projectId}/search`,
    );
    await writeJson(path.join(artifactRoot, "04-search.json"), searchResponse);

    const referencesResponse = await requestJson(
      options.baseUrl,
      jar,
      "GET",
      `/api/projects/${projectId}/references`,
    );
    await writeJson(path.join(artifactRoot, "05-references.json"), referencesResponse);

    const selectedReferenceIds = referencesResponse.references
      .slice(0, options.selectionCount)
      .map((item) => item.reference.id);

    const selectionResponse = await requestJson(
      options.baseUrl,
      jar,
      "PUT",
      `/api/projects/${projectId}/references`,
      {
        selectedReferenceIds,
      },
    );
    await writeJson(path.join(artifactRoot, "06-selection.json"), selectionResponse);

    const blueprintResponse = await requestJson(
      options.baseUrl,
      jar,
      "POST",
      `/api/projects/${projectId}/blueprints`,
    );
    await writeJson(path.join(artifactRoot, "07-blueprint-create.json"), blueprintResponse);

    const versionId = blueprintResponse.version.id;
    const versionResponse = await requestJson(
      options.baseUrl,
      jar,
      "GET",
      `/api/projects/${projectId}/blueprints/${versionId}`,
    );
    await writeJson(path.join(artifactRoot, "08-blueprint-version.json"), versionResponse);

    const blueprint = versionResponse.version.blueprintJson;
    const summary = {
      artifactRoot,
      projectId,
      versionId,
      templateContextSource: blueprint.template_context?.source ?? null,
      referenceInsightsCount: Array.isArray(blueprint.reference_insights)
        ? blueprint.reference_insights.length
        : 0,
      citationPlanCount: Array.isArray(blueprint.citation_plan) ? blueprint.citation_plan.length : 0,
      citationPlanSupportLevels: Array.isArray(blueprint.citation_plan)
        ? blueprint.citation_plan.reduce((accumulator, section) => {
            const key = section.support_level ?? "unknown";
            accumulator[key] = (accumulator[key] ?? 0) + 1;
            return accumulator;
          }, {})
        : {},
      engineWarnings: blueprint.engine_warnings ?? [],
    };

    await writeJson(path.join(artifactRoot, "09-summary.json"), summary);
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    if (typeof serverHandle.close === "function") {
      await serverHandle.close();
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
