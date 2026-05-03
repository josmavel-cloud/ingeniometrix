import fs from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const repoRoot = process.cwd();
const envPath = path.join(repoRoot, ".env");

const RULES = [
  {
    conceptCode: "3.3",
    label: "Health sciences",
    keywords: [
      "salud",
      "paciente",
      "pacientes",
      "tratamiento",
      "hospital",
      "clinica",
      "redes regionales",
      "adherencia",
      "diagnostico",
    ],
  },
  {
    conceptCode: "5.3",
    label: "Education",
    keywords: [
      "educacion",
      "docencia",
      "universitaria",
      "curso",
      "cursos",
      "aprendizaje",
      "gamificacion",
      "posgrado",
      "universidades",
    ],
  },
  {
    conceptCode: "1.2",
    label: "Computer and information sciences",
    keywords: [
      "sistemas",
      "tecnologias de la informacion",
      "tecnologia",
      "tecnologico",
      "inteligencia artificial",
      "ciberseguridad",
      "digital",
      "fintech",
      "analitica",
      "datos",
      "software",
    ],
  },
  {
    conceptCode: "5.2",
    label: "Economics and business",
    keywords: [
      "marketing",
      "negocios",
      "consumidor",
      "compra",
      "recompra",
      "retail",
      "e-commerce",
      "empresa",
      "empresas",
      "pymes",
      "gestion",
      "administracion",
      "banca",
      "turistico",
      "hotelero",
    ],
  },
  {
    conceptCode: "5.1",
    label: "Psychology and cognitive sciences",
    keywords: [
      "psicologia",
      "comportamiento",
      "talento humano",
      "recursos humanos",
      "teletrabajo",
      "desempeno",
      "capacitacion",
      "colaboradores",
    ],
  },
  {
    conceptCode: "2.1",
    label: "Civil engineering",
    keywords: [
      "construccion",
      "arquitectura",
      "urbano",
      "parques",
      "vecinales",
      "infraestructura",
    ],
  },
  {
    conceptCode: "5.6",
    label: "Political science",
    keywords: [
      "gestion publica",
      "publica",
      "gobierno",
      "regional",
      "politica publica",
    ],
  },
];

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

function normalizeText(value) {
  return (value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, " ");
}

function scoreRules(text) {
  const hits = [];

  for (const rule of RULES) {
    const matchedKeywords = rule.keywords.filter((keyword) => text.includes(normalizeText(keyword)));
    if (matchedKeywords.length > 0) {
      hits.push({
        ...rule,
        matchedKeywords,
        score: matchedKeywords.length,
      });
    }
  }

  return hits.sort((left, right) => right.score - left.score);
}

async function loadFordConcepts() {
  const scheme = await prisma.taxonomyScheme.findUnique({
    where: {
      code: "FORD-2015",
    },
    include: {
      concepts: true,
    },
  });

  if (!scheme) {
    throw new Error("No existe el esquema FORD-2015 en la base.");
  }

  return new Map(scheme.concepts.map((concept) => [concept.conceptCode, concept]));
}

async function main() {
  await loadLocalEnv();
  const fordConcepts = await loadFordConcepts();
  const projects = await prisma.project.findMany({
    include: {
      intake: true,
    },
  });

  let assignedCount = 0;
  let skippedCount = 0;

  try {
    for (const project of projects) {
      const text = normalizeText(
        [
          project.title,
          project.program,
          project.intake?.topic ?? "",
          project.intake?.problemContext ?? "",
          project.intake?.researchLine ?? "",
        ].join(" "),
      );

      const [best] = scoreRules(text);
      if (!best) {
        skippedCount += 1;
        continue;
      }

      const concept = fordConcepts.get(best.conceptCode);
      if (!concept) {
        skippedCount += 1;
        continue;
      }

      await prisma.projectKnowledgeField.upsert({
        where: {
          projectId_conceptId: {
            projectId: project.id,
            conceptId: concept.id,
          },
        },
        update: {
          isPrimary: true,
          source: "RULE",
          confidence: Math.min(0.55 + best.score * 0.08, 0.95),
          evidenceJson: {
            matchedKeywords: best.matchedKeywords,
            conceptCode: best.conceptCode,
            conceptLabel: best.label,
            title: project.title,
            program: project.program,
          },
        },
        create: {
          projectId: project.id,
          conceptId: concept.id,
          isPrimary: true,
          source: "RULE",
          confidence: Math.min(0.55 + best.score * 0.08, 0.95),
          evidenceJson: {
            matchedKeywords: best.matchedKeywords,
            conceptCode: best.conceptCode,
            conceptLabel: best.label,
            title: project.title,
            program: project.program,
          },
        },
      });

      await prisma.projectKnowledgeField.updateMany({
        where: {
          projectId: project.id,
          NOT: {
            conceptId: concept.id,
          },
        },
        data: {
          isPrimary: false,
        },
      });

      assignedCount += 1;
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log("Resumen de backfill FORD por proyecto:");
  console.log(`- proyectos con campo asignado: ${assignedCount}`);
  console.log(`- proyectos sin match heuristico: ${skippedCount}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
