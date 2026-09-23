import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { LlmProvider } from "@/llm/provider";
import type { MvpStep5EvidenceLedger } from "./evidence-materialization-types";
import type { MvpStep6SectionDraft, MvpStep6SectionPlanItem, MvpStep6TitlePlan } from "./step6-blueprint-docx-types";
import { inspectableEvidence } from "./evidence-continuity";
import { assessEvidenceCoverage, permitsMethodologicalSupport } from "./evidence-coverage";
import { consistencyMatrixSchema, consistencyTableRows, definitionSchema, evidencePointerSchema, MVP_DOCUMENT_SECTIONS, normalizeConsistencyMatrix, objectiveSchema, questionSchema, researchDesignSchema, SECTION_BUDGETS, validateResearchDefinition } from "./research-plan-contracts";
import { SCIENTIFIC_PLAN_PROMPT as LEGACY_SCIENTIFIC_PLAN_PROMPT, SCIENTIFIC_TASKS as LEGACY_SCIENTIFIC_TASKS } from "./prompts/scientific-plan.v4";
import { SCIENTIFIC_PLAN_LATAM_COMPACT_PROMPT, SCIENTIFIC_TASKS_LATAM_COMPACT } from "./prompts/scientific-plan-latam-compact.v1";
import { CONSISTENCY_MATRIX_PROMPT } from "./prompts/consistency-matrix.v1";
import { compactSectionToBudget } from "./section-budget";
import { stageCheckpoint, stableJson } from "./job-execution-context";
import { generationBudget, GENERATION_POLICY_VERSION, priorSectionsForPhase, SCIENTIFIC_MODEL } from "./generation-budgets";
import type { DesignAlternative } from "./scientific-decision-contracts";
import { APPROVED_SCIENTIFIC_PLAN_LATAM_COMPACT_PROMPT, APPROVED_SCIENTIFIC_PLAN_PROMPT } from "./prompts/scientific-plan-approved.v1";
import { LATAM_COMPACT_GENERATION_ORDER, latamCompactSectionPlan, validateLatamCompactDefinition } from "./document-profiles/latam-compact-v1";
import { SCIENTIFIC_DOCUMENT_CITATION_REPAIR_PROMPT } from "./prompts/scientific-document-citation-repair.v1";
import { claimJobControlSlot } from "./job-execution-context";

const paragraphSchema = z.object({ text: z.string().min(1), citations: z.array(evidencePointerSchema) });
const narrativeSchema = z.object({ paragraphs: z.array(paragraphSchema).min(1), assumptions: z.array(z.string()), limitations: z.array(z.string()) });
const problemSchema = narrativeSchema.extend({ problem: z.string().min(1) });
const questionsSchema = z.object({ questions: z.array(questionSchema).min(1) });
const objectivesSchema = z.object({ objectives: z.array(objectiveSchema).min(1), hypotheses_or_propositions: definitionSchema.shape.hypotheses_or_propositions });
const reviewSchema = z.object({ critical_issues: z.array(z.string()), warnings: z.array(z.string()), checked_dimensions: z.array(z.string()) });
const titleSchema = z.object({ title: z.string(), short_title: z.string(), rationale: z.string(), keywords: z.array(z.string()), warnings: z.array(z.string()) });
const citationRepairSchema = z.object({
  sections: z.object({
    state_of_knowledge: narrativeSchema,
    conceptual_framework: narrativeSchema,
    methodology: narrativeSchema,
  }),
  matrix: consistencyMatrixSchema,
  methodological_support: z.array(evidencePointerSchema),
  corrected_findings: z.array(z.string()),
  unresolved_critical_issues: z.array(z.string()),
});
export function scientificSectionPlan(definition?: z.infer<typeof definitionSchema>, design?: z.infer<typeof researchDesignSchema>): MvpStep6SectionPlanItem[] {
  return latamCompactSectionPlan(definition, design);
}

const legacyLabels: Record<string, string> = { executive_summary: "Resumen ejecutivo", problem_definition: "Definicion del problema", state_of_knowledge: "Estado del conocimiento", conceptual_framework: "Marco conceptual", questions_objectives_hypotheses_when_applicable: "Preguntas y objetivos de investigacion", methodology: "Metodologia", consistency_matrix: "Matriz de consistencia", contribution_and_feasibility: "Contribucion y factibilidad", scope_limitations_and_pending_decisions: "Alcances, limitaciones y decisiones pendientes", references: "Referencias" };

