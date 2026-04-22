import { prisma } from "@/lib/prisma";
import { extractSearchTerms, normalizeTitle } from "@/lib/text";

type BlueprintTemplateResolutionInput = {
  projectTemplateKey: string;
  projectUniversity: string;
  projectDegreeLevel: string;
  projectProgram: string;
};

type TemplateSectionLike = {
  semantic_key?: string | null;
  children?: TemplateSectionLike[];
};

type TemplateCandidateLike = {
  template_family?: string | null;
  institution?: {
    university_name?: string | null;
    program_name?: string | null;
    degree_level?: string | null;
  } | null;
  sections?: TemplateSectionLike[];
};

const POSITIVE_FAMILY_PATTERNS = [
  "plan de tesis",
  "proyecto de investigacion",
  "trabajo de investigacion",
  "tesis",
  "proyecto",
];

const NEGATIVE_FAMILY_PATTERNS = [
  "manual",
  "reglamento",
  "presentacion fisica",
  "guia normativa",
  "grados y titulos",
];

const BLUEPRINT_TARGET_SECTION_KEYS = new Set([
  "problem_statement",
  "research_problem",
  "research_questions",
  "general_objective",
  "objectives",
  "justification",
  "methodology",
  "population_and_sample",
  "data_collection_techniques",
  "analysis_plan",
  "consistency_matrix",
  "schedule",
  "references",
  "hypotheses",
  "variables_indicators",
  "antecedentes_de_la_investigacion",
  "bases_teoricas",
  "diseno_metodologico",
  "tecnicas_de_recoleccion_de_datos",
  "tecnicas_estadisticas",
]);

function normalizeKey(value: string | null | undefined) {
  return normalizeTitle(value).replace(/\s+/g, "_");
}

function collectSemanticKeys(sections: TemplateSectionLike[] | undefined) {
  const keys = new Set<string>();

  function visit(nodes: TemplateSectionLike[]) {
    for (const node of nodes) {
      if (node.semantic_key) {
        keys.add(normalizeKey(node.semantic_key));
      }

      if (Array.isArray(node.children) && node.children.length > 0) {
        visit(node.children);
      }
    }
  }

  if (Array.isArray(sections)) {
    visit(sections);
  }

  return keys;
}

function countPositiveMatches(value: string, patterns: string[]) {
  return patterns.reduce((count, pattern) => {
    return value.includes(normalizeTitle(pattern)) ? count + 1 : count;
  }, 0);
}

function scoreTemplateCandidate(input: {
  candidate: TemplateCandidateLike;
  templateKey: string;
  templateName: string;
  universityName: string | null;
  degreeLevel: string | null;
  project: BlueprintTemplateResolutionInput;
}) {
  const normalizedProjectKey = normalizeTitle(input.project.projectTemplateKey);
  const normalizedProjectUniversity = normalizeTitle(input.project.projectUniversity);
  const normalizedProjectProgram = normalizeTitle(input.project.projectProgram);
  const normalizedProjectDegree = normalizeTitle(input.project.projectDegreeLevel);
  const normalizedTemplateKey = normalizeTitle(input.templateKey);
  const normalizedTemplateName = normalizeTitle(input.templateName);
  const normalizedUniversity = normalizeTitle(
    input.universityName ??
      input.candidate.institution?.university_name ??
      "",
  );
  const normalizedDegree = normalizeTitle(
    input.degreeLevel ??
      input.candidate.institution?.degree_level ??
      "",
  );
  const normalizedFamily = normalizeTitle(input.candidate.template_family ?? "");
  const normalizedProgram = normalizeTitle(input.candidate.institution?.program_name ?? "");
  const semanticKeys = collectSemanticKeys(input.candidate.sections);
  const semanticCoverage = Array.from(semanticKeys).filter((key) =>
    BLUEPRINT_TARGET_SECTION_KEYS.has(key),
  ).length;
  const projectProgramTerms = extractSearchTerms(input.project.projectProgram, {
    maxTerms: 8,
    minLength: 4,
  });
  const templateProgramTerms = extractSearchTerms(
    input.candidate.institution?.program_name ?? input.templateName,
    {
      maxTerms: 8,
      minLength: 4,
    },
  );
  const programOverlap = templateProgramTerms.filter((term) =>
    projectProgramTerms.includes(term),
  ).length;
  const positiveFamilyScore = countPositiveMatches(normalizedFamily, POSITIVE_FAMILY_PATTERNS);
  const negativeFamilyScore = countPositiveMatches(normalizedFamily, NEGATIVE_FAMILY_PATTERNS);

  let score = 0;

  if (normalizedTemplateKey === normalizedProjectKey) {
    score += 100;
  }

  if (normalizedProjectUniversity && normalizedUniversity.includes(normalizedProjectUniversity)) {
    score += 35;
  }

  if (normalizedUniversity.includes("universidad no identificada")) {
    score += 8;
  }

  if (normalizedProjectDegree && normalizedDegree.includes(normalizedProjectDegree)) {
    score += 12;
  }

  if (
    normalizedProjectProgram &&
    normalizedProgram &&
    (normalizedProjectProgram.includes(normalizedProgram) ||
      normalizedProgram.includes(normalizedProjectProgram))
  ) {
    score += 10;
  }

  if (projectProgramTerms.length > 0 && templateProgramTerms.length > 0) {
    score += programOverlap * 4;

    if (programOverlap === 0) {
      score -= 12;
    }
  }

  score += semanticCoverage * 2;
  score += positiveFamilyScore * 6;
  score -= negativeFamilyScore * 5;

  if (
    normalizedTemplateName.includes("plantilla") ||
    normalizedFamily.includes("plantilla")
  ) {
    score += 4;
  }

  if (normalizedFamily.includes("plan de tesis")) {
    score += 10;
  }

  if (normalizedFamily.includes("reglamento") && !normalizedFamily.includes("plan de tesis")) {
    score -= 6;
  }

  return {
    score,
    semanticCoverage,
  };
}

export async function resolveTemplateVersionForBlueprint(
  input: BlueprintTemplateResolutionInput,
) {
  const candidates = await prisma.templateVersion.findMany({
    include: {
      template: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (candidates.length === 0) {
    throw new Error("No hay TemplateVersion disponibles para resolver una plantilla de blueprint.");
  }

  const ranked = candidates
    .map((candidate) => {
      const templateCandidate = candidate.templateCandidateJson as TemplateCandidateLike;
      const scoring = scoreTemplateCandidate({
        candidate: templateCandidate,
        templateKey: candidate.template.key,
        templateName: candidate.template.name,
        universityName: candidate.universityName,
        degreeLevel: candidate.degreeLevel,
        project: input,
      });

      return {
        id: candidate.id,
        templateKey: candidate.template.key,
        templateName: candidate.template.name,
        score: scoring.score,
        semanticCoverage: scoring.semanticCoverage,
      };
    })
    .sort((left, right) => right.score - left.score);

  return {
    selectedTemplateVersionId: ranked[0].id,
    selectedTemplateKey: ranked[0].templateKey,
    selectedTemplateName: ranked[0].templateName,
    selectedScore: ranked[0].score,
    selectedSemanticCoverage: ranked[0].semanticCoverage,
    rankedCandidates: ranked.slice(0, 5),
  };
}
