import { mkdir } from "node:fs/promises";
import path from "node:path";

import { getConfiguredLlmProvider } from "@/llm";
import type {
  AssumptionInput,
  BlueprintSourceRecord,
  EvidenceSnippet,
  ExtractedEvidencePack,
  PdfAssetRecord,
  PdfDownloadResult,
} from "@/server/blueprint-v2/types";
import {
  clipText,
  makeSnippetId,
  pickFirstNonEmpty,
} from "@/server/blueprint-v2/utils";
import {
  ensurePdfPythonRuntime,
  runPythonJsonWithResolvedRuntime,
} from "@/server/blueprint-v2/evidence/pdf-python-runtime";

type RawPdfAssetPayload = {
  asset_key: string;
  title: string;
  kind: "image" | "equation" | "table";
  caption: string | null;
  page_number: number | null;
  file_path: string | null;
  mime_type: string | null;
  width_px: number | null;
  height_px: number | null;
  text_content: string | null;
  extraction_origin: "pdf_native" | "llm_reconstructed";
  extracted: boolean;
};

type ExtractedPdfPayload = {
  text: string | null;
  error: string | null;
  assets: RawPdfAssetPayload[];
};

type LlmExtractionPayload = {
  abstract_summary: string | null;
  problem_signal: string | null;
  method_signal: string | null;
  context_signal: string | null;
  finding_signal: string | null;
  limitation_signal: string | null;
  future_line_signal: string | null;
  pdf_sections: {
    abstract: string | null;
    methodology: string | null;
    results: string | null;
    conclusions: string | null;
    limitations: string | null;
    future_work: string | null;
  };
  table_elements: Array<{
    title: string;
    text_content: string;
  }>;
  equation_elements: Array<{
    title: string;
    text_content: string;
  }>;
  image_elements: Array<{
    title: string;
    caption: string;
  }>;
};

const PDF_EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "abstract_summary",
    "problem_signal",
    "method_signal",
    "context_signal",
    "finding_signal",
    "limitation_signal",
    "future_line_signal",
    "pdf_sections",
    "table_elements",
    "equation_elements",
    "image_elements",
  ],
  properties: {
    abstract_summary: { type: ["string", "null"] },
    problem_signal: { type: ["string", "null"] },
    method_signal: { type: ["string", "null"] },
    context_signal: { type: ["string", "null"] },
    finding_signal: { type: ["string", "null"] },
    limitation_signal: { type: ["string", "null"] },
    future_line_signal: { type: ["string", "null"] },
    pdf_sections: {
      type: "object",
      additionalProperties: false,
      required: [
        "abstract",
        "methodology",
        "results",
        "conclusions",
        "limitations",
        "future_work",
      ],
      properties: {
        abstract: { type: ["string", "null"] },
        methodology: { type: ["string", "null"] },
        results: { type: ["string", "null"] },
        conclusions: { type: ["string", "null"] },
        limitations: { type: ["string", "null"] },
        future_work: { type: ["string", "null"] },
      },
    },
    table_elements: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "text_content"],
        properties: {
          title: { type: "string" },
          text_content: { type: "string" },
        },
      },
    },
    equation_elements: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "text_content"],
        properties: {
          title: { type: "string" },
          text_content: { type: "string" },
        },
      },
    },
    image_elements: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "caption"],
        properties: {
          title: { type: "string" },
          caption: { type: "string" },
        },
      },
    },
  },
} as const;

