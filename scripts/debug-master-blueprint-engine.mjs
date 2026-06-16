import OpenAI from "openai";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { spawn } from "node:child_process";

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const DEFAULT_BATCH_COUNT = 20;
const DEFAULT_SELECTION_COUNT = 5;
const DEFAULT_SYNTHETIC_MODEL = process.env.LLM_DEFAULT_MODEL?.trim() || "gpt-5.4-mini";
const SERVER_READY_TIMEOUT_MS = 120_000;
const SERVER_POLL_INTERVAL_MS = 2_000;
const QUALITY_THRESHOLD = 8;

const SINGLE_DEBUG_CASE = {
  projectInput: {
    title: "MasterBlueprintEngine LATAM para trazabilidad progresiva",
    degreeLevel: "MAESTRIA",
    university: "UPC",
    program: "Maestria en Gestion y Direccion de Proyectos",
    templateKey: "UPC_POSGRADO",
    topicAreaLabel: "Transformacion digital y analitica aplicada",
    customIdeaText:
      "Factores que condicionan la adopcion de analitica de datos en pymes comerciales peruanas.",
  },
  intakeInput: {
    topic:
      "Factores que condicionan la adopcion de analitica de datos en pymes comerciales peruanas.",
    problemContext:
      "Muchas pymes adoptan herramientas digitales, pero no logran institucionalizar analitica de datos en sus decisiones operativas y estrategicas.",
    researchLine: "Transformacion digital y gestion basada en evidencia.",
    academicConstraints:
      "Delimitar el estudio al contexto de pymes comerciales en Lima Metropolitana y a un plan de investigacion de posgrado.",
    targetPopulation:
      "Propietarios, gerentes y responsables operativos de pymes comerciales de Lima Metropolitana.",
    availableData:
      "Encuestas, entrevistas semiestructuradas, documentos internos y bibliografia academica recuperable en OpenAlex/Crossref.",
    preferredMethodology: "Enfoque mixto con alcance descriptivo y exploratorio.",
    advisorNotes:
      "Mantener trazabilidad clara, usar la plantilla maestra LATAM y evitar afirmaciones causales fuertes.",
  },
};

const SYNTHETIC_AREA_CATALOG = [
  {
    label: "Ingenieria industrial y operaciones",
    cue: "optimizacion de procesos, calidad, trazabilidad operativa",
    program: "Maestria en Gestion de Operaciones",
  },
  {
    label: "Ingenieria civil y construccion",
    cue: "gestion de obra, seguridad, productividad en proyectos",
    program: "Maestria en Ingenieria Civil",
  },
  {
    label: "Tecnologias de informacion y sistemas",
    cue: "transformacion digital, analitica, adopcion de sistemas",
    program: "Maestria en Direccion de Tecnologias de la Informacion",
  },
  {
    label: "Educacion superior y gestion educativa",
    cue: "aprendizaje, permanencia, calidad educativa",
    program: "Maestria en Educacion",
  },
  {
    label: "Salud publica y gestion sanitaria",
    cue: "calidad asistencial, adherencia, procesos clinicos",
    program: "Maestria en Salud Publica",
  },
  {
    label: "Administracion y gestion empresarial",
    cue: "innovacion, competitividad, adopcion organizacional",
    program: "Maestria en Administracion de Negocios",
  },
  {
    label: "Ciencias sociales aplicadas",
    cue: "intervencion publica, inclusion, comportamiento social",
    program: "Maestria en Gestion Publica",
  },
];

const SYNTHETIC_UNIVERSITY_OPTIONS = [
  {
    university: "UPC",
    templateKey: "UPC_POSGRADO",
  },
  {
    university: "UCV",
    templateKey: "UCV_POSGRADO",
  },
  {
    university: "USMP",
    templateKey: "USMP_POSGRADO",
  },
];

