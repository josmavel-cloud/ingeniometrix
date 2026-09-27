import type { SemanticKeywordGroup } from "./retrieval-semantic-plan";

export const QUERY_COMPOSITION_VERSION = "scientific-query-composition.v2";
export type QueryFamily = "CORE_PHENOMENON" | "OBJECT_OR_SYSTEM" | "EXPERIMENTAL_OR_METHOD_PRECEDENT" | "MODELING_OR_ANALYSIS_PRECEDENT" | "THEORETICAL_OR_MECHANISTIC" | "CONTEXTUAL_OR_LOCAL";
export type ScientificQuery = {
  id: string; family: QueryFamily; relaxationLevel: 0 | 1 | 2 | 3;
  requiredConcepts: string[]; refiners: string[]; sourceFields: string[];
  query: string; reason: string;
};
const norm = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const contains = (a: string, b: string) => (` ${norm(a)} `).includes(` ${norm(b)} `);
const words = (s: string) => norm(s).split(" ").length;

function mergeConcepts(groups: SemanticKeywordGroup[]) {
  const merged = new Map<string, SemanticKeywordGroup>();
  for (const g of groups) {
    const key = norm(g.anchor), old = merged.get(key);
    if (!old) merged.set(key, { ...g, variants: [...g.variants], sourceFields: [...g.sourceFields] });
    else {
      old.variants = [...new Set([...old.variants, ...g.variants])];
      old.sourceFields = [...new Set([...old.sourceFields, ...g.sourceFields])];
      if (g.role === "OBJECT" || g.sourceFields.includes("problem")) old.role = g.role;
    }
  }
  return [...merged.values()];
}

export function queryRedundancyReasons(queries: ScientificQuery[]) {
  const reasons: string[] = [];
  for (const q of queries) {
    if (q.requiredConcepts.length < 2) reasons.push(`${q.id}:RESEARCH_IDENTITY_TOO_WEAK`);
    if (q.query.length > 900) reasons.push(`${q.id}:QUERY_TOO_LONG`);
    if (q.requiredConcepts.some((a, i) => q.requiredConcepts.some((b, j) => i !== j && contains(a, b)))) {
      reasons.push(`${q.id}:COMPOSITE_AND_ITS_CONSTITUENT`);
    }
    for (const old of queries.slice(0, queries.indexOf(q))) {
      const a = new Set([...q.requiredConcepts, ...q.refiners].map(norm));
      const b = new Set([...old.requiredConcepts, ...old.refiners].map(norm));
      const intersection = [...a].filter(x => b.has(x)).length;
      const similarity = intersection / new Set([...a, ...b]).size;
      if (similarity >= 0.8 || norm(q.query) === norm(old.query)) reasons.push(`${q.id}:DUPLICATE_COVERAGE`);
    }
  }
  if (queries.length > 1 && queries[0].requiredConcepts.some(a => words(a) > 6 && queries.every(q => q.requiredConcepts.some(b => norm(a) === norm(b))))) {
    reasons.push("UNIVERSAL_LONG_LITERAL");
  }
  return [...new Set(reasons)];
}

