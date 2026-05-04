# Taxonomy Query Cheatsheet

## Goal

Quick inspection queries for the taxonomy layer now stored in Postgres.

Run them against the local database:

```bash
docker exec -i ingeniometrix-postgres psql -U ingeniometrix -d ingeniometrix
```

## 1. List Taxonomy Schemes

```sql
SELECT code, name, version, uri
FROM "TaxonomyScheme"
ORDER BY code;
```

## 2. Count Concepts By Scheme

```sql
SELECT ts.code, COUNT(*) AS concepts
FROM "TaxonomyConcept" tc
JOIN "TaxonomyScheme" ts ON ts.id = tc."schemeId"
GROUP BY ts.code
ORDER BY ts.code;
```

## 3. Inspect FORD Hierarchy

```sql
SELECT parent."conceptCode" AS parent_code,
       parent."prefLabel" AS parent_label,
       child."conceptCode" AS child_code,
       child."prefLabel" AS child_label
FROM "TaxonomyConcept" child
JOIN "TaxonomyConcept" parent ON parent.id = child."parentId"
JOIN "TaxonomyScheme" ts ON ts.id = child."schemeId"
WHERE ts.code = 'FORD-2015'
ORDER BY parent."conceptCode", child."conceptCode";
```

## 4. Find COAR Concepts By Label

```sql
SELECT tc."conceptCode", tc."prefLabel", tc.definition
FROM "TaxonomyConcept" tc
JOIN "TaxonomyScheme" ts ON ts.id = tc."schemeId"
WHERE ts.code = 'COAR-RESOURCE-TYPES-3.2'
  AND LOWER(tc."prefLabel") LIKE '%thesis%'
ORDER BY tc."prefLabel";
```

## 5. Distribution Of Project Knowledge Fields

```sql
SELECT tc."conceptCode",
       tc."prefLabel",
       COUNT(pkf.id) AS projects
FROM "ProjectKnowledgeField" pkf
JOIN "TaxonomyConcept" tc ON tc.id = pkf."conceptId"
WHERE pkf."isPrimary" = true
GROUP BY tc."conceptCode", tc."prefLabel"
ORDER BY projects DESC, tc."conceptCode";
```

## 6. Show Project Field Assignments With Evidence

```sql
SELECT p.title,
       p.program,
       tc."conceptCode",
       tc."prefLabel",
       pkf.source,
       pkf.confidence,
       pkf."evidenceJson"
FROM "ProjectKnowledgeField" pkf
JOIN "Project" p ON p.id = pkf."projectId"
JOIN "TaxonomyConcept" tc ON tc.id = pkf."conceptId"
WHERE pkf."isPrimary" = true
ORDER BY pkf.confidence DESC, p."createdAt" DESC
LIMIT 20;
```

## 7. Distribution Of Reference Resource Types

```sql
SELECT COALESCE("resourceTypeSpecific", 'NULL') AS resource_type,
       COUNT(*) AS refs,
       COUNT(*) FILTER (WHERE "resourceTypeConceptId" IS NOT NULL) AS mapped_to_concept
FROM "ReferenceClassification"
GROUP BY COALESCE("resourceTypeSpecific", 'NULL')
ORDER BY refs DESC, resource_type;
```

## 8. Show Reference Classification Examples

```sql
SELECT r.title,
       rc."resourceTypeGeneral",
       rc."resourceTypeSpecific",
       tc."conceptCode",
       tc."prefLabel",
       rc."peerReviewStatus",
       rc."publicationStage",
       rc.source,
       rc.confidence,
       rc."evidenceJson"
FROM "ReferenceClassification" rc
JOIN "Reference" r ON r.id = rc."referenceId"
LEFT JOIN "TaxonomyConcept" tc ON tc.id = rc."resourceTypeConceptId"
ORDER BY r."createdAt" DESC
LIMIT 20;
```

## 9. Check Index Membership Coverage

```sql
SELECT "indexName", COUNT(*) AS references
FROM "ReferenceIndexMembership"
GROUP BY "indexName"
ORDER BY references DESC, "indexName";
```

## 10. Show Reference Index Examples

```sql
SELECT r.title,
       rim."indexName",
       rim."indexLabel",
       rim.source,
       rim.status,
       rim."evidenceJson"
FROM "ReferenceIndexMembership" rim
JOIN "Reference" r ON r.id = rim."referenceId"
ORDER BY rim."createdAt" DESC
LIMIT 20;
```

## 11. See Tables Still Empty

```sql
SELECT COUNT(*) AS total_keywords,
       COUNT(*) FILTER (WHERE "isValidated" = true) AS validated_keywords
FROM "ReferenceKeyword";
```

## 12. Spot References Still Needing Better Classification

```sql
SELECT r.title,
       r."workType",
       rc."resourceTypeSpecific",
       tc."prefLabel" AS mapped_concept
FROM "Reference" r
JOIN "ReferenceClassification" rc ON rc."referenceId" = r.id
LEFT JOIN "TaxonomyConcept" tc ON tc.id = rc."resourceTypeConceptId"
WHERE rc."resourceTypeConceptId" IS NULL
ORDER BY r."createdAt" DESC
LIMIT 50;
```

## 13. Project Classifications By University

```sql
SELECT p.university,
       tc."conceptCode",
       tc."prefLabel",
       COUNT(*) AS projects
FROM "ProjectKnowledgeField" pkf
JOIN "Project" p ON p.id = pkf."projectId"
JOIN "TaxonomyConcept" tc ON tc.id = pkf."conceptId"
WHERE pkf."isPrimary" = true
GROUP BY p.university, tc."conceptCode", tc."prefLabel"
ORDER BY p.university, projects DESC;
```

## 14. Readiness For Keywords

```sql
SELECT COUNT(*) AS total_refs,
       COUNT(*) FILTER (WHERE doi IS NOT NULL AND doi <> '') AS refs_with_doi,
       COUNT(*) FILTER (WHERE abstract IS NOT NULL AND abstract <> '') AS refs_with_abstract,
       COUNT(*) FILTER (WHERE venue IS NOT NULL AND venue <> '') AS refs_with_venue,
       COUNT(*) FILTER (WHERE "landingPageUrl" IS NOT NULL AND "landingPageUrl" <> '') AS refs_with_landing
FROM "Reference";
```