const SYNTHETIC_INTAKE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "projectTitle",
    "topicAreaLabel",
    "topic",
    "problemContext",
    "researchLine",
    "academicConstraints",
    "targetPopulation",
    "availableData",
    "preferredMethodology",
    "advisorNotes",
    "program",
  ],
  properties: {
    projectTitle: { type: "string", minLength: 18, maxLength: 180 },
    topicAreaLabel: { type: "string", minLength: 8, maxLength: 120 },
    topic: { type: "string", minLength: 18, maxLength: 220 },
    problemContext: { type: "string", minLength: 60, maxLength: 700 },
    researchLine: { type: "string", minLength: 12, maxLength: 180 },
    academicConstraints: { type: "string", minLength: 40, maxLength: 400 },
    targetPopulation: { type: "string", minLength: 20, maxLength: 260 },
    availableData: { type: "string", minLength: 30, maxLength: 320 },
    preferredMethodology: { type: "string", minLength: 20, maxLength: 220 },
    advisorNotes: { type: "string", minLength: 20, maxLength: 260 },
    program: { type: "string", minLength: 10, maxLength: 140 },
  },
};

function loadLocalEnvFile() {
  const envPath = path.join(process.cwd(), ".env");

  return readFile(envPath, "utf8")
    .then((raw) => {
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith("#")) {
          continue;
        }

        const separatorIndex = trimmed.indexOf("=");

        if (separatorIndex <= 0) {
          continue;
        }

        const key = trimmed.slice(0, separatorIndex).trim();
        const rawValue = trimmed.slice(separatorIndex + 1).trim();

        if (process.env[key] !== undefined) {
          continue;
        }

        process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
      }
    })
    .catch(() => undefined);
}

function buildArtifactTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function ensureArtifactDir(...segments) {
  const target = path.join(process.cwd(), "artifacts-local", ...segments);
  await mkdir(target, { recursive: true });
  return target;
}

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    reuseServer: false,
    selectionCount: DEFAULT_SELECTION_COUNT,
    count: 1,
    seed: `seed-${new Date().toISOString().slice(0, 10)}`,
    synthetic: false,
    syntheticModel: DEFAULT_SYNTHETIC_MODEL,
  };

  for (const arg of argv) {
    if (arg === "--reuse-server") {
      options.reuseServer = true;
      continue;
    }

    if (arg === "--synthetic") {
      options.synthetic = true;
      continue;
    }

    if (arg.startsWith("--base-url=")) {
      options.baseUrl = arg.slice("--base-url=".length);
      continue;
    }

    if (arg.startsWith("--selection-count=")) {
      options.selectionCount = Number.parseInt(arg.slice("--selection-count=".length), 10);
      continue;
    }

    if (arg.startsWith("--count=")) {
      options.count = Number.parseInt(arg.slice("--count=".length), 10);
      continue;
    }

    if (arg.startsWith("--seed=")) {
      options.seed = arg.slice("--seed=".length);
      continue;
    }

    if (arg.startsWith("--synthetic-model=")) {
      options.syntheticModel = arg.slice("--synthetic-model=".length);
    }
  }

  if (options.count > 1) {
    options.synthetic = true;
  }

  if (!Number.isFinite(options.selectionCount) || options.selectionCount <= 0) {
    options.selectionCount = DEFAULT_SELECTION_COUNT;
  }

  if (!Number.isFinite(options.count) || options.count <= 0) {
    options.count = 1;
  }

  return options;
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(filePath, value) {
  await writeFile(filePath, value, "utf8");
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
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
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
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const retryable =
        /fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|aborted/i.test(message);

      if (!retryable || attempt === 3) {
        throw error;
      }

      await delay(1_500 * attempt);
    }
  }

  throw lastError ?? new Error("La solicitud fallo sin detalle.");
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
      // Keep polling.
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
    // Start local server.
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

function hashString(value) {
  let hash = 1779033703;

  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }

  return (hash >>> 0) || 1;
}

