import { prisma } from "@/lib/prisma";
import { runMvpThesisPlanBlueprint } from "@/server/mvp/thesis-plan-blueprint-service";

const DEFAULT_PROJECT_ID = "76a48983-0d2c-404e-b3da-0d7f3f4cc866";
const DEFAULT_USER_EMAIL = "mvp-normalized-discovery@ingeniometrix.local";

function arg(name: string) {
  return process.argv.find((item) => item.startsWith(`--${name}=`))?.split("=")[1];
}

async function main() {
  const projectId = arg("project") ?? DEFAULT_PROJECT_ID;
  const email = arg("email") ?? DEFAULT_USER_EMAIL;
  const persist = arg("persist") !== "false";
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) throw new Error(`Usuario no encontrado: ${email}`);

  const result = await runMvpThesisPlanBlueprint({ userId: user.id, projectId, persist });
  console.log(JSON.stringify({
    ok: true,
    project_id: result.project_id,
    run_id: result.run_id,
    artifact_dir: result.artifact_dir,
    decision: result.decision,
    persisted_blueprint_version_id: result.persisted_blueprint_version_id,
    readiness: result.readiness,
    section_count: result.sections.length,
    table_count: Object.keys(result.core_tables).length,
    reference_count: result.references.length,
    warnings: result.warnings,
    blockers: result.blockers,
    sections: result.sections.map((section) => ({
      key: section.key,
      title: section.title,
      min_words: section.min_words,
      target_words: section.target_words,
      status_from_readiness: section.status_from_readiness,
      source_count: section.source_ids.length,
      warnings: section.warnings,
    })),
    references: result.references,
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
