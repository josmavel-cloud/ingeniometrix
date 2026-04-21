import { createWriteStream } from "node:fs";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
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
const DEFAULT_RUNS = 50;
const DEFAULT_SELECTION_COUNT = 7;
const MIN_SELECTION_COUNT = 5;
const SERVER_READY_TIMEOUT_MS = 120_000;
const SERVER_POLL_INTERVAL_MS = 2_000;
const SERVER_PROBE_TIMEOUT_MS = 2_000;
const DEBUG_CASES = [
  {
    projectInput: {
      title:
        "Factores de adopcion de inteligencia artificial en universidades privadas peruanas",
      degreeLevel: "MAESTRIA",
      university: "UPC",
      program: "Maestria en Direccion de Sistemas y Tecnologias de la Informacion",
      templateKey: "UPC_POSGRADO",
    },
    intakeInput: {
      topic:
        "Factores de adopcion de herramientas de inteligencia artificial en universidades privadas peruanas.",
      problemContext:
        "Las universidades privadas vienen incorporando herramientas de IA, pero existe poca claridad sobre los factores organizacionales, docentes y tecnologicos que impulsan o frenan su adopcion real.",
      researchLine: "Transformacion digital en educacion superior.",
      academicConstraints:
        "El estudio debe enfocarse en instituciones privadas del Peru y limitarse a la fase de adopcion, no a resultados de aprendizaje de largo plazo.",
      targetPopulation:
        "Docentes y coordinadores academicos de universidades privadas ubicadas en Lima Metropolitana.",
      availableData:
        "Acceso potencial a encuestas online y entrevistas semiestructuradas con docentes y coordinadores.",
      preferredMethodology:
        "Enfoque mixto con encuesta descriptiva y entrevistas exploratorias.",
      advisorNotes:
        "Delimitar bien el concepto de adopcion y evitar convertir el trabajo en una evaluacion pedagogica completa.",
    },
  },
  {
    projectInput: {
      title: "Experiencia de usuario y confianza en aplicaciones fintech de pagos en Peru",
      degreeLevel: "MAESTRIA",
      university: "UPC",
      program: "Maestria en Gestion de la Innovacion y Transformacion Digital",
      templateKey: "UPC_POSGRADO",
    },
    intakeInput: {
      topic:
        "Relacion entre experiencia de usuario digital y confianza en aplicaciones fintech peruanas.",
      problemContext:
        "Las fintech han crecido con rapidez, pero la confianza del usuario sigue siendo una barrera para una adopcion sostenida y para el uso recurrente de sus aplicaciones.",
      researchLine: "Innovacion digital y comportamiento del consumidor.",
      academicConstraints:
        "Analizar solo aplicaciones fintech orientadas a pagos y transferencias en el mercado peruano.",
      targetPopulation:
        "Usuarios entre 22 y 40 anos que utilicen aplicaciones fintech de pagos en Lima y Callao.",
      availableData:
        "Encuestas online, resenas publicas en tiendas de apps y literatura sobre UX y confianza.",
      preferredMethodology: "Cuantitativa de corte transversal.",
      advisorNotes:
        "Operacionalizar confianza con dimensiones claras y no mezclarla con satisfaccion de manera indistinta.",
    },
  },
  {
    projectInput: {
      title:
        "Impacto del teletrabajo hibrido en el desempeno administrativo de empresas de servicios",
      degreeLevel: "POSGRADO",
      university: "UCV",
      program: "Posgrado en Gestion del Talento Humano",
      templateKey: "UCV_POSGRADO",
    },
    intakeInput: {
      topic:
        "Impacto percibido del teletrabajo hibrido en el desempeno de equipos administrativos.",
      problemContext:
        "Muchas organizaciones mantienen esquemas hibridos, pero no tienen evidencia clara sobre como estos afectan coordinacion, productividad y bienestar del personal administrativo.",
      researchLine: "Gestion del talento y trabajo digital.",
      academicConstraints:
        "Limitar el estudio a personal administrativo y no incluir trabajadores operativos o comerciales.",
      targetPopulation:
        "Colaboradores administrativos de empresas medianas del sector servicios en Lima.",
      availableData:
        "Encuesta interna, entrevistas y documentos organizacionales sobre politicas de trabajo hibrido.",
      preferredMethodology: "Diseno no experimental descriptivo-correlacional.",
      advisorNotes:
        "Evitar afirmaciones causales fuertes porque no habra intervencion experimental.",
    },
  },
  {
    projectInput: {
      title: "Uso de analitica digital para mejorar decisiones de marketing en pymes comerciales",
      degreeLevel: "MAESTRIA",
      university: "USMP",
      program: "Maestria en Marketing y Negocios Internacionales",
      templateKey: "USMP_POSGRADO",
    },
    intakeInput: {
      topic:
        "Uso de analitica digital para mejorar decisiones de marketing en pymes comerciales.",
      problemContext:
        "Muchas pymes invierten en marketing digital pero toman decisiones con baja capacidad analitica, lo que reduce eficiencia y dificulta medir retorno.",
      researchLine: "Analitica de negocios y marketing.",
      academicConstraints:
        "Centrarse en pymes del sector comercio con presencia activa en redes sociales.",
      targetPopulation:
        "Propietarios o responsables de marketing de pymes comerciales en Lima Norte.",
      availableData:
        "Entrevistas, encuestas y acceso parcial a metricas de redes sociales o campanas.",
      preferredMethodology: "Estudio aplicado con enfoque mixto.",
      advisorNotes:
        "Definir claramente que se entiende por analitica digital y no reducirlo solo a numero de seguidores.",
    },
  },
  {
    projectInput: {
      title:
        "Factores de experiencia digital que influyen en la intencion de recompra en e-commerce peruano",
      degreeLevel: "MAESTRIA",
      university: "UPC",
      program: "Maestria en Administracion y Direccion de Marketing",
      templateKey: "UPC_POSGRADO",
    },
    intakeInput: {
      topic:
        "Factores de experiencia digital que influyen en la intencion de recompra en plataformas de e-commerce peruano.",
      problemContext:
        "El comercio electronico crece, pero muchas plataformas no logran convertir compradores ocasionales en clientes recurrentes.",
      researchLine: "Comportamiento del consumidor digital.",
      academicConstraints:
        "Analizar solo plataformas con operacion en Peru y usuarios mayores de edad.",
      targetPopulation:
        "Consumidores de 20 a 45 anos que hayan comprado al menos una vez en e-commerce local durante los ultimos 6 meses.",
      availableData:
        "Encuestas online y referencias bibliograficas sobre UX, confianza y recompra.",
      preferredMethodology: "Cuantitativa con modelo correlacional.",
      advisorNotes:
        "Mantener como variable dependiente la intencion de recompra y no mezclarla con lealtad de marca completa.",
    },
  },
  {
    projectInput: {
      title:
        "Uso de recordatorios digitales y adherencia al tratamiento en pacientes cronicos",
      degreeLevel: "POSGRADO",
      university: "UCV",
      program: "Posgrado en Gestion de Servicios de Salud",
      templateKey: "UCV_POSGRADO",
    },
    intakeInput: {
      topic:
        "Uso de recordatorios digitales y adherencia al tratamiento en pacientes cronicos.",
      problemContext:
        "Las soluciones de salud digital prometen mejorar adherencia, pero en la practica hay brechas de uso, seguimiento y aceptacion por parte de los pacientes.",
      researchLine: "Innovacion en salud digital.",
      academicConstraints:
        "No intervenir clinicamente; limitarse a evaluar uso y percepcion de herramientas de recordatorio.",
      targetPopulation:
        "Pacientes adultos con enfermedades cronicas atendidos en centros privados de salud en Lima.",
      availableData:
        "Encuestas, entrevistas y revision de literatura open access sobre adherencia y salud digital.",
      preferredMethodology: "Enfoque mixto descriptivo.",
      advisorNotes:
        "Evitar conclusiones medicas y concentrarse en comportamiento de uso y percepcion.",
    },
  },
  {
    projectInput: {
      title: "Madurez de practicas de ciberseguridad en pymes del sector servicios",
      degreeLevel: "MAESTRIA",
      university: "USMP",
      program: "Maestria en Ingenieria de Sistemas",
      templateKey: "USMP_POSGRADO",
    },
    intakeInput: {
      topic: "Madurez de practicas de ciberseguridad en pymes del sector servicios.",
      problemContext:
        "Las pymes enfrentan riesgos crecientes de seguridad digital, pero suelen carecer de politicas formales, capacitacion y herramientas de control.",
      researchLine: "Gobierno TI y gestion de riesgos.",
      academicConstraints:
        "Trabajar con una evaluacion de practicas y no con pruebas tecnicas de intrusion.",
      targetPopulation:
        "Responsables de TI o administradores de pequenas y medianas empresas de servicios en Lima.",
      availableData: "Checklist, encuestas y entrevistas con responsables de TI.",
      preferredMethodology: "Diagnostico aplicado de corte descriptivo.",
      advisorNotes:
        "Usar un marco simple de madurez para no sobrecargar el trabajo con estandares enterprise.",
    },
  },
  {
    projectInput: {
      title:
        "Efectividad percibida de programas de capacitacion virtual en colaboradores administrativos",
      degreeLevel: "POSGRADO",
      university: "UCV",
      program: "Posgrado en Gestion de Recursos Humanos",
      templateKey: "UCV_POSGRADO",
    },
    intakeInput: {
      topic:
        "Efectividad percibida de programas de capacitacion virtual en colaboradores administrativos.",
      problemContext:
        "Las empresas utilizan capacitacion virtual para reducir costos, pero no siempre tienen claridad sobre su aceptacion y utilidad real para el personal.",
      researchLine: "Aprendizaje organizacional y tecnologia educativa.",
      academicConstraints:
        "Medir percepcion y resultados reportados, no desempeno objetivo longitudinal.",
      targetPopulation:
        "Colaboradores administrativos de empresas medianas que hayan recibido capacitacion virtual reciente.",
      availableData: "Encuestas online y entrevistas semiestructuradas.",
      preferredMethodology: "Mixto con prioridad cuantitativa.",
      advisorNotes:
        "Diferenciar satisfaccion de efectividad percibida y de aplicacion al puesto.",
    },
  },
  {
    projectInput: {
      title: "Barreras de adopcion de banca digital en adultos mayores urbanos",
      degreeLevel: "MAESTRIA",
      university: "UPC",
      program: "Maestria en Comportamiento del Consumidor",
      templateKey: "UPC_POSGRADO",
    },
    intakeInput: {
      topic: "Barreras de adopcion de banca digital en adultos mayores urbanos.",
      problemContext:
        "Aunque la banca digital se expande, los adultos mayores siguen enfrentando barreras de confianza, usabilidad y apoyo para su adopcion sostenida.",
      researchLine: "Inclusion financiera y transformacion digital.",
      academicConstraints:
        "Limitar el estudio a zonas urbanas y usuarios con telefono inteligente.",
      targetPopulation:
        "Adultos mayores de 60 anos residentes en Lima Metropolitana con cuenta bancaria activa.",
      availableData:
        "Entrevistas, encuestas asistidas y bibliografia sobre inclusion financiera digital.",
      preferredMethodology: "Cualitativa con apoyo descriptivo cuantitativo.",
      advisorNotes:
        "Plantear un alcance realista y evitar convertir el estudio en evaluacion nacional.",
    },
  },
  {
    projectInput: {
      title:
        "Influencia de sostenibilidad percibida en la intencion de compra en retail moderno",
      degreeLevel: "MAESTRIA",
      university: "USMP",
      program: "Maestria en Marketing Turistico y Hotelero",
      templateKey: "USMP_POSGRADO",
    },
    intakeInput: {
      topic:
        "Influencia de iniciativas de sostenibilidad percibida en la intencion de compra en retail moderno.",
      problemContext:
        "Las marcas comunican acciones de sostenibilidad, pero no esta claro si estas generan valor real en decisiones de compra del consumidor peruano.",
      researchLine: "Marketing sostenible y percepcion del consumidor.",
      academicConstraints: "Enfocarse en retail moderno y consumidores de Lima.",
      targetPopulation:
        "Clientes frecuentes de supermercados y tiendas por departamento entre 20 y 45 anos.",
      availableData:
        "Encuestas online y revision bibliografica sobre consumo sostenible.",
      preferredMethodology: "Cuantitativa descriptivo-correlacional.",
      advisorNotes:
        "Definir bien sostenibilidad percibida y no mezclarla con reputacion corporativa general.",
    },
  },
];