function createMulberry32(seed) {
  let value = seed >>> 0;

  return () => {
    value += 0x6d2b79f5;
    let output = Math.imul(value ^ (value >>> 15), value | 1);
    output ^= output + Math.imul(output ^ (output >>> 7), output | 61);
    return ((output ^ (output >>> 14)) >>> 0) / 4294967296;
  };
}

function pickRandom(rng, values) {
  return values[Math.floor(rng() * values.length)];
}

function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractAccessSignals(reference) {
  const rawOpenAlexJson =
    reference?.rawOpenAlexJson && typeof reference.rawOpenAlexJson === "object"
      ? reference.rawOpenAlexJson
      : null;
  const bestLocation =
    rawOpenAlexJson &&
    typeof rawOpenAlexJson.best_oa_location === "object" &&
    rawOpenAlexJson.best_oa_location !== null
      ? rawOpenAlexJson.best_oa_location
      : null;
  const primaryLocation =
    rawOpenAlexJson &&
    typeof rawOpenAlexJson.primary_location === "object" &&
    rawOpenAlexJson.primary_location !== null
      ? rawOpenAlexJson.primary_location
      : null;
  const pdfUrl =
    (typeof bestLocation?.pdf_url === "string" && bestLocation.pdf_url) ||
    (typeof primaryLocation?.pdf_url === "string" && primaryLocation.pdf_url) ||
    null;

  return {
    pdfUrl,
    hasPdfUrl: Boolean(pdfUrl),
  };
}

function pickReferenceIds(references, selectionCount) {
  const ranked = references
    .map((item, index) => {
      const reference = item.reference ?? {};
      const access = extractAccessSignals(reference);
      const relevanceScore =
        typeof item.relevanceScore === "number" ? item.relevanceScore : 0;
      let score = relevanceScore;

      if (reference.abstract?.trim()) {
        score += 4;
      }

      if (reference.translatedAbstract?.trim()) {
        score += 1.5;
      }

      if (access.hasPdfUrl) {
        score += 2;
      }

      if (typeof reference.citationCount === "number") {
        score += Math.min(reference.citationCount / 50, 1.5);
      }

      return {
        id: reference.id,
        score,
        fallbackOrder: index,
      };
    })
    .filter((item) => typeof item.id === "string" && item.id.length > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.fallbackOrder - right.fallbackOrder;
    });

  return Array.from(new Set(ranked.slice(0, selectionCount).map((item) => item.id)));
}

function buildFallbackSyntheticCase({ area, universityOption, degreeLevel, runNumber }) {
  const scopeLabel = area.label.toLowerCase();
  const topic =
    degreeLevel === "MAESTRIA"
      ? `Factores que condicionan la adopcion de soluciones basadas en evidencia en ${scopeLabel} en Peru.`
      : `Condiciones de implementacion y mejora de procesos en ${scopeLabel} en organizaciones peruanas.`;

  return {
    projectTitle: `Estudio aplicado sobre ${scopeLabel} - corrida ${runNumber}`,
    topicAreaLabel: area.label,
    topic,
    problemContext:
      `Persisten brechas operativas y de gestion en ${scopeLabel}, con decisiones que suelen apoyarse en evidencia fragmentada y practicas poco estandarizadas.`,
    researchLine: `${area.label} y mejora basada en evidencia.`,
    academicConstraints:
      "Delimitar el estudio al contexto peruano, con alcance de posgrado y trazabilidad estricta a fuentes recuperadas.",
    targetPopulation:
      "Profesionales, responsables operativos o usuarios clave vinculados directamente al problema de estudio en organizaciones peruanas.",
    availableData:
      "Articulos indexados recientes, entrevistas semiestructuradas, encuestas y documentacion institucional accesible durante el estudio.",
    preferredMethodology:
      "Enfoque mixto con alcance descriptivo-explicativo y triangulacion de evidencia documental y de campo.",
    advisorNotes:
      "Mantener objetivos concretos, preguntas alineadas y soporte explicito en antecedentes recientes.",
    program: area.program,
    university: universityOption.university,
    templateKey: universityOption.templateKey,
    degreeLevel,
    syntheticOrigin: "fallback_local",
  };
}

