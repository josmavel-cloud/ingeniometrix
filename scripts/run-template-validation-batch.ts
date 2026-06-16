import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const WORKSPACE_PYTHON =
  process.env.IMX_WORKSPACE_PYTHON ??
  "C:\\Users\\josma\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe";

const BATCH_ROOT = path.join(process.cwd(), "artifacts-local", "template-validation-batch");
const DOWNLOADS_ROOT = path.join(BATCH_ROOT, "downloads");
const REPORTS_ROOT = path.join(BATCH_ROOT, "reports");
const PREVIEWS_ROOT = path.join(BATCH_ROOT, "previews");

type BatchSource = {
  sourceId: string;
  universityLabel: string;
  kind: "local" | "download";
  sourceType: "docx" | "pdf_native_text";
  documentPath?: string;
  documentUrl?: string;
  assetPath?: string;
  assetUrl?: string;
  assetKey?: string;
};

type VariantResult = {
  variantSeed: number;
  outputDir: string;
  docxPath: string;
  syntheticJsonPath: string;
  canonicalJsonPath: string;
  summaryJsonPath: string;
  validation: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };
  qaIssues: string[];
};

type SourceResult = {
  sourceId: string;
  universityLabel: string;
  sourceType: "docx" | "pdf_native_text";
  templateKey: string;
  templateVersionId: string;
  warnings: string[];
  variants: VariantResult[];
};

const BATCH_SOURCES: BatchSource[] = [
  {
    sourceId: "pucp-civil-plan-sample",
    universityLabel: "PUCP Ingenieria Civil",
    kind: "local",
    sourceType: "pdf_native_text",
    documentPath:
      "C:\\Users\\josma\\Downloads\\a20214687_Cusiquispe_Plan_de_Tesis_FINAL_firmado.pdf",
    assetPath: "C:\\Users\\josma\\Downloads\\logo pucp.png",
    assetKey: "pucp-logo-provided",
  },
  {
    sourceId: "upt-civil-plan-sample",
    universityLabel: "UPT Ingenieria Civil",
    kind: "local",
    sourceType: "docx",
    documentPath:
      "C:\\Users\\josma\\Downloads\\PLAN DE TESIS FINAL - PABLO CIELO MARINA.docx",
    assetPath:
      "C:\\Users\\josma\\Downloads\\universidad-privada-de-tacna-logo-png_seeklogo-205879.png",
    assetKey: "upt-logo-provided",
  },
  {
    sourceId: "uni-plantilla-tesis-apa",
    universityLabel: "UNI Plantilla APA",
    kind: "download",
    sourceType: "docx",
    documentUrl: "https://www.bibliotecavirtual.uni.edu.pe/formatos/plantilla-tesis-apa.docx",
  },
  {
    sourceId: "ucss-plantilla-proyecto-tesis",
    universityLabel: "UCSS Plantilla Proyecto de Tesis",
    kind: "download",
    sourceType: "docx",
    documentUrl:
      "https://www.ucss.edu.pe/images/fia/departamento-investigacion/plantilla-proyecto-tesis.docx",
  },
  {
    sourceId: "ucsm-formatos-posgrado",
    universityLabel: "UCSM Formatos de Proyecto y Tesis",
    kind: "download",
    sourceType: "pdf_native_text",
    documentUrl:
      "https://postgrado.ucsm.edu.pe/wp-content/uploads/2024/07/PL-Formatos-de-Proyecto-De-Investigacio%CC%81n-Tesis-Trabajo-de-Investigacio%CC%81n-y-Cubierta-EPG.pdf",
  },
  {
    sourceId: "ucv-reglamento-grados-titulos",
    universityLabel: "UCV Reglamento Trabajos Conducentes",
    kind: "download",
    sourceType: "pdf_native_text",
    documentUrl:
      "https://webadminportal.ucv.edu.pe/uploads/files/backup/RCU-N--128-2023-UCV-REGLAMENTO-DE-TRABAJOS-CONDUCENTES-A-GRADOS-Y-TITULOS-1.pdf",
  },
  {
    sourceId: "usmp-manual-tesis",
    universityLabel: "USMP Manual de Tesis",
    kind: "download",
    sourceType: "pdf_native_text",
    documentUrl: "https://fia.usmp.edu.pe/wp-content/uploads/2026/01/MANUAL-ELABORACION-TESIS.pdf",
  },
];