function parseArgs(argv) {
  const options = {
    runs: DEFAULT_RUNS,
    baseUrl: DEFAULT_BASE_URL,
    selectionCount: DEFAULT_SELECTION_COUNT,
    reuseServer: false,
  };

  for (const arg of argv) {
    if (arg === "--reuse-server") {
      options.reuseServer = true;
      continue;
    }

    if (arg.startsWith("--runs=")) {
      options.runs = Number.parseInt(arg.slice("--runs=".length), 10);
      continue;
    }

    if (arg.startsWith("--base-url=")) {
      options.baseUrl = arg.slice("--base-url=".length);
      continue;
    }

    if (arg.startsWith("--selection-count=")) {
      options.selectionCount = Number.parseInt(
        arg.slice("--selection-count=".length),
        10,
      );
    }
  }

  if (!Number.isInteger(options.runs) || options.runs <= 0) {
    throw new Error("El argumento --runs debe ser un entero positivo.");
  }

  if (
    !Number.isInteger(options.selectionCount) ||
    options.selectionCount < MIN_SELECTION_COUNT
  ) {
    throw new Error(
      `El argumento --selection-count debe ser un entero >= ${MIN_SELECTION_COUNT}.`,
    );
  }

  return options;
}

function buildTimestamp() {
  return buildArtifactTimestamp();
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function appendLine(filePath, line) {
  await appendFile(filePath, `${line}\n`, "utf8");
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

  const payload = {
    ok: response.ok,
    status: response.status,
    routePath,
    method,
    body: parsedBody,
  };

  if (!response.ok) {
    const error = new Error(
      `La solicitud ${method} ${routePath} fallo con estado ${response.status}.`,
    );
    error.responsePayload = payload;
    throw error;
  }

  return payload;
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
      // Ignore until timeout.
    }

    await delay(SERVER_POLL_INTERVAL_MS);
  }

  throw new Error(
    `El servidor no estuvo disponible en ${baseUrl} dentro de ${SERVER_READY_TIMEOUT_MS} ms.`,
  );
}