async function generateSyntheticCase({
  client,
  model,
  rng,
  runNumber,
}) {
  const area = pickRandom(rng, SYNTHETIC_AREA_CATALOG);
  const universityOption = pickRandom(rng, SYNTHETIC_UNIVERSITY_OPTIONS);
  const degreeLevel = rng() > 0.35 ? "MAESTRIA" : "POSGRADO";

  if (!client) {
    return buildFallbackSyntheticCase({
      area,
      universityOption,
      degreeLevel,
      runNumber,
    });
  }

  const prompt = [
    "Genera un intake sintetico, realista y completo para probar un motor academico de blueprint.",
    "Responde solo con JSON valido segun el schema.",
    "Idioma: espanol.",
    "Pais de contexto: Peru.",
    `Area de conocimiento: ${area.label}.`,
    `Pista de dominio: ${area.cue}.`,
    `Programa sugerido: ${area.program}.`,
    `Universidad de referencia: ${universityOption.university}.`,
    `Nivel academico: ${degreeLevel}.`,
    "Condiciones obligatorias:",
    "- El tema debe ser plausible, actual y etico.",
    "- No inventes resultados ni datos medidos; solo plantea un estudio potencial.",
    "- El problema debe ser concreto y abordable con OpenAlex/Crossref.",
    "- La metodologia debe ser compatible con un trabajo de posgrado.",
    "- La poblacion objetivo debe ser identificable.",
    "- Los textos deben ser especificos y no genericos.",
  ].join("\n");

  try {
    const response = await client.responses.create({
      model,
      store: false,
      input: prompt,
      text: {
        format: {
          type: "json_schema",
          name: "synthetic_master_blueprint_intake",
          strict: true,
          schema: SYNTHETIC_INTAKE_SCHEMA,
        },
      },
    });

    if (!response.output_text) {
      throw new Error("OpenAI no devolvio contenido para el intake sintetico.");
    }

    const parsed = JSON.parse(response.output_text);

    return {
      ...parsed,
      university: universityOption.university,
      templateKey: universityOption.templateKey,
      degreeLevel,
      syntheticOrigin: "llm",
    };
  } catch (error) {
    return {
      ...buildFallbackSyntheticCase({
        area,
        universityOption,
        degreeLevel,
        runNumber,
      }),
      syntheticOrigin: `fallback_local:${error instanceof Error ? error.message : "unknown_error"}`,
    };
  }
}

function classifyFailure({ errorMessage, qualityReport, sectionDraftCount, downloadedPdfCount }) {
  if (!errorMessage && (!qualityReport || qualityReport.passed)) {
    return "passed";
  }

  const message = `${errorMessage ?? ""} ${qualityReport?.hard_failures?.join(" ") ?? ""}`.toLowerCase();

  if (message.includes("duckduckgo")) {
    return "source_relevance_failure";
  }

  if (message.includes("timeout") || message.includes("excedio")) {
    return "section_timeout";
  }

  if (message.includes("pdf")) {
    return "pdf_pipeline_failure";
  }

  if (message.includes("trazabilidad") || message.includes("referencias")) {
    return "provenance_failure";
  }

  if (message.includes("secciones obligatorias")) {
    return "structure_failure";
  }

  if (message.includes("score global")) {
    return "final_score_below_threshold";
  }

  if (qualityReport && !qualityReport.passed) {
    if ((downloadedPdfCount ?? 0) === 0 && (sectionDraftCount ?? 0) > 0) {
      return "evidence_support_failure";
    }

    return "quality_failure";
  }

  return "unknown_failure";
}

