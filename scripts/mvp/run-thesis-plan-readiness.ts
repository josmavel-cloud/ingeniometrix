import { prisma } from "@/lib/prisma";
import { runMvpThesisPlanReadiness } from "@/server/mvp/thesis-plan-readiness-service";

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

  const result = await runMvpThesisPlanReadiness({ userId: user.id, projectId });
  console.log(JSON.stringify({
    ok: true,
    project_id: result.project_id,
    run_id: result.run_id,
    artifact_dir: result.artifact_dir,
    decision: result.decision,
    intake_summary: result.intake_summary,
    source_enrichment: result.source_enrichment,
    missing_evidence_categories: result.missing_evidence_categories,
    recommended_deep_research_questions: result.recommended_deep_research_questions,
    warnings: result.warnings,
    blockers: result.blockers,
    section_requirements: result.section_requirements.map((section) => ({
      key: section.key,
      title: section.title,
      min_words: section.min_words,
      target_words: section.target_words,
      status: section.status,
      source_count: section.source_ids.length,
      warnings: section.warnings,
    })),
    source_roles: result.source_roles.map((source) => ({
      order: source.selected_order,
      source_id: source.source_id,
      title: source.title,
      score: source.thesis_plan_score,
      evidence_depth: source.evidence_depth,
      roles_in_plan: source.roles_in_plan,
      usable_for: source.usable_for,
      full_text_required_before_final_framework: source.full_text_required_before_final_framework,
      warnings: source.warnings,
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
