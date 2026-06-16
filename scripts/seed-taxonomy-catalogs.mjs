import fs from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const repoRoot = process.cwd();
const envPath = path.join(repoRoot, ".env");
const registryPath = path.join(repoRoot, "lib", "assets", "taxonomy-source-registry.json");
const fordPath = path.join(repoRoot, "lib", "assets", "ford-2015-curated.json");
const appliedDomainsPath = path.join(repoRoot, "lib", "assets", "applied-domain-taxonomy-v1.json");
const seismicPath = path.join(repoRoot, "lib", "assets", "seismic-structural-taxonomy-v1.json");
const taxonomyRoot = path.join(repoRoot, "artifacts-local", "taxonomies");

const SKOS_PREF_LABEL = "http://www.w3.org/2004/02/skos/core#prefLabel";
const SKOS_ALT_LABEL = "http://www.w3.org/2004/02/skos/core#altLabel";
const SKOS_BROADER = "http://www.w3.org/2004/02/skos/core#broader";
const SKOS_DEFINITION = "http://www.w3.org/2004/02/skos/core#definition";
const SKOS_CONCEPT = "http://www.w3.org/2004/02/skos/core#Concept";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

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

function parseArgs(argv) {
  return {
    source: argv
      .find((arg) => arg.startsWith("--source="))
      ?.slice("--source=".length)
      .trim() || null,
  };
}

async function loadJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function buildSourceFileMap(registry) {
  const result = new Map();

  for (const source of registry.sources) {
    const directTargets = (source.downloadTargets ?? []).filter(
      (target) => target.downloadMode === "direct",
    );

    result.set(
      source.id,
      directTargets.map((target) => path.join(taxonomyRoot, source.id, target.filename)),
    );
  }

  return result;
}

async function upsertScheme(input) {
  return prisma.taxonomyScheme.upsert({
    where: {
      code: input.code,
    },
    update: {
      name: input.name,
      version: input.version ?? null,
      uri: input.uri ?? null,
      description: input.description ?? null,
    },
    create: {
      code: input.code,
      name: input.name,
      version: input.version ?? null,
      uri: input.uri ?? null,
      description: input.description ?? null,
    },
  });
}

async function upsertConcept({
  schemeId,
  parentId,
  conceptCode,
  conceptUri,
  prefLabel,
  altLabels,
  definition,
  lang = "en",
}) {
  return prisma.taxonomyConcept.upsert({
    where: {
      schemeId_conceptCode: {
        schemeId,
        conceptCode,
      },
    },
    update: {
      parentId: parentId ?? null,
      conceptUri: conceptUri ?? null,
      prefLabel,
      altLabelsJson: altLabels.length > 0 ? altLabels : null,
      definition: definition ?? null,
      lang,
    },
    create: {
      schemeId,
      parentId: parentId ?? null,
      conceptCode,
      conceptUri: conceptUri ?? null,
      prefLabel,
      altLabelsJson: altLabels.length > 0 ? altLabels : null,
      definition: definition ?? null,
      lang,
    },
  });
}

async function seedFord() {
  const ford = await loadJson(fordPath);
  const scheme = await upsertScheme(ford.scheme);
  let conceptCount = 0;

  for (const broad of ford.concepts) {
    const broadConcept = await upsertConcept({
      schemeId: scheme.id,
      parentId: null,
      conceptCode: broad.conceptCode,
      conceptUri: `${ford.scheme.uri}#${broad.conceptCode}`,
      prefLabel: broad.prefLabel,
      altLabels: [],
      definition: null,
    });
    conceptCount += 1;

    for (const subfield of broad.children ?? []) {
      await upsertConcept({
        schemeId: scheme.id,
        parentId: broadConcept.id,
        conceptCode: subfield.conceptCode,
        conceptUri: `${ford.scheme.uri}#${subfield.conceptCode}`,
        prefLabel: subfield.prefLabel,
        altLabels: [],
        definition: null,
      });
      conceptCount += 1;
    }
  }

  return {
    scheme: ford.scheme.code,
    conceptCount,
  };
}