function buildRunSummary({
  runNumber,
  projectId,
  versionId,
  syntheticCase,
  references,
  selectedReferenceIds,
  searchResponse,
  selectionResponse,
  versionDetail,
  errorMessage,
  durationMs,
}) {
  const selectedReferences = references.filter((item) =>
    selectedReferenceIds.includes(item.reference.id),
  );
  const blueprint = versionDetail?.version?.blueprintJson ?? null;
  const master = blueprint?.master_blueprint_engine ?? null;
  const validationReport = master?.validation_report ?? null;
  const qualityReport = validationReport?.quality_report ?? null;
  const downloadedPdfCount = Array.isArray(master?.pdf_downloads?.records)
    ? master.pdf_downloads.records.filter((record) => record.status === "downloaded").length
    : 0;
  const selectedWithAbstractCount = selectedReferences.filter((item) =>
    item.reference.abstract?.trim(),
  ).length;
  const selectedWithPdfCount = selectedReferences.filter((item) =>
    extractAccessSignals(item.reference).hasPdfUrl,
  ).length;
  const classification = classifyFailure({
    errorMessage,
    qualityReport,
    sectionDraftCount: Array.isArray(master?.master_section_drafts)
      ? master.master_section_drafts.length
      : 0,
    downloadedPdfCount,
  });

  return {
    runNumber,
    syntheticOrigin: syntheticCase.syntheticOrigin ?? "manual",
    projectId,
    versionId,
    degreeLevel: syntheticCase.degreeLevel,
    university: syntheticCase.university,
    templateKey: syntheticCase.templateKey,
    area: syntheticCase.topicAreaLabel,
    topic: syntheticCase.topic,
    selectedReferenceCount: selectedReferenceIds.length,
    selectedWithAbstractCount,
    selectedWithPdfCount,
    searchQuery:
      searchResponse?.result?.searchQuery ??
      searchResponse?.searchQuery ??
      null,
    attemptedQueries:
      searchResponse?.result?.attemptedQueries ??
      searchResponse?.attemptedQueries ??
      [],
    totalSearchResults:
      searchResponse?.result?.totalResults ??
      searchResponse?.totalResults ??
      references.length,
      downloadedPdfCount,
      deterministicScore:
        qualityReport?.deterministic_score_10 ?? qualityReport?.score_10 ?? null,
      semanticScore: qualityReport?.semantic_score_10 ?? null,
      qualityScore: qualityReport?.score_10 ?? null,
      qualityPassed: qualityReport?.passed ?? false,
      qualityThreshold: qualityReport?.threshold ?? QUALITY_THRESHOLD,
      qualityHardFailures: qualityReport?.hard_failures ?? [],
      qualityWarnings: qualityReport?.soft_warnings ?? validationReport?.warnings ?? [],
      qualityComponents: qualityReport?.components ?? [],
      semanticReview: qualityReport?.semantic_review ?? null,
      coherenceReport: versionDetail?.version?.coherenceReportJson ?? null,
    sectionDraftCount: Array.isArray(master?.master_section_drafts)
      ? master.master_section_drafts.length
      : 0,
    providerExpansionCount: Array.isArray(master?.acquisition?.provider_expansion_sources)
      ? master.acquisition.provider_expansion_sources.length
      : 0,
    websearchCount: Array.isArray(master?.acquisition?.websearch_sources)
      ? master.acquisition.websearch_sources.length
      : 0,
    selectionSaved: selectionResponse?.ok === true,
    durationMs,
    status:
      errorMessage || !(qualityReport?.passed ?? false)
        ? "failed"
        : "passed",
    classification,
    errorMessage: errorMessage ?? null,
  };
}

