import { createWriteStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { spawn } from "node:child_process";

import { PrismaClient } from "@prisma/client";

import {
  buildArtifactTimestamp,
  ensureArtifactDir,
} from "./lib/artifact-paths.mjs";

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const SERVER_READY_TIMEOUT_MS = 120_000;
const SERVER_POLL_INTERVAL_MS = 2_000;

const DEBUG_CASE = {
  projectInput: {
    title: "Blueprint report MVP con plantilla real",
    degreeLevel: "MAESTRIA",
    university: "UPC",
    program: "Maestria en Gestion de la Innovacion",
    templateKey: "UPC_POSGRADO",
  },
  intakeInput: {
    topic:
      "Factores que afectan la adopcion de herramientas de analitica de datos en pymes de Lima.",
    problemContext:
      "Las pymes comerciales intentan usar herramientas de analitica, pero persisten brechas de capacidades, procesos y evidencia para tomar decisiones basadas en datos.",
    researchLine: "Transformacion digital y gestion de informacion.",
    academicConstraints:
      "Acotar el estudio a planeamiento de investigacion, evitando afirmaciones causales fuertes y usando solo fuentes recuperadas.",
    targetPopulation:
      "Gerentes, jefes y responsables operativos de pymes comerciales en Lima Metropolitana.",
    availableData:
      "Entrevistas semiestructuradas, encuestas y referencias academicas recuperadas por el sistema.",
    preferredMethodology: "Enfoque mixto con diseno descriptivo y exploratorio.",
    advisorNotes:
      "Alinear objetivos, preguntas y metodo, y explicitar assumptions cuando falte soporte directo.",
  },
};

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    selectionCount: 7,
    templateVersionId: null,
  };

  for (const arg of argv) {
    if (arg.startsWith("--base-url=")) {
      options.baseUrl = arg.slice("--base-url=".length);
      continue;
    }

    if (arg.startsWith("--selection-count=")) {
      options.selectionCount = Number.parseInt(arg.slice("--selection-count=".length), 10);
      continue;
    }

    if (arg.startsWith("--template-version-id=")) {
      options.templateVersionId = arg.slice("--template-version-id=".length);
    }
  }

  return options;
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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

async function ensureServer(baseUrl, rootDir) {
  try {
    await waitForServer(baseUrl);
    return { close: null };
  } catch {
    // Start local server if needed.
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

async function resolveTemplateVersionId(explicitTemplateVersionId) {
  if (explicitTemplateVersionId) {
    return explicitTemplateVersionId;
  }

  const prisma = new PrismaClient();

  try {
    const templateVersion = await prisma.templateVersion.findFirst({
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!templateVersion) {
      throw new Error("No hay TemplateVersion cargadas en la base local.");
    }

    return templateVersion.id;
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const artifactRoot = await ensureArtifactDir(
    "debug-blueprint-report",
    buildArtifactTimestamp(),
  );
  const serverHandle = await ensureServer(options.baseUrl, artifactRoot);
  const templateVersionId = options.templateVersionId
    ? await resolveTemplateVersionId(options.templateVersionId)
    : null;
  const jar = new Map();

  try {
    const session = await requestJson(options.baseUrl, jar, "POST", "/api/auth/session", {
      email: "debug.blueprint.report@ingeniometrix.local",
      name: "Debug Blueprint Report",
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
    await writeJson(path.join(artifactRoot, "07-blueprint.json"), blueprintResponse);

    const versionId = blueprintResponse.version.id;
    const reportResponse = await requestJson(
      options.baseUrl,
      jar,
      "POST",
      `/api/projects/${projectId}/blueprints/${versionId}/report-preview`,
      templateVersionId ? { templateVersionId } : {},
    );
    await writeJson(path.join(artifactRoot, "08-report-preview.json"), reportResponse);

    const summary = {
      artifactRoot,
      projectId,
      blueprintVersionId: versionId,
      requestedTemplateVersionId: templateVersionId,
      resolvedTemplateVersionId: reportResponse.bundle.templateVersionId,
      outputDir: reportResponse.bundle.outputDir,
      canonicalJsonPath: reportResponse.bundle.paths.canonicalJson,
      docxPath: reportResponse.bundle.paths.docx,
      summaryJsonPath: reportResponse.bundle.paths.summaryJson,
      sectionCount: reportResponse.bundle.sectionCount,
      annexCount: reportResponse.bundle.annexCount,
      referenceCount: reportResponse.bundle.referenceCount,
      warnings: reportResponse.bundle.validation.warnings,
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