async function isServerResponding(baseUrl) {
  try {
    const response = await fetch(baseUrl, {
      method: "GET",
      signal: AbortSignal.timeout(SERVER_PROBE_TIMEOUT_MS),
    });

    return response.ok;
  } catch {
    return false;
  }
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

  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await Promise.race([once(child, "exit"), delay(5_000)]);
  }
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
    return { startedByRunner: false, pid: null, logPath: null, errorLogPath: null };
  }

  if (await isServerResponding(baseUrl)) {
    throw new Error(
      `Ya hay un servidor respondiendo en ${baseUrl}. Usa --reuse-server para reutilizarlo o libera el puerto antes de ejecutar el runner.`,
    );
  }

  const logPath = path.join(rootDir, "server.log");
  const errorLogPath = path.join(rootDir, "server.err.log");
  const stdoutStream = createWriteStream(logPath, { flags: "a" });
  const stderrStream = createWriteStream(errorLogPath, { flags: "a" });
  const child =
    process.platform === "win32"
      ? spawn("cmd.exe", ["/d", "/s", "/c", "npm run start"], {
          cwd: process.cwd(),
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
          detached: false,
        })
      : spawn("npm", ["run", "start"], {
          cwd: process.cwd(),
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
          detached: false,
        });

  child.stdout?.pipe(stdoutStream);
  child.stderr?.pipe(stderrStream);
  const childStarted = new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });

  try {
    await childStarted;
    await waitForServer(baseUrl);
  } catch (error) {
    child.stdout?.unpipe(stdoutStream);
    child.stderr?.unpipe(stderrStream);
    await stopChildProcess(child);
    await closeLogStream(stdoutStream);
    await closeLogStream(stderrStream);
    throw error;
  }

  return {
    startedByRunner: true,
    pid: child.pid ?? null,
    logPath,
    errorLogPath,
    close: async () => {
      child.stdout?.unpipe(stdoutStream);
      child.stderr?.unpipe(stderrStream);
      await stopChildProcess(child);
      await closeLogStream(stdoutStream);
      await closeLogStream(stderrStream);
    },
  };
}