async function runProjectCase({
  baseUrl,
  jar,
  rootDir,
  syntheticCase,
  selectionCount,
  runNumber,
}) {
  const runDir = path.join(rootDir, `run-${String(runNumber).padStart(2, "0")}`);
  await mkdir(runDir, { recursive: true });
  const startedAt = Date.now();
  let projectId = null;
  let versionId = null;

  await writeJson(path.join(runDir, "00-synthetic-case.json"), syntheticCase);

  try {
    const projectResponse = await requestJson(baseUrl, jar, "POST", "/api/projects", {
      title: syntheticCase.projectTitle,
      degreeLevel: syntheticCase.degreeLevel,
      university: syntheticCase.university,
      program: syntheticCase.program,
      templateKey: syntheticCase.templateKey,
      customIdeaText: syntheticCase.topic,
      topicAreaLabel: syntheticCase.topicAreaLabel,
    });
    await writeJson(path.join(runDir, "01-project.json"), projectResponse);
    projectId = projectResponse.project.id;

    const intakeResponse = await requestJson(
      baseUrl,
      jar,
      "PUT",
      `/api/projects/${projectId}/intake`,
      {
        topic: syntheticCase.topic,
        problemContext: syntheticCase.problemContext,
        researchLine: syntheticCase.researchLine,
        academicConstraints: syntheticCase.academicConstraints,
        targetPopulation: syntheticCase.targetPopulation,
        availableData: syntheticCase.availableData,
        preferredMethodology: syntheticCase.preferredMethodology,
        advisorNotes: syntheticCase.advisorNotes,
      },
    );
    await writeJson(path.join(runDir, "02-intake.json"), intakeResponse);

    const searchResponse = await requestJson(
      baseUrl,
      jar,
      "POST",
      `/api/projects/${projectId}/search`,
      { desiredTotal: 10 },
    );
    await writeJson(path.join(runDir, "03-search.json"), searchResponse);

    const referencesResponse = await requestJson(
      baseUrl,
      jar,
      "GET",
      `/api/projects/${projectId}/references`,
    );
    await writeJson(path.join(runDir, "04-references.json"), referencesResponse);

    const selectedReferenceIds = pickReferenceIds(
      referencesResponse.references ?? [],
      selectionCount,
    );
    const selectionResponse = await requestJson(
      baseUrl,
      jar,
      "PUT",
      `/api/projects/${projectId}/references`,
      {
        selectedReferenceIds,
      },
    );
    await writeJson(path.join(runDir, "05-selection.json"), {
      selectedReferenceIds,
      selectionResponse,
    });

    const blueprintResponse = await requestJson(
      baseUrl,
      jar,
      "POST",
      `/api/projects/${projectId}/blueprints`,
    );
    await writeJson(path.join(runDir, "06-blueprint-version.json"), blueprintResponse);
    versionId = blueprintResponse.version.id;

    const versionDetail = await requestJson(
      baseUrl,
      jar,
      "GET",
      `/api/projects/${projectId}/blueprints/${versionId}`,
    );
    await writeJson(path.join(runDir, "07-blueprint-detail.json"), versionDetail);

    const summary = buildRunSummary({
      runNumber,
      projectId,
      versionId,
      syntheticCase,
      references: referencesResponse.references ?? [],
      selectedReferenceIds,
      searchResponse,
      selectionResponse,
      versionDetail,
      errorMessage: null,
      durationMs: Date.now() - startedAt,
    });
    await writeJson(path.join(runDir, "99-summary.json"), summary);

    return summary;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Fallo no identificado en la corrida.";
    const summary = {
      runNumber,
      syntheticOrigin: syntheticCase.syntheticOrigin ?? "manual",
      projectId,
      versionId,
      degreeLevel: syntheticCase.degreeLevel,
      university: syntheticCase.university,
      templateKey: syntheticCase.templateKey,
      area: syntheticCase.topicAreaLabel,
      topic: syntheticCase.topic,
      selectedReferenceCount: 0,
      selectedWithAbstractCount: 0,
      selectedWithPdfCount: 0,
      searchQuery: null,
      attemptedQueries: [],
      totalSearchResults: 0,
      downloadedPdfCount: 0,
      deterministicScore: null,
      semanticScore: null,
      qualityScore: null,
      qualityPassed: false,
      qualityThreshold: QUALITY_THRESHOLD,
      qualityHardFailures: [],
      qualityWarnings: [],
      qualityComponents: [],
      semanticReview: null,
      coherenceReport: null,
      sectionDraftCount: 0,
      providerExpansionCount: 0,
      websearchCount: 0,
      selectionSaved: false,
      durationMs: Date.now() - startedAt,
      status: "failed",
      classification: classifyFailure({
        errorMessage,
        qualityReport: null,
        sectionDraftCount: 0,
        downloadedPdfCount: 0,
      }),
      errorMessage,
    };

    await writeJson(path.join(runDir, "90-error.json"), {
      projectId,
      versionId,
      errorMessage,
    });
    await writeJson(path.join(runDir, "99-summary.json"), summary);

    return summary;
  }
}