function sanitizeSegment(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function extFromUrl(url: string) {
  const pathname = new URL(url).pathname;
  const ext = path.extname(pathname);
  return ext || ".bin";
}

async function downloadFile(url: string, destinationPath: string) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Ingeniometrix template validation bot/0.1",
    },
  });

  if (!response.ok) {
    throw new Error(`No se pudo descargar ${url}: HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  ensureDir(path.dirname(destinationPath));
  fs.writeFileSync(destinationPath, Buffer.from(arrayBuffer));
  return destinationPath;
}

async function resolveLocalFile(source: BatchSource, role: "document" | "asset") {
  const directPath = role === "document" ? source.documentPath : source.assetPath;
  if (directPath) {
    return directPath;
  }

  const url = role === "document" ? source.documentUrl : source.assetUrl;
  if (!url) {
    return null;
  }

  const root = role === "document" ? DOWNLOADS_ROOT : path.join(DOWNLOADS_ROOT, "assets");
  const destinationPath = path.join(root, `${sanitizeSegment(source.sourceId)}${extFromUrl(url)}`);
  if (fs.existsSync(destinationPath)) {
    return destinationPath;
  }

  return downloadFile(url, destinationPath);
}

function runExtractor(input: {
  sourceType: "docx" | "pdf_native_text";
  documentPath: string;
  sourceId: string;
  assetPath?: string | null;
  assetKey?: string;
}) {
  const scriptPath = path.join(process.cwd(), "scripts", "lib", "extract_template_source.py");
  const args = [
    scriptPath,
    "--source-type",
    input.sourceType,
    "--document-path",
    input.documentPath,
    "--source-id",
    input.sourceId,
    "--language",
    "es-PE",
  ];

  if (input.assetPath) {
    args.push("--asset-path", input.assetPath, "--asset-key", input.assetKey ?? "provided-logo");
  }

  const stdout = execFileSync(WORKSPACE_PYTHON, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });

  return JSON.parse(stdout) as Record<string, unknown>;
}

function qaCheckDocx(bundleDocxPath: string) {
  const qaScript = [
    "import sys, zipfile",
    "issues = []",
    "with zipfile.ZipFile(sys.argv[1]) as zf:",
    "    xml = zf.read('word/document.xml').decode('utf-8', 'ignore')",
    "if '\\\\beta' in xml or '\\\\hat' in xml or '\\\\sqrt' in xml:",
    "    issues.append('DOCX contiene LaTeX crudo en word/document.xml.')",
    "if 'Ã' in xml or '\\ufffd' in xml:",
    "    issues.append('DOCX contiene mojibake o caracteres corruptos.')",
    "print('\\n'.join(issues))",
  ].join("\n");

  const output = execFileSync(WORKSPACE_PYTHON, ["-", bundleDocxPath], {
    cwd: process.cwd(),
    input: qaScript,
    encoding: "utf8",
  }).trim();

  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

function loadEnvFile() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
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
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function toMarkdownReport(results: SourceResult[], globalErrors: string[]) {
  const lines: string[] = [
    "# Batch de validacion de plantillas",
    "",
    `Fecha: ${new Date().toISOString()}`,
    "",
  ];

  if (globalErrors.length > 0) {
    lines.push("## Errores globales", "");
    for (const error of globalErrors) {
      lines.push(`- ${error}`);
    }
    lines.push("");
  }

  for (const result of results) {
    lines.push(`## ${result.universityLabel}`, "");
    lines.push(`- Template key: ${result.templateKey}`);
    lines.push(`- Template version id: ${result.templateVersionId}`);
    for (const warning of result.warnings) {
      lines.push(`- Warning de extraccion: ${warning}`);
    }
    for (const variant of result.variants) {
      lines.push(`- Variante ${variant.variantSeed}: ${variant.docxPath}`);
      for (const issue of variant.qaIssues) {
        lines.push(`- QA: ${issue}`);
      }
      for (const warning of variant.validation.warnings) {
        lines.push(`- Validacion: ${warning}`);
      }
      for (const error of variant.validation.errors) {
        lines.push(`- Error: ${error}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function main() {
  loadEnvFile();
  ensureDir(REPORTS_ROOT);
  ensureDir(PREVIEWS_ROOT);

  const { prisma } = await import("@/lib/prisma");
  const { extractTemplateFromSource } = await import(
    "@/server/reporting/template-ingestion/extract-template-from-source"
  );
  const { persistTemplateExtraction } = await import(
    "@/server/reporting/template-ingestion/persist-template-extraction"
  );
  const { generateTemplatePreviewBundle } = await import("@/server/reporting/reporting-engine");
  const { getArtifactsRoot } = await import(
    "@/server/reporting/template-ingestion/local-artifacts"
  );

  async function deleteTemplateByKey(templateKey: string) {
    const existing = await prisma.template.findUnique({
      where: { key: templateKey },
    });

    if (existing) {
      await prisma.template.delete({
        where: { id: existing.id },
      });
    }

    const importDir = path.join(
      getArtifactsRoot(),
      "template-imports",
      sanitizeSegment(templateKey),
    );
    if (fs.existsSync(importDir)) {
      fs.rmSync(importDir, { recursive: true, force: true });
    }

    const previewDir = path.join(PREVIEWS_ROOT, sanitizeSegment(templateKey));
    if (fs.existsSync(previewDir)) {
      fs.rmSync(previewDir, { recursive: true, force: true });
    }
  }

  async function processSource(source: BatchSource) {
    const documentPath = await resolveLocalFile(source, "document");
    if (!documentPath) {
      throw new Error(`No se resolvio documento para ${source.sourceId}.`);
    }

    const assetPath = await resolveLocalFile(source, "asset");
    const rawSource = runExtractor({
      sourceType: source.sourceType,
      documentPath,
      sourceId: source.sourceId,
      assetPath,
      assetKey: source.assetKey,
    });

    const extraction = await extractTemplateFromSource({
      sourceType: source.sourceType,
      source: rawSource as never,
      useLlmAnalysis: true,
      llmRequired: false,
    });

    const templateKey =
      extraction.templateCandidate.template_key_guess ??
      extraction.templateCandidate.template_family;
    await deleteTemplateByKey(templateKey);

    const persisted = await persistTemplateExtraction({
      extraction,
      ownerType: "SYSTEM",
      source: {
        sourceType: source.sourceType,
        source: rawSource as never,
      },
    });

    const templatePreviewRoot = path.join(PREVIEWS_ROOT, sanitizeSegment(templateKey));
    const variants: VariantResult[] = [];
    for (let variantSeed = 1; variantSeed <= 5; variantSeed += 1) {
      const bundle = await generateTemplatePreviewBundle({
        templateVersionId: persisted.version.id,
        outputDir: path.join(templatePreviewRoot, `variant-${String(variantSeed).padStart(2, "0")}`),
        variantSeed,
      });

      const qaIssues = qaCheckDocx(bundle.paths.docx);
      variants.push({
        variantSeed,
        outputDir: bundle.outputDir,
        docxPath: bundle.paths.docx,
        syntheticJsonPath: bundle.paths.syntheticJson,
        canonicalJsonPath: bundle.paths.canonicalJson,
        summaryJsonPath: bundle.paths.summaryJson,
        validation: bundle.validation,
        qaIssues,
      });
    }

    return {
      sourceId: source.sourceId,
      universityLabel: source.universityLabel,
      sourceType: source.sourceType,
      templateKey,
      templateVersionId: persisted.version.id,
      warnings: extraction.templateCandidate.warnings,
      variants,
    } satisfies SourceResult;
  }

  const results: SourceResult[] = [];
  const globalErrors: string[] = [];

  for (const source of BATCH_SOURCES) {
    try {
      results.push(await processSource(source));
    } catch (error) {
      globalErrors.push(
        `${source.sourceId}: ${
          error instanceof Error ? error.message : "Error desconocido en batch."
        }`,
      );
    }
  }

  const reportJsonPath = path.join(REPORTS_ROOT, "template-validation-report.json");
  const reportMdPath = path.join(REPORTS_ROOT, "template-validation-report.md");

  fs.writeFileSync(
    reportJsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        sourcesProcessed: results.length,
        globalErrors,
        results,
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(reportMdPath, toMarkdownReport(results, globalErrors));

  console.log(
    JSON.stringify(
      {
        reportJsonPath,
        reportMdPath,
        sourcesProcessed: results.length,
        globalErrors,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
