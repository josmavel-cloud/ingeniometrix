import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type AnyRecord = Record<string, unknown>;

function readArg(name: string) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match?.slice(prefix.length);
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  if (!await fileExists(filePath)) {
    return fallback;
  }
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function htmlEscape(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function compact(value: unknown, max = 900) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function relLink(fromDir: string, target: unknown) {
  if (typeof target !== "string" || !target.trim()) {
    return null;
  }
  const absolute = path.isAbsolute(target) ? target : path.join(process.cwd(), target);
  return path.relative(fromDir, absolute).split(path.sep).join("/");
}

async function latestStep5RunDir() {
  const root = path.join(process.cwd(), "artifacts-local", "mvp-step5-evidence-materialization");
  const projectDirs = await readdir(root, { withFileTypes: true });
  const candidates: Array<{ mtimeMs: number; dir: string }> = [];
  for (const projectDir of projectDirs) {
    if (!projectDir.isDirectory()) continue;
    const projectPath = path.join(root, projectDir.name);
    const runs = await readdir(projectPath, { withFileTypes: true });
    for (const run of runs) {
      if (!run.isDirectory() || !run.name.startsWith("step5-evidence-materialization-")) continue;
      const manifest = path.join(projectPath, run.name, "manifest.json");
      if (!await fileExists(manifest)) continue;
      const stat = await import("node:fs/promises").then((fs) => fs.stat(manifest));
      candidates.push({ mtimeMs: stat.mtimeMs, dir: path.join(projectPath, run.name) });
    }
  }
  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return candidates[0]?.dir ?? null;
}

function recordString(record: AnyRecord, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function recordNumber(record: AnyRecord, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function assetSortKey(asset: AnyRecord) {
  const kind = recordString(asset, "asset_kind") ?? recordString(asset, "kind") ?? "figure";
  const kindRank = kind === "equation" ? 0 : kind === "table" ? 1 : 2;
  return [
    String(kindRank).padStart(2, "0"),
    recordString(asset, "source_id") ?? "",
    String(recordNumber(asset, "page_number") ?? 0).padStart(4, "0"),
    recordString(asset, "asset_id") ?? "",
  ].join(":");
}

function findMatchingBrace(value: string, start: number) {
  let depth = 0;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function renderLatexInline(value: string): string {
  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    if (value.startsWith("\\frac{", index)) {
      const numeratorStart = index + "\\frac".length;
      const numeratorEnd = findMatchingBrace(value, numeratorStart);
      const denominatorStart = numeratorEnd + 1;
      const denominatorEnd = value[denominatorStart] === "{" ? findMatchingBrace(value, denominatorStart) : -1;
      if (numeratorEnd > 0 && denominatorEnd > numeratorEnd) {
        const numerator = value.slice(numeratorStart + 1, numeratorEnd);
        const denominator = value.slice(denominatorStart + 1, denominatorEnd);
        output += `<span class="frac"><span>${renderLatexInline(numerator)}</span><span>${renderLatexInline(denominator)}</span></span>`;
        index = denominatorEnd;
        continue;
      }
    }
    if (value.startsWith("\\left", index)) {
      index += "\\left".length - 1;
      continue;
    }
    if (value.startsWith("\\right", index)) {
      index += "\\right".length - 1;
      continue;
    }
    if (value.startsWith("\\cdot", index)) {
      output += "·";
      index += "\\cdot".length - 1;
      continue;
    }
    if (value.startsWith("\\cos", index)) {
      output += "cos";
      index += "\\cos".length - 1;
      continue;
    }
    if (value.startsWith("\\vartheta", index)) {
      output += "ϑ";
      index += "\\vartheta".length - 1;
      continue;
    }
    const char = value[index];
    if ((char === "_" || char === "^") && index + 1 < value.length) {
      const tag = char === "_" ? "sub" : "sup";
      if (value[index + 1] === "{") {
        const end = findMatchingBrace(value, index + 1);
        if (end > index) {
          output += `<${tag}>${renderLatexInline(value.slice(index + 2, end))}</${tag}>`;
          index = end;
          continue;
        }
      }
      output += `<${tag}>${htmlEscape(value[index + 1])}</${tag}>`;
      index += 1;
      continue;
    }
    if (char === "{" || char === "}") {
      continue;
    }
    output += htmlEscape(char);
  }
  return output;
}

function latexPreview(value: unknown) {
  const latex = typeof value === "string" ? value.trim() : "";
  if (!latex) return "";
  return `<div class="latex-render">${renderLatexInline(latex)}</div>`;
}

async function main() {
  const runDir = path.resolve(readArg("run-dir") ?? await latestStep5RunDir() ?? "");
  if (!runDir || !await fileExists(runDir)) {
    throw new Error("No Step 5 run dir found. Pass --run-dir=/abs/path/to/step5-run.");
  }

  const manifest = await readJson<AnyRecord>(path.join(runDir, "manifest.json"), {});
  const visualAssets = await readJson<AnyRecord[]>(path.join(runDir, "visual-localized-assets.json"), []);
  const sourceAssets = await readJson<AnyRecord[]>(path.join(runDir, "source-assets.json"), []);
  const references = await readJson<AnyRecord[]>(path.join(runDir, "references.json"), []);
  const referencesByKey = new Map(references.map((ref) => [recordString(ref, "citation_key"), ref]));
  const sourceAssetsById = new Map(sourceAssets.map((asset) => [recordString(asset, "asset_id"), asset]));

  const assets = (visualAssets.length ? visualAssets : sourceAssets)
    .slice()
    .sort((left, right) => assetSortKey(left).localeCompare(assetSortKey(right)));

  const runName = path.basename(runDir);
  const outputRoot = path.join(
    process.cwd(),
    "artifacts-local",
    "asset-inspection",
    readArg("label") ?? runName.replaceAll(":", "-"),
  );
  await mkdir(outputRoot, { recursive: true });

  const counts = assets.reduce<Record<string, number>>((acc, asset) => {
    const kind = recordString(asset, "asset_kind") ?? recordString(asset, "kind") ?? "unknown";
    acc[kind] = (acc[kind] ?? 0) + 1;
    return acc;
  }, {});

  const cards = assets.map((asset) => {
    const assetId = recordString(asset, "asset_id") ?? "asset";
    const sourceAsset = sourceAssetsById.get(assetId) ?? {};
    const kind = recordString(asset, "asset_kind") ?? recordString(asset, "kind") ?? recordString(sourceAsset, "asset_kind") ?? "figure";
    const sourceId = recordString(asset, "source_id") ?? recordString(sourceAsset, "source_id") ?? "source";
    const citationKey = recordString(asset, "citation_key") ?? recordString(sourceAsset, "citation_key");
    const reference = citationKey ? referencesByKey.get(citationKey) : null;
    const sourceBodyPath = recordString(sourceAsset, "body_image_path") ?? recordString(sourceAsset, "structured_path");
    const crop = relLink(outputRoot, kind === "equation"
      ? recordString(sourceAsset, "fallback_image_path") ?? sourceBodyPath ?? recordString(asset, "cropped_image_path")
      : sourceBodyPath ?? recordString(asset, "cropped_image_path"));
    const context = relLink(
      outputRoot,
      recordString(asset, "page_image_path") ?? recordString(asset, "fallback_page_image_path") ?? recordString(sourceAsset, "image_path"),
    );
    const page = relLink(outputRoot, recordString(asset, "fallback_page_image_path") ?? recordString(sourceAsset, "image_path"));
    const warnings = Array.isArray(asset.warnings) ? asset.warnings : [];
    const sourceQualityFlags = Array.isArray(sourceAsset.quality_flags) ? sourceAsset.quality_flags : [];
    const captionText = recordString(sourceAsset, "caption_text");
    return [
      `<section class="asset ${htmlEscape(kind)}">`,
      `  <h2>${htmlEscape(assetId)} · ${htmlEscape(kind)} · p. ${htmlEscape(recordNumber(asset, "page_number") ?? recordNumber(sourceAsset, "page_number") ?? "?")} · ${htmlEscape(sourceId)}</h2>`,
      `  <p><strong>Estado:</strong> ${htmlEscape(recordString(asset, "localization_status") ?? recordString(sourceAsset, "status") ?? "review")} · <strong>Confianza:</strong> ${htmlEscape(recordNumber(asset, "confidence_100") ?? recordNumber(sourceAsset, "curation_score_100") ?? "")} · <strong>Sección:</strong> ${htmlEscape(recordString(asset, "section_key") ?? "")}</p>`,
      `  <p><strong>Cita:</strong> ${htmlEscape(reference?.inline_citation_hint ?? citationKey ?? "")}<br>${htmlEscape(reference?.formatted_reference ?? "")}</p>`,
      captionText ? `  <p><strong>Caption/título:</strong> ${htmlEscape(compact(captionText, 700))}</p>` : "",
      `  <p><strong>Descripción:</strong> ${htmlEscape(compact(asset.visual_description_es ?? sourceAsset.nearby_text_excerpt ?? sourceAsset.caption_or_signal_text, 1200))}</p>`,
      kind === "equation"
        ? `  <p><strong>Representación primaria:</strong> LaTeX · <strong>Status:</strong> ${htmlEscape(asset.equation_latex_status ?? "")}</p>${latexPreview(asset.equation_latex)}<p><strong>LaTeX fuente:</strong> <code>${htmlEscape(asset.equation_latex ?? "(sin LaTeX)")}</code></p>`
        : "",
      sourceQualityFlags.length ? `  <p><strong>Flags:</strong> ${htmlEscape(sourceQualityFlags.join(" | "))}</p>` : "",
      warnings.length ? `  <p><strong>Warnings:</strong> ${htmlEscape(warnings.map((item) => compact(item, 200)).join(" | "))}</p>` : "",
      `  <div class="images">`,
      crop ? `    <figure><figcaption>${kind === "equation" ? "Fallback imagen" : "Asset limpio"}</figcaption><a href="${crop}"><img src="${crop}"></a></figure>` : "",
      context ? `    <figure><figcaption>Contexto/OCR</figcaption><a href="${context}"><img src="${context}"></a></figure>` : "",
      page && page !== context ? `    <figure><figcaption>Pagina completa</figcaption><a href="${page}"><img src="${page}"></a></figure>` : "",
      `  </div>`,
      `</section>`,
    ].filter(Boolean).join("\n");
  }).join("\n\n");

  const html = [
    "<!doctype html><html><head><meta charset=\"utf-8\"><title>Step 5 Asset Inspection</title>",
    "<style>body{font-family:Arial,sans-serif;margin:32px;color:#111;line-height:1.4}h1{font-size:26px}.summary{background:#f4f6f8;border:1px solid #d9dee5;padding:12px;margin-bottom:20px}.asset{break-inside:avoid;border-top:2px solid #333;padding-top:16px;margin-top:24px}.images{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}img{max-width:100%;border:1px solid #ccc;background:white}figcaption{font-weight:700;margin-bottom:6px}code{background:#f3f3f3;padding:1px 3px}.latex-render{font-family:Georgia,'Times New Roman',serif;font-size:24px;text-align:center;margin:14px 0;padding:16px;border:1px solid #d6d6d6;background:#fff}.frac{display:inline-flex;flex-direction:column;vertical-align:middle;text-align:center;margin:0 3px}.frac>span:first-child{border-bottom:1px solid #111;padding:0 3px}.frac>span:last-child{padding:0 3px}.equation h2{color:#8a3b00}.table h2{color:#004d70}.figure h2{color:#305400}</style>",
    "</head><body>",
    "<h1>Ingeniometrix Step 5 - Asset Inspection</h1>",
    `<div class="summary"><p><strong>Run:</strong> ${htmlEscape(runName)}</p><p><strong>Run dir:</strong> ${htmlEscape(runDir)}</p><p><strong>Assets:</strong> ${assets.length} ${htmlEscape(JSON.stringify(counts))}</p><p><strong>Source assets total:</strong> ${htmlEscape(manifest.source_asset_count ?? sourceAssets.length)} · <strong>Visual localized:</strong> ${htmlEscape(manifest.visual_localized_asset_count ?? visualAssets.length)}</p></div>`,
    cards,
    "</body></html>",
  ].join("\n");

  const summary = {
    generated_at: new Date().toISOString(),
    run_dir: runDir,
    output_dir: outputRoot,
    html_path: path.join(outputRoot, "step5-asset-inspection.html"),
    asset_count: assets.length,
    counts,
    assets: assets.map((asset) => ({
      asset_id: recordString(asset, "asset_id"),
      source_id: recordString(asset, "source_id"),
      asset_kind: recordString(asset, "asset_kind") ?? recordString(asset, "kind"),
      page_number: recordNumber(asset, "page_number"),
      localization_status: recordString(asset, "localization_status"),
      confidence_100: recordNumber(asset, "confidence_100"),
      section_key: recordString(asset, "section_key"),
      equation_latex: recordString(asset, "equation_latex"),
      equation_latex_status: recordString(asset, "equation_latex_status"),
      warnings: Array.isArray(asset.warnings) ? asset.warnings.map((item) => compact(item, 240)) : [],
      caption_text: recordString(sourceAssetsById.get(recordString(asset, "asset_id") ?? "") ?? {}, "caption_text"),
      quality_flags: Array.isArray(sourceAssetsById.get(recordString(asset, "asset_id") ?? "")?.quality_flags)
        ? sourceAssetsById.get(recordString(asset, "asset_id") ?? "")?.quality_flags
        : [],
      cropped_image_path: recordString(sourceAssetsById.get(recordString(asset, "asset_id") ?? "") ?? {}, "body_image_path") ?? recordString(asset, "cropped_image_path") ?? recordString(sourceAssetsById.get(recordString(asset, "asset_id") ?? "") ?? {}, "structured_path"),
      context_image_path: recordString(asset, "page_image_path") ?? recordString(asset, "fallback_page_image_path"),
      page_image_path: recordString(asset, "fallback_page_image_path") ?? recordString(asset, "page_image_path"),
    })),
  };

  await writeFile(summary.html_path, html, "utf8");
  await writeFile(path.join(outputRoot, "step5-asset-inspection-summary.json"), JSON.stringify(summary, null, 2), "utf8");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