function summarizeResults(results, options) {
  const completedRuns = results.length;
  const passedRuns = results.filter((result) => result.status === "passed");
  const scoreRuns = results.filter((result) => typeof result.qualityScore === "number");
  const deterministicRuns = results.filter(
    (result) => typeof result.deterministicScore === "number",
  );
  const semanticRuns = results.filter((result) => typeof result.semanticScore === "number");
  const averageScore =
    scoreRuns.reduce((total, result) => total + result.qualityScore, 0) /
    Math.max(1, scoreRuns.length);
  const averageDeterministicScore =
    deterministicRuns.reduce((total, result) => total + result.deterministicScore, 0) /
    Math.max(1, deterministicRuns.length);
  const averageSemanticScore =
    semanticRuns.reduce((total, result) => total + result.semanticScore, 0) /
    Math.max(1, semanticRuns.length);
  const qualityPassCount = results.filter((result) => result.qualityPassed).length;
  const classificationCounts = {};
  const distinctCombinedScores = Array.from(
    new Set(scoreRuns.map((result) => result.qualityScore)),
  ).sort((left, right) => left - right);
  const distinctDeterministicScores = Array.from(
    new Set(deterministicRuns.map((result) => result.deterministicScore)),
  ).sort((left, right) => left - right);
  const distinctSemanticScores = Array.from(
    new Set(semanticRuns.map((result) => result.semanticScore)),
  ).sort((left, right) => left - right);

  for (const result of results) {
    classificationCounts[result.classification] =
      (classificationCounts[result.classification] ?? 0) + 1;
  }

  return {
    requestedRuns: options.count,
    completedRuns,
    passedRuns: passedRuns.length,
    qualityPassCount,
    averageScore: Number.parseFloat(averageScore.toFixed(2)),
    averageDeterministicScore: Number.parseFloat(averageDeterministicScore.toFixed(2)),
    averageSemanticScore: Number.parseFloat(averageSemanticScore.toFixed(2)),
    minimumScore:
      scoreRuns.length > 0
        ? Math.min(...scoreRuns.map((result) => result.qualityScore))
        : null,
    maximumScore:
      scoreRuns.length > 0
        ? Math.max(...scoreRuns.map((result) => result.qualityScore))
        : null,
    threshold: QUALITY_THRESHOLD,
    passRate: Number.parseFloat((qualityPassCount / Math.max(1, completedRuns)).toFixed(2)),
    classificationCounts,
    distinctCombinedScores,
    distinctDeterministicScores,
    distinctSemanticScores,
  };
}

