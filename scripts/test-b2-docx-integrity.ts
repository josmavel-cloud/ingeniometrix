import assert from "node:assert/strict";
import { Document, Packer } from "docx";
import JSZip from "jszip";
import { applyCrossReferenceMentions, applyEditorialPatchToDraft, enforceWordBudgetOnParagraphs, tableBlock, trimTextToWordLimit } from "@/server/mvp/step6-blueprint-docx-service";

async function main() {
  const objective = `Comprender las experiencias y condiciones de la práctica docente: ${"análisis explícito, población y contexto; ".repeat(12)} cierre completo del objetivo.`;
  const methodology = `Diseño propuesto, no ejecutado: ${"selección y análisis pendientes de revisión ética; ".repeat(12)} cierre completo del método.`;
  const question = `¿Cómo se relacionan ${"las experiencias, condiciones y límites del contexto, ".repeat(12)} sin inventar hallazgos?`;
  const cited = `${"La evidencia disponible debe delimitarse prudentemente. ".repeat(15)} (Fuente sintética, 2026).`;
  const paragraphs = [objective, methodology, question, cited].map((text) => text.replace(/\s+/g, " ").trim());
  assert.deepEqual(enforceWordBudgetOnParagraphs(paragraphs, 8), paragraphs);
  assert.equal(trimTextToWordLimit(paragraphs[3], 8), paragraphs[3], "No perder oraciones ni la cita al final por presupuesto");
  const draft = { section_key: "methodology", blocks: paragraphs.map((text) => ({ kind: "paragraph", text })), citation_anchors: [{ paragraph_index: 3, citation_label: "(Fuente sintética, 2026)" }], warnings: [] } as any;
  const withMention = applyCrossReferenceMentions({ drafts: [draft], crossReferences: [{ section_key: "methodology", label: "Tabla 1" }] as any })[0];
  assert.equal(withMention.blocks.length, 4, "Las referencias cruzadas no desplazan indices de parrafos");
  assert.equal((withMention.blocks[3] as any).text, paragraphs[3]);
  const rejected = applyEditorialPatchToDraft({ draft, paragraphs: ["Texto nuevo sin citas"], bulletItems: [], notes: [] });
  assert.deepEqual(rejected.blocks, draft.blocks, "Revision editorial incompatible no sustituye contenido citado");
  const blocks = tableBlock({ kind: "table", title: "Regresión sintética", rows: [["Campo", "Texto"], ["Objetivo", objective], ["Método", methodology], ["Pregunta", question], ["Multilínea", "Primera línea\nSegunda línea con ñ y áéíóú"], ["Citación", cited]], source_note: "Fixture sintético, no evidencia científica.", render_hint: "compact_landscape" }, null);
  const buffer = await Packer.toBuffer(new Document({ sections: [{ children: blocks }] }));
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")!.async("string");
  for (const text of [...paragraphs, "Primera línea", "Segunda línea con ñ y áéíóú"]) assert.ok(xml.includes(text), `DOCX debe preservar texto completo: ${text.slice(-65)}`);
  assert.ok(!xml.includes("..."), "No insertar truncamientos");
  console.log("PASS B2 DOCX: 12 assertions; long objectives/method/questions/citations, multiline, accented characters, paragraph and editorial continuity.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