// The provider returns citation pointers as the semantic authority. Some models
// also echo author-year citations in prose. Strip only trailing author-year
// groups before appending the deterministic labels so the public document does
// not contain duplicated or provider-formatted citations.
export function appendDeterministicCitationLabels(text: string, labels: string[]) {
  let normalized = text.trim();
  const trailingAuthorYearGroup = /\s*\((?=[^()]*,\s*(?:19|20)\d{2}[a-z]?\b)(?![^()]*=)[^()]+\)\.?\s*$/iu;
  while (trailingAuthorYearGroup.test(normalized)) {
    normalized = normalized.replace(trailingAuthorYearGroup, "").replace(/[;,\s]+$/, "").trim();
  }
  normalized = normalized.replace(/[;,]+$/, "").trim();
  const uniqueLabels = [...new Set(labels.map((label) => label.trim()).filter(Boolean))];
  if (!uniqueLabels.length) return normalized;
  return `${[normalized, ...uniqueLabels].filter(Boolean).join(" ").replace(/[.]+$/, "")}.`;
}
function legacyScientificSectionPlan(): MvpStep6SectionPlanItem[] {
  return MVP_DOCUMENT_SECTIONS.filter((key) => key !== "cover").map((key, i) => ({ section_key: key, title: legacyLabels[key], level: 1, order: i + 1, priority: "required", purpose: legacyLabels[key], min_words: SECTION_BUDGETS[key][0], max_words: SECTION_BUDGETS[key][1], output_modes: key === "references" ? ["references"] : key === "consistency_matrix" ? ["native_table"] : ["narrative"], evidence_section_keys: [], required_source_count: 0, allowed_claim_types: ["proposed_research", "supported_literature"], claims_to_avoid: ["fabricated_findings"], asset_policy: { allow_figures: true, allow_equations: true, allow_tables: true, max_assets: 1 }, fallback_policy: "Declarar decisiones pendientes." }));
}

export function prepareCitationLabels(ledger: MvpStep5EvidenceLedger) {
  const labels = new Map<string, typeof ledger.source_registry>();
  for (const source of ledger.source_registry) {
    const authors = source.authors.map((author) => author.trim().split(/\s+/).at(-1));
    const author = authors.length > 2 ? `${authors[0]} et al.` : authors.join(" & ");
    const key = `${author}, ${source.year ?? "s. f."}`;
    labels.set(key, [...(labels.get(key) ?? []), source]);
  }
  return ledger.source_registry.map((source) => {
    const [key, group] = [...labels].find(([, group]) => group.includes(source))!;
    const suffix = group.length > 1 ? String.fromCharCode(97 + group.indexOf(source)) : "";
    const reference = ledger.references.find((ref) => ref.reference_id === source.reference_id)!;
    return { ...source, citation_label: `(${key}${suffix})`, formatted_reference: reference.formatted_reference.replace(`(${source.year}).`, `(${source.year}${suffix}).`) };
  });
}