function buildMarkdownReport({ summary, results, options }) {
  const topFailures = Object.entries(summary.classificationCounts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join("\n");
  const runRows = results
    .map(
      (result) =>
        `| ${result.runNumber} | ${result.university} | ${result.area} | ${result.deterministicScore ?? "-"} | ${result.semanticScore ?? "-"} | ${result.qualityScore ?? "-"} | ${result.status} | ${result.classification} | ${result.selectedReferenceCount} | ${result.downloadedPdfCount} |`,
    )
    .join("\n");

  return [
    "# Reporte de evaluacion BluePrintv2_backend",
    "",
    "## Resumen",
    "",
    `- Corridas solicitadas: ${summary.requestedRuns}`,
    `- Corridas completadas: ${summary.completedRuns}`,
    `- Corridas aprobadas (>= ${QUALITY_THRESHOLD}/10): ${summary.qualityPassCount}`,
    `- Score promedio: ${summary.averageScore}`,
    `- Score deterministico promedio: ${summary.averageDeterministicScore}`,
    `- Score semantico promedio: ${summary.averageSemanticScore}`,
    `- Score minimo: ${summary.minimumScore ?? "-"}`,
    `- Score maximo: ${summary.maximumScore ?? "-"}`,
    `- Pass rate: ${summary.passRate}`,
    `- Scores deterministico distintos: ${summary.distinctDeterministicScores.join(", ") || "-"}`,
    `- Scores semanticos distintos: ${summary.distinctSemanticScores.join(", ") || "-"}`,
    `- Scores combinados distintos: ${summary.distinctCombinedScores.join(", ") || "-"}`,
    `- Seed: ${options.seed}`,
    "",
    "## Fallos mas frecuentes",
    "",
    topFailures || "- No se registraron fallos.",
    "",
    "## Corridas",
    "",
    "| Run | Universidad | Area | Score det. | Score sem. | Score final | Estado | Clasificacion | Ref sel. | PDFs |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    runRows,
    "",
  ].join("\n");
}

async function main() {
  await loadLocalEnvFile();
  const options = parseArgs(process.argv.slice(2));
  const artifactRoot = await ensureArtifactDir(
    "blueprint-v2-evals",
    buildArtifactTimestamp(),
  );
  const serverHandle = await ensureServer(options.baseUrl, artifactRoot, options.reuseServer);
  const jar = new Map();
  const syntheticClient = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;
  const rng = createMulberry32(hashString(options.seed));

  try {
    const session = await requestJson(options.baseUrl, jar, "POST", "/api/auth/session", {
      email: "debug.master.blueprint@ingeniometrix.local",
      name: "Debug Master Blueprint",
    });
    await writeJson(path.join(artifactRoot, "00-session.json"), session);
    await writeJson(path.join(artifactRoot, "00-options.json"), options);

    const results = [];

    for (let runNumber = 1; runNumber <= options.count; runNumber += 1) {
      const syntheticCase =
        options.synthetic || options.count > 1
          ? await generateSyntheticCase({
              client: syntheticClient,
              model: options.syntheticModel,
              rng,
              runNumber,
            })
          : {
              ...SINGLE_DEBUG_CASE.projectInput,
              ...SINGLE_DEBUG_CASE.intakeInput,
              projectTitle: SINGLE_DEBUG_CASE.projectInput.title,
              topicAreaLabel: SINGLE_DEBUG_CASE.projectInput.topicAreaLabel,
              topic: SINGLE_DEBUG_CASE.intakeInput.topic,
              program: SINGLE_DEBUG_CASE.projectInput.program,
              university: SINGLE_DEBUG_CASE.projectInput.university,
              templateKey: SINGLE_DEBUG_CASE.projectInput.templateKey,
              degreeLevel: SINGLE_DEBUG_CASE.projectInput.degreeLevel,
              syntheticOrigin: "manual_seed",
            };

      const runSummary = await runProjectCase({
        baseUrl: options.baseUrl,
        jar,
        rootDir: artifactRoot,
        syntheticCase,
        selectionCount: options.selectionCount,
        runNumber,
      });
      results.push(runSummary);
      console.log(
        `[run ${runNumber}/${options.count}] ${runSummary.status.toUpperCase()} score=${runSummary.qualityScore ?? "-"} classification=${runSummary.classification}`,
      );
    }

    const summary = summarizeResults(results, options);
    const markdown = buildMarkdownReport({
      summary,
      results,
      options,
    });
    await writeJson(path.join(artifactRoot, "summary.json"), {
      summary,
      results,
    });
    await writeText(path.join(artifactRoot, "report.md"), markdown);

    console.log(JSON.stringify(summary, null, 2));

    if (summary.qualityPassCount < Math.ceil(options.count * 0.8)) {
      process.exitCode = 1;
    }
  } finally {
    await serverHandle.close?.();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
