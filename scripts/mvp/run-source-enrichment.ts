import { prisma } from "@/lib/prisma";
import { runMvpSourceEnrichment } from "@/server/mvp/source-enrichment-service";

const DEFAULT_PROJECT_ID = "76a48983-0d2c-404e-b3da-0d7f3f4cc866";
const DEFAULT_USER_EMAIL = "mvp-normalized-discovery@ingeniometrix.local";

function arg(name: string) {
  return process.argv.find((item) => item.startsWith(`--${name}=`))?.split("=")[1];
}

async function main() {
  const projectId = arg("project") ?? DEFAULT_PROJECT_ID;
  const email = arg("email") ?? DEFAULT_USER_EMAIL;
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    throw new Error(`Usuario no encontrado: ${email}`);
  }

  const result = await runMvpSourceEnrichment({ userId: user.id, projectId });
  console.log(JSON.stringify({
    ok: true,
    project_id: result.project_id,
    run_id: result.run_id,
    artifact_dir: result.artifact_dir,
    decision: result.decision,
    selected_source_count: result.selected_source_count,
    abstract_source_count: result.abstract_source_count,
    full_text_signal_count: result.full_text_signal_count,
    pdf_signal_count: result.pdf_signal_count,
    high_relevance_source_count: result.high_relevance_source_count,
    methodology_candidate_count: result.methodology_candidate_count,
    theory_candidate_count: result.theory_candidate_count,
    review_or_state_of_art_count: result.review_or_state_of_art_count,
    graph_reference_count: result.graph_reference_count,
    graph_related_count: result.graph_related_count,
    graph_cited_by_count: result.graph_cited_by_count,
    missing_evidence_categories: result.missing_evidence_categories,
    recommended_deep_research_questions: result.recommended_deep_research_questions,
    warnings: result.warnings,
    blockers: result.blockers,
    items: result.items.map((item) => ({
      order: item.selected_order,
      source_id: item.source_id,
      title: item.title,
      doi: item.doi,
      evidence_depth: item.evidence_depth,
      thesis_plan_score: item.quality.thesis_plan_score,
      thematic_relevance_score: item.quality.thematic_relevance_score,
      methodological_value_score: item.quality.methodological_value_score,
      theoretical_value_score: item.quality.theoretical_value_score,
      authority_score: item.quality.authority_score,
      accessibility_score: item.quality.accessibility_score,
      graph_centrality_score: item.quality.graph_centrality_score,
      labels: item.quality.labels,
      abstract_chars: item.source_summary.abstract_chars,
      referenced_works_count: item.source_summary.referenced_works_count,
      related_sample_count: item.related_works_sample.length,
      cited_by_sample_count: item.cited_by_sample.length,
      has_fulltext: item.source_summary.has_fulltext,
      has_pdf_url: item.source_summary.has_pdf_url,
      topics: item.source_summary.topics,
      keywords: item.source_summary.keywords,
      warnings: item.warnings,
    })),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  });
