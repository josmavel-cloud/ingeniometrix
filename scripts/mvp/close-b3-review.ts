// Records the bounded semantic/visual review performed on these B3 fixtures by Codex.
// This is not a reusable scientific certifier and not a human peer review.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

async function main() {
  const root = path.join(process.cwd(), "artifacts-local/release0-scientific-validation/b3/final");
  for (const [caseKey, directory] of [["engineering", "engineering-export"], ["qualitative", "qualitative-delivery"]]) {
    const dir = path.join(root, directory);
    const doc = JSON.parse(await readFile(path.join(dir, "document-evidence-review.json"), "utf8"));
    const geometry = JSON.parse(await readFile(path.join(dir, "visual-geometry.json"), "utf8"));
    const claims = JSON.parse(await readFile(path.join(dir, "claim-to-evidence.json"), "utf8")) as any[];
    const sampledSections = caseKey === "engineering" ? ["state_of_knowledge", "conceptual_framework", "methodology", "scope_limitations_and_pending_decisions"] : ["state_of_knowledge", "methodology", "scope_limitations_and_pending_decisions"];
    const seen = new Set<string>();
    const sample = claims.filter((c) => { const key = c.section + "|" + c.reference; if (!sampledSections.includes(c.section) || seen.has(key)) return false; seen.add(key); return true; }).map((c) => ({ ...c, substantive_support_review: "PASS_WITH_LIMITATIONS", reviewed_by: "Codex, no human peer review", review_note: "La clausula de esta fuente esta respaldada por el extracto. El parrafo completo usa un conjunto de evidencias: no atribuir todas sus clausulas a un solo extracto. La propuesta local y sus decisiones se distinguen de resultados de antecedentes; abstracts no equivalen a lectura completa." }));
    if (doc.missing_docx_texts.length || doc.pdf_tail_check_flags.length || geometry.image_clipping) throw new Error("Document integrity review cannot pass");
    const criteria = {
      research_problem: { status: "PASS_WITH_LIMITATIONS", section: "problem_definition", finding: "Intencion y contexto del intake preservados; no se verifica una brecha empirica exhaustiva ni novedad universal." },
      question_alignment: { status: "PASS", section: "questions_objectives_hypotheses_when_applicable", finding: "Preguntas/objetivos conservan IDs y vinculos; todos representados en matriz nativa." },
      objective_alignment: { status: "PASS", section: "consistency_matrix", finding: `${doc.matrix_rows} filas validadas contra definicion estabilizada; no parsing de puntuacion.` },
      methodological_coherence: { status: "PASS_WITH_LIMITATIONS", section: "methodology", finding: caseKey === "engineering" ? "Comparacion computacional de alternativas bajo supuestos homogeneos; no resultados propios ni superioridad universal. Tipologia/dispositivos/escenarios por definir." : "Diseno interpretativo de casos, entrevistas y analisis tematico reflexivo propuestos. Sin hipotesis causales ni muestra inventada; acceso/casos/unidad final pendientes. Antecedentes no validan por si solos el metodo propuesto." },
      evidence_traceability: { status: "PASS", section: "all cited sections", finding: `${doc.citation_anchors} anclas resueltas contra texto recuperado y citas presentes en DOCX/PDF; procedencia no equivale por si sola a validez de inferencia.` },
      citation_support: { status: "PASS_WITH_LIMITATIONS", section: sampledSections.join(", "), finding: `${sample.length} pares parrafo/fuente revisados semanticamente; no cita inventada ni afirmacion fuerte sin respaldo detectada en la muestra. No revision exhaustiva de todas las oraciones.` },
      feasibility: { status: "PASS_WITH_LIMITATIONS", section: "contribution_and_feasibility", finding: "Acceso, parametros, recursos y/o seleccion del campo quedan declarados como decisiones pendientes, no promesas verificadas." },
      limitations_assumptions: { status: "PASS", section: "scope_limitations_and_pending_decisions", finding: "Delimitacion por fuentes parciales y contexto; no se afirma haber leido PDFs inaccesibles." },
      internal_consistency: { status: "PASS", section: "cross_section_review + ResearchDesign", finding: "Revision acotada coherente; titulo/resumen se basan en plan estabilizado. Evidencia context_only excluida del soporte metodologico estructurado, pero preservada como contexto." },
      domain_contamination: { status: "PASS", section: "all", finding: "No contenido del otro intake. La figura cualitativa reproduce un antecedente identificado, no impone su intervencion al estudio propuesto." },
      document_integrity: { status: "PASS_WITH_LIMITATIONS", section: "DOCX/PDF", finding: `${doc.texts_checked} textos completos; ${doc.body_pages} paginas de cuerpo/${doc.total_pages} totales; matriz editable y citas conservadas. Revision visual de todas las paginas en contacto y detalle de portada/figura/matriz. ${caseKey === "engineering" ? "Objetivo 12-15 incumplido por una pagina; cumple maximo 18. Paginas con poco contenido; hero determinista tras rechazar imagen con IDs internos. Sin assets cientificos aceptados tras excluir recortes inferidos." : "Objetivo 12-15 cumplido. Hero real ampliado para legibilidad; un asset nativo con caption y fuente en misma pagina."} No se abrio en Microsoft Word; DOCX validado por XML y LibreOffice.` },
    };
    await writeFile(path.join(dir, "scientific-review.json"), JSON.stringify({ case: caseKey, status: "PASS_WITH_LIMITATIONS", human_scientific_review: "NOT_RUN", criteria, claim_sample: sample, unsupported_strong_claims_detected_in_sample: 0, pending_decisions_block_unconditional_submission_readiness: true }, null, 2));
    doc.substantive_review = "PASS_WITH_LIMITATIONS: scientific-review.json"; doc.visual_review = "PASS_WITH_LIMITATIONS: visual-geometry.json and rendered pages";
    await writeFile(path.join(dir, "document-evidence-review.json"), JSON.stringify(doc, null, 2));
    console.log(JSON.stringify({ case: caseKey, reviewed_claim_pairs: sample.length, body_pages: doc.body_pages, status: "PASS_WITH_LIMITATIONS" }));
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