function buildCase(runNumber) {
  const presetIndex = (runNumber - 1) % DEBUG_CASES.length;
  const debugCase = DEBUG_CASES[presetIndex];

  return {
    runNumber,
    caseId: `debug-case-${String(presetIndex + 1).padStart(2, "0")}`,
    projectInput: {
      ...debugCase.projectInput,
      title: `${debugCase.projectInput.title} [debug ${String(runNumber).padStart(3, "0")}]`,
    },
    intakeInput: {
      ...debugCase.intakeInput,
    },
  };
}

function summarizeProjectState(project) {
  if (!project) {
    return null;
  }

  return {
    id: project.id,
    title: project.title,
    status: project.status,
    templateKey: project.templateKey,
    degreeLevel: project.degreeLevel,
    university: project.university,
    program: project.program,
    intakeId: project.intake?.id ?? null,
  };
}

function summarizeReferences(referencePayload) {
  const references = referencePayload.body.references ?? [];
  const selected = references.filter((item) => item.selected);

  return {
    totalReferences: references.length,
    selectedReferences: selected.length,
    topReferenceTitles: references.slice(0, 5).map((item) => item.reference?.title ?? null),
  };
}

function summarizeBlueprint(version) {
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    exportStatus: version.exportStatus,
    createdAt: version.createdAt,
    referenceCount: Array.isArray(version.selectedReferencesSnapshotJson)
      ? version.selectedReferencesSnapshotJson.length
      : null,
  };
}