async function seedLocalHierarchyTaxonomy(filePath) {
  const taxonomy = await loadJson(filePath);
  const scheme = await upsertScheme(taxonomy.scheme);
  let conceptCount = 0;

  async function walkConcepts(concepts, parentId) {
    for (const concept of concepts) {
      const saved = await upsertConcept({
        schemeId: scheme.id,
        parentId,
        conceptCode: concept.conceptCode,
        conceptUri: `${taxonomy.scheme.uri}#${concept.conceptCode}`,
        prefLabel: concept.prefLabel,
        altLabels: concept.altLabels ?? [],
        definition: concept.definition ?? null,
      });

      conceptCount += 1;
      await walkConcepts(concept.children ?? [], saved.id);
    }
  }

  await walkConcepts(taxonomy.concepts, null);

  return {
    scheme: taxonomy.scheme.code,
    conceptCount,
  };
}

function decodeNtLiteral(value) {
  return value
    .replace(/\\u([0-9A-Fa-f]{4})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\U([0-9A-Fa-f]{8})/g, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/\\"/g, "\"")
    .replace(/\\\\/g, "\\");
}

function parseNTriples(text) {
  const triples = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const uriObjectMatch = line.match(/^<([^>]+)>\s+<([^>]+)>\s+<([^>]+)>\s+\.$/);
    if (uriObjectMatch) {
      triples.push({
        subject: uriObjectMatch[1],
        predicate: uriObjectMatch[2],
        objectType: "uri",
        object: uriObjectMatch[3],
        lang: null,
      });
      continue;
    }

    const literalMatch = line.match(/^<([^>]+)>\s+<([^>]+)>\s+"((?:[^"\\]|\\.)*)"(?:@([A-Za-z-]+)|\^\^<[^>]+>)?\s+\.$/);
    if (literalMatch) {
      triples.push({
        subject: literalMatch[1],
        predicate: literalMatch[2],
        objectType: "literal",
        object: decodeNtLiteral(literalMatch[3]),
        lang: literalMatch[4] ?? null,
      });
    }
  }

  return triples;
}

function buildCoarConceptMap(triples, schemeUriPrefix) {
  const subjects = new Map();

  function getSubject(uri) {
    const existing = subjects.get(uri);
    if (existing) {
      return existing;
    }

    const created = {
      uri,
      isConcept: false,
      parentUri: null,
      labels: new Map(),
      altLabels: new Map(),
      definitions: new Map(),
    };
    subjects.set(uri, created);
    return created;
  }

  for (const triple of triples) {
    if (!triple.subject.startsWith(schemeUriPrefix)) {
      continue;
    }

    const subject = getSubject(triple.subject);

    if (triple.predicate === RDF_TYPE && triple.objectType === "uri" && triple.object === SKOS_CONCEPT) {
      subject.isConcept = true;
      continue;
    }

    if (triple.predicate === SKOS_BROADER && triple.objectType === "uri") {
      subject.parentUri = triple.object;
      continue;
    }

    if (triple.predicate === SKOS_PREF_LABEL && triple.objectType === "literal") {
      subject.labels.set(triple.lang ?? "und", triple.object);
      continue;
    }

    if (triple.predicate === SKOS_ALT_LABEL && triple.objectType === "literal") {
      const bucket = subject.altLabels.get(triple.lang ?? "und") ?? [];
      bucket.push(triple.object);
      subject.altLabels.set(triple.lang ?? "und", bucket);
      continue;
    }

    if (triple.predicate === SKOS_DEFINITION && triple.objectType === "literal") {
      subject.definitions.set(triple.lang ?? "und", triple.object);
    }
  }

  return Array.from(subjects.values()).filter((subject) => subject.isConcept);
}

function deriveConceptCode(uri) {
  return uri.split("/").pop() ?? uri;
}

