import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { getConfiguredLlmProvider } from "@/llm";
import { generateStructuredObjectWithTextFallback } from "@/server/retrieval/retrieval-llm-json";

import type {
  BlueprintLaunchContentMaterializationResult,
  BlueprintLaunchEvidenceCompletionResult,
  BlueprintLaunchLlmPromptRecord,
  BlueprintLaunchSavedIntakeSnapshot,
  BlueprintLaunchSelectedSourceBundle,
  BlueprintLaunchSignalExtractionResult,
  BlueprintLaunchSourceAccessResolutionResult,
  BlueprintLaunchSignalExtractionSource,
  EvidencePackArtifact,
  EvidenceSnippet,
  EvidenceSourceChunk,
  ExtractedEvidencePack,
  PdfAssetRecord,
} from "./local-playground-store";

const execFileAsync = promisify(execFile);
const ASSET_ROOT = path.join(
  process.cwd(),
  "artifacts-local",
  "blueprint_launch",
  "extracted_assets",
);
const STEP5_SCHEMA_NAME = "blueprint_launch_step5_source_signal_extraction";
const STEP5_TRACKING_LABEL = `structured:${STEP5_SCHEMA_NAME}`;
const STEP5_MODEL = process.env.LLM_DEFAULT_MODEL?.trim() || "gpt-5.4";
const MAX_TEXT_CHARS = 60_000;
const MAX_PROMPT_BODY_CHARS = 24_000;
const MAX_PROMPT_SECTION_CHARS = 5_000;
const MAX_SNIPPET_CHARS = 1_200;
const MAX_ASSET_CANDIDATES_FOR_LLM = 12;
const MAX_EQUATION_ASSETS_PER_SOURCE = 2;
const MAX_TABLE_ASSETS_PER_SOURCE = 3;
const MAX_IMAGE_ASSETS_PER_SOURCE = 3;
const MAX_TOTAL_ASSETS_PER_SOURCE = 6;
const MAX_SECTION_SNIPPET_CHARS = 1_400;
const MAX_CHUNK_CHARS = 1_500;
const MIN_CHUNK_CHARS = 180;
const MAX_CHUNK_CANDIDATES_FOR_LLM = 24;
const MAX_DETERMINISTIC_ORIGINAL_SNIPPETS = 8;

type AssetCandidate = {
  candidateKey: string;
  asset: PdfAssetRecord;
  kindGuess: "image" | "table";
  pageNumber: number | null;
  caption: string | null;
  heuristicScore: number;
  sectionHintKeys: string[];
  summary: string;
};

type SourceInputMode = "pdf" | "web_text" | "abstract_metadata";

type SourceInputDescriptor = {
  sourceId: string;
  title: string;
  inputMode: SourceInputMode;
  primaryPath: string | null;
  secondaryPath: string | null;
  extractedTextPath: string | null;
  sourceChunksPath: string | null;
  sourceChunks: EvidenceSourceChunk[];
  pageCount: number | null;
  textCharCount: number;
  text: string | null;
  abstract: string | null;
  languageDetected: string | null;
  assets: PdfAssetRecord[];
  equationCandidates: Array<{ page_number: number | null; raw_text: string }>;
  tableCaptions: Array<{ page_number: number | null; caption: string; text_content?: string | null }>;
  figureCaptions: Array<{ page_number: number | null; caption: string }>;
};

type SectionCandidateMap = {
  abstract: string | null;
  methodology: string | null;
  results: string | null;
  conclusions: string | null;
  limitations: string | null;
  future_work: string | null;
};

type SourceLlmPlan = {
  source_overview: string | null;
  topic_relevance: "directa" | "parcial" | "debil";
  proposal_usefulness: "alta" | "media" | "baja";
  supports_section_keys: string[];
  methodology_hints: string[];
  framework_hints: string[];
  problem_signal: string | null;
  method_signal: string | null;
  context_signal: string | null;
  finding_signal: string | null;
  limitation_signal: string | null;
  future_line_signal: string | null;
  abstract_summary: string | null;
  pdf_summary: string | null;
  pdf_sections: SectionCandidateMap;
  selected_chunks: Array<{
    chunk_id: string;
    label: string;
    section_hint_keys: string[];
    relevance_score: number;
    interpretation_es: string;
    confidence: number;
  }>;
  snippet_suggestions: Array<{
    label: string;
    text_excerpt: string;
    section_hint_keys: string[];
    confidence: number;
  }>;
  equation_reconstructions: Array<{
    raw_text: string;
    latex_candidate: string;
    meaning: string;
    confidence: number;
  }>;
  asset_selections: Array<{
    candidate_key: string;
    keep: boolean;
    section_hint_keys: string[];
    reason: string;
    confidence: number;
  }>;
};

const signalSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "source_overview",
    "topic_relevance",
    "proposal_usefulness",
    "supports_section_keys",
    "methodology_hints",
    "framework_hints",
    "problem_signal",
    "method_signal",
    "context_signal",
    "finding_signal",
    "limitation_signal",
    "future_line_signal",
    "abstract_summary",
    "pdf_summary",
    "pdf_sections",
    "selected_chunks",
    "snippet_suggestions",
    "equation_reconstructions",
    "asset_selections",
  ],
  properties: {
    source_overview: { anyOf: [{ type: "string", minLength: 12, maxLength: 700 }, { type: "null" }] },
    topic_relevance: { type: "string", enum: ["directa", "parcial", "debil"] },
    proposal_usefulness: { type: "string", enum: ["alta", "media", "baja"] },
    supports_section_keys: {
      type: "array",
      maxItems: 8,
      items: { type: "string", minLength: 3, maxLength: 48 },
    },
    methodology_hints: {
      type: "array",
      maxItems: 6,
      items: { type: "string", minLength: 4, maxLength: 120 },
    },
    framework_hints: {
      type: "array",
      maxItems: 6,
      items: { type: "string", minLength: 4, maxLength: 120 },
    },
    problem_signal: { anyOf: [{ type: "string", minLength: 8, maxLength: 520 }, { type: "null" }] },
    method_signal: { anyOf: [{ type: "string", minLength: 8, maxLength: 520 }, { type: "null" }] },
    context_signal: { anyOf: [{ type: "string", minLength: 8, maxLength: 520 }, { type: "null" }] },
    finding_signal: { anyOf: [{ type: "string", minLength: 8, maxLength: 520 }, { type: "null" }] },
    limitation_signal: { anyOf: [{ type: "string", minLength: 8, maxLength: 520 }, { type: "null" }] },
    future_line_signal: { anyOf: [{ type: "string", minLength: 8, maxLength: 520 }, { type: "null" }] },
    abstract_summary: { anyOf: [{ type: "string", minLength: 8, maxLength: 900 }, { type: "null" }] },
    pdf_summary: { anyOf: [{ type: "string", minLength: 8, maxLength: 900 }, { type: "null" }] },
    pdf_sections: {
      type: "object",
      additionalProperties: false,
      required: ["abstract", "methodology", "results", "conclusions", "limitations", "future_work"],
      properties: {
        abstract: { anyOf: [{ type: "string", minLength: 8, maxLength: 1600 }, { type: "null" }] },
        methodology: { anyOf: [{ type: "string", minLength: 8, maxLength: 1600 }, { type: "null" }] },
        results: { anyOf: [{ type: "string", minLength: 8, maxLength: 1600 }, { type: "null" }] },
        conclusions: { anyOf: [{ type: "string", minLength: 8, maxLength: 1600 }, { type: "null" }] },
        limitations: { anyOf: [{ type: "string", minLength: 8, maxLength: 1600 }, { type: "null" }] },
        future_work: { anyOf: [{ type: "string", minLength: 8, maxLength: 1600 }, { type: "null" }] },
      },
    },
    selected_chunks: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "chunk_id",
          "label",
          "section_hint_keys",
          "relevance_score",
          "interpretation_es",
          "confidence",
        ],
        properties: {
          chunk_id: { type: "string", minLength: 3, maxLength: 180 },
          label: { type: "string", minLength: 3, maxLength: 90 },
          section_hint_keys: {
            type: "array",
            maxItems: 5,
            items: { type: "string", minLength: 3, maxLength: 48 },
          },
          relevance_score: { type: "number", minimum: 0, maximum: 1 },
          interpretation_es: { type: "string", minLength: 8, maxLength: 360 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
    snippet_suggestions: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "text_excerpt", "section_hint_keys", "confidence"],
        properties: {
          label: { type: "string", minLength: 3, maxLength: 80 },
          text_excerpt: { type: "string", minLength: 8, maxLength: 1200 },
          section_hint_keys: {
            type: "array",
            maxItems: 5,
            items: { type: "string", minLength: 3, maxLength: 48 },
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
    equation_reconstructions: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["raw_text", "latex_candidate", "meaning", "confidence"],
        properties: {
          raw_text: { type: "string", minLength: 3, maxLength: 220 },
          latex_candidate: { type: "string", minLength: 3, maxLength: 220 },
          meaning: { type: "string", minLength: 6, maxLength: 220 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
    asset_selections: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["candidate_key", "keep", "section_hint_keys", "reason", "confidence"],
        properties: {
          candidate_key: { type: "string", minLength: 3, maxLength: 220 },
          keep: { type: "boolean" },
          section_hint_keys: {
            type: "array",
            maxItems: 5,
            items: { type: "string", minLength: 3, maxLength: 48 },
          },
          reason: { type: "string", minLength: 6, maxLength: 220 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
  },
} satisfies Record<string, unknown>;

function truncateText(value: string | null | undefined, maxLength = MAX_SNIPPET_CHARS) {
  const text = (value ?? "")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#13;|&#10;|\\n/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) {
    return null;
  }
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function normalizeWhitespace(value: string) {
  return value.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g, "").replace(/\s+/g, " ").trim();
}

function hashText(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function buildFullTextFromPages(pageTexts: Array<{ page_number: number; text: string }>) {
  return pageTexts
    .map((page) => page.text)
    .filter((text) => text.trim().length > 0)
    .join("\n\n");
}

function buildChunksFromPages(input: {
  sourceId: string;
  pageTexts: Array<{ page_number: number; text: string }>;
  languageDetected: string | null;
}) {
  const chunks: EvidenceSourceChunk[] = [];
  let globalOffset = 0;

  for (const page of input.pageTexts) {
    const rawPageText = page.text ?? "";
    const pageLength = rawPageText.length;

    if (!rawPageText.trim()) {
      globalOffset += pageLength + 2;
      continue;
    }

    let currentParts: string[] = [];
    let currentStart: number | null = null;
    let currentEnd: number | null = null;

    const flush = () => {
      const originalText = normalizeWhitespace(currentParts.join(" "));
      if (originalText.length >= MIN_CHUNK_CHARS) {
        const chunkHash = hashText(originalText);
        const sectionHints = guessSectionHintsFromText(originalText);
        const relevanceScore = scoreOriginalChunk(originalText);

        chunks.push({
          chunk_id: `${buildSafeKey(input.sourceId) || "source"}-p${page.page_number}-c${chunks.length + 1}-${chunkHash.slice(0, 8)}`,
          source_id: input.sourceId,
          page_start: page.page_number,
          page_end: page.page_number,
          char_start: currentStart == null ? null : globalOffset + currentStart,
          char_end: currentEnd == null ? null : globalOffset + currentEnd,
          original_language: input.languageDetected,
          original_text: originalText,
          text_char_count: originalText.length,
          quote_hash: chunkHash,
          section_hint_keys: sectionHints,
          relevance_score: relevanceScore,
        });
      }

      currentParts = [];
      currentStart = null;
      currentEnd = null;
    };

    for (const match of rawPageText.matchAll(/[^\r\n]+/g)) {
      const rawLine = match[0] ?? "";
      const line = normalizeWhitespace(rawLine);
      const lineStart = match.index ?? 0;
      const lineEnd = lineStart + rawLine.length;

      if (!line) {
        continue;
      }

      const nextLength = normalizeWhitespace([...currentParts, line].join(" ")).length;
      if (currentParts.length > 0 && nextLength > MAX_CHUNK_CHARS) {
        flush();
      }

      if (currentStart == null) {
        currentStart = lineStart;
      }
      currentEnd = lineEnd;
      currentParts.push(line);
    }

    flush();

    globalOffset += pageLength + 2;
  }

  return chunks;
}

function detectLanguage(input: string | null, fallback: string | null) {
  const source = fallback?.trim().toLowerCase() ?? "";
  if (source) {
    return source.split("-")[0];
  }
  const text = input?.toLowerCase() ?? "";
  if (!text) {
    return null;
  }
  const spanishHits = [" el ", " la ", " los ", " las ", " de ", " para ", " estudio "].filter((token) =>
    text.includes(token),
  ).length;
  const englishHits = [" the ", " and ", " of ", " for ", " study ", " method "].filter((token) =>
    text.includes(token),
  ).length;
  if (spanishHits > englishHits && spanishHits >= 2) {
    return "es";
  }
  if (englishHits >= spanishHits && englishHits >= 2) {
    return "en";
  }
  return null;
}

function buildTimestampToken(value: string) {
  return value.replace(/[:.]/g, "-");
}

function buildSafeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function findWorkspacePythonExecutable() {
  const candidates = [
    path.join(
      os.homedir(),
      ".cache",
      "codex-runtimes",
      "codex-primary-runtime",
      "dependencies",
      "python",
      "python.exe",
    ),
    "python",
  ];

  return candidates.find((candidate) => candidate === "python" || existsSync(candidate)) ?? "python";
}

async function runPdfExtraction(params: {
  pdfPath: string;
  runDir: string;
  baseName: string;
}) {
  await mkdir(params.runDir, { recursive: true });
  const scriptPath = path.join(process.cwd(), "blueprint_launch", "server", "pdf_extract_runtime.py");
  const pythonExecutable = findWorkspacePythonExecutable();
  const { stdout } = await execFileAsync(pythonExecutable, [
    scriptPath,
    "--pdf",
    params.pdfPath,
    "--output-dir",
    params.runDir,
    "--base-name",
    params.baseName,
  ], {
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });

  return JSON.parse(stdout) as {
    page_count: number;
    page_texts: Array<{ page_number: number; text: string }>;
    equation_candidates: Array<{ page_number: number; raw_text: string }>;
    table_captions: Array<{ page_number: number; caption: string; text_content?: string | null }>;
    figure_captions: Array<{ page_number: number; caption: string }>;
    assets: Array<Omit<PdfAssetRecord, "source_id">>;
    full_text: string;
  };
}

function extractSectionWithHeading(text: string | null, headings: string[]) {
  if (!text) {
    return null;
  }

  const lines = text.split(/\r?\n/);
  const lowerHeadings = headings.map((heading) => heading.toLowerCase());

  for (let index = 0; index < lines.length; index += 1) {
    const line = normalizeWhitespace(lines[index] ?? "");
    if (!line) {
      continue;
    }
    const lowerLine = line.toLowerCase();
    if (!lowerHeadings.some((heading) => lowerLine === heading || lowerLine.startsWith(`${heading} `))) {
      continue;
    }

    const chunk: string[] = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const value = normalizeWhitespace(lines[cursor] ?? "");
      if (!value) {
        if (chunk.length > 0) {
          break;
        }
        continue;
      }
      const lowerValue = value.toLowerCase();
      if (
        [
          "abstract",
          "introduction",
          "materials and methods",
          "methodology",
          "methods",
          "results",
          "discussion",
          "conclusions",
          "conclusion",
          "limitations",
          "future work",
          "references",
        ].includes(lowerValue)
      ) {
        break;
      }
      chunk.push(value);
      if (chunk.join(" ").length > MAX_PROMPT_SECTION_CHARS) {
        break;
      }
    }

    const candidate = normalizeWhitespace(chunk.join(" "));
    if (candidate) {
      return truncateText(candidate, MAX_PROMPT_SECTION_CHARS);
    }
  }

  return null;
}

function deriveSectionCandidates(input: {
  abstract: string | null;
  bodyText: string | null;
}) {
  return {
    abstract: truncateText(input.abstract, MAX_PROMPT_SECTION_CHARS) ?? extractSectionWithHeading(input.bodyText, ["abstract"]),
    methodology: extractSectionWithHeading(input.bodyText, [
      "materials and methods",
      "methodology",
      "methods",
      "research method",
      "approach",
    ]),
    results: extractSectionWithHeading(input.bodyText, ["results", "findings", "analysis"]),
    conclusions: extractSectionWithHeading(input.bodyText, ["conclusion", "conclusions"]),
    limitations: extractSectionWithHeading(input.bodyText, ["limitations", "limitation"]),
    future_work: extractSectionWithHeading(input.bodyText, [
      "future work",
      "future research",
      "further research",
    ]),
  } satisfies SectionCandidateMap;
}

async function selectSourceInput(input: {
  source: BlueprintLaunchSelectedSourceBundle["sources"][number];
  contentMaterialization: BlueprintLaunchContentMaterializationResult;
  runDir: string;
}): Promise<SourceInputDescriptor> {
  const materialized = input.contentMaterialization.items.find(
    (item) => item.sourceId === input.source.reference.id,
  );
  const baseLanguage = input.source.reference.sourceLanguage ?? null;

  if (materialized?.storedKind === "pdf" && materialized.localPrimaryPath) {
    const assetDir = path.join(input.runDir, buildSafeKey(input.source.reference.id) || "source");
    const extracted = await runPdfExtraction({
      pdfPath: materialized.localPrimaryPath,
      runDir: assetDir,
      baseName: buildSafeKey(input.source.reference.title) || "source",
    });
    const fullText = buildFullTextFromPages(extracted.page_texts);
    const languageDetected = detectLanguage(fullText, baseLanguage);
    const extractedTextPath = path.join(assetDir, `${buildSafeKey(input.source.reference.id) || "source"}-plain-text.txt`);
    const chunks = buildChunksFromPages({
      sourceId: input.source.reference.id,
      pageTexts: extracted.page_texts,
      languageDetected,
    });
    const chunksPath = path.join(assetDir, `${buildSafeKey(input.source.reference.id) || "source"}-chunks.json`);
    await writeFile(extractedTextPath, fullText, "utf8");
    await writeFile(
      chunksPath,
      `${JSON.stringify(
        {
          source_id: input.source.reference.id,
          title: input.source.reference.title,
          source_text_path: extractedTextPath,
          chunk_count: chunks.length,
          chunks,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    const truncatedText = truncateText(fullText, MAX_TEXT_CHARS);

    return {
      sourceId: input.source.reference.id,
      title: input.source.reference.title,
      inputMode: "pdf",
      primaryPath: materialized.localPrimaryPath,
      secondaryPath: assetDir,
      extractedTextPath,
      sourceChunksPath: chunksPath,
      sourceChunks: chunks,
      pageCount: extracted.page_count,
      textCharCount: fullText.length,
      text: truncatedText,
      abstract: input.source.reference.abstract,
      languageDetected,
      assets: extracted.assets.map((asset) => ({
        ...asset,
        source_id: input.source.reference.id,
      })),
      equationCandidates: extracted.equation_candidates,
      tableCaptions: extracted.table_captions,
      figureCaptions: extracted.figure_captions,
    };
  }

  if (materialized?.localTextPath) {
    const text = await readFile(materialized.localTextPath, "utf8");
    const languageDetected = detectLanguage(text, baseLanguage);
    const chunks = buildChunksFromPages({
      sourceId: input.source.reference.id,
      pageTexts: [{ page_number: 1, text }],
      languageDetected,
    });
    const chunksPath = path.join(input.runDir, `${buildSafeKey(input.source.reference.id) || "source"}-chunks.json`);
    await writeFile(
      chunksPath,
      `${JSON.stringify(
        {
          source_id: input.source.reference.id,
          title: input.source.reference.title,
          source_text_path: materialized.localTextPath,
          chunk_count: chunks.length,
          chunks,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    return {
      sourceId: input.source.reference.id,
      title: input.source.reference.title,
      inputMode: "web_text",
      primaryPath: materialized.localPrimaryPath,
      secondaryPath: materialized.localTextPath,
      extractedTextPath: materialized.localTextPath,
      sourceChunksPath: chunksPath,
      sourceChunks: chunks,
      pageCount: null,
      textCharCount: text.length,
      text: truncateText(text, MAX_TEXT_CHARS),
      abstract: input.source.reference.abstract,
      languageDetected,
      assets: [],
      equationCandidates: [],
      tableCaptions: [],
      figureCaptions: [],
    };
  }

  return {
    sourceId: input.source.reference.id,
    title: input.source.reference.title,
    inputMode: "abstract_metadata",
    primaryPath: null,
    secondaryPath: null,
    extractedTextPath: null,
    sourceChunksPath: null,
    sourceChunks: buildChunksFromPages({
      sourceId: input.source.reference.id,
      pageTexts: [{ page_number: 1, text: input.source.reference.abstract ?? "" }],
      languageDetected: detectLanguage(input.source.reference.abstract, baseLanguage),
    }),
    pageCount: null,
    textCharCount: input.source.reference.abstract?.length ?? 0,
    text: truncateText(input.source.reference.abstract, MAX_TEXT_CHARS),
    abstract: input.source.reference.abstract,
    languageDetected: detectLanguage(input.source.reference.abstract, baseLanguage),
    assets: [],
    equationCandidates: [],
    tableCaptions: [],
    figureCaptions: [],
  };
}

function renderPromptTemplate(template: string, replacements: Record<string, string>) {
  return Object.entries(replacements).reduce(
    (current, [key, value]) => current.replaceAll(`{{${key}}}`, value),
    template,
  );
}

function buildPromptTemplate() {
  return `
Actua como analista academico de evidencia para una investigacion aplicada de posgrado.

Objetivo:
- formarte una primera idea general de la fuente completa
- extraer senales trazables que sirvan para problema, justificacion, objetivos, marco teorico o tecnico, metodologia, hallazgos, limitaciones y lineas futuras
- seleccionar chunks originales suficientemente utiles para que otra etapa pueda redactar secciones con respaldo
- seleccionar solo assets realmente utiles: ecuaciones, tablas, diagramas, figuras metodologicas o resultados visuales

Reglas:
- responde en espanol
- usa solo el texto, metadatos y candidatos incluidos aqui
- no inventes datos, resultados, citas, secciones ni paginas
- si una senal no puede sostenerse con el contenido visible, devuelve null o arreglo vacio
- no redactes extractos nuevos: selecciona chunk_id desde original_chunk_candidates
- cada selected_chunk debe apuntar a una seccion futura usando section_hint_keys
- prioriza extractos para metodologia, objetivos, justificacion, marco teorico/tecnico, criterios de evaluacion, propuesta, hallazgos y limitaciones
- si hay ecuaciones candidatas, reconstruye latex_candidate solo cuando sea razonable; si no, omitela
- asset_selections debe retener solo assets utiles para futuras secciones; ignora logos, ornamentos, miniaturas, duplicados o capturas sin valor academico
- no selecciones mas de 6 assets no ecuacionales en total
- detecta el idioma desde el contenido visible y traduce senales/resumenes al espanol; conserva acronimos y terminos tecnicos ampliamente usados si mejoran precision

Formato esperado:
- source_overview: idea general de la fuente en 2-4 frases
- topic_relevance y proposal_usefulness: valor para el tema del proyecto
- supports_section_keys: secciones futuras que esta fuente puede sostener
- methodology_hints y framework_hints: metodos, tecnicas, teorias o marcos identificados
- *_signal: senales sinteticas pero trazables
- pdf_sections: fragmentos o resumenes breves por seccion si aparecen en el texto
- selected_chunks: hasta 12 chunk_id originales, con una interpretation_es que explique por que sirve
- snippet_suggestions: devolver [] salvo que no exista ningun chunk candidato usable
- equation_reconstructions: ecuaciones candidatas en LaTeX si aplica
- asset_selections: decisiones de conservar/descartar candidatos visuales

Contexto del proyecto:
- area: {{knowledge_area}}
- tema: {{topic}}
- contexto/problema: {{problem_context}}
- linea: {{research_line}}
- poblacion/alcance: {{target_population}}
- metodologia preferida: {{preferred_methodology}}
- notas tecnicas del asesor: {{advisor_notes}}

Fuente:
- source_id: {{source_id}}
- titulo: {{title}}
- doi: {{doi}}
- venue: {{venue}}
- year: {{year}}
- input_mode: {{input_mode}}
- detected_language_hint: {{detected_language}}
- local_primary_path: {{local_primary_path}}
- local_text_path: {{local_text_path}}
- page_count: {{page_count}}
- text_char_count: {{text_char_count}}
- abstract: {{abstract}}
- body_excerpt: {{body_excerpt}}
- section_candidates: {{section_candidates}}
- original_chunk_candidates: {{original_chunk_candidates}}
- evidence_completion: {{evidence_completion}}
- equation_candidates: {{equation_candidates}}
- table_captions: {{table_captions}}
- figure_captions: {{figure_captions}}
- asset_candidates: {{asset_candidates}}
`.trim();
}

function buildPrompt(input: {
  savedIntake: BlueprintLaunchSavedIntakeSnapshot;
  source: BlueprintLaunchSelectedSourceBundle["sources"][number];
  sourceInput: SourceInputDescriptor;
  completionCard: BlueprintLaunchEvidenceCompletionResult["cards"][number] | null;
  sections: SectionCandidateMap;
  assetCandidates: AssetCandidate[];
  chunkCandidates: EvidenceSourceChunk[];
}) {
  const template = buildPromptTemplate();
  const promptText = renderPromptTemplate(template, {
    knowledge_area: input.savedIntake.projectContext.knowledgeAreaLabel ?? "No definida",
    topic: input.savedIntake.intake.topic ?? "null",
    problem_context: input.savedIntake.intake.problemContext ?? "null",
    research_line: input.savedIntake.intake.researchLine ?? "null",
    target_population: input.savedIntake.intake.targetPopulation ?? "null",
    preferred_methodology: input.savedIntake.intake.preferredMethodology ?? "null",
    advisor_notes: input.savedIntake.intake.advisorNotes ?? "null",
    source_id: input.source.reference.id,
    title: input.source.reference.title,
    doi: input.source.reference.doi ?? "null",
    venue: input.source.reference.venue ?? "null",
    year: input.source.reference.year?.toString() ?? "null",
    input_mode: input.sourceInput.inputMode,
    detected_language: input.sourceInput.languageDetected ?? "null",
    local_primary_path: input.sourceInput.primaryPath ?? "null",
    local_text_path: input.sourceInput.extractedTextPath ?? "null",
    page_count: input.sourceInput.pageCount?.toString() ?? "null",
    text_char_count: input.sourceInput.textCharCount.toString(),
    abstract: JSON.stringify(truncateText(input.sourceInput.abstract, MAX_PROMPT_SECTION_CHARS)),
    body_excerpt: JSON.stringify(truncateText(input.sourceInput.text, MAX_PROMPT_BODY_CHARS)),
    section_candidates: JSON.stringify(input.sections, null, 2),
    original_chunk_candidates: JSON.stringify(
      input.chunkCandidates.map((chunk) => ({
        chunk_id: chunk.chunk_id,
        page_start: chunk.page_start,
        page_end: chunk.page_end,
        char_start: chunk.char_start,
        char_end: chunk.char_end,
        original_language: chunk.original_language,
        quote_hash: chunk.quote_hash,
        relevance_score: chunk.relevance_score,
        section_hint_keys: chunk.section_hint_keys,
        original_text: truncateText(chunk.original_text, 900),
      })),
      null,
      2,
    ),
    evidence_completion: JSON.stringify(input.completionCard, null, 2),
    equation_candidates: JSON.stringify(input.sourceInput.equationCandidates.slice(0, 8), null, 2),
    table_captions: JSON.stringify(input.sourceInput.tableCaptions.slice(0, 8), null, 2),
    figure_captions: JSON.stringify(input.sourceInput.figureCaptions.slice(0, 8), null, 2),
    asset_candidates: JSON.stringify(
      input.assetCandidates.slice(0, MAX_ASSET_CANDIDATES_FOR_LLM).map((candidate) => ({
        candidate_key: candidate.candidateKey,
        asset_key: candidate.asset.asset_key,
        kind_guess: candidate.kindGuess,
        page_number: candidate.pageNumber,
        heuristic_score: candidate.heuristicScore,
        caption: candidate.caption,
        section_hint_keys: candidate.sectionHintKeys,
        summary: candidate.summary,
      })),
      null,
      2,
    ),
  });

  return { template, promptText };
}

function splitTopicTerms(topic: string) {
  return topic
    .toLowerCase()
    .split(/[^a-z0-9áéíóúñü]+/i)
    .map((term) => term.trim())
    .filter((term) => term.length >= 5)
    .slice(0, 8);
}

function scoreOriginalChunk(value: string) {
  const text = value.toLowerCase();
  const weightedPatterns: Array<[RegExp, number]> = [
    [/\badaptive reuse\b|\breutili[sz]aci[oó]n adaptativa\b/, 0.22],
    [/\bmethod|\bmethodology|\bmetodolog|\bapproach|\bframework|\bmodel\b/, 0.18],
    [/\bcriteria|\bcriterion|\bdecision[- ]making|\bmatrix|\bahp\b|\bmulti-criteria|\bmcdm\b/, 0.2],
    [/\bobjective|\baim|\bpurpose|\bresearch question|\bgoal\b/, 0.12],
    [/\bproblem|\bgap|\bchallenge|\bbarrier|\bvacan|\bdemolition|\bunderuse\b/, 0.14],
    [/\bcarbon|\bemission|\blife cycle|\bembodied|\bghg\b|\bsustainab|\bcircular\b/, 0.14],
    [/\bresult|\bfinding|\bshow|\bconclusion|\blimitation|\bfuture work\b/, 0.12],
    [/\bbuilding|\bcommercial|\bhousing|\bmasterplan|\bheritage|\bmass timber\b/, 0.1],
  ];
  const score = weightedPatterns.reduce(
    (sum, [pattern, weight]) => sum + (pattern.test(text) ? weight : 0),
    0.12,
  );

  return Math.min(Number(score.toFixed(3)), 1);
}

function guessSectionHintsFromText(value: string) {
  const text = value.toLowerCase();
  const hints = new Set<string>();

  if (/\bmethod|\bmethodology|\bcriteria|\bmodel|\bframework|\bahp\b|\bmatrix|\bworkflow|\bapproach/.test(text)) {
    hints.add("methodology");
    hints.add("technical_framework");
  }
  if (/\bobjective|\baim|\bpurpose|\bgoal|\bresearch question/.test(text)) {
    hints.add("objectives");
  }
  if (/\bjustify|\bjustification|\bneed|\bgap|\bproblem|\bchallenge|\bbarrier/.test(text)) {
    hints.add("justification");
    hints.add("problem_statement");
  }
  if (/\btheory|\bconcept|\bdefinition|\bliterature|\bprinciple|\bconstruct/.test(text)) {
    hints.add("theoretical_framework");
  }
  if (/\bresult|\bfinding|\bshows|\bcomparison|\branking|\bscore|\bperformance/.test(text)) {
    hints.add("findings");
  }
  if (/\blimit|\blimitation|\bconstraint|\bfuture work|\bfurther research/.test(text)) {
    hints.add("limitations");
    hints.add("future_work");
  }
  if (hints.size === 0) {
    hints.add("background");
  }

  return [...hints].slice(0, 5);
}

function rankChunkCandidates(input: {
  chunks: EvidenceSourceChunk[];
  intakeTopic: string;
  maxItems?: number;
}) {
  const topicTerms = splitTopicTerms(input.intakeTopic);
  const seen = new Set<string>();
  const maxItems = input.maxItems ?? MAX_CHUNK_CANDIDATES_FOR_LLM;
  const scored = input.chunks.map((chunk) => {
    const lower = chunk.original_text.toLowerCase();
    const topicBonus = topicTerms.some((term) => lower.includes(term)) ? 0.1 : 0;
    const sectionBonus = chunk.section_hint_keys.includes("methodology") ? 0.08 : 0;
    return {
      chunk,
      score: Math.min(chunk.relevance_score + topicBonus + sectionBonus, 1),
    };
  });

  const uniqueRanked = scored
    .sort((left, right) => right.score - left.score)
    .filter(({ chunk }) => {
      const fingerprint = `${chunk.page_start}-${chunk.original_text.slice(0, 80)}`;
      if (seen.has(fingerprint)) {
        return false;
      }
      seen.add(fingerprint);
      return true;
    });
  const prioritySections = [
    "methodology",
    "technical_framework",
    "theoretical_framework",
    "evaluation_criteria",
    "justification",
    "problem_statement",
    "objectives",
    "limitations",
    "future_work",
  ];
  const selected = new Map<string, (typeof uniqueRanked)[number]>();

  for (const sectionKey of prioritySections) {
    const candidate = uniqueRanked.find(
      (item) => item.chunk.section_hint_keys.includes(sectionKey) && !selected.has(item.chunk.chunk_id),
    );

    if (candidate) {
      selected.set(candidate.chunk.chunk_id, candidate);
    }
  }

  for (const item of uniqueRanked) {
    if (selected.size >= maxItems) {
      break;
    }
    selected.set(item.chunk.chunk_id, item);
  }

  return [...selected.values()]
    .slice(0, maxItems)
    .map(({ chunk, score }) => ({ ...chunk, relevance_score: Number(score.toFixed(3)) }));
}

function buildMetadataSnippets(input: {
  sourceId: string;
  sourceInput: SourceInputDescriptor;
  intakeTopic: string;
}): EvidenceSnippet[] {
  return [
    {
      snippet_id: `${input.sourceId}-title`,
      source_id: input.sourceId,
      origin: "source",
      label: "Titulo de la fuente",
      text: input.sourceInput.title,
      extraction_kind: "metadata",
      original_text: input.sourceInput.title,
      interpretation_es: null,
      source_chunk_id: null,
      page_number: null,
      page_start: null,
      page_end: null,
      char_start: null,
      char_end: null,
      original_language: input.sourceInput.languageDetected,
      quote_hash: hashText(input.sourceInput.title),
      text_char_count: input.sourceInput.title.length,
      section_hint_keys: ["background", "problem_statement"],
      relevance_score: 0.5,
      confidence: 0.95,
    },
    {
      snippet_id: `${input.sourceId}-intake`,
      source_id: input.sourceId,
      origin: "intake",
      label: "Tema del intake",
      text: input.intakeTopic,
      extraction_kind: "intake",
      original_text: input.intakeTopic,
      interpretation_es: null,
      source_chunk_id: null,
      page_number: null,
      page_start: null,
      page_end: null,
      char_start: null,
      char_end: null,
      original_language: "es",
      quote_hash: hashText(input.intakeTopic),
      text_char_count: input.intakeTopic.length,
      section_hint_keys: ["problem_statement"],
      relevance_score: 0.65,
      confidence: 0.98,
    },
  ];
}

function buildOriginalSnippetFromChunk(input: {
  sourceId: string;
  sourceInput: SourceInputDescriptor;
  chunk: EvidenceSourceChunk;
  label: string;
  sectionHintKeys?: string[];
  interpretationEs?: string | null;
  confidence: number;
  relevanceScore?: number | null;
  selectedByLlm: boolean;
}): EvidenceSnippet {
  return {
    snippet_id: `${input.sourceId}-${input.selectedByLlm ? "llm-chunk" : "chunk"}-${input.chunk.chunk_id}`,
    source_id: input.sourceId,
    origin: input.sourceInput.inputMode === "pdf" ? "pdf" : "source",
    label: input.label,
    text: input.chunk.original_text,
    extraction_kind: input.selectedByLlm ? "llm_selected_original" : "original_excerpt",
    original_text: input.chunk.original_text,
    interpretation_es: input.interpretationEs ?? null,
    source_chunk_id: input.chunk.chunk_id,
    page_number: input.chunk.page_start,
    page_start: input.chunk.page_start,
    page_end: input.chunk.page_end,
    char_start: input.chunk.char_start,
    char_end: input.chunk.char_end,
    original_language: input.chunk.original_language,
    quote_hash: input.chunk.quote_hash,
    text_char_count: input.chunk.text_char_count,
    section_hint_keys: normalizeSectionKeys(input.sectionHintKeys ?? input.chunk.section_hint_keys),
    relevance_score: input.relevanceScore ?? input.chunk.relevance_score,
    confidence: input.confidence,
  };
}

function buildFallbackSourceAnalysis(input: {
  sourceInput: SourceInputDescriptor;
  sections: SectionCandidateMap;
  completionCard: BlueprintLaunchEvidenceCompletionResult["cards"][number] | null;
}): SourceLlmPlan {
  return {
    source_overview:
      input.completionCard?.whyRelevant ??
      truncateText(input.sourceInput.abstract ?? input.sourceInput.text, 520),
    topic_relevance: input.completionCard?.applicabilityToProject ?? "parcial",
    proposal_usefulness:
      input.completionCard?.usefulnessLabel === "usable"
        ? "alta"
        : input.completionCard?.usefulnessLabel === "off_topic"
          ? "baja"
          : "media",
    supports_section_keys: input.completionCard?.supportsSectionKeys ?? [],
    methodology_hints: input.completionCard?.methodologyHints ?? [],
    framework_hints: input.completionCard?.frameworkHints ?? [],
    problem_signal: input.completionCard?.whyRelevant ?? truncateText(input.sourceInput.title, 420),
    method_signal: input.completionCard?.methodSignals.join(", ") || truncateText(input.sections.methodology, 420),
    context_signal: input.completionCard?.contextSignals.join(", ") || truncateText(input.sourceInput.abstract, 420),
    finding_signal: truncateText(input.sections.results ?? input.sections.conclusions ?? input.sourceInput.abstract, 420),
    limitation_signal: input.completionCard?.evidenceLimits.join(", ") || truncateText(input.sections.limitations, 420),
    future_line_signal: input.completionCard?.decisionValue ?? truncateText(input.sections.future_work, 420),
    abstract_summary: truncateText(input.sourceInput.abstract, 700),
    pdf_summary: input.sourceInput.inputMode === "pdf" ? truncateText(input.sourceInput.text, 700) : null,
    pdf_sections: input.sections,
    selected_chunks: [],
    snippet_suggestions: [],
    equation_reconstructions: [],
    asset_selections: [],
  };
}

function normalizeSectionKeys(values: string[]) {
  return values
    .flatMap((value) => value.split(/[,;|]+/))
    .map((value) =>
      value
        .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g, "")
        .replace(/['"\\]/g, "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean)
    .slice(0, 8);
}

function uniqueNonEmpty(values: Array<string | null | undefined>, maxItems = 6) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ).slice(0, maxItems);
}

function normalizeHintValues(values: string[] | null | undefined, maxItems = 6) {
  return uniqueNonEmpty(
    (values ?? [])
      .map((value) =>
        value
          .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g, "")
          .replace(/\\"/g, "")
          .replace(/["\\]/g, "")
          .replace(/\s*,\s*$/g, "")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter((value) => {
        const normalized = value.trim();
        if (!normalized) {
          return false;
        }
        if (
          /^(problem_signal|method_signal|context_signal|finding_signal|limitation_signal|future_line_signal|framework_hints|supports_section_keys)\b/i.test(
            normalized,
          )
        ) {
          return false;
        }
        if (/[{}[\]]/.test(normalized) || /\bvalid json\b|\bhmm\b/i.test(normalized)) {
          return false;
        }
        if (/\bnull\b/i.test(normalized) && normalized.length < 40) {
          return false;
        }
        return /[A-Za-z]/.test(normalized);
      }),
    maxItems,
  );
}

function guessSectionHintsFromCaption(kind: "image" | "table", caption: string | null) {
  const value = caption?.toLowerCase() ?? "";
  const hints = new Set<string>();

  if (kind === "table") {
    hints.add("findings");
  }
  if (/\bahp\b|\bmethod\b|\bmethodology\b|\bprocess\b|\bworkflow\b|\bhierarchy\b/.test(value)) {
    hints.add("methodology");
    hints.add("technical_framework");
  }
  if (/\bresult\b|\bcomparison\b|\branking\b|\bscore\b|\bperformance\b/.test(value)) {
    hints.add("findings");
  }
  if (/\bframework\b|\bconcept\b|\bmodel\b/.test(value)) {
    hints.add("theoretical_framework");
  }
  if (hints.size === 0) {
    hints.add(kind === "table" ? "findings" : "technical_framework");
  }

  return [...hints].slice(0, 4);
}

function isNoisyTableCaption(caption: string) {
  const normalized = caption.toLowerCase().replace(/\s+/g, " ").trim();

  if (
    /\b(table of contents|contents:|list of tables|list of figures|list of plates|list of abbreviations|bibliography|references|acknowledg|declaration)\b/.test(
      normalized,
    )
  ) {
    return true;
  }

  if (/\.{6,}/.test(caption)) {
    return true;
  }

  if (normalized.length < 18) {
    return true;
  }

  return false;
}

function buildAssetCandidates(sourceInput: SourceInputDescriptor) {
  const candidates: AssetCandidate[] = [];
  let imageDiscardedCount = 0;
  const figureCaptionsByPage = new Map<number, string[]>();
  const tableCaptionsByPage = new Map<number, string[]>();

  for (const entry of sourceInput.figureCaptions) {
    if (entry.page_number == null) {
      continue;
    }
    const list = figureCaptionsByPage.get(entry.page_number) ?? [];
    list.push(entry.caption);
    figureCaptionsByPage.set(entry.page_number, list);
  }

  for (const entry of sourceInput.tableCaptions) {
    if (entry.page_number == null) {
      continue;
    }
    const list = tableCaptionsByPage.get(entry.page_number) ?? [];
    list.push(entry.caption);
    tableCaptionsByPage.set(entry.page_number, list);
  }

  for (const asset of sourceInput.assets) {
    const width = asset.width_px ?? 0;
    const height = asset.height_px ?? 0;
    const area = width * height;
    const aspectRatio = height > 0 ? width / height : 0;
    const pageCaptions = asset.page_number != null ? figureCaptionsByPage.get(asset.page_number) ?? [] : [];
    const caption = uniqueNonEmpty([asset.caption, pageCaptions[0], asset.text_content], 1)[0] ?? null;
    const captionBonus = caption ? 0.25 : 0;
    const sizeScore = Math.min(area / 400_000, 1.4);
    const aspectPenalty = aspectRatio > 10 || aspectRatio < 0.1 ? 0.45 : 0;
    const decorativePenalty = area < 35_000 && !caption ? 0.55 : 0;
    const heuristicScore = Number((0.2 + sizeScore + captionBonus - aspectPenalty - decorativePenalty).toFixed(3));

    if (heuristicScore < 0.45) {
      imageDiscardedCount += 1;
      continue;
    }

    candidates.push({
      candidateKey: `${asset.source_id}-${asset.asset_key}`,
      asset,
      kindGuess: "image",
      pageNumber: asset.page_number,
      caption,
      heuristicScore,
      sectionHintKeys: guessSectionHintsFromCaption("image", caption),
      summary: `image | page=${asset.page_number ?? "n/d"} | size=${width}x${height} | caption=${caption ?? "sin caption"} | score=${heuristicScore}`,
    });
  }

  sourceInput.tableCaptions.forEach((item, index) => {
    if (isNoisyTableCaption(item.caption)) {
      return;
    }

    const heuristicScore = 1.05 + (/\bahp\b|\bcriteria\b|\bmatrix\b|\bcomparison\b/i.test(item.caption) ? 0.25 : 0);
    const asset: PdfAssetRecord = {
      source_id: sourceInput.sourceId,
      asset_key: `${sourceInput.sourceId}-table-${index + 1}`,
      title: `Tabla detectada ${index + 1}`,
      kind: "table",
      caption: item.caption,
      page_number: item.page_number,
      file_path: null,
      mime_type: null,
      width_px: null,
      height_px: null,
      text_content: item.text_content ?? item.caption,
      extraction_origin: "llm_reconstructed",
      extracted: true,
    };
    candidates.push({
      candidateKey: `${sourceInput.sourceId}-table-candidate-${index + 1}`,
      asset,
      kindGuess: "table",
      pageNumber: item.page_number,
      caption: item.caption,
      heuristicScore,
      sectionHintKeys: guessSectionHintsFromCaption("table", item.caption),
      summary: `table | page=${item.page_number ?? "n/d"} | caption=${item.caption} | text=${truncateText(item.text_content, 240) ?? "n/d"} | score=${heuristicScore.toFixed(3)}`,
    });
  });

  const uniqueCandidates = candidates.filter(
    (candidate, index, array) =>
      array.findIndex(
        (item) =>
          item.kindGuess === candidate.kindGuess &&
          item.pageNumber === candidate.pageNumber &&
          item.caption === candidate.caption &&
          item.asset.file_path === candidate.asset.file_path,
      ) === index,
  );

  return {
    all: uniqueCandidates.sort((left, right) => right.heuristicScore - left.heuristicScore),
    imageDiscardedCount,
  };
}

function curateAssetCandidates(input: {
  sourceId: string;
  candidates: AssetCandidate[];
  planSelections: SourceLlmPlan["asset_selections"];
}) {
  const selectionByKey = new Map(input.planSelections.map((selection) => [selection.candidate_key, selection]));
  const keptTables: PdfAssetRecord[] = [];
  const keptImages: PdfAssetRecord[] = [];
  const warnings: string[] = [];

  for (const candidate of input.candidates) {
    const llmSelection =
      selectionByKey.get(candidate.candidateKey) ??
      selectionByKey.get(candidate.asset.asset_key);
    const keepByHeuristic =
      candidate.kindGuess === "table" ? candidate.heuristicScore >= 1 : candidate.heuristicScore >= 0.95;
    const keep = llmSelection ? llmSelection.keep && llmSelection.confidence >= 0.55 : keepByHeuristic;

    if (!keep) {
      continue;
    }

    const enrichedAsset: PdfAssetRecord = {
      ...candidate.asset,
      caption:
        uniqueNonEmpty([
          candidate.asset.caption,
          candidate.caption,
          llmSelection?.reason ? `${candidate.caption ?? candidate.asset.title} | ${llmSelection.reason}` : null,
        ], 1)[0] ?? null,
      text_content:
        candidate.asset.text_content ??
        (llmSelection?.section_hint_keys?.length
          ? `section_hints=${normalizeSectionKeys(llmSelection.section_hint_keys).join(",")}`
          : null),
    };

    if (candidate.kindGuess === "table") {
      if (keptTables.length < MAX_TABLE_ASSETS_PER_SOURCE) {
        keptTables.push(enrichedAsset);
      }
      continue;
    }

    if (keptImages.length < MAX_IMAGE_ASSETS_PER_SOURCE) {
      keptImages.push(enrichedAsset);
    }
  }

  const curated = [...keptTables, ...keptImages].slice(0, MAX_TOTAL_ASSETS_PER_SOURCE);
  if (input.candidates.length > curated.length) {
    warnings.push(
      `Se retuvieron ${curated.length} asset(s) curados de ${input.candidates.length} candidato(s) visuales para ${input.sourceId}.`,
    );
  }

  return {
    assets: curated,
    warnings,
  };
}

function resolveConfiguredLlmStatus() {
  const providerName = process.env.LLM_PROVIDER?.trim().toLowerCase() ?? "openai";

  if (providerName !== "openai") {
    return {
      ok: false,
      reason: `Extraccion LLM omitida: proveedor no soportado en Release 0 (${providerName}).`,
    };
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return {
      ok: false,
      reason:
        "Extraccion LLM omitida porque el proveedor local no tiene credenciales cargadas; se uso extraccion deterministica.",
    };
  }

  return { ok: true, reason: null };
}

function summarizeExtraction(sources: BlueprintLaunchSignalExtractionSource[]) {
  const pdfInputCount = sources.filter((source) => source.inputMode === "pdf").length;
  const webInputCount = sources.filter((source) => source.inputMode === "web_text").length;
  const abstractOnlyCount = sources.filter((source) => source.inputMode === "abstract_metadata").length;
  const textExtractionCount = sources.filter((source) => source.textCharCount > 0).length;
  const totalTextCharCount = sources.reduce((sum, source) => sum + source.textCharCount, 0);
  const totalSnippetCount = sources.reduce((sum, source) => sum + source.snippetCount, 0);
  const totalAssetCount = sources.reduce((sum, source) => sum + source.assetCount, 0);
  const equationAssetCount = sources.reduce((sum, source) => sum + source.equationAssetCount, 0);
  const tableAssetCount = sources.reduce((sum, source) => sum + source.tableAssetCount, 0);
  const imageAssetCount = sources.reduce((sum, source) => sum + source.imageAssetCount, 0);

  return {
    pdfInputCount,
    webInputCount,
    abstractOnlyCount,
    textExtractionCount,
    totalTextCharCount,
    totalSnippetCount,
    totalAssetCount,
    equationAssetCount,
    tableAssetCount,
    imageAssetCount,
    summary: `Paso 5 procesado: ${sources.length} fuente(s), ${pdfInputCount} PDF(s), ${textExtractionCount} texto(s) extraido(s), ${totalTextCharCount} caracteres trazables, ${totalSnippetCount} snippet(s) y ${totalAssetCount} asset(s) (${imageAssetCount} imagen(es), ${tableAssetCount} tabla(s), ${equationAssetCount} ecuacion(es)).`,
  };
}

export async function extractBlueprintLaunchSourceSignals(input: {
  projectTitle: string;
  savedIntake: BlueprintLaunchSavedIntakeSnapshot;
  bundle: BlueprintLaunchSelectedSourceBundle;
  sourceAccessResolution: BlueprintLaunchSourceAccessResolutionResult;
  contentMaterialization: BlueprintLaunchContentMaterializationResult;
  evidenceCompletion: BlueprintLaunchEvidenceCompletionResult | null;
}): Promise<{
  evidencePacksArtifact: EvidencePackArtifact;
  sourceSignalExtraction: BlueprintLaunchSignalExtractionResult;
}> {
  const runAt = new Date().toISOString();
  const runDir = path.join(ASSET_ROOT, `run-${buildTimestampToken(runAt)}`);
  await mkdir(runDir, { recursive: true });
  const completionCardsBySourceId = new Map(
    (input.evidenceCompletion?.cards ?? []).map((card) => [card.referenceId, card]),
  );
  const warnings: string[] = [];
  let extractionMode: EvidencePackArtifact["extraction_mode"] = "rule_based";
  const llmPrompts: BlueprintLaunchLlmPromptRecord[] = [];
  const llmStatus = resolveConfiguredLlmStatus();
  const provider = llmStatus.ok ? getConfiguredLlmProvider() : null;
  let llmCallCount = 0;
  let successfulLlmCount = 0;
  if (!llmStatus.ok && llmStatus.reason) {
    warnings.push(llmStatus.reason);
  }
  const packs: ExtractedEvidencePack[] = [];
  const sources: BlueprintLaunchSignalExtractionSource[] = [];

  for (const source of input.bundle.sources) {
    const sourceInput = await selectSourceInput({
      source,
      contentMaterialization: input.contentMaterialization,
      runDir,
    });
    const completionCard = completionCardsBySourceId.get(source.reference.id) ?? null;
    const sections = deriveSectionCandidates({
      abstract: sourceInput.abstract,
      bodyText: sourceInput.text,
    });
    const assetCandidateBuild = buildAssetCandidates(sourceInput);
    const assetCandidatesForLlm = assetCandidateBuild.all.slice(0, MAX_ASSET_CANDIDATES_FOR_LLM);
    const chunkCandidatesForLlm = rankChunkCandidates({
      chunks: sourceInput.sourceChunks,
      intakeTopic: input.savedIntake.intake.topic,
      maxItems: MAX_CHUNK_CANDIDATES_FOR_LLM,
    });
    const fallback = buildFallbackSourceAnalysis({
      sourceInput,
      sections,
      completionCard,
    });
    const { template, promptText } = buildPrompt({
      savedIntake: input.savedIntake,
      source,
      sourceInput,
      completionCard,
      sections,
      assetCandidates: assetCandidatesForLlm,
      chunkCandidates: chunkCandidatesForLlm,
    });
    llmPrompts.push({
      label: `Primera ola de extraccion por fuente: ${source.reference.id}`,
      schemaName: STEP5_SCHEMA_NAME,
      model: STEP5_MODEL,
      trackingLabel: STEP5_TRACKING_LABEL,
      promptTemplate: template,
      promptText,
      sourceId: source.reference.id,
      sourceTitle: source.reference.title,
    });

    let plan: SourceLlmPlan = fallback;
    if (provider) {
      try {
        llmCallCount += 1;
        const generated = await generateStructuredObjectWithTextFallback<SourceLlmPlan>({
          provider,
          prompt: promptText,
          schemaName: STEP5_SCHEMA_NAME,
          schema: signalSchema,
          model: STEP5_MODEL,
        });
        plan = generated;
        successfulLlmCount += 1;
        extractionMode = "hybrid";
      } catch (error) {
        warnings.push(
          error instanceof Error
            ? `Fallo la extraccion LLM para ${source.reference.id}; se uso fallback: ${error.message}`
            : `Fallo la extraccion LLM para ${source.reference.id}; se uso fallback.`,
        );
      }
    }

    const chunksById = new Map(sourceInput.sourceChunks.map((chunk) => [chunk.chunk_id, chunk]));
    const llmSelectedSnippets = (plan.selected_chunks ?? [])
      .map((selection) => {
        const chunk = chunksById.get(selection.chunk_id);
        if (!chunk) {
          return null;
        }

        return buildOriginalSnippetFromChunk({
          sourceId: source.reference.id,
          sourceInput,
          chunk,
          label: selection.label,
          sectionHintKeys: selection.section_hint_keys,
          interpretationEs: selection.interpretation_es,
          confidence: selection.confidence,
          relevanceScore: selection.relevance_score,
          selectedByLlm: true,
        });
      })
      .filter((snippet): snippet is EvidenceSnippet => Boolean(snippet));
    const selectedChunkIds = new Set(llmSelectedSnippets.map((snippet) => snippet.source_chunk_id));
    const deterministicOriginalSnippets = chunkCandidatesForLlm
      .filter((chunk) => !selectedChunkIds.has(chunk.chunk_id))
      .slice(0, Math.max(MAX_DETERMINISTIC_ORIGINAL_SNIPPETS - llmSelectedSnippets.length, 0))
      .map((chunk, index) =>
        buildOriginalSnippetFromChunk({
          sourceId: source.reference.id,
          sourceInput,
          chunk,
          label: `Extracto original candidato ${index + 1}`,
          sectionHintKeys: chunk.section_hint_keys,
          interpretationEs: null,
          confidence: sourceInput.inputMode === "pdf" ? 0.82 : 0.72,
          relevanceScore: chunk.relevance_score,
          selectedByLlm: false,
        }),
      );
    const snippets = [
      ...buildMetadataSnippets({
        sourceId: source.reference.id,
        sourceInput,
        intakeTopic: input.savedIntake.intake.topic,
      }),
      ...llmSelectedSnippets,
      ...deterministicOriginalSnippets,
      ...(plan.snippet_suggestions ?? [])
        .filter(() => sourceInput.sourceChunks.length === 0)
        .map((snippet, index) => {
          const text = truncateText(snippet.text_excerpt, MAX_SNIPPET_CHARS) ?? snippet.text_excerpt;

          return {
            snippet_id: `${source.reference.id}-llm-fallback-${index + 1}`,
            source_id: source.reference.id,
            origin: sourceInput.inputMode === "pdf" ? "pdf" : "source",
            label: snippet.label,
            text,
            extraction_kind: "interpreted_signal",
            original_text: text,
            interpretation_es: "Fallback sin chunks originales disponibles.",
            source_chunk_id: null,
            page_number: null,
            page_start: null,
            page_end: null,
            char_start: null,
            char_end: null,
            original_language: sourceInput.languageDetected,
            quote_hash: hashText(text),
            text_char_count: text.length,
            section_hint_keys: normalizeSectionKeys(snippet.section_hint_keys),
            relevance_score: snippet.confidence,
            confidence: snippet.confidence,
          } satisfies EvidenceSnippet;
        }),
    ];

    const equationAssets: PdfAssetRecord[] = (plan.equation_reconstructions ?? [])
      .filter((equation) => equation.confidence >= 0.55)
      .sort((left, right) => right.confidence - left.confidence)
      .slice(0, MAX_EQUATION_ASSETS_PER_SOURCE)
      .map((equation, index) => ({
      source_id: source.reference.id,
      asset_key: `${source.reference.id}-equation-${index + 1}`,
      title: `Ecuacion reconstruida ${index + 1}`,
      kind: "equation",
      caption: equation.meaning,
      page_number:
        sourceInput.equationCandidates.find((candidate) => candidate.raw_text === equation.raw_text)?.page_number ??
        null,
      file_path: null,
      mime_type: null,
      width_px: null,
      height_px: null,
      text_content: equation.latex_candidate,
      extraction_origin: "llm_reconstructed",
      extracted: true,
    }));

    const curatedAssets = curateAssetCandidates({
      sourceId: source.reference.id,
      candidates: assetCandidateBuild.all,
      planSelections: plan.asset_selections ?? [],
    });
    const assets = [...equationAssets, ...curatedAssets.assets].slice(0, MAX_TOTAL_ASSETS_PER_SOURCE + MAX_EQUATION_ASSETS_PER_SOURCE);
    const planSections = plan.pdf_sections ?? sections;
    const pdfSections = {
      abstract: planSections.abstract ?? sections.abstract,
      methodology: planSections.methodology ?? sections.methodology,
      results: planSections.results ?? sections.results,
      conclusions: planSections.conclusions ?? sections.conclusions,
      limitations: planSections.limitations ?? sections.limitations,
      future_work: planSections.future_work ?? sections.future_work,
    };
    const pdfSectionsAvailable = Object.entries(pdfSections)
      .filter((entry) => Boolean(entry[1]))
      .map((entry) => entry[0]);

    if (sourceInput.inputMode !== "pdf") {
      warnings.push(`La fuente ${source.reference.id} se proceso sin PDF completo; las senales dependen de ${sourceInput.inputMode}.`);
    }
    if (assetCandidateBuild.imageDiscardedCount > 0) {
      warnings.push(
        `Se descartaron ${assetCandidateBuild.imageDiscardedCount} imagen(es) pequenas o decorativas en ${source.reference.id}.`,
      );
    }
    warnings.push(...curatedAssets.warnings);

    packs.push({
      source_id: source.reference.id,
      source_text_path: sourceInput.extractedTextPath,
      source_chunks_path: sourceInput.sourceChunksPath,
      source_text_char_count: sourceInput.textCharCount,
      source_chunk_count: sourceInput.sourceChunks.length,
      selected_original_snippet_count: snippets.filter((snippet) =>
        snippet.extraction_kind === "llm_selected_original" || snippet.extraction_kind === "original_excerpt",
      ).length,
      interpreted_signal_count: [
        plan.problem_signal,
        plan.method_signal,
        plan.context_signal,
        plan.finding_signal,
        plan.limitation_signal,
        plan.future_line_signal,
      ].filter(Boolean).length,
      problem_signal: plan.problem_signal,
      method_signal: plan.method_signal,
      context_signal: plan.context_signal,
      finding_signal: plan.finding_signal,
      limitation_signal: plan.limitation_signal,
      future_line_signal: plan.future_line_signal,
      abstract_summary: plan.abstract_summary,
      pdf_summary: plan.pdf_summary,
      pdf_sections: pdfSections,
      snippets,
      assets,
    });

    sources.push({
      sourceId: source.reference.id,
      title: source.reference.title,
      inputMode: sourceInput.inputMode,
      primaryPath: sourceInput.primaryPath,
      secondaryPath: sourceInput.secondaryPath,
      extractedTextPath: sourceInput.extractedTextPath,
      sourceChunksPath: sourceInput.sourceChunksPath,
      sourceChunkCount: sourceInput.sourceChunks.length,
      pageCount: sourceInput.pageCount,
      textCharCount: sourceInput.textCharCount,
      detectedLanguage: sourceInput.languageDetected,
      sourceOverview: plan.source_overview,
      topicRelevance: plan.topic_relevance,
      proposalUsefulness: plan.proposal_usefulness,
      supportsSectionKeys: normalizeSectionKeys(plan.supports_section_keys ?? []),
      methodologyHints: normalizeHintValues(plan.methodology_hints),
      frameworkHints: normalizeHintValues(plan.framework_hints),
      problemSignal: plan.problem_signal,
      methodSignal: plan.method_signal,
      contextSignal: plan.context_signal,
      findingSignal: plan.finding_signal,
      limitationSignal: plan.limitation_signal,
      futureLineSignal: plan.future_line_signal,
      abstractSummary: plan.abstract_summary,
      pdfSummary: plan.pdf_summary,
      pdfSectionsAvailable,
      snippetCount: snippets.length,
      originalSnippetCount: snippets.filter((snippet) =>
        snippet.extraction_kind === "llm_selected_original" || snippet.extraction_kind === "original_excerpt",
      ).length,
      interpretedSignalCount: [
        plan.problem_signal,
        plan.method_signal,
        plan.context_signal,
        plan.finding_signal,
        plan.limitation_signal,
        plan.future_line_signal,
      ].filter(Boolean).length,
      assetCount: assets.length,
      equationAssetCount: equationAssets.length,
      tableAssetCount: assets.filter((asset) => asset.kind === "table").length,
      imageAssetCount: assets.filter((asset) => asset.kind === "image").length,
      warnings: [
        ...(assetCandidateBuild.imageDiscardedCount > 0
          ? [`Se descartaron ${assetCandidateBuild.imageDiscardedCount} imagen(es) pequenas o decorativas.`]
          : []),
        ...curatedAssets.warnings,
      ],
    });
  }

  const summary = summarizeExtraction(sources);
  const resultLlmStatus: BlueprintLaunchSignalExtractionResult["llmStatus"] =
    successfulLlmCount === 0
      ? llmStatus.ok
        ? "fallback"
        : "skipped"
      : successfulLlmCount === input.bundle.sources.length
        ? "llm"
        : "hybrid";
  const readyForStep6 = sources.length > 0 && summary.totalSnippetCount >= sources.length * 4;
  const sourceSignalExtraction: BlueprintLaunchSignalExtractionResult = {
    savedAt: runAt,
    extractionMode,
    llmStatus: resultLlmStatus,
    llmPromptCount: llmPrompts.length,
    llmCallCount,
    llmPrompts,
    runDir,
    readyForStep6,
    summary: summary.summary,
    sourceCount: sources.length,
    textExtractionCount: summary.textExtractionCount,
    totalTextCharCount: summary.totalTextCharCount,
    pdfInputCount: summary.pdfInputCount,
    webInputCount: summary.webInputCount,
    abstractOnlyCount: summary.abstractOnlyCount,
    totalSnippetCount: summary.totalSnippetCount,
    totalAssetCount: summary.totalAssetCount,
    equationAssetCount: summary.equationAssetCount,
    tableAssetCount: summary.tableAssetCount,
    imageAssetCount: summary.imageAssetCount,
    sources,
    warnings: Array.from(new Set(warnings)),
  };

  return {
    evidencePacksArtifact: {
      artifact_type: "evidence_packs",
      artifact_version: "v1",
      generated_at: runAt,
      extraction_mode: extractionMode,
      project_context: {
        project_title: input.projectTitle,
        intake_topic: input.savedIntake.intake.topic,
      },
      packs,
      warnings: Array.from(new Set(warnings)),
    },
    sourceSignalExtraction,
  };
}
