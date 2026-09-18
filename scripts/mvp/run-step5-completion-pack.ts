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
  if (!await fileExists(filePath)) return fallback;
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

function asString(record: AnyRecord | null | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value : null;
}

function asNumber(record: AnyRecord | null | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function relLink(fromDir: string, target: unknown) {
  if (typeof target !== "string" || !target.trim()) return null;
  const absolute = path.isAbsolute(target) ? target : path.resolve(process.cwd(), target);
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

function approveAsset(input: { visual: AnyRecord; source: AnyRecord | null }) {
  const kind = asString(input.visual, "asset_kind") ?? asString(input.source, "asset_kind") ?? "figure";
  const status = asString(input.visual, "localization_status");
  const confidence = asNumber(input.visual, "confidence_100") ?? 0;
  const latexStatus = asString(input.visual, "equation_latex_status");
  const warnings = asArray<string>(input.visual.warnings);

  if (status === "not_found" || status === "failed" || status === "skipped") {
    return {
      decision: "reject",
      representation: "none",
      reason: `visual status ${status ?? "unknown"}`,
    };
  }

  if (kind === "equation") {
    if (latexStatus === "transcribed" && asString(input.visual, "equation_latex")) {
      return {
        decision: "approved",
        representation: "latex",
        reason: "equation transcribed to LaTeX",
      };
    }
    return {
      decision: warnings.length ? "needs_review" : "fallback",
      representation: "fallback_image",
      reason: `equation latex status ${latexStatus ?? "unknown"}`,
    };
  }

  if (status === "localized" && confidence >= 90) {
    return {
      decision: "approved",
      representation: "image",
      reason: "localized visual asset above confidence threshold",
    };
  }

  return {
    decision: "needs_review",
    representation: "image",
    reason: `confidence ${confidence}; status ${status ?? "unknown"}`,
  };
}

function sourceTitle(reference: AnyRecord | null | undefined) {
  return asString(reference, "formatted_reference") ?? asString(reference, "title") ?? "";
}

function sectionLabel(sectionKey: string) {
  return sectionKey.replaceAll("_", " ");
}

function renderAssetCard(outputRoot: string, asset: AnyRecord) {
  const kind = asString(asset, "asset_kind") ?? "asset";
  const latex = asString(asset, "equation_latex");
  const body = relLink(outputRoot, asString(asset, "body_image_path") ?? asString(asset, "cropped_image_path"));
  const context = relLink(outputRoot, asString(asset, "context_image_path"));
  const page = relLink(outputRoot, asString(asset, "page_image_path"));
  const warnings = asArray<string>(asset.warnings);
  const qualityFlags = asArray<string>(asset.quality_flags);
  return [
    `<section class="asset ${htmlEscape(kind)}">`,
    `<h3>${htmlEscape(asset.asset_id)} · ${htmlEscape(kind)} · ${htmlEscape(asset.decision)} · ${htmlEscape(asset.representation)}</h3>`,
    `<p><strong>Fuente:</strong> ${htmlEscape(asset.source_id)} · <strong>Pagina:</strong> ${htmlEscape(asset.page_number)} · <strong>Confianza:</strong> ${htmlEscape(asset.confidence_100 ?? "")} · <strong>Seccion:</strong> ${htmlEscape(asset.section_key ?? "")}</p>`,
    `<p><strong>Motivo:</strong> ${htmlEscape(asset.decision_reason)}</p>`,
    asset.caption_text ? `<p><strong>Caption/titulo:</strong> ${htmlEscape(asset.caption_text)}</p>` : "",
    latex ? `<p><strong>LaTeX:</strong> <code>${htmlEscape(latex)}</code></p><div class="latex">${htmlEscape(latex)}</div>` : "",
    qualityFlags.length ? `<p><strong>Flags:</strong> ${htmlEscape(qualityFlags.join(" | "))}</p>` : "",
    warnings.length ? `<p><strong>Warnings:</strong> ${htmlEscape(warnings.join(" | "))}</p>` : "",
    `<div class="images">`,
    body ? `<figure><figcaption>${kind === "equation" ? "Fallback / crop fuente" : "Asset limpio"}</figcaption><img src="${body}"></figure>` : "",
    context && context !== body ? `<figure><figcaption>Contexto/OCR</figcaption><img src="${context}"></figure>` : "",
    page && page !== context ? `<figure><figcaption>Pagina completa</figcaption><img src="${page}"></figure>` : "",
    `</div>`,
    `</section>`,
  ].filter(Boolean).join("\n");
}

async function main() {
  const runDir = path.resolve(readArg("run-dir") ?? await latestStep5RunDir() ?? "");
  if (!runDir || !await fileExists(runDir)) {
    throw new Error("No Step 5 run dir found. Pass --run-dir=/abs/path/to/step5-run.");
  }

  const manifest = await readJson<AnyRecord>(path.join(runDir, "manifest.json"), {});
  const visualAssets = await readJson<AnyRecord[]>(path.join(runDir, "visual-localized-assets.json"), []);
  const sourceAssets = await readJson<AnyRecord[]>(path.join(runDir, "source-assets.json"), []);
  const evidenceCards = await readJson<AnyRecord[]>(path.join(runDir, "evidence-cards.json"), []);
  const extractionGaps = await readJson<AnyRecord[]>(path.join(runDir, "extraction-gaps.json"), []);
  const references = await readJson<AnyRecord[]>(path.join(runDir, "references.json"), []);
  const pdfMaterializations = await readJson<AnyRecord[]>(path.join(runDir, "pdf-materializations.json"), []);
  const sectionPlan = await readJson<AnyRecord[]>(path.join(runDir, "section-content-plan.json"), []);
  const sourceRegistry = await readJson<AnyRecord[]>(path.join(runDir, "source-registry.json"), []);

  const sourceAssetsById = new Map(sourceAssets.map((asset) => [asString(asset, "asset_id"), asset]));
  const referencesByKey = new Map(references.map((ref) => [asString(ref, "citation_key"), ref]));

  const approvedAssets = visualAssets.map((visual) => {
    const assetId = asString(visual, "asset_id");
    const source = sourceAssetsById.get(assetId) ?? null;
    const decision = approveAsset({ visual, source });
    const citationKey = asString(visual, "citation_key") ?? asString(source, "citation_key");
    return {
      asset_id: assetId,
      source_id: asString(visual, "source_id") ?? asString(source, "source_id"),
      reference_id: asString(visual, "reference_id") ?? asString(source, "reference_id"),
      citation_key: citationKey,
      asset_kind: asString(visual, "asset_kind") ?? asString(source, "asset_kind"),
      page_number: asNumber(visual, "page_number") ?? asNumber(source, "page_number"),
      section_key: asString(visual, "section_key"),
      decision: decision.decision,
      representation: decision.representation,
      decision_reason: decision.reason,
      confidence_100: asNumber(visual, "confidence_100"),
      equation_latex: asString(visual, "equation_latex"),
      equation_latex_status: asString(visual, "equation_latex_status"),
      caption_text: asString(source, "caption_text"),
      body_image_path: asString(source, "body_image_path") ?? asString(source, "structured_path"),
      cropped_image_path: asString(visual, "cropped_image_path"),
      context_image_path: asString(visual, "page_image_path"),
      page_image_path: asString(visual, "fallback_page_image_path") ?? asString(source, "image_path"),
      quality_flags: asArray<string>(source?.quality_flags),
      warnings: [
        ...asArray<string>(visual.warnings),
        ...asArray<string>(source?.warnings).filter((warning) => !/candidate generated/i.test(warning)),
      ],
      citation: citationKey ? {
        inline: asString(referencesByKey.get(citationKey), "inline_citation_hint"),
        reference: sourceTitle(referencesByKey.get(citationKey)),
      } : null,
    };
  });

  const approvedForBlueprint = approvedAssets.filter((asset) => asset.decision === "approved" || asset.decision === "fallback");
  const rejectedAssets = approvedAssets.filter((asset) => asset.decision === "reject");
  const needsReviewAssets = approvedAssets.filter((asset) => asset.decision === "needs_review");

  const evidenceBySection = sectionPlan
    .filter((section) => asString(section, "section_key") !== "references")
    .map((section) => {
      const sectionKey = asString(section, "section_key") ?? "unknown";
      const cards = evidenceCards.filter((card) => asArray<string>(card.assigned_section_keys).includes(sectionKey));
      const assets = approvedForBlueprint.filter((asset) => asset.section_key === sectionKey);
      const sourceIds = Array.from(new Set(cards.map((card) => asString(card, "source_id")).filter(Boolean)));
      return {
        section_key: sectionKey,
        section_label: sectionLabel(sectionKey),
        status: cards.length ? "evidence_available" : "gap_only",
        supporting_source_ids: sourceIds,
        evidence_cards: cards.map((card) => ({
          card_id: asString(card, "card_id"),
          source_id: asString(card, "source_id"),
          citation_key: asString(card, "citation_key"),
          quality_status: asString(card, "quality_status"),
          traceable_summary: asString(card, "traceable_summary"),
          allowed_evidence_use: asString(card, "allowed_evidence_use"),
        })),
        approved_assets: assets.map((asset) => ({
          asset_id: asset.asset_id,
          asset_kind: asset.asset_kind,
          representation: asset.representation,
          source_id: asset.source_id,
          page_number: asset.page_number,
          caption_text: asset.caption_text,
          equation_latex: asset.equation_latex,
        })),
        gaps: extractionGaps
          .filter((gap) => sourceIds.includes(asString(gap, "source_id")))
          .slice(0, 8)
          .map((gap) => ({
            source_id: asString(gap, "source_id"),
            gap: asString(gap, "gap"),
          })),
      };
    });

  const pdfCoverage = pdfMaterializations.map((item) => ({
    source_id: asString(item, "source_id"),
    status: asString(item, "status"),
    page_count: asNumber(item, "page_count"),
    chunk_count: asNumber(item, "chunk_count"),
    warnings: asArray<string>(item.warnings),
  }));
  const missingPdfSources = pdfCoverage.filter((item) => item.status !== "materialized").map((item) => item.source_id);

  const scopeGaps = {
    status: missingPdfSources.length ? "complete_with_declared_gaps" : "complete",
    required_scope_policy: "No afirmar resultados, comparaciones o cobertura no sustentada por fuentes recuperadas.",
    coverage_summary: {
      selected_source_count: manifest.selected_source_count ?? references.length,
      materialized_pdf_count: manifest.materialized_pdf_count,
      source_asset_count: manifest.source_asset_count,
      visual_localized_asset_count: manifest.visual_localized_asset_count,
      approved_asset_count: approvedForBlueprint.length,
      rejected_asset_count: rejectedAssets.length,
      needs_review_asset_count: needsReviewAssets.length,
    },
    source_coverage: pdfCoverage,
    main_constraints: [
      missingPdfSources.length ? `Fuentes sin PDF completo materializado: ${missingPdfSources.join(", ")}.` : null,
      "La evidencia recuperada sostiene mejor amortiguadores viscosos e histereticos que aislamiento sismico.",
      "Las ecuaciones OCR/LaTeX deben conservar fallback visual y ancla de pagina.",
      "Los captions se almacenan como texto; no deben formar parte del crop renderizado final.",
    ].filter(Boolean),
    repeated_gaps: Array.from(new Set(extractionGaps.map((gap) => asString(gap, "gap")).filter(Boolean))).slice(0, 18),
  };

  const handoff = {
    status: "STEP5_COMPLETE_READY_FOR_STEP6",
    run_dir: runDir,
    next_step: "Paso 6 - refinamiento de plan/contenido usando evidencia trazable",
    allowed_inputs_for_step6: {
      references: "references.json",
      evidence_pack: "blueprint-evidence-pack.json",
      approved_assets: "approved-assets.json",
      scope_gaps: "step5-scope-gaps.json",
    },
    hard_rules: [
      "No usar assets rechazados.",
      "Usar ecuaciones aprobadas desde LaTeX; imagen solo como fallback.",
      "Renderizar captions y referencias fuera del crop.",
      "Declarar gaps de cobertura cuando una seccion requiera aislamiento sismico o S2 fulltext.",
      "No inventar resultados ni citas.",
    ],
  };

  const outputRoot = path.join(
    process.cwd(),
    "artifacts-local",
    "step5-completion",
    readArg("label") ?? path.basename(runDir).replaceAll(":", "-"),
  );
  await mkdir(outputRoot, { recursive: true });

  const pack = {
    generated_at: new Date().toISOString(),
    run_dir: runDir,
    project_id: manifest.project_id,
    citation_style: manifest.citation_style ?? "APA7",
    references,
    evidence_by_section: evidenceBySection,
    approved_assets: approvedForBlueprint,
    rejected_assets: rejectedAssets,
    needs_review_assets: needsReviewAssets,
    scope_gaps: scopeGaps,
  };

  await writeFile(path.join(outputRoot, "approved-assets.json"), JSON.stringify({
    generated_at: new Date().toISOString(),
    run_dir: runDir,
    rules: [
      "equation + transcribed latex => approved latex",
      "localized table/figure + confidence >= 90 => approved image",
      "not_found/failed/skipped => reject",
      "other localized/ambiguous cases => needs_review",
    ],
    assets: approvedAssets,
  }, null, 2), "utf8");
  await writeFile(path.join(outputRoot, "blueprint-evidence-pack.json"), JSON.stringify(pack, null, 2), "utf8");
  await writeFile(path.join(outputRoot, "step5-scope-gaps.json"), JSON.stringify(scopeGaps, null, 2), "utf8");
  await writeFile(path.join(outputRoot, "step5-handoff-to-step6.json"), JSON.stringify(handoff, null, 2), "utf8");

  const approvedCards = approvedAssets.map((asset) => renderAssetCard(outputRoot, asset)).join("\n");
  const sectionRows = evidenceBySection.map((section) => [
    "<tr>",
    `<td>${htmlEscape(section.section_key)}</td>`,
    `<td>${htmlEscape(section.status)}</td>`,
    `<td>${htmlEscape(section.supporting_source_ids.join(", "))}</td>`,
    `<td>${htmlEscape(section.approved_assets.map((asset) => asset.asset_id).join(", "))}</td>`,
    `<td>${htmlEscape(section.gaps.length)}</td>`,
    "</tr>",
  ].join("")).join("\n");
  const referenceList = references.map((reference) =>
    `<li><strong>${htmlEscape(asString(reference, "citation_key"))}</strong>: ${htmlEscape(sourceTitle(reference))}</li>`,
  ).join("\n");
  const html = [
    "<!doctype html><html><head><meta charset=\"utf-8\"><title>Ingeniometrix Step 5 Completion</title>",
    "<style>body{font-family:Arial,sans-serif;margin:32px;color:#111;line-height:1.4}h1{font-size:26px}h2{border-top:2px solid #222;padding-top:16px;margin-top:26px}.summary{background:#f4f6f8;border:1px solid #d9dee5;padding:12px;margin-bottom:20px}table{border-collapse:collapse;width:100%;font-size:12px}td,th{border:1px solid #bbb;padding:6px;vertical-align:top}.asset{break-inside:avoid;border-top:1px solid #999;margin-top:18px;padding-top:12px}.images{display:grid;grid-template-columns:1fr 1fr;gap:14px}img{max-width:100%;border:1px solid #ccc;background:white}figcaption{font-weight:700;margin-bottom:4px}code{background:#f3f3f3;padding:1px 3px}.latex{font-family:Georgia,'Times New Roman',serif;font-size:20px;text-align:center;margin:10px 0;padding:12px;border:1px solid #ddd;background:#fff}.reject h3{color:#8a0000}.approved h3{color:#07520c}.needs_review h3{color:#805300}@page{size:Letter;margin:14mm}.asset{page-break-inside:avoid}.images{grid-template-columns:1fr}img{max-height:520px;object-fit:contain}</style>",
    "</head><body>",
    "<h1>Ingeniometrix - Paso 5 Completion Pack</h1>",
    `<div class="summary"><p><strong>Run:</strong> ${htmlEscape(path.basename(runDir))}</p><p><strong>Proyecto:</strong> ${htmlEscape(manifest.project_id)}</p><p><strong>Estado:</strong> STEP5_COMPLETE_READY_FOR_STEP6</p><p><strong>Assets:</strong> ${approvedAssets.length} evaluados · ${approvedForBlueprint.length} aprobados/fallback · ${rejectedAssets.length} rechazados · ${needsReviewAssets.length} en revision</p></div>`,
    "<h2>Resultado Ejecutivo</h2>",
    `<p>${htmlEscape(scopeGaps.required_scope_policy)}</p>`,
    `<ul>${scopeGaps.main_constraints.map((item) => `<li>${htmlEscape(item)}</li>`).join("")}</ul>`,
    "<h2>Referencias</h2>",
    `<ol>${referenceList}</ol>`,
    "<h2>Evidence Pack Por Seccion</h2>",
    `<table><thead><tr><th>Seccion</th><th>Estado</th><th>Fuentes</th><th>Assets aprobados</th><th>Gaps</th></tr></thead><tbody>${sectionRows}</tbody></table>`,
    "<h2>Assets Y Decisiones</h2>",
    approvedCards,
    "<h2>Handoff A Paso 6</h2>",
    `<ul>${handoff.hard_rules.map((rule) => `<li>${htmlEscape(rule)}</li>`).join("")}</ul>`,
    "</body></html>",
  ].join("\n");
  const htmlPath = path.join(outputRoot, "step5-completion-inspection.html");
  await writeFile(htmlPath, html, "utf8");

  const summary = {
    generated_at: new Date().toISOString(),
    run_dir: runDir,
    output_dir: outputRoot,
    html_path: htmlPath,
    artifacts: {
      approved_assets: path.join(outputRoot, "approved-assets.json"),
      blueprint_evidence_pack: path.join(outputRoot, "blueprint-evidence-pack.json"),
      scope_gaps: path.join(outputRoot, "step5-scope-gaps.json"),
      handoff_to_step6: path.join(outputRoot, "step5-handoff-to-step6.json"),
      inspection_html: htmlPath,
    },
    status: handoff.status,
    counts: {
      assets_evaluated: approvedAssets.length,
      approved_or_fallback_assets: approvedForBlueprint.length,
      rejected_assets: rejectedAssets.length,
      needs_review_assets: needsReviewAssets.length,
      sections: evidenceBySection.length,
    },
  };
  await writeFile(path.join(outputRoot, "step5-completion-summary.json"), JSON.stringify(summary, null, 2), "utf8");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