async function seedCoarScheme({
  schemeCode,
  schemeName,
  schemeVersion,
  schemeUri,
  conceptUriPrefix,
  description,
  ntFilePath,
}) {
  const nt = await fs.readFile(ntFilePath, "utf8");
  const triples = parseNTriples(nt);
  const concepts = buildCoarConceptMap(triples, conceptUriPrefix);
  const scheme = await upsertScheme({
    code: schemeCode,
    name: schemeName,
    version: schemeVersion,
    uri: schemeUri,
    description,
  });

  const conceptByUri = new Map();
  const pending = [...concepts].sort(
    (left, right) => deriveConceptCode(left.uri).localeCompare(deriveConceptCode(right.uri)),
  );
  let conceptCount = 0;

  while (pending.length > 0) {
    const before = pending.length;

    for (let index = pending.length - 1; index >= 0; index -= 1) {
      const concept = pending[index];
      if (concept.parentUri && !conceptByUri.has(concept.parentUri)) {
        continue;
      }

      const prefLabel =
        concept.labels.get("en") ??
        concept.labels.values().next().value ??
        deriveConceptCode(concept.uri);

      const altLabels = concept.altLabels.get("en") ?? [];
      const definition = concept.definitions.get("en") ?? null;
      const saved = await upsertConcept({
        schemeId: scheme.id,
        parentId: concept.parentUri ? conceptByUri.get(concept.parentUri)?.id ?? null : null,
        conceptCode: deriveConceptCode(concept.uri),
        conceptUri: concept.uri,
        prefLabel,
        altLabels,
        definition,
      });

      conceptByUri.set(concept.uri, saved);
      pending.splice(index, 1);
      conceptCount += 1;
    }

    if (pending.length === before) {
      throw new Error(`No se pudo resolver la jerarquia para ${schemeCode}.`);
    }
  }

  return {
    scheme: schemeCode,
    conceptCount,
  };
}

async function main() {
  await loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  const registry = await loadJson(registryPath);
  const sourceFiles = buildSourceFileMap(registry);
  const targets = [];

  if (!args.source || args.source === "ford") {
    targets.push("ford");
  }

  if (!args.source || args.source === "seismic-structural") {
    targets.push("seismic-structural");
  }

  if (!args.source || args.source === "applied-domains") {
    targets.push("applied-domains");
  }

  if (!args.source || args.source === "coar-resource-types") {
    targets.push("coar-resource-types");
  }

  if (!args.source || args.source === "coar-version-types") {
    targets.push("coar-version-types");
  }

  const results = [];

  try {
    for (const target of targets) {
      if (target === "ford") {
        results.push(await seedFord());
        continue;
      }

      if (target === "seismic-structural") {
        results.push(await seedLocalHierarchyTaxonomy(seismicPath));
        continue;
      }

      if (target === "applied-domains") {
        results.push(await seedLocalHierarchyTaxonomy(appliedDomainsPath));
        continue;
      }

      if (target === "coar-resource-types") {
        const [ntFilePath] = sourceFiles.get(target) ?? [];
        if (!ntFilePath) {
          throw new Error("No se encontro el archivo local de COAR Resource Types.");
        }

        results.push(
          await seedCoarScheme({
            schemeCode: "COAR-RESOURCE-TYPES-3.2",
            schemeName: "COAR Resource Types",
            schemeVersion: "3.2",
            schemeUri: "https://vocabularies.coar-repositories.org/resource_types/scheme",
            conceptUriPrefix: "http://purl.org/coar/resource_type/",
            description: "Seed from official COAR Resource Types N-Triples dump.",
            ntFilePath,
          }),
        );
        continue;
      }

      if (target === "coar-version-types") {
        const [ntFilePath] = sourceFiles.get(target) ?? [];
        if (!ntFilePath) {
          throw new Error("No se encontro el archivo local de COAR Version Types.");
        }

        results.push(
          await seedCoarScheme({
            schemeCode: "COAR-VERSION-TYPES-1.1",
            schemeName: "COAR Version Types",
            schemeVersion: "1.1",
            schemeUri: "https://vocabularies.coar-repositories.org/version_types/scheme",
            conceptUriPrefix: "http://purl.org/coar/version/",
            description: "Seed from official COAR Version Types N-Triples dump.",
            ntFilePath,
          }),
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log("Resumen de seed:");
  for (const result of results) {
    console.log(`- ${result.scheme}: ${result.conceptCount} conceptos`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