async function createSession(baseUrl, jar) {
  return requestJson(baseUrl, jar, "POST", "/api/auth/session", {
    email: "debug.runner@ingeniometrix.local",
    name: "Debug Runner",
  });
}

async function runSingleCase(baseUrl, runDir, runCase, jar, selectionCount, logPath) {
  const startedAt = Date.now();
  const stageTimings = {};
  let projectId = null;

  async function runStage(stageName, work) {
    const stageStartedAt = Date.now();
    const result = await work();
    stageTimings[stageName] = Date.now() - stageStartedAt;
    await appendLine(
      logPath,
      `${new Date().toISOString()} run=${runCase.runNumber} stage=${stageName} ok duration_ms=${stageTimings[stageName]}`,
    );
    return result;
  }

  try {
    await writeJson(path.join(runDir, "case.json"), runCase);

    const projectResponse = await runStage("project_create", () =>
      requestJson(baseUrl, jar, "POST", "/api/projects", runCase.projectInput),
    );
    await writeJson(path.join(runDir, "01-project-create.json"), projectResponse);

    projectId = projectResponse.body.project.id;

    const projectInitial = await runStage("project_get_initial", () =>
      requestJson(baseUrl, jar, "GET", `/api/projects/${projectId}`),
    );
    await writeJson(path.join(runDir, "02-project-initial.json"), projectInitial);

    const intakeResponse = await runStage("intake_save", () =>
      requestJson(baseUrl, jar, "PUT", `/api/projects/${projectId}/intake`, runCase.intakeInput),
    );
    await writeJson(path.join(runDir, "03-intake-save.json"), intakeResponse);

    const projectAfterIntake = await runStage("project_get_after_intake", () =>
      requestJson(baseUrl, jar, "GET", `/api/projects/${projectId}`),
    );
    await writeJson(path.join(runDir, "04-project-after-intake.json"), projectAfterIntake);

    const searchResponse = await runStage("search", () =>
      requestJson(baseUrl, jar, "POST", `/api/projects/${projectId}/search`),
    );
    await writeJson(path.join(runDir, "05-search.json"), searchResponse);

    const referencesResponse = await runStage("references_list", () =>
      requestJson(baseUrl, jar, "GET", `/api/projects/${projectId}/references`),
    );
    await writeJson(path.join(runDir, "06-references-before-selection.json"), referencesResponse);

    const references = referencesResponse.body.references ?? [];
    if (references.length < MIN_SELECTION_COUNT) {
      throw new Error(
        `La busqueda solo devolvio ${references.length} referencias y no alcanza el minimo de ${MIN_SELECTION_COUNT}.`,
      );
    }

    const selectedReferenceIds = references
      .slice(0, Math.min(selectionCount, references.length))
      .map((item) => item.reference.id);

    const selectionRequest = {
      selectedReferenceIds,
    };
    await writeJson(path.join(runDir, "07-selection-request.json"), selectionRequest);

    const selectionResponse = await runStage("selection_save", () =>
      requestJson(
        baseUrl,
        jar,
        "PUT",
        `/api/projects/${projectId}/references`,
        selectionRequest,
      ),
    );
    await writeJson(path.join(runDir, "08-selection-save.json"), selectionResponse);

    const selectedReferencesResponse = await runStage("references_list_after_selection", () =>
      requestJson(baseUrl, jar, "GET", `/api/projects/${projectId}/references`),
    );
    await writeJson(
      path.join(runDir, "09-references-after-selection.json"),
      selectedReferencesResponse,
    );

    const blueprintCreateResponse = await runStage("blueprint_generate", () =>
      requestJson(baseUrl, jar, "POST", `/api/projects/${projectId}/blueprints`),
    );
    await writeJson(
      path.join(runDir, "10-blueprint-create.json"),
      blueprintCreateResponse,
    );

    const versionId = blueprintCreateResponse.body.version.id;

    const blueprintDetailResponse = await runStage("blueprint_get", () =>
      requestJson(
        baseUrl,
        jar,
        "GET",
        `/api/projects/${projectId}/blueprints/${versionId}`,
      ),
    );
    await writeJson(
      path.join(runDir, "11-blueprint-detail.json"),
      blueprintDetailResponse,
    );

    const projectFinal = await runStage("project_get_final", () =>
      requestJson(baseUrl, jar, "GET", `/api/projects/${projectId}`),
    );
    await writeJson(path.join(runDir, "12-project-final.json"), projectFinal);

    const runSummary = {
      ok: true,
      runNumber: runCase.runNumber,
      projectId,
      versionId,
      durationMs: Date.now() - startedAt,
      stageTimings,
      project: summarizeProjectState(projectFinal.body.project),
      search: searchResponse.body.result,
      references: summarizeReferences(selectedReferencesResponse),
      blueprint: summarizeBlueprint(blueprintDetailResponse.body.version),
    };

    await writeJson(path.join(runDir, "run-summary.json"), runSummary);
    return runSummary;
  } catch (error) {
    const errorPayload = {
      ok: false,
      runNumber: runCase.runNumber,
      projectId,
      durationMs: Date.now() - startedAt,
      stageTimings,
      errorMessage: error instanceof Error ? error.message : "Error desconocido.",
      responsePayload:
        error instanceof Error && "responsePayload" in error ? error.responsePayload : null,
    };

    await writeJson(path.join(runDir, "error.json"), errorPayload);
    await appendLine(
      logPath,
      `${new Date().toISOString()} run=${runCase.runNumber} error=${JSON.stringify(errorPayload.errorMessage)}`,
    );
    return errorPayload;
  }
}

