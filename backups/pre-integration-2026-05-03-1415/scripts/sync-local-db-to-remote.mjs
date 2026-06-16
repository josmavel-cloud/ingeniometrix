import { PrismaClient } from "@prisma/client";

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Falta la variable ${name}.`);
  }

  return value;
}

function buildClients() {
  const localUrl = requireEnv("LOCAL_DATABASE_URL");
  const remoteUrl = requireEnv("REMOTE_DATABASE_URL");

  return {
    local: new PrismaClient({ datasourceUrl: localUrl }),
    remote: new PrismaClient({ datasourceUrl: remoteUrl }),
  };
}

function remapReferenceIdsInJson(value, referenceIdMap) {
  if (Array.isArray(value)) {
    return value.map((item) => remapReferenceIdsInJson(item, referenceIdMap));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        if ((key === "reference_id" || key === "referenceId") && typeof item === "string") {
          return [key, referenceIdMap.get(item) ?? item];
        }

        return [key, remapReferenceIdsInJson(item, referenceIdMap)];
      }),
    );
  }

  return value;
}

async function syncUsers(local, remote) {
  const rows = await local.user.findMany();
  const userIdMap = new Map();

  for (const row of rows) {
    const existingById = await remote.user.findUnique({
      where: { id: row.id },
    });

    if (existingById) {
      await remote.user.update({
        where: { id: row.id },
        data: {
          email: row.email,
          name: row.name,
          locale: row.locale,
        },
      });
      userIdMap.set(row.id, row.id);
      continue;
    }

    const existingByEmail = await remote.user.findUnique({
      where: { email: row.email },
    });

    if (existingByEmail) {
      await remote.user.update({
        where: { id: existingByEmail.id },
        data: {
          name: row.name,
          locale: row.locale,
        },
      });
      userIdMap.set(row.id, existingByEmail.id);
      continue;
    }

    await remote.user.create({
      data: row,
    });
    userIdMap.set(row.id, row.id);
  }

  return {
    count: rows.length,
    userIdMap,
  };
}

async function syncTaxonomySchemes(local, remote) {
  const rows = await local.taxonomyScheme.findMany();

  for (const row of rows) {
    await remote.taxonomyScheme.upsert({
      where: { id: row.id },
      update: {
        code: row.code,
        name: row.name,
        version: row.version,
        uri: row.uri,
        description: row.description,
      },
      create: row,
    });
  }

  return rows.length;
}

async function syncTaxonomyConcepts(local, remote) {
  const rows = await local.taxonomyConcept.findMany({
    orderBy: { createdAt: "asc" },
  });

  for (const row of rows) {
    await remote.taxonomyConcept.upsert({
      where: { id: row.id },
      update: {
        schemeId: row.schemeId,
        conceptCode: row.conceptCode,
        conceptUri: row.conceptUri,
        prefLabel: row.prefLabel,
        altLabelsJson: row.altLabelsJson,
        definition: row.definition,
        lang: row.lang,
      },
      create: {
        ...row,
        parentId: null,
      },
    });
  }

  for (const row of rows) {
    await remote.taxonomyConcept.update({
      where: { id: row.id },
      data: {
        parentId: row.parentId,
      },
    });
  }

  return rows.length;
}

async function syncTemplates(local, remote, userIdMap) {
  const rows = await local.template.findMany();

  for (const row of rows) {
    const ownerUserId = row.ownerUserId ? userIdMap.get(row.ownerUserId) ?? null : null;

    await remote.template.upsert({
      where: { id: row.id },
      update: {
        key: row.key,
        name: row.name,
        ownerType: row.ownerType,
        ownerUserId,
        status: row.status,
        universityName: row.universityName,
        schoolName: row.schoolName,
        programName: row.programName,
        mention: row.mention,
        degreeLevel: row.degreeLevel,
        disciplineArea: row.disciplineArea,
        templateFamily: row.templateFamily,
      },
      create: {
        ...row,
        ownerUserId,
      },
    });
  }

  return rows.length;
}

async function syncTemplateVersions(local, remote) {
  const rows = await local.templateVersion.findMany();

  for (const row of rows) {
    await remote.templateVersion.upsert({
      where: { id: row.id },
      update: {
        templateId: row.templateId,
        versionNumber: row.versionNumber,
        schemaVersion: row.schemaVersion,
        language: row.language,
        methodologyMode: row.methodologyMode,
        citationStyle: row.citationStyle,
        documentKind: row.documentKind,
        reviewStatus: row.reviewStatus,
        templateFamily: row.templateFamily,
        templateKeyGuess: row.templateKeyGuess,
        universityName: row.universityName,
        schoolName: row.schoolName,
        programName: row.programName,
        mention: row.mention,
        degreeLevel: row.degreeLevel,
        disciplineArea: row.disciplineArea,
        normalizedDocumentJson: row.normalizedDocumentJson,
        semanticAnalysisJson: row.semanticAnalysisJson,
        templateCandidateJson: row.templateCandidateJson,
      },
      create: row,
    });
  }

  return rows.length;
}

async function syncTemplateSources(local, remote) {
  const rows = await local.templateSource.findMany();

  for (const row of rows) {
    await remote.templateSource.upsert({
      where: { id: row.id },
      update: {
        templateVersionId: row.templateVersionId,
        sourceId: row.sourceId,
        sourceType: row.sourceType,
        documentKind: row.documentKind,
        originalFilePath: row.originalFilePath,
        storedFilePath: row.storedFilePath,
        metadataJson: row.metadataJson,
      },
      create: row,
    });
  }

  return rows.length;
}

async function syncTemplateAssets(local, remote) {
  const rows = await local.templateAsset.findMany();

  for (const row of rows) {
    await remote.templateAsset.upsert({
      where: { id: row.id },
      update: {
        templateVersionId: row.templateVersionId,
        assetKey: row.assetKey,
        kind: row.kind,
        sourceStrategy: row.sourceStrategy,
        originalFilePath: row.originalFilePath,
        storedFilePath: row.storedFilePath,
        mimeType: row.mimeType,
        widthPx: row.widthPx,
        heightPx: row.heightPx,
        hasTransparency: row.hasTransparency,
        metadataJson: row.metadataJson,
      },
      create: row,
    });
  }

  return rows.length;
}

async function syncReferences(local, remote) {
  const rows = await local.reference.findMany();
  const referenceIdMap = new Map();

  for (const row of rows) {
    const existingById = await remote.reference.findUnique({
      where: { id: row.id },
    });

    if (existingById) {
      await remote.reference.update({
        where: { id: row.id },
        data: {
          doi: row.doi,
          openAlexId: row.openAlexId,
          crossrefId: row.crossrefId,
          title: row.title,
          normalizedTitle: row.normalizedTitle,
          authorsJson: row.authorsJson,
          abstract: row.abstract,
          venue: row.venue,
          year: row.year,
          workType: row.workType,
          landingPageUrl: row.landingPageUrl,
          citationCount: row.citationCount,
          rawOpenAlexJson: row.rawOpenAlexJson,
          rawCrossrefJson: row.rawCrossrefJson,
        },
      });
      referenceIdMap.set(row.id, row.id);
      continue;
    }

    let existingReference = null;

    if (row.openAlexId) {
      existingReference = await remote.reference.findUnique({
        where: { openAlexId: row.openAlexId },
      });
    }

    if (!existingReference && row.doi) {
      existingReference = await remote.reference.findFirst({
        where: { doi: row.doi },
      });
    }

    if (!existingReference) {
      existingReference = await remote.reference.findFirst({
        where: {
          normalizedTitle: row.normalizedTitle,
          year: row.year,
        },
      });
    }

    if (existingReference) {
      await remote.reference.update({
        where: { id: existingReference.id },
        data: {
          doi: row.doi,
          openAlexId: row.openAlexId,
          crossrefId: row.crossrefId,
          title: row.title,
          normalizedTitle: row.normalizedTitle,
          authorsJson: row.authorsJson,
          abstract: row.abstract,
          venue: row.venue,
          year: row.year,
          workType: row.workType,
          landingPageUrl: row.landingPageUrl,
          citationCount: row.citationCount,
          rawOpenAlexJson: row.rawOpenAlexJson,
          rawCrossrefJson: row.rawCrossrefJson,
        },
      });
      referenceIdMap.set(row.id, existingReference.id);
      continue;
    }

    await remote.reference.create({
      data: row,
    });
    referenceIdMap.set(row.id, row.id);
  }

  return {
    count: rows.length,
    referenceIdMap,
  };
}

async function syncReferenceClassifications(local, remote, referenceIdMap) {
  const rows = await local.referenceClassification.findMany();

  for (const row of rows) {
    const referenceId = referenceIdMap.get(row.referenceId);

    if (!referenceId) {
      throw new Error(`No se encontro referenceId remoto para ${row.referenceId}.`);
    }

    await remote.referenceClassification.upsert({
      where: { id: row.id },
      update: {
        referenceId,
        resourceTypeGeneral: row.resourceTypeGeneral,
        resourceTypeSpecific: row.resourceTypeSpecific,
        resourceTypeConceptId: row.resourceTypeConceptId,
        peerReviewStatus: row.peerReviewStatus,
        publicationStage: row.publicationStage,
        doiInteropType: row.doiInteropType,
        source: row.source,
        confidence: row.confidence,
        evidenceJson: row.evidenceJson,
      },
      create: {
        ...row,
        referenceId,
      },
    });
  }

  return rows.length;
}

async function syncReferenceIndexMemberships(local, remote, referenceIdMap) {
  const rows = await local.referenceIndexMembership.findMany();

  for (const row of rows) {
    const referenceId = referenceIdMap.get(row.referenceId);

    if (!referenceId) {
      throw new Error(`No se encontro referenceId remoto para ${row.referenceId}.`);
    }

    await remote.referenceIndexMembership.upsert({
      where: { id: row.id },
      update: {
        referenceId,
        indexName: row.indexName,
        indexLabel: row.indexLabel,
        source: row.source,
        status: row.status,
        evidenceJson: row.evidenceJson,
        checkedAt: row.checkedAt,
      },
      create: {
        ...row,
        referenceId,
      },
    });
  }

  return rows.length;
}

async function syncReferenceKeywords(local, remote, referenceIdMap) {
  const rows = await local.referenceKeyword.findMany();

  for (const row of rows) {
    const referenceId = referenceIdMap.get(row.referenceId);

    if (!referenceId) {
      throw new Error(`No se encontro referenceId remoto para ${row.referenceId}.`);
    }

    await remote.referenceKeyword.upsert({
      where: { id: row.id },
      update: {
        referenceId,
        keywordText: row.keywordText,
        normalizedKeyword: row.normalizedKeyword,
        conceptId: row.conceptId,
        source: row.source,
        score: row.score,
        isValidated: row.isValidated,
        evidenceJson: row.evidenceJson,
      },
      create: {
        ...row,
        referenceId,
      },
    });
  }

  return rows.length;
}

async function syncProjects(local, remote, userIdMap) {
  const rows = await local.project.findMany();

  for (const row of rows) {
    const userId = userIdMap.get(row.userId);

    if (!userId) {
      throw new Error(`No se encontro userId remoto para el proyecto ${row.id}.`);
    }

    await remote.project.upsert({
      where: { id: row.id },
      update: {
        userId,
        catalogTopicId: row.catalogTopicId,
        title: row.title,
        status: row.status,
        country: row.country,
        language: row.language,
        degreeLevel: row.degreeLevel,
        university: row.university,
        program: row.program,
        templateKey: row.templateKey,
        topicOriginType: row.topicOriginType,
        topicSelectionStatus: row.topicSelectionStatus,
        topicSeedText: row.topicSeedText,
        topicAreaId: row.topicAreaId,
        topicAreaLabel: row.topicAreaLabel,
        selectedTopicSuggestionId: null,
      },
      create: {
        ...row,
        userId,
        selectedTopicSuggestionId: null,
      },
    });
  }

  return rows.length;
}

async function syncIntakes(local, remote) {
  const rows = await local.intake.findMany();

  for (const row of rows) {
    await remote.intake.upsert({
      where: { id: row.id },
      update: {
        projectId: row.projectId,
        topic: row.topic,
        problemContext: row.problemContext,
        researchLine: row.researchLine,
        academicConstraints: row.academicConstraints,
        targetPopulation: row.targetPopulation,
        availableData: row.availableData,
        preferredMethodology: row.preferredMethodology,
        advisorNotes: row.advisorNotes,
        searchQuery: row.searchQuery,
      },
      create: row,
    });
  }

  return rows.length;
}

async function syncTopicSuggestions(local, remote) {
  const rows = await local.projectTopicSuggestion.findMany();

  for (const row of rows) {
    await remote.projectTopicSuggestion.upsert({
      where: { id: row.id },
      update: {
        projectId: row.projectId,
        sourceType: row.sourceType,
        catalogTopicId: row.catalogTopicId,
        seedText: row.seedText,
        title: row.title,
        researchLine: row.researchLine,
        rationale: row.rationale,
        metadataJson: row.metadataJson,
        primaryConceptId: row.primaryConceptId,
        selected: row.selected,
      },
      create: row,
    });
  }

  for (const project of await local.project.findMany({
    select: { id: true, selectedTopicSuggestionId: true },
  })) {
    await remote.project.update({
      where: { id: project.id },
      data: {
        selectedTopicSuggestionId: project.selectedTopicSuggestionId,
      },
    });
  }

  return rows.length;
}

async function syncProjectKnowledgeFields(local, remote) {
  const rows = await local.projectKnowledgeField.findMany();

  for (const row of rows) {
    await remote.projectKnowledgeField.upsert({
      where: { id: row.id },
      update: {
        projectId: row.projectId,
        conceptId: row.conceptId,
        isPrimary: row.isPrimary,
        source: row.source,
        confidence: row.confidence,
        evidenceJson: row.evidenceJson,
      },
      create: row,
    });
  }

  return rows.length;
}

async function syncProjectReferences(local, remote, referenceIdMap) {
  const rows = await local.projectReference.findMany();

  for (const row of rows) {
    const referenceId = referenceIdMap.get(row.referenceId);

    if (!referenceId) {
      throw new Error(`No se encontro referenceId remoto para ${row.referenceId}.`);
    }

    await remote.projectReference.upsert({
      where: { id: row.id },
      update: {
        projectId: row.projectId,
        referenceId,
        sourceProvider: row.sourceProvider,
        relevanceScore: row.relevanceScore,
        selected: row.selected,
        selectedOrder: row.selectedOrder,
        selectionReason: row.selectionReason,
      },
      create: {
        ...row,
        referenceId,
      },
    });
  }

  return rows.length;
}

async function syncBlueprintVersions(local, remote, referenceIdMap) {
  const rows = await local.blueprintVersion.findMany();

  for (const row of rows) {
    const selectedReferencesSnapshotJson = remapReferenceIdsInJson(
      row.selectedReferencesSnapshotJson,
      referenceIdMap,
    );
    const blueprintJson = remapReferenceIdsInJson(row.blueprintJson, referenceIdMap);
    const coherenceReportJson = remapReferenceIdsInJson(
      row.coherenceReportJson,
      referenceIdMap,
    );

    await remote.blueprintVersion.upsert({
      where: { id: row.id },
      update: {
        projectId: row.projectId,
        versionNumber: row.versionNumber,
        model: row.model,
        promptVersion: row.promptVersion,
        intakeSnapshotJson: row.intakeSnapshotJson,
        selectedReferencesSnapshotJson,
        blueprintJson,
        coherenceReportJson,
        exportStatus: row.exportStatus,
      },
      create: {
        ...row,
        selectedReferencesSnapshotJson,
        blueprintJson,
        coherenceReportJson,
      },
    });
  }

  return rows.length;
}

async function syncAuditLogs(local, remote, userIdMap) {
  const rows = await local.auditLog.findMany();

  for (const row of rows) {
    const userId = row.userId ? userIdMap.get(row.userId) ?? null : null;

    await remote.auditLog.upsert({
      where: { id: row.id },
      update: {
        projectId: row.projectId,
        userId,
        eventType: row.eventType,
        actorType: row.actorType,
        provider: row.provider,
        payloadJson: row.payloadJson,
      },
      create: {
        ...row,
        userId,
      },
    });
  }

  return rows.length;
}

async function main() {
  const { local, remote } = buildClients();
  const summary = {};

  try {
    const userSync = await syncUsers(local, remote);
    summary.users = userSync.count;
    summary.taxonomySchemes = await syncTaxonomySchemes(local, remote);
    summary.taxonomyConcepts = await syncTaxonomyConcepts(local, remote);
    summary.templates = await syncTemplates(local, remote, userSync.userIdMap);
    summary.templateVersions = await syncTemplateVersions(local, remote);
    summary.templateSources = await syncTemplateSources(local, remote);
    summary.templateAssets = await syncTemplateAssets(local, remote);
    const referenceSync = await syncReferences(local, remote);
    summary.references = referenceSync.count;
    summary.referenceClassifications = await syncReferenceClassifications(
      local,
      remote,
      referenceSync.referenceIdMap,
    );
    summary.referenceIndexMemberships = await syncReferenceIndexMemberships(
      local,
      remote,
      referenceSync.referenceIdMap,
    );
    summary.referenceKeywords = await syncReferenceKeywords(
      local,
      remote,
      referenceSync.referenceIdMap,
    );
    summary.projects = await syncProjects(local, remote, userSync.userIdMap);
    summary.intakes = await syncIntakes(local, remote);
    summary.topicSuggestions = await syncTopicSuggestions(local, remote);
    summary.projectKnowledgeFields = await syncProjectKnowledgeFields(local, remote);
    summary.projectReferences = await syncProjectReferences(
      local,
      remote,
      referenceSync.referenceIdMap,
    );
    summary.blueprintVersions = await syncBlueprintVersions(
      local,
      remote,
      referenceSync.referenceIdMap,
    );
    summary.auditLogs = await syncAuditLogs(local, remote, userSync.userIdMap);

    console.log("Sincronizacion local -> remoto completada.");
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await local.$disconnect();
    await remote.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