// Compose from grounded concept groups, not from their arrival order or field index.
// No discipline-specific vocabulary, translation or method is invented here.
export function composeSemanticQueries(input: { necessary: SemanticKeywordGroup[]; complementary: SemanticKeywordGroup[]; optional: SemanticKeywordGroup[] }) {
  const core = mergeConcepts(input.necessary).filter(g => !/\d{4}/.test(g.anchor) && g.role !== "PURPOSE");
  const compact = core.filter(g => words(g.anchor) <= 6 && !core.some(other => other !== g && words(other.anchor) >= 2 && words(other.anchor) < words(g.anchor) && contains(g.anchor, other.anchor)));
  const explicitObjects = core.filter(g => g.role === "OBJECT");
  const objectCandidates = compact.filter(g => g.role === "OBJECT" || explicitObjects.some(o => contains(o.anchor, g.anchor)));
  const objectPool = objectCandidates.length ? objectCandidates : compact.filter(g => g.role === "CONCEPT");
  const object = [...objectPool].sort((a, b) => words(a.anchor) - words(b.anchor) || a.anchor.localeCompare(b.anchor))[0];
  const phenomena = compact.filter(g => g !== object && !contains(g.anchor, object?.anchor ?? "") && !contains(object?.anchor ?? "", g.anchor) && ["PROBLEM", "CONCEPT"].includes(g.role));
  phenomena.sort((a, b) => Number(b.sourceFields.includes("problem")) - Number(a.sourceFields.includes("problem")) || Number(b.role === "PROBLEM") - Number(a.role === "PROBLEM") || words(b.anchor) - words(a.anchor) || a.anchor.localeCompare(b.anchor));
  const phenomenon = phenomena[0];
  const plannedQueries: ScientificQuery[] = [];
  const quote = (s: string) => `"${s.replace(/["(){}\n\r\\]/g, " ").trim()}"`;
  const clause = (g: SemanticKeywordGroup) => `(${[...new Set(g.variants)].filter(v => v.length <= 160).slice(0, 4).map(quote).join(" OR ")})`;
  const add = (family: QueryFamily, level: ScientificQuery["relaxationLevel"], required: SemanticKeywordGroup[], refiners: SemanticKeywordGroup[], reason: string) => {
    if (plannedQueries.length >= 4 || required.some(g => !g?.variants.length)) return;
    const query: ScientificQuery = { id: `q${plannedQueries.length + 1}`, family, relaxationLevel: level,
      requiredConcepts: required.map(g => g.anchor), refiners: refiners.map(g => g.anchor),
      sourceFields: [...new Set([...required, ...refiners].flatMap(g => g.sourceFields))],
      query: [...required, ...refiners].map(clause).join(" AND "), reason };
    if (!queryRedundancyReasons([...plannedQueries, query]).length) plannedQueries.push(query);
  };
  if (phenomenon && object) {
    add("CORE_PHENOMENON", 1, [phenomenon, object], [], "Main phenomenon and object/concept without secondary qualifiers");
    const preciseObject = explicitObjects.filter(g => norm(g.anchor) !== norm(object.anchor) && contains(g.anchor, object.anchor) && words(g.anchor) <= 7)
      .sort((a, b) => words(a.anchor) - words(b.anchor))[0];
    if (preciseObject) add("OBJECT_OR_SYSTEM", 0, [phenomenon, preciseObject], [], "Confirmed object qualifier; general query remains available");
    for (const alternative of phenomena.slice(1)) {
      const text = norm(alternative.variants.join(" "));
      const family: QueryFamily | null = /\b(simulation|simulacion|modeling|modelling|modelado|analysis|analisis)\b/.test(text) ? "MODELING_OR_ANALYSIS_PRECEDENT"
        : /\b(testing|ensayo|experiment|experimental|methodology|metodologia)\b/.test(text) ? "EXPERIMENTAL_OR_METHOD_PRECEDENT"
        : /\b(theory|teoria|mechanism|mecanismo|conceptual|framework)\b/.test(text) ? "THEORETICAL_OR_MECHANISTIC" : null;
      if (family) { add(family, 3, [alternative, object], [], "Grounded alternative precedent, not a chosen research method"); break; }
    }
    const contextual = mergeConcepts(input.complementary).filter(g => g.sourceFields.includes("context") && words(g.anchor) <= 5 && !contains(g.anchor, phenomenon.anchor) && !contains(g.anchor, object.anchor))
      .sort((a, b) => Number(/\d{4}/.test(a.anchor)) - Number(/\d{4}/.test(b.anchor)) || words(a.anchor) - words(b.anchor))[0];
    if (contextual) add("CONTEXTUAL_OR_LOCAL", 2, [phenomenon, object], [contextual], "Optional contextual branch; user premises are not verified facts");
  }
  return { compositionVersion: QUERY_COMPOSITION_VERSION, plannedQueries,
    necessaryOnly: plannedQueries.map(q => q.query), complementaryBoosted: [] as string[], optionalBackups: [] as string[],
    validation: { valid: plannedQueries.length > 0 && queryRedundancyReasons(plannedQueries).length === 0, reasons: plannedQueries.length ? queryRedundancyReasons(plannedQueries) : ["NEEDS_CONCEPT_DECOMPOSITION"] } };
}
