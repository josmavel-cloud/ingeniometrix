import fs from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const repoRoot = process.cwd();
const envPath = path.join(repoRoot, ".env");

function normalizeText(value) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function loadLocalEnv() {
  try {
    const envFile = await fs.readFile(envPath, "utf8");

    for (const rawLine of envFile.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }

      const separatorIndex = line.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();

      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }

    throw error;
  }
}

function buildAliasIndex(concepts) {
  const aliasToConcepts = new Map();

  for (const concept of concepts) {
    const labels = [concept.prefLabel, ...(Array.isArray(concept.altLabelsJson) ? concept.altLabelsJson : [])]
      .map((label) => normalizeText(String(label)))
      .filter(Boolean);

    for (const label of labels) {
      const bucket = aliasToConcepts.get(label) ?? [];
      bucket.push(concept);
      aliasToConcepts.set(label, bucket);
    }
  }

  return aliasToConcepts;
}

function pickBestProjectConcept(text, concepts) {
  const candidates = concepts.filter((concept) => concept.parentId !== null);
  const scored = [];

  for (const concept of candidates) {
    const labels = [concept.prefLabel, ...(Array.isArray(concept.altLabelsJson) ? concept.altLabelsJson : [])]
      .map((label) => normalizeText(String(label)))
      .filter(Boolean);

    const matchedLabels = labels.filter((label) => text.includes(label));
    if (matchedLabels.length === 0) {
      continue;
    }

    scored.push({
      concept,
      matchedLabels,
      score: matchedLabels.reduce((total, label) => total + Math.max(1, label.split(" ").length), 0),
    });
  }

  scored.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return left.concept.conceptCode.localeCompare(right.concept.conceptCode);
  });

  return scored[0] ?? null;
}

function selectFallbackConceptCode(text) {
  const orderedRules = [
    { conceptCode: "2.4", patterns: ["ciberseguridad", "information and cyber security", "network security"] },
    { conceptCode: "2.3", patterns: ["inteligencia artificial", "artificial intelligence"] },
    { conceptCode: "3.3", patterns: ["telesalud", "telemedicine", "telehealth", "mhealth", "recordatorios digitales"] },
    { conceptCode: "3.4", patterns: ["adherencia", "chronic disease", "diabetes", "tratamiento"] },
    { conceptCode: "5.4", patterns: ["teletrabajo", "hybrid work", "remote work"] },
    { conceptCode: "5.5", patterns: ["capacitacion", "training", "professionalization"] },
    { conceptCode: "4.6", patterns: ["gamificacion", "gamification"] },
    { conceptCode: "4.4", patterns: ["competencia digital", "digital literacy", "alfabetizacion digital"] },
    { conceptCode: "4.1", patterns: ["docencia universitaria", "educacion superior", "higher education"] },
    { conceptCode: "6.5", patterns: ["construccion", "bim"] },
    { conceptCode: "6.2", patterns: ["arquitectura", "entorno urbano"] },
    { conceptCode: "6.4", patterns: ["resiliencia", "climaticos extremos", "flood risk"] },
    { conceptCode: "7.2", patterns: ["gestion publica", "public management"] },
    { conceptCode: "3.1", patterns: ["gestion de servicios de salud", "health services"] },
    { conceptCode: "5.1", patterns: ["talento humano", "recursos humanos", "human resources"] },
    { conceptCode: "2.1", patterns: ["tecnologias de la informacion", "ingenieria de sistemas", "information system", "sistemas"] },
    { conceptCode: "2.2", patterns: ["transformacion digital", "digital transformation"] },
    { conceptCode: "4.2", patterns: ["innovacion educativa", "educational innovations and technology"] },
  ];

  const rule = orderedRules.find((item) =>
    item.patterns.some((pattern) => text.includes(normalizeText(pattern))),
  );

  return rule?.conceptCode ?? null;
}

