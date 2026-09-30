import { prisma } from "@/lib/prisma";
import { runMvpSourceReadiness } from "@/server/mvp/source-readiness-service";

const DEFAULT_PROJECT_ID = "a76a6ffa-ffc9-426a-b18a-cb02c550fa1b";
const DEFAULT_USER_EMAIL = "mvp-bridge-cpr-diagnostics@ingeniometrix.local";

function arg(name: string) {
  return process.argv.find((item) => item.startsWith(`--${name}=`))?.split("=")[1];
}

async function main() {
  const projectId = arg("project") ?? DEFAULT_PROJECT_ID;
  const email = arg("email") ?? DEFAULT_USER_EMAIL;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`Usuario no encontrado: ${email}`);

  const result = await runMvpSourceReadiness({ userId: user.id, projectId });
  console.log(JSON.stringify({
    ok: true,
    project_id: result.project_id,
    run_id: result.run_id,
    artifact_dir: result.artifact_dir,
    decision: result.decision,
    selected_source_count: result.selected_source_count,
    central_source_count: result.central_source_count,
    pdf_source_count: result.pdf_source_count,
    abstract_source_count: result.abstract_source_count,
    coverage: result.coverage,
    deep_research_light: result.deep_research_light,
    frontend_cable: result.frontend_cable,
    warnings: result.warnings,
    blockers: result.blockers,
    inspection: result.inspection,
    items: result.items.map((item) => ({
      source_id: item.source_id,
      title: item.title,
      year: item.year,
      venue: item.venue,
      doi: item.doi,
      relevance_score: item.relevance_score,
      abstract_available: item.abstract_available,
      pdf_available: item.pdf_available,
      pdf_url: item.pdf_url,
      open_access_status: item.open_access_status,
      source_health: item.source_health,
      allowed_evidence_use: item.allowed_evidence_use,
      role: item.role,
      role_confidence: item.role_confidence,
      recommended_action: item.recommended_action,
      why_useful: item.why_useful,
      limitations: item.limitations,
    })),
    api_usage_delta: result.api_usage.report.filtered_delta,
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
