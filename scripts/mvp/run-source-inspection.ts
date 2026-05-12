import { prisma } from "@/lib/prisma";
import { runMvpSourceInspection } from "@/server/mvp/source-inspection-service";

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

  const result = await runMvpSourceInspection({ userId: user.id, projectId });
  console.log(JSON.stringify({
    ok: true,
    project_id: result.project_id,
    run_id: result.run_id,
    artifact_dir: result.artifact_dir,
    decision: result.decision,
    selected_source_count: result.selected_source_count,
    usable_source_count: result.usable_source_count,
    direct_or_method_source_count: result.direct_or_method_source_count,
    metadata_only_source_count: result.metadata_only_source_count,
    source_ids_ready_for_blueprint: result.source_ids_ready_for_blueprint,
    source_ids_needing_replacement: result.source_ids_needing_replacement,
    source_ids_needing_manual_review: result.source_ids_needing_manual_review,
    missing_evidence_categories: result.missing_evidence_categories,
    blockers: result.blockers,
    warnings: result.warnings,
    api_usage_delta: result.api_usage.report.filtered_delta,
    items: result.items.map((item) => ({
      order: item.selected_order,
      source_id: item.source_id,
      title: item.title,
      year: item.year,
      doi: item.doi,
      source_health: item.source_health,
      topic_fit: item.topic_fit,
      allowed_evidence_use: item.allowed_evidence_use,
      pdf_available_signal: item.pdf_available_signal,
      pdf_accessible: item.pdf_accessible,
      resolved_pdf_url: item.resolved_pdf_url,
      pdf_access_strategy: item.pdf_access_strategy,
      text_char_count: item.text_char_count,
      identity_status: item.identity_status,
      method_signal_count: item.method_signal_count,
      theory_signal_count: item.theory_signal_count,
      variable_signal_count: item.variable_signal_count,
      equation_candidate_count: item.equation_candidate_count,
      table_candidate_count: item.table_candidate_count,
      figure_candidate_count: item.figure_candidate_count,
      sample_text_path: item.sample_text_path,
      downloaded_pdf_path: item.downloaded_pdf_path,
      warnings: item.warnings,
      blockers: item.blockers,
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