async function backfillProjectDomains(scheme) {
  const concepts = await prisma.taxonomyConcept.findMany({
    where: {
      schemeId: scheme.id,
    },
  });

  const schemeConceptIds = concepts.map((concept) => concept.id);
  const conceptByCode = new Map(concepts.map((concept) => [concept.conceptCode, concept]));
  const projects = await prisma.project.findMany({
    include: {
      intake: true,
    },
  });

  let assigned = 0;

  for (const project of projects) {
    const text = normalizeText(
      [
        project.title,
        project.program,
        project.intake?.topic ?? "",
        project.intake?.problemContext ?? "",
        project.intake?.researchLine ?? "",
        project.intake?.advisorNotes ?? "",
      ].join(" "),
    );

    let best = pickBestProjectConcept(text, concepts);
    if (!best) {
      const fallbackCode = selectFallbackConceptCode(text);
      const fallbackConcept = fallbackCode ? conceptByCode.get(fallbackCode) ?? null : null;

      if (fallbackConcept) {
        best = {
          concept: fallbackConcept,
          matchedLabels: [fallbackConcept.prefLabel],
          score: 2,
        };
      }
    }

    if (!best) {
      continue;
    }

    await prisma.projectKnowledgeField.updateMany({
      where: {
        projectId: project.id,
        conceptId: {
          in: schemeConceptIds,
        },
      },
      data: {
        isPrimary: false,
      },
    });

    await prisma.projectKnowledgeField.upsert({
      where: {
        projectId_conceptId: {
          projectId: project.id,
          conceptId: best.concept.id,
        },
      },
      update: {
        isPrimary: true,
        source: "RULE",
        confidence: Math.min(0.6 + best.score * 0.05, 0.95),
        evidenceJson: {
          scheme: scheme.code,
          matchedLabels: best.matchedLabels,
          conceptCode: best.concept.conceptCode,
          conceptLabel: best.concept.prefLabel,
          title: project.title,
          program: project.program,
        },
      },
      create: {
        projectId: project.id,
        conceptId: best.concept.id,
        isPrimary: true,
        source: "RULE",
        confidence: Math.min(0.6 + best.score * 0.05, 0.95),
        evidenceJson: {
          scheme: scheme.code,
          matchedLabels: best.matchedLabels,
          conceptCode: best.concept.conceptCode,
          conceptLabel: best.concept.prefLabel,
          title: project.title,
          program: project.program,
        },
      },
    });

    assigned += 1;
  }

  return assigned;
}

async function mapKeywordConcepts(scheme) {
  const concepts = await prisma.taxonomyConcept.findMany({
    where: {
      schemeId: scheme.id,
    },
  });

  const aliasIndex = buildAliasIndex(concepts);
  const keywords = await prisma.referenceKeyword.findMany({
    select: {
      id: true,
      normalizedKeyword: true,
      keywordText: true,
      conceptId: true,
      evidenceJson: true,
    },
  });

  let mapped = 0;

  for (const keyword of keywords) {
    const matches = aliasIndex.get(keyword.normalizedKeyword) ?? [];
    if (matches.length !== 1) {
      continue;
    }

    const concept = matches[0];
    await prisma.referenceKeyword.update({
      where: {
        id: keyword.id,
      },
      data: {
        conceptId: concept.id,
        evidenceJson: {
          ...(typeof keyword.evidenceJson === "object" && keyword.evidenceJson !== null ? keyword.evidenceJson : {}),
          mappedScheme: scheme.code,
          mappedConceptCode: concept.conceptCode,
          mappedConceptLabel: concept.prefLabel,
        },
      },
    });
    mapped += 1;
  }

  return mapped;
}

async function main() {
  await loadLocalEnv();

  const scheme = await prisma.taxonomyScheme.findUnique({
    where: {
      code: "PLMX-APPLIED-DOMAINS-V1",
    },
  });

  if (!scheme) {
    throw new Error("No existe el esquema PLMX-APPLIED-DOMAINS-V1.");
  }

  try {
    const assignedProjects = await backfillProjectDomains(scheme);
    const mappedKeywords = await mapKeywordConcepts(scheme);

    console.log("Resumen de mappings de dominios aplicados:");
    console.log(`- proyectos asignados: ${assignedProjects}`);
    console.log(`- keywords mapeadas a concepto: ${mappedKeywords}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