function splitSentences(value: string | null | undefined) {
  return (value ?? "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 40);
}

function findSentenceByPattern(value: string | null | undefined, patterns: RegExp[]) {
  const sentences = splitSentences(value);
  const match = sentences.find((sentence) => patterns.some((pattern) => pattern.test(sentence)));
  return clipText(match ?? sentences[0] ?? null, 480);
}

function findSectionSlice(text: string | null | undefined, headingPatterns: string[]) {
  if (!text) {
    return null;
  }

  const normalized = text.replace(/\r/g, "");
  for (const heading of headingPatterns) {
    const pattern = new RegExp(`(?:^|\\n)\\s*${heading}\\s*(?:\\n|:)([\\s\\S]{0,2400})`, "i");
    const match = normalized.match(pattern);

    if (match?.[1]) {
      return clipText(match[1], 1800);
    }
  }

  return null;
}

function assessPdfTextQuality(text: string | null) {
  const normalized = text?.replace(/\s+/g, " ").trim() ?? "";

  if (!normalized) {
    return {
      usable: false,
      reason: "No se extrajo texto del PDF.",
    };
  }

  const weirdCharRatio =
    (normalized.match(/[^\x20-\x7E\u00A0-\u024F]/g)?.length ?? 0) /
    Math.max(1, normalized.length);
  const headingSignalCount = [
    /abstract/i,
    /metodolog/i,
    /method/i,
    /results?/i,
    /conclusions?/i,
  ].filter((pattern) => pattern.test(normalized)).length;

  if (normalized.length < 900) {
    return {
      usable: false,
      reason: "El texto extraido del PDF es demasiado corto para una lectura estructurada.",
    };
  }

  if (weirdCharRatio > 0.08) {
    return {
      usable: false,
      reason: "El texto extraido del PDF contiene demasiado ruido de codificacion.",
    };
  }

  if (headingSignalCount === 0) {
    return {
      usable: false,
      reason: "El texto extraido del PDF no conserva headings utiles.",
    };
  }

  return {
    usable: true,
    reason: null,
  };
}

async function runPythonPdfExtract(filePath: string, assetDir: string): Promise<ExtractedPdfPayload> {
  const script = [
    "import io, json, os, sys",
    "from PIL import Image, ImageChops",
    "try:",
    "    from pypdf import PdfReader",
    "except Exception as exc:",
    "    print(json.dumps({'text': None, 'error': f'pypdf no disponible: {exc}', 'assets': []}))",
    "    sys.exit(0)",
    "pdf_path = sys.argv[1]",
    "asset_dir = sys.argv[2]",
    "os.makedirs(asset_dir, exist_ok=True)",
    "def trim_image(image):",
    "    if image.mode not in ('RGB', 'RGBA'):",
    "        image = image.convert('RGBA')",
    "    bg_color = image.getpixel((0, 0))",
    "    background = Image.new(image.mode, image.size, bg_color)",
    "    diff = ImageChops.difference(image, background)",
    "    bbox = diff.getbbox()",
    "    if not bbox:",
    "        return image",
    "    left = max(0, bbox[0] - 2)",
    "    top = max(0, bbox[1] - 2)",
    "    right = min(image.size[0], bbox[2] + 2)",
    "    bottom = min(image.size[1], bbox[3] + 2)",
    "    return image.crop((left, top, right, bottom))",
    "try:",
    "    reader = PdfReader(pdf_path)",
    "    text_chunks = []",
    "    assets = []",
    "    extracted_images = 0",
    "    for page_index, page in enumerate(reader.pages[:25]):",
    "        try:",
    "            page_text = page.extract_text() or ''",
    "        except Exception:",
    "            page_text = ''",
    "        text_chunks.append(page_text)",
    "        if extracted_images >= 6:",
    "            continue",
    "        try:",
    "            page_images = list(page.images)",
    "        except Exception:",
    "            page_images = []",
    "        for image_index, page_image in enumerate(page_images[:3]):",
    "            if extracted_images >= 6:",
    "                break",
    "            try:",
    "                raw_bytes = page_image.data",
    "                image = Image.open(io.BytesIO(raw_bytes))",
    "                image = trim_image(image)",
    "                asset_key = f'pdf_image_{page_index + 1}_{image_index + 1}'",
    "                output_path = os.path.join(asset_dir, f'{asset_key}.png')",
    "                image.save(output_path, format='PNG')",
    "                assets.append({",
    "                    'asset_key': asset_key,",
    "                    'title': f'Figura extraida de pagina {page_index + 1}',",
    "                    'kind': 'image',",
    "                    'caption': None,",
    "                    'page_number': page_index + 1,",
    "                    'file_path': output_path,",
    "                    'mime_type': 'image/png',",
    "                    'width_px': image.size[0],",
    "                    'height_px': image.size[1],",
    "                    'text_content': None,",
    "                    'extraction_origin': 'pdf_native',",
    "                    'extracted': True,",
    "                })",
    "                extracted_images += 1",
    "            except Exception:",
    "                continue",
    "    text = '\\n'.join(chunk for chunk in text_chunks if chunk).strip()",
    "    print(json.dumps({'text': text[:90000] if text else None, 'error': None, 'assets': assets}))",
    "except Exception as exc:",
    "    print(json.dumps({'text': None, 'error': str(exc), 'assets': []}))",
  ].join("\n");

  const { payload } = await runPythonJsonWithResolvedRuntime<ExtractedPdfPayload>(script, [
    filePath,
    assetDir,
  ]);

  return (
    payload ?? {
      text: null,
      error: "No se pudo ejecutar la extraccion estructurada del PDF.",
      assets: [],
    }
  );
}

function buildSourceSnippets(source: BlueprintSourceRecord): EvidenceSnippet[] {
  const snippets: EvidenceSnippet[] = [];

  if (source.abstract?.trim()) {
    snippets.push({
      snippet_id: makeSnippetId("source"),
      source_id: source.source_id,
      origin: "source",
      label: "Resumen/abstract de la fuente",
      text: clipText(source.abstract, 900) ?? source.abstract,
      section_hint_keys: [
        "introduction",
        "research_antecedents",
        "state_of_the_art",
        "theoretical_framework",
        "theoretical_bases",
      ],
      confidence: 0.74,
    });
  }

  if (source.origin === "websearch_source" && source.snippet?.trim()) {
    snippets.push({
      snippet_id: makeSnippetId("web"),
      source_id: source.source_id,
      origin: "websearch",
      label: "Fragmento web complementario",
      text: source.snippet,
      section_hint_keys: ["introduction", "problem_statement", "justification"],
      confidence: 0.42,
    });
  }

  return snippets;
}

function buildSignalSnippets(input: {
  source: BlueprintSourceRecord;
  problemSignal: string | null;
  methodSignal: string | null;
  contextSignal: string | null;
  findingSignal: string | null;
  limitationSignal: string | null;
  futureLineSignal: string | null;
}) {
  const snippets: EvidenceSnippet[] = [];

  if (input.problemSignal) {
    snippets.push({
      snippet_id: makeSnippetId("signal"),
      source_id: input.source.source_id,
      origin: "source",
      label: "Problema o brecha del antecedente",
      text: input.problemSignal,
      section_hint_keys: ["problem_statement", "justification", "research_antecedents"],
      confidence: 0.76,
    });
  }

  if (input.contextSignal) {
    snippets.push({
      snippet_id: makeSnippetId("signal"),
      source_id: input.source.source_id,
      origin: "source",
      label: "Contexto o poblacion del antecedente",
      text: input.contextSignal,
      section_hint_keys: [
        "problem_statement",
        "population_and_sample",
        "research_antecedents",
      ],
      confidence: 0.72,
    });
  }

  if (input.methodSignal) {
    snippets.push({
      snippet_id: makeSnippetId("signal"),
      source_id: input.source.source_id,
      origin: "source",
      label: "Metodo del antecedente",
      text: input.methodSignal,
      section_hint_keys: [
        "methodology",
        "methodological_approach",
        "research_design",
        "analysis_plan",
      ],
      confidence: 0.8,
    });
  }

  if (input.findingSignal) {
    snippets.push({
      snippet_id: makeSnippetId("signal"),
      source_id: input.source.source_id,
      origin: "source",
      label: "Hallazgo relevante del antecedente",
      text: input.findingSignal,
      section_hint_keys: ["justification", "analysis_plan", "research_antecedents"],
      confidence: 0.74,
    });
  }

  if (input.limitationSignal) {
    snippets.push({
      snippet_id: makeSnippetId("signal"),
      source_id: input.source.source_id,
      origin: "source",
      label: "Limitacion detectada en antecedente",
      text: input.limitationSignal,
      section_hint_keys: ["justification", "scope_and_limitations", "specific_objectives"],
      confidence: 0.72,
    });
  }

  if (input.futureLineSignal) {
    snippets.push({
      snippet_id: makeSnippetId("signal"),
      source_id: input.source.source_id,
      origin: "source",
      label: "Linea futura sugerida por antecedente",
      text: input.futureLineSignal,
      section_hint_keys: [
        "general_objective",
        "specific_objectives",
        "justification",
      ],
      confidence: 0.7,
    });
  }

  return snippets;
}

function buildAssetSnippets(sourceId: string, assets: PdfAssetRecord[]) {
  const snippets: EvidenceSnippet[] = [];

  for (const asset of assets) {
    if (!asset.text_content?.trim() && !asset.caption?.trim()) {
      continue;
    }

    snippets.push({
      snippet_id: makeSnippetId("asset"),
      source_id: sourceId,
      origin: "pdf",
      label: `${asset.kind.toUpperCase()} ${asset.page_number ? `pagina ${asset.page_number}` : ""}`.trim(),
      text: clipText(asset.text_content ?? asset.caption ?? "", 700) ?? "",
      section_hint_keys:
        asset.kind === "table"
          ? ["analysis_plan", "methodology", "results"]
          : asset.kind === "equation"
            ? ["methodology", "analysis_plan"]
            : ["theoretical_framework", "results", "annexes"],
      confidence: asset.extraction_origin === "pdf_native" ? 0.7 : 0.45,
    });
  }

  return snippets;
}

async function runLlmFallbackExtraction(input: {
  source: BlueprintSourceRecord;
  extractedText: string | null;
  extractionReason: string;
}): Promise<LlmExtractionPayload | null> {
  const provider = getConfiguredLlmProvider();
  const prompt = [
    "Eres Ingeniometrix. Debes reconstruir una lectura prudente y estructurada de una fuente academica cuando la extraccion del PDF no fue suficiente.",
    "No inventes resultados. Si algo no puede inferirse de manera prudente, devuelve null.",
    "Usa solo el titulo, abstract, metadata y el texto parcial recuperado.",
    `Motivo del fallback: ${input.extractionReason}`,
    `Titulo: ${input.source.title}`,
    `Autores: ${input.source.authors.join(", ") || "NO_DISPONIBLE"}`,
    `Anio: ${input.source.year ?? "NO_DISPONIBLE"}`,
    `Venue: ${input.source.venue ?? "NO_DISPONIBLE"}`,
    `Abstract: ${input.source.abstract ?? "NO_DISPONIBLE"}`,
    `Texto parcial del PDF: ${clipText(input.extractedText, 8000) ?? "NO_DISPONIBLE"}`,
    "Devuelve una lectura estructurada para apoyar el blueprint. Si detectas tablas, ecuaciones o imagenes relevantes, describe su contenido de forma breve y prudente.",
  ].join("\n");

  try {
    return await provider.generateStructuredObject<LlmExtractionPayload>({
      prompt,
      schemaName: "pdf_evidence_extraction_fallback",
      schema: PDF_EXTRACTION_SCHEMA,
    });
  } catch {
    return null;
  }
}

function buildLlmAssets(source: BlueprintSourceRecord, llmPayload: LlmExtractionPayload): PdfAssetRecord[] {
  const assets: PdfAssetRecord[] = [];

  for (const [index, element] of llmPayload.table_elements.entries()) {
    assets.push({
      source_id: source.source_id,
      asset_key: `${source.source_id}:table:${index + 1}`,
      title: element.title,
      kind: "table",
      caption: element.title,
      page_number: null,
      file_path: null,
      mime_type: null,
      width_px: null,
      height_px: null,
      text_content: clipText(element.text_content, 1200),
      extraction_origin: "llm_reconstructed",
      extracted: false,
    });
  }

  for (const [index, element] of llmPayload.equation_elements.entries()) {
    assets.push({
      source_id: source.source_id,
      asset_key: `${source.source_id}:equation:${index + 1}`,
      title: element.title,
      kind: "equation",
      caption: element.title,
      page_number: null,
      file_path: null,
      mime_type: null,
      width_px: null,
      height_px: null,
      text_content: clipText(element.text_content, 800),
      extraction_origin: "llm_reconstructed",
      extracted: false,
    });
  }

  for (const [index, element] of llmPayload.image_elements.entries()) {
    assets.push({
      source_id: source.source_id,
      asset_key: `${source.source_id}:image-hint:${index + 1}`,
      title: element.title,
      kind: "image",
      caption: clipText(element.caption, 500),
      page_number: null,
      file_path: null,
      mime_type: null,
      width_px: null,
      height_px: null,
      text_content: clipText(element.caption, 500),
      extraction_origin: "llm_reconstructed",
      extracted: false,
    });
  }

  return assets;
}

function buildAssetOutputDir(sourceId: string) {
  return path.join(
    process.cwd(),
    "artifacts-local",
    "master-blueprint-engine",
    "pdf-assets",
    sourceId.replace(/[^a-z0-9_-]/gi, "_"),
  );
}

export async function runEvidenceExtractionEngine(input: {
  sourceRegistry: BlueprintSourceRecord[];
  pdfDownloads: PdfDownloadResult;
  assumptions: AssumptionInput[];
}): Promise<{
  evidencePacks: ExtractedEvidencePack[];
  assumptionSnippets: EvidenceSnippet[];
  warnings: string[];
}> {
  const pdfBySourceId = new Map(
    input.pdfDownloads.records.map((record) => [record.source_id, record]),
  );
  const evidencePacks: ExtractedEvidencePack[] = [];
  const assumptionSnippets = input.assumptions.map((assumption) => ({
    snippet_id: makeSnippetId("assumption"),
    source_id: null,
    origin: "assumption_backed" as const,
    label: "Assumption operativa del engine",
    text: `${assumption.statement} Motivo: ${assumption.reason}`,
    section_hint_keys: assumption.section_keys,
    confidence: 0.18,
  }));
  const warnings: string[] = [];

  try {
    await ensurePdfPythonRuntime();
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? error.message
        : "No se pudo preparar el runtime PDF del MasterBlueprintEngine.",
    );
  }

  for (const source of input.sourceRegistry) {
    const pdfRecord = pdfBySourceId.get(source.source_id);
    let pdfText: string | null = null;
    let extractedAssets: PdfAssetRecord[] = [];

    if (pdfRecord?.status === "downloaded" && pdfRecord.stored_file_path) {
      const assetOutputDir = buildAssetOutputDir(source.source_id);
      await mkdir(assetOutputDir, { recursive: true });
      const extracted = await runPythonPdfExtract(pdfRecord.stored_file_path, assetOutputDir);
      pdfText = extracted.text;
      extractedAssets = extracted.assets.map((asset) => ({
        source_id: source.source_id,
        asset_key: `${source.source_id}:${asset.asset_key}`,
        title: asset.title,
        kind: asset.kind,
        caption: asset.caption,
        page_number: asset.page_number,
        file_path: asset.file_path,
        mime_type: asset.mime_type,
        width_px: asset.width_px,
        height_px: asset.height_px,
        text_content: asset.text_content,
        extraction_origin: asset.extraction_origin,
        extracted: asset.extracted,
      }));

      if (extracted.error) {
        warnings.push(`${source.title}: ${extracted.error}`);
      }
    }

    const quality = assessPdfTextQuality(pdfText);
    let llmFallback: LlmExtractionPayload | null = null;

    if (pdfRecord?.status === "downloaded" && !quality.usable) {
      llmFallback = await runLlmFallbackExtraction({
        source,
        extractedText: pdfText,
        extractionReason: quality.reason ?? "La extraccion del PDF no fue suficiente.",
      });

      if (llmFallback) {
        warnings.push(
          `${source.title}: se activo fallback LLM para completar la lectura estructurada del PDF.`,
        );
        extractedAssets = [...extractedAssets, ...buildLlmAssets(source, llmFallback)];
      }
    }

    const pdfSummary = clipText(pdfText, 1200);
    const nativeSections = {
      abstract: findSectionSlice(pdfText, ["abstract", "resumen"]),
      methodology: findSectionSlice(pdfText, [
        "methodology",
        "methods",
        "metodologia",
        "materiales y metodos",
      ]),
      results: findSectionSlice(pdfText, ["results", "resultados"]),
      conclusions: findSectionSlice(pdfText, ["conclusions", "conclusiones"]),
      limitations: findSectionSlice(pdfText, ["limitations", "limitaciones"]),
      future_work: findSectionSlice(pdfText, [
        "future work",
        "future research",
        "trabajo futuro",
        "futuras investigaciones",
      ]),
    };
    const pdfSections = llmFallback
      ? {
          abstract: pickFirstNonEmpty(nativeSections.abstract, llmFallback.pdf_sections.abstract),
          methodology: pickFirstNonEmpty(
            nativeSections.methodology,
            llmFallback.pdf_sections.methodology,
          ),
          results: pickFirstNonEmpty(nativeSections.results, llmFallback.pdf_sections.results),
          conclusions: pickFirstNonEmpty(
            nativeSections.conclusions,
            llmFallback.pdf_sections.conclusions,
          ),
          limitations: pickFirstNonEmpty(
            nativeSections.limitations,
            llmFallback.pdf_sections.limitations,
          ),
          future_work: pickFirstNonEmpty(
            nativeSections.future_work,
            llmFallback.pdf_sections.future_work,
          ),
        }
      : nativeSections;
    const problemSignal = pickFirstNonEmpty(
      llmFallback?.problem_signal,
      findSentenceByPattern(source.abstract, [
        /problem|gap|challenge|problema|brecha|desafio/i,
      ]),
      pdfSections.abstract,
    );
    const methodSignal = pickFirstNonEmpty(
      llmFallback?.method_signal,
      findSentenceByPattern(source.abstract, [
        /method|methodology|approach|metodolog|diseno|survey|interview|sample/i,
      ]),
      pdfSections.methodology,
    );
    const contextSignal = pickFirstNonEmpty(
      llmFallback?.context_signal,
      findSentenceByPattern(source.abstract, [
        /population|context|sample|poblacion|contexto|muestra|peru|lima/i,
      ]),
    );
    const findingSignal = pickFirstNonEmpty(
      llmFallback?.finding_signal,
      findSentenceByPattern(source.abstract, [/result|finding|hallazgo|resultado|conclusion/i]),
      pdfSections.results,
      pdfSections.conclusions,
    );
    const limitationSignal = pickFirstNonEmpty(
      llmFallback?.limitation_signal,
      findSentenceByPattern(source.abstract, [/limit|constraint|limitacion|restriccion/i]),
      pdfSections.limitations,
    );
    const futureLineSignal = pickFirstNonEmpty(
      llmFallback?.future_line_signal,
      findSentenceByPattern(source.abstract, [/future|recommend|futura|recomienda/i]),
      pdfSections.future_work,
    );
    const snippets = [
      ...buildSourceSnippets(source),
      ...buildSignalSnippets({
        source,
        problemSignal,
        methodSignal,
        contextSignal,
        findingSignal,
        limitationSignal,
        futureLineSignal,
      }),
      ...buildAssetSnippets(source.source_id, extractedAssets),
    ];

    if (pdfSections.methodology) {
      snippets.push({
        snippet_id: makeSnippetId("pdf"),
        source_id: source.source_id,
        origin: "pdf",
        label: "Metodo extraido de PDF",
        text: pdfSections.methodology,
        section_hint_keys: [
          "methodology",
          "methodological_approach",
          "research_design",
          "analysis_plan",
        ],
        confidence: llmFallback ? 0.62 : 0.83,
      });
    }

    if (pdfSections.results) {
      snippets.push({
        snippet_id: makeSnippetId("pdf"),
        source_id: source.source_id,
        origin: "pdf",
        label: "Resultados extraidos de PDF",
        text: pdfSections.results,
        section_hint_keys: ["research_antecedents", "state_of_the_art", "justification"],
        confidence: llmFallback ? 0.56 : 0.78,
      });
    }

    if (pdfSections.conclusions) {
      snippets.push({
        snippet_id: makeSnippetId("pdf"),
        source_id: source.source_id,
        origin: "pdf",
        label: "Conclusiones extraidas de PDF",
        text: pdfSections.conclusions,
        section_hint_keys: [
          "research_antecedents",
          "justification",
          "scope_and_limitations",
        ],
        confidence: llmFallback ? 0.55 : 0.75,
      });
    }

    evidencePacks.push({
      source_id: source.source_id,
      problem_signal: problemSignal,
      method_signal: methodSignal,
      context_signal: contextSignal,
      finding_signal: findingSignal,
      limitation_signal: limitationSignal,
      future_line_signal: futureLineSignal,
      abstract_summary: pickFirstNonEmpty(
        llmFallback?.abstract_summary,
        clipText(source.abstract, 900),
      ),
      pdf_summary: pickFirstNonEmpty(pdfSummary, llmFallback?.abstract_summary),
      pdf_sections: pdfSections,
      snippets,
      assets: extractedAssets,
    });
  }

  return {
    evidencePacks,
    assumptionSnippets,
    warnings,
  };
}