export async function generateScientificPlan(input: { provider: LlmProvider; projectId: string; runId: string; intake: unknown; ledger: MvpStep5EvidenceLedger; artifactDir: string; approvedDesign?: DesignAlternative; documentProfile?: "legacy-release0" | "latam-compact-v1" }) {
  const compactProfile = input.documentProfile === "latam-compact-v1";
  const scientificPrompt = input.approvedDesign
    ? compactProfile ? APPROVED_SCIENTIFIC_PLAN_LATAM_COMPACT_PROMPT : APPROVED_SCIENTIFIC_PLAN_PROMPT
    : compactProfile ? SCIENTIFIC_PLAN_LATAM_COMPACT_PROMPT : LEGACY_SCIENTIFIC_PLAN_PROMPT;
  const scientificTasks = compactProfile ? SCIENTIFIC_TASKS_LATAM_COMPACT : LEGACY_SCIENTIFIC_TASKS;
  const coverage = assessEvidenceCoverage(input.ledger);
  if (coverage.status === "INSUFFICIENT") throw new Error("INSUFFICIENT_EVIDENCE_COVERAGE");
  const sources = prepareCitationLabels(input.ledger);
  const evidence = inspectableEvidence(input.ledger).map(({ item, basis }) => ({ source_id: item.source_id, evidence_id: item.evidence_id, section_key: item.section_key, summary: item.traceable_summary_es, excerpt: item.supporting_excerpt, evidence_level: basis, allowed_use: item.allowed_use, citation_label: sources.find((s) => s.source_id === item.source_id)!.citation_label }));
  const validPointers = new Set(evidence.map((e) => `${e.source_id}:${e.evidence_id}`));
  const checkPointers = (pointers: z.infer<typeof evidencePointerSchema>[]) => { if (pointers.some((p) => !validPointers.has(`${p.source_id}:${p.evidence_id}`))) throw new Error("UNKNOWN_EVIDENCE_POINTER"); };
  const sections: Record<string, z.infer<typeof narrativeSchema>> = {};
  let definition: Record<string, unknown> = input.approvedDesign ? structuredClone(input.approvedDesign.definition) : {};
  let design: unknown = input.approvedDesign?.research_design ?? null;
  const promptInventory: unknown[] = [];
  const sequence: string[] = [];
  await mkdir(input.artifactDir, { recursive: true });
  async function call<S extends z.ZodType>(phase: keyof typeof SCIENTIFIC_TASKS_LATAM_COMPACT, schema: S, extra: object = {}): Promise<z.infer<S>> {
    const sectionBudget = generationBudget(phase, compactProfile ? "latam-compact-v1" : "legacy-release0");
    const upstream = priorSectionsForPhase(phase, sections);
    if (JSON.stringify(evidence).length > sectionBudget.evidence_context_budget || JSON.stringify(upstream).length > sectionBudget.prior_context_budget) throw new Error("USER_ACTION_REQUIRED: scientific context exceeds safe profile; no evidence silently discarded");
    const context = { intake: input.intake, stable_definition: definition, research_design: design, evidence: phase === "final_title" || phase === "executive_summary" ? [] : evidence, coverage, upstream_sections: upstream, word_budget: sectionBudget.target_words === null ? null : [sectionBudget.target_words, sectionBudget.max_words], section_budget: sectionBudget, document_profile: compactProfile ? "latam-compact-v1" : "legacy-release0", ...extra };
    const prompt = `${scientificPrompt.systemPrompt}\n\n${scientificPrompt.userPromptTemplate.replace("{{task}}", scientificTasks[phase]).replace("{{context_json}}", stableJson(context))}`;
    const schemaJson = z.toJSONSchema(schema);
    const maxOutputTokens = sectionBudget.max_output_tokens;
    const output = schema.parse(await stageCheckpoint(phase === "research_design" ? "RESEARCH_DESIGN" : phase === "cross_section_review" ? "SCIENTIFIC_REVIEW" : `SECTION_DRAFTS:${phase}`, { prompt, schemaJson, model: SCIENTIFIC_MODEL, maxOutputTokens, policy: GENERATION_POLICY_VERSION }, async () => schema.parse(await input.provider.generateStructuredObject({ prompt, schema: schemaJson, schemaName: `b3_${phase}`, model: SCIENTIFIC_MODEL, maxOutputTokens, trackingAttribution: { projectId: input.projectId, runId: input.runId, promptVersion: scientificPrompt.version, schemaName: `b3_${phase}`, stage: "blueprint_generation" } }))));
    const budget = sectionBudget.max_words === null ? null : [sectionBudget.target_words ?? sectionBudget.max_words, sectionBudget.max_words] as const;
    if (budget && output && typeof output === "object" && "paragraphs" in output) {
      const original = narrativeSchema.parse(output);
      original.paragraphs.forEach((p) => checkPointers(p.citations));
      const compacted = await compactSectionToBudget({ provider: input.provider, section: phase, maxWords: budget[1], paragraphs: original.paragraphs, projectId: input.projectId, runId: input.runId }).catch((error) => {
        if (!(error instanceof Error) || !error.message.includes("CHANGED_EVIDENCE")) throw error;
        return { paragraphs: original.paragraphs, prompt_record: { phase, warning: "EDITORIAL_REJECTED_CHANGED_EVIDENCE: original scientific text retained", budget_unresolved: true } };
      });
      if (compacted.prompt_record) {
        await writeFile(path.join(input.artifactDir, `${phase}-before-compaction.json`), JSON.stringify(output, null, 2));
        output.paragraphs = compacted.paragraphs;
        promptInventory.push(compacted.prompt_record);
      }
    }
    sequence.push(phase);
    promptInventory.push({ phase, ...scientificPrompt, task: scientificTasks[phase], dynamic_variables: Object.keys(context), model: SCIENTIFIC_MODEL, max_output_tokens: maxOutputTokens, retry_policy: "provider configured bounded retries; acceptance 0", message_arrangement: "single concatenated Responses input", schema: schemaJson });
    await writeFile(path.join(input.artifactDir, `${phase}.json`), JSON.stringify(output, null, 2));
    return output;
  }
  sections.state_of_knowledge = await call("evidence_synthesis", narrativeSchema);
  const problem = await call("problem_definition", problemSchema);
  if (input.approvedDesign && problem.problem !== input.approvedDesign.definition.problem) throw new Error("DESIGN_APPROVAL_CONTRADICTION: la formulación del problema cambió; revisar de forma localizada.");
  definition.problem = problem.problem; sections.problem_definition = problem;
  if (input.approvedDesign) {
    // Preserve the approved semantic objects. No paid re-selection of questions,
    // objectives or design after the researcher has confirmed them.
    sequence.push("research_questions", "objectives_and_optional_hypotheses");
    await stageCheckpoint("SECTION_DRAFTS:research_questions", { approved: input.approvedDesign.definition.questions }, async () => ({ questions: input.approvedDesign!.definition.questions }));
    await stageCheckpoint("SECTION_DRAFTS:objectives_and_optional_hypotheses", { approved: input.approvedDesign.definition }, async () => ({ objectives: input.approvedDesign!.definition.objectives, hypotheses_or_propositions: input.approvedDesign!.definition.hypotheses_or_propositions }));
    await writeFile(path.join(input.artifactDir, "approved-scientific-design.json"), JSON.stringify(input.approvedDesign, null, 2));
  } else {
    Object.assign(definition, await call("research_questions", questionsSchema));
    Object.assign(definition, await call("objectives_and_optional_hypotheses", objectivesSchema));
  }
  const stableDefinition = definitionSchema.parse(definition); validateResearchDefinition(stableDefinition); if (compactProfile) validateLatamCompactDefinition(stableDefinition);
  sections.conceptual_framework = await call("conceptual_framework", narrativeSchema);
  const researchDesign = input.approvedDesign ? researchDesignSchema.parse(await stageCheckpoint("RESEARCH_DESIGN", { approved: input.approvedDesign }, async () => input.approvedDesign!.research_design)) : await call("research_design", researchDesignSchema);
  if (input.approvedDesign) sequence.push("research_design");
  checkPointers(researchDesign.methodological_support);
  const excludedSupport: unknown[] = [];
  const methodSupport = (pointers: z.infer<typeof evidencePointerSchema>[], consumer: string) => pointers.filter((p) => {
    const item = evidence.find((e) => e.source_id === p.source_id && e.evidence_id === p.evidence_id)!;
    if (permitsMethodologicalSupport(item.allowed_use)) return true;
    excludedSupport.push({ ...p, consumer, allowed_use: item.allowed_use, reason: "Contextual evidence cannot certify methodological rationale" });
    return false;
  });
  researchDesign.methodological_support = methodSupport(researchDesign.methodological_support, "ResearchDesign");
  design = researchDesign;
  sections.methodology = await call("methodology", narrativeSchema);
  if (!compactProfile) {
    sections.contribution_and_feasibility = await call("contribution_and_feasibility", narrativeSchema);
    sections.scope_limitations_and_pending_decisions = await call("scope_limitations_and_pending_decisions", narrativeSchema);
  }
  const matrixContext = { normalized_intake: input.intake, definition, research_design: design, stabilized_sections: sections, methodological_evidence: evidence };
  const matrixPrompt = `${CONSISTENCY_MATRIX_PROMPT.systemPrompt}\n\n${CONSISTENCY_MATRIX_PROMPT.userPromptTemplate.replace("{{context_json}}", stableJson(matrixContext))}`;
  let matrix = await stageCheckpoint("CONSISTENCY_MATRIX", { matrixPrompt, schema: z.toJSONSchema(consistencyMatrixSchema), model: CONSISTENCY_MATRIX_PROMPT.model, policy: GENERATION_POLICY_VERSION }, async () => normalizeConsistencyMatrix(await input.provider.generateStructuredObject({ prompt: matrixPrompt, schemaName: "b3_consistency_matrix", schema: z.toJSONSchema(consistencyMatrixSchema), model: CONSISTENCY_MATRIX_PROMPT.model, maxOutputTokens: CONSISTENCY_MATRIX_PROMPT.max_output_tokens, trackingAttribution: { projectId: input.projectId, runId: input.runId, promptVersion: CONSISTENCY_MATRIX_PROMPT.version, stage: "blueprint_generation" } }), stableDefinition, researchDesign));
  matrix.rows.forEach((row) => checkPointers(row.rationale_evidence));
  matrix.rows.forEach((row, index) => { row.rationale_evidence = methodSupport(row.rationale_evidence, `matrix:${index}`); });
  await writeFile(path.join(input.artifactDir, "methodological-evidence-policy.json"), JSON.stringify({ excluded_support: excludedSupport, substantive_context_preserved: true }, null, 2));
  sequence.push("consistency_matrix"); promptInventory.push({ phase: "consistency_matrix", ...CONSISTENCY_MATRIX_PROMPT, message_arrangement: "single concatenated Responses input", schema: z.toJSONSchema(consistencyMatrixSchema) });
  await writeFile(path.join(input.artifactDir, "consistency-matrix.json"), JSON.stringify(matrix, null, 2));
  let review = await call("cross_section_review", reviewSchema, { consistency_matrix: matrix });
  if (review.critical_issues.length && compactProfile) {
    const repairContext = { critical_findings: review.critical_issues, definition: stableDefinition, research_design: researchDesign, sections: { state_of_knowledge: sections.state_of_knowledge, conceptual_framework: sections.conceptual_framework, methodology: sections.methodology }, matrix, inspectable_evidence: evidence };
    const repairPrompt = `${SCIENTIFIC_DOCUMENT_CITATION_REPAIR_PROMPT.systemPrompt}\n\n${SCIENTIFIC_DOCUMENT_CITATION_REPAIR_PROMPT.userPromptTemplate.replace("{{context_json}}", stableJson(repairContext))}`;
    const repairSchema = z.toJSONSchema(citationRepairSchema);
    const repaired = citationRepairSchema.parse(await stageCheckpoint("SCIENTIFIC_CITATION_REPAIR", { repairPrompt, repairSchema, model: SCIENTIFIC_DOCUMENT_CITATION_REPAIR_PROMPT.model, version: SCIENTIFIC_DOCUMENT_CITATION_REPAIR_PROMPT.version }, async () => {
      const slot = await claimJobControlSlot("g3-scientific-citation-repair", 1);
      if (!slot) throw new Error(`SCIENTIFIC_REVIEW_BLOCKED: ${review.critical_issues.join("; ")}`);
      return input.provider.generateStructuredObject({ prompt: repairPrompt, schema: repairSchema, schemaName: "rc4_g3_scientific_citation_repair_v1", model: SCIENTIFIC_DOCUMENT_CITATION_REPAIR_PROMPT.model, maxOutputTokens: SCIENTIFIC_DOCUMENT_CITATION_REPAIR_PROMPT.max_output_tokens, trackingAttribution: { projectId: input.projectId, runId: input.runId, promptVersion: SCIENTIFIC_DOCUMENT_CITATION_REPAIR_PROMPT.version, stage: "scientific_citation_repair" } });
    }));
    const unresolvedAttribution = repaired.unresolved_critical_issues.filter((issue) => /\b(?:cita|atribuci[oó]n|evidencia|respaldo|puntero|fuente\s+(?:no|sin)\s+sustento)\b/i.test(issue));
    if (unresolvedAttribution.length) throw new Error(`SCIENTIFIC_REPAIR_UNRESOLVED: ${unresolvedAttribution.join("; ")}`);
    review.warnings.push(...repaired.unresolved_critical_issues.map((issue) => `DECISION_PENDIENTE_CONSERVADA: ${issue}`));
    for (const repairedSection of Object.values(repaired.sections)) repairedSection.paragraphs.forEach((paragraph) => checkPointers(paragraph.citations));
    const originalSupport = new Set(researchDesign.methodological_support.map((item) => `${item.source_id}:${item.evidence_id}`));
    checkPointers(repaired.methodological_support);
    const retainedMethodologicalSupport = repaired.methodological_support.filter((item) => originalSupport.has(`${item.source_id}:${item.evidence_id}`));
    if (retainedMethodologicalSupport.length < repaired.methodological_support.length) review.warnings.push("SCIENTIFIC_REPAIR_DISCARDED_UNAPPROVED_METHOD_SUPPORT");
    sections.state_of_knowledge = repaired.sections.state_of_knowledge;
    sections.conceptual_framework = repaired.sections.conceptual_framework;
    sections.methodology = repaired.sections.methodology;
    researchDesign.methodological_support = retainedMethodologicalSupport;
    matrix = normalizeConsistencyMatrix(repaired.matrix, stableDefinition, researchDesign);
    matrix.rows.forEach((row) => row.rationale_evidence.forEach((pointer) => checkPointers([pointer])));
    await writeFile(path.join(input.artifactDir, "scientific-citation-repair.json"), JSON.stringify(repaired, null, 2));
    promptInventory.push({ phase: "scientific_citation_repair", ...SCIENTIFIC_DOCUMENT_CITATION_REPAIR_PROMPT, message_arrangement: "single concatenated Responses input", schema: repairSchema });
    const repairedReviewContext = { intake: input.intake, stable_definition: stableDefinition, research_design: researchDesign, evidence, coverage, upstream_sections: sections, consistency_matrix: matrix, repair_findings: repaired.corrected_findings };
    const repairedReviewPrompt = `${scientificPrompt.systemPrompt}\n\n${scientificPrompt.userPromptTemplate.replace("{{task}}", scientificTasks.cross_section_review).replace("{{context_json}}", stableJson(repairedReviewContext))}`;
    const repairedReviewSchema = z.toJSONSchema(reviewSchema);
    review = reviewSchema.parse(await stageCheckpoint("SCIENTIFIC_REVIEW_REPAIR", { repairedReviewPrompt, repairedReviewSchema, model: SCIENTIFIC_MODEL, policy: GENERATION_POLICY_VERSION }, async () => input.provider.generateStructuredObject({ prompt: repairedReviewPrompt, schema: repairedReviewSchema, schemaName: "rc4_g3_cross_section_repair_review", model: SCIENTIFIC_MODEL, maxOutputTokens: generationBudget("cross_section_review", "latam-compact-v1").max_output_tokens, trackingAttribution: { projectId: input.projectId, runId: input.runId, promptVersion: scientificPrompt.version, stage: "scientific_citation_repair" } })));
    sequence.push("scientific_citation_repair", "scientific_review_repair");
  }
  if (review.critical_issues.length) throw new Error(`SCIENTIFIC_REVIEW_BLOCKED: ${review.critical_issues.join("; ")}`);
  const title = await call("final_title", titleSchema, { consistency_matrix: matrix });
  sections.executive_summary = await call("executive_summary", narrativeSchema, { final_title: title.title, consistency_matrix: matrix });
  const plan = compactProfile ? scientificSectionPlan(stableDefinition, researchDesign) : legacyScientificSectionPlan();
  const drafts: MvpStep6SectionDraft[] = plan.map((section) => {
    const narrativeKey = section.section_key === "research_questions" || section.section_key === "objectives_hypotheses" || section.section_key === "questions_objectives_hypotheses_when_applicable" || section.section_key === "consistency_matrix" || section.section_key === "final_methodological_infographic" || section.section_key === "references" ? null : section.section_key;
    const narrative = narrativeKey ? sections[narrativeKey] : undefined;
    const anchors: MvpStep6SectionDraft["citation_anchors"] = [];
    const blocks: MvpStep6SectionDraft["blocks"] = [];
    narrative?.paragraphs.forEach((paragraph, index) => {
      checkPointers(paragraph.citations);
      const citationLabels = [...new Set(paragraph.citations.map((p) => sources.find((s) => s.source_id === p.source_id)!.citation_label))];
      const text = appendDeterministicCitationLabels(paragraph.text, citationLabels);
      if (/\b(?:blueprint|preliminary|preliminar|readiness|pipeline|artefacto|runId|source_id|evidence_id)\b/i.test(text)) throw new Error(`PUBLIC_JARGON: ${section.section_key}`);
      blocks.push({ kind: "paragraph", text });
      anchors.push(...paragraph.citations.map((p) => ({ section_key: section.section_key, block_id: `${section.section_key}:paragraph:${index}`, paragraph_index: index, sentence_index: null, ...p, snippet_id: null, citation_label: sources.find((s) => s.source_id === p.source_id)!.citation_label, claim_summary: paragraph.text })));
    });
    if (section.section_key === "research_questions") blocks.push({ kind: "bullet_list", items: stableDefinition.questions.map((q) => `${q.kind === "general" ? "Pregunta general" : "Pregunta especifica"}: ${q.text}`) });
    if (section.section_key === "objectives_hypotheses") {
      const generalQuestionId = stableDefinition.questions.find((q) => q.kind === "general")!.id;
      blocks.push({ kind: "bullet_list", items: [
        ...stableDefinition.objectives.map((objective) => `${objective.question_ids.includes(generalQuestionId) ? "Objetivo general" : "Objetivo especifico"}: ${objective.text}`),
        ...stableDefinition.hypotheses_or_propositions.map((item) => `${researchDesign.approach === "qualitative" || researchDesign.approach === "theoretical" ? "Proposicion" : "Hipotesis"}: ${item.text}`),
      ] });
    }
    if (section.section_key === "questions_objectives_hypotheses_when_applicable") blocks.push({ kind: "bullet_list", items: [...stableDefinition.questions.map((q) => q.text), ...stableDefinition.objectives.map((o) => o.text), ...stableDefinition.hypotheses_or_propositions.map((h) => h.text)] });
    if (section.section_key === "consistency_matrix") {
      if (matrix.synthesis) blocks.push({ kind: "paragraph", text: matrix.synthesis });
      blocks.push({ kind: "table", title: "Matriz de consistencia de la investigacion", rows: consistencyTableRows(matrix, stableDefinition, researchDesign), source_note: "Fuente: elaboracion propia a partir del diseno de investigacion propuesto.", render_hint: "compact_landscape" });
      const pointers = matrix.rows.flatMap((row) => row.rationale_evidence);
      const supportText = "Antecedentes metodológicos considerados: " + [...new Set(pointers.map((p) => sources.find((s) => s.source_id === p.source_id)!.citation_label))].join("; ") + ".";
      if (pointers.length) {
        blocks.push({ kind: "paragraph", text: supportText });
        anchors.push(...pointers.map((p) => ({ section_key: section.section_key, block_id: "consistency_matrix:support", paragraph_index: matrix.synthesis ? 1 : 0, sentence_index: null, ...p, snippet_id: null, citation_label: sources.find((s) => s.source_id === p.source_id)!.citation_label, claim_summary: supportText })));
      }
    }
    const deterministic = ["research_questions", "objectives_hypotheses", "questions_objectives_hypotheses_when_applicable", "consistency_matrix", "final_methodological_infographic", "references"].includes(section.section_key);
    return { ...section, status: "generated", generation_source: deterministic ? "system" : "llm", generation_wave: "core", blocks, word_count: blocks.map((b) => b.kind === "paragraph" ? b.text : b.kind === "bullet_list" ? b.items.join(" ") : "").join(" ").split(/\s+/).filter(Boolean).length, citation_anchors: anchors, used_source_ids: [...new Set(anchors.map((a) => a.source_id))], used_evidence_ids: anchors.map((a) => a.evidence_id!), used_snippet_ids: [], used_asset_keys: [], assumptions: narrative?.assumptions ?? [], limitations: narrative?.limitations ?? [], warnings: [] };
  });
  const citedIds = new Set(drafts.flatMap((d) => d.used_source_ids));
  matrix.rows.flatMap((r) => r.rationale_evidence).forEach((e) => citedIds.add(e.source_id));
  const usedSources = sources.filter((s) => citedIds.has(s.source_id));
  const refs = drafts.find((d) => d.section_key === "references")!;
  refs.blocks = [{ kind: "reference_list", items: [...new Set(usedSources.map((s) => s.formatted_reference))] }]; refs.generation_source = "deterministic";
  const titlePlan: MvpStep6TitlePlan = { artifact_type: "mvp_step6_title_plan", artifact_version: "v1", status: "generated", model: scientificPrompt.model, prompt_version: scientificPrompt.version, original_title: "", ...title };
  await writeFile(path.join(input.artifactDir, "research-definition.json"), JSON.stringify(stableDefinition, null, 2));
  await writeFile(path.join(input.artifactDir, "research-design.json"), JSON.stringify(design, null, 2));
  await writeFile(path.join(input.artifactDir, "PROMPTS_USED.md"), `# Prompts ${compactProfile ? "RC4 G3 / latam-compact-v1" : "legacy"}\n\n\`\`\`json\n${JSON.stringify(promptInventory, null, 2)}\n\`\`\`\n`);
  return { drafts, plan, titlePlan, definition: stableDefinition, design: researchDesign, matrix, review, coverage, usedSources, generation_order: sequence, expected_order: LATAM_COMPACT_GENERATION_ORDER };
}