function buildAggregateSummary(runResults, startedAt, baseUrl, selectionCount) {
  const okRuns = runResults.filter((run) => run.ok);
  const failedRuns = runResults.filter((run) => !run.ok);

  return {
    generatedAt: new Date().toISOString(),
    baseUrl,
    selectionCount,
    totalRuns: runResults.length,
    successfulRuns: okRuns.length,
    failedRuns: failedRuns.length,
    totalDurationMs: Date.now() - startedAt,
    averageDurationMs:
      runResults.length > 0
        ? Math.round(runResults.reduce((sum, run) => sum + run.durationMs, 0) / runResults.length)
        : 0,
    failures: failedRuns.map((run) => ({
      runNumber: run.runNumber,
      projectId: run.projectId,
      errorMessage: run.errorMessage,
    })),
    runResults,
  };
}

async function writeReport(reportPath, summary) {
  const lines = [
    "# Debug Workflow Report",
    "",
    `- Fecha: ${summary.generatedAt}`,
    `- Base URL: ${summary.baseUrl}`,
    `- Corridas ejecutadas: ${summary.totalRuns}`,
    `- Corridas exitosas: ${summary.successfulRuns}`,
    `- Corridas fallidas: ${summary.failedRuns}`,
    `- Duracion promedio (ms): ${summary.averageDurationMs}`,
    "",
    "## Fallas encontradas",
  ];

  if (summary.failures.length === 0) {
    lines.push("", "No se detectaron fallas en las corridas ejecutadas.");
  } else {
    for (const failure of summary.failures) {
      lines.push(
        "",
        `- Run ${failure.runNumber}: ${failure.errorMessage}`,
        `  - projectId: ${failure.projectId ?? "no_creado"}`,
      );
    }
  }

  lines.push("", "## Resoluciones", "");

  if (summary.failures.length === 0) {
    lines.push("No fue necesario aplicar correcciones de codigo durante esta ejecucion.");
  } else {
    lines.push(
      "Las resoluciones deben documentarse manualmente luego de investigar cada falla y volver a correr el proceso.",
    );
  }

  await writeFile(reportPath, `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const timestamp = buildTimestamp();
  const debugWorkflowRoot = await ensureArtifactDir("debug-workflow");
  const rootDir = path.join(debugWorkflowRoot, timestamp);
  const runsDir = path.join(rootDir, "runs");
  const runnerLogPath = path.join(rootDir, "runner.log");
  const summaryPath = path.join(rootDir, "summary.json");
  const reportPath = path.join(rootDir, "report.md");
  const startedAt = Date.now();

  await mkdir(runsDir, { recursive: true });
  await appendLine(
    runnerLogPath,
    `${new Date().toISOString()} debug workflow start runs=${options.runs} baseUrl=${options.baseUrl}`,
  );

  const serverHandle = await ensureServer(options.baseUrl, rootDir, options.reuseServer);
  const jar = new Map();
  const sessionResponse = await createSession(options.baseUrl, jar);

  await writeJson(path.join(rootDir, "session.json"), sessionResponse);
  await writeJson(path.join(rootDir, "manifest.json"), {
    generatedAt: new Date().toISOString(),
    options,
    artifactRoot: rootDir,
    server: {
      startedByRunner: serverHandle.startedByRunner,
      pid: serverHandle.pid,
      logPath: serverHandle.logPath,
      errorLogPath: serverHandle.errorLogPath,
    },
  });

  const runResults = [];

  try {
    for (let runNumber = 1; runNumber <= options.runs; runNumber += 1) {
      const runDir = path.join(runsDir, `run-${String(runNumber).padStart(3, "0")}`);
      await mkdir(runDir, { recursive: true });

      const runCase = buildCase(runNumber);
      const result = await runSingleCase(
        options.baseUrl,
        runDir,
        runCase,
        jar,
        options.selectionCount,
        runnerLogPath,
      );

      runResults.push(result);

      const summary = buildAggregateSummary(
        runResults,
        startedAt,
        options.baseUrl,
        options.selectionCount,
      );
      await writeJson(summaryPath, summary);
    }
  } finally {
    if (typeof serverHandle.close === "function") {
      await serverHandle.close();
    }
  }

  const finalSummary = buildAggregateSummary(
    runResults,
    startedAt,
    options.baseUrl,
    options.selectionCount,
  );

  await writeJson(summaryPath, finalSummary);
  await writeReport(reportPath, finalSummary);

  console.log(JSON.stringify({ artifactRoot: rootDir, summaryPath, reportPath }, null, 2));
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
