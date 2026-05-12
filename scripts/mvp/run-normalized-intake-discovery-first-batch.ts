import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { ProjectStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { REFERENCE_BATCH_SIZE } from "@/lib/research-workflow";
import { buildMvpApiUsageReport } from "@/server/mvp/api-usage-service";
import { normalizeIntakeForMvpProject } from "@/server/mvp/intake-normalization-service";
import { runMvpSourceDiscovery } from "@/server/mvp/source-discovery-service";
import { saveIntakeForProject } from "@/server/projects/project-service";
import { listProjectReferences } from "@/server/retrieval/reference-service";

import { structuralWarrenBridgeFixture } from "./fixtures/structural-warren-bridge-intake";

const TEST_USER_EMAIL = "mvp-normalized-discovery@ingeniometrix.local";

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function renderAuthors(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").slice(0, 3).join(", ")
    : "";
}

async function main() {
  const runId = `normalized-discovery-${nowStamp()}`;
  const artifactDir = path.join(process.cwd(), "artifacts-local", "mvp-source-discovery", runId);
  await mkdir(artifactDir, { recursive: true });

  const user = await prisma.user.upsert({
    where: { email: TEST_USER_EMAIL },
    create: { email: TEST_USER_EMAIL, name: "MVP Normalized Discovery", locale: "es-PE" },
    update: { name: "MVP Normalized Discovery", locale: "es-PE" },
  });

  const fixture = structuralWarrenBridgeFixture;
  const project = await prisma.project.create({
    data: {
      userId: user.id,
      status: ProjectStatus.DRAFT,
      ...fixture.project,
      title: `${fixture.project.title} (${runId})`,
    },
  });

  await saveIntakeForProject(user.id, project.id, fixture.intake);
  const normalization = await normalizeIntakeForMvpProject({ userId: user.id, projectId: project.id });
  const discovery = await runMvpSourceDiscovery(user.id, project.id, {
    desiredTotal: REFERENCE_BATCH_SIZE,
    batchKind: "initial",
  });
  const references = await listProjectReferences(user.id, project.id);
  const apiUsage = await buildMvpApiUsageReport({ filter: { projectId: project.id } });

  const firstFive = references.slice(0, REFERENCE_BATCH_SIZE).map((item, index) => ({
    index: index + 1,
    reference_id: item.reference.id,
    suggested: item.selectedOrder !== null,
    selected_order: item.selectedOrder,
    score: item.relevanceScore,
    score_label: item.scoreBreakdown?.label ?? null,
    score_breakdown: item.scoreBreakdown,
    title: item.reference.title,
    translated_title: item.reference.translatedTitle,
    authors: renderAuthors(item.reference.authorsJson),
    year: item.reference.year,
    venue: item.reference.venue,
    language: item.reference.sourceLanguage,
    doi: item.reference.doi,
    url: item.reference.landingPageUrl,
    pdf_available: Boolean(item.reference.pdfUrl),
    pdf_accessible_checked: item.reference.pdfAccessible,
    pdf_url: item.reference.pdfUrl,
  }));

  const output = {
    ok: true,
    runId,
    projectId: project.id,
    database_design: {
      current: "Sin migracion nueva: Project/Intake/Reference/ProjectReference/AuditLog + artifacts JSON.",
      doc: "docs/architecture/mvp-source-discovery-data-design.md",
      future_tables: [
        "ProjectIntakeNormalization",
        "SourceDiscoveryRun",
        "SourceCandidate",
        "SourceSelectionEvent",
      ],
    },
    normalized_intake: normalization.normalized,
    normalization_source: normalization.source,
    normalization_model: normalization.model,
    discovery: {
      batch_kind: discovery.batch_kind,
      status: discovery.status,
      candidate_source_count: discovery.candidate_source_count,
      suggested_selection_ids: discovery.suggested_selection_ids,
      next_action_es: discovery.next_action_es,
      searchQuery: discovery.search?.searchQuery,
      attemptedQueries: discovery.search?.attemptedQueries,
      providerBreakdown: discovery.search?.providerBreakdown,
    },
    first_five_sources: firstFive,
    token_usage_by_project: {
      filtered_delta: apiUsage.filtered_delta,
      by_stage: apiUsage.filtered_by_stage,
      project_totals: apiUsage.project_totals,
      recent_calls: apiUsage.recent_calls.map((call) => ({
        model: call.model,
        operation: call.operation,
        attribution: call.attribution ?? null,
        inputTokens: call.inputTokens,
        outputTokens: call.outputTokens,
        totalTokens: call.totalTokens,
      })),
    },
  };

  await writeFile(path.join(artifactDir, "first-batch-report.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(output, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  });
