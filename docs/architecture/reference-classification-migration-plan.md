# Reference Classification Migration Plan

## Goal

Add a minimal but correct metadata layer for:

- knowledge field classification
- scholarly resource type normalization
- peer review status
- publication stage
- index membership
- keywords and training provenance

This plan is designed to fit Release 0 constraints and avoid unnecessary ontology work.

## Current State

Current storage in [prisma/schema.prisma](C:/projects/ingeniometrix/prisma/schema.prisma:1):

- `Project` stores user, university, template, and degree context
- `Intake` stores the structured thesis-planning inputs
- `Reference` stores raw bibliographic data plus `workType`
- `rawOpenAlexJson` and `rawCrossrefJson` preserve provider payloads

Current limitation:

- `Reference.workType` is provider-native and not a canonical classification layer
- there is no explicit storage for peer review, publication stage, indexing, taxonomy concept mapping, or keywords

## Recommended Standards By Axis

- `knowledge_field`: `FORD`
- `study_field`: `ISCED-F` when needed
- `resource_type_general`: `DCMI Type`
- `resource_type_specific`: `COAR Resource Types`
- `doi_interop_type`: `DataCite` compatible label where available
- `thesis_metadata_profile`: `ETD-MS`
- `peer_review_status` and `peer_review_model`: `NISO` terminology when known
- `controlled_keywords`: `UNESCO Thesaurus` plus provider topics and author keywords

## Canonical Model

Treat classification as separate axes, not one label:

- a `master thesis` can be `Text`, may have no DOI, may be non-indexed, and may have no peer review
- a `journal article` can be peer reviewed or not
- a `preprint` can be indexed in some systems and still not be peer reviewed
- `paper` is informal UI copy, not a storage class

## Proposed Prisma Additions

### Enums

```prisma
enum PeerReviewStatus {
  PEER_REVIEWED
  NOT_PEER_REVIEWED
  UNKNOWN
}

enum PublicationStage {
  PREPRINT
  ACCEPTED_MANUSCRIPT
  VERSION_OF_RECORD
  CORRECTED_VERSION
  RETRACTED
  UNKNOWN
}

enum ClassificationSource {
  PROVIDER
  RULE
  USER
  MODEL
  SYSTEM
}

enum IndexName {
  OPENALEX
  CROSSREF
  DOAJ
  SCOPUS
  WEB_OF_SCIENCE
  LATINDEX
  SCIELO
  REDALYC
  DIALNET
  OTHER
}

enum KeywordSource {
  AUTHOR
  PROVIDER
  USER
  MODEL
  SYSTEM
}
```

### New Models

```prisma
model TaxonomyScheme {
  id          String   @id @default(uuid())
  code        String   @unique
  name        String
  version     String?
  uri         String?
  description String?  @db.Text
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  concepts    TaxonomyConcept[]
}

model TaxonomyConcept {
  id              String   @id @default(uuid())
  schemeId        String
  parentId        String?
  conceptCode     String
  conceptUri      String?
  prefLabel       String
  altLabelsJson   Json?
  definition      String?  @db.Text
  lang            String   @default("es")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  scheme          TaxonomyScheme @relation(fields: [schemeId], references: [id], onDelete: Cascade)
  parent          TaxonomyConcept? @relation("TaxonomyConceptTree", fields: [parentId], references: [id], onDelete: SetNull)
  children        TaxonomyConcept[] @relation("TaxonomyConceptTree")
  projectFields   ProjectKnowledgeField[]
  referenceFields ReferenceFieldAssignment[]
  referenceTypes  ReferenceClassification[]
  keywords        ReferenceKeyword[]

  @@unique([schemeId, conceptCode])
}

model ProjectKnowledgeField {
  id                String   @id @default(uuid())
  projectId         String
  conceptId         String
  isPrimary         Boolean  @default(false)
  source            ClassificationSource
  confidence        Float?
  evidenceJson      Json?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  project           Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  concept           TaxonomyConcept @relation(fields: [conceptId], references: [id], onDelete: Cascade)

  @@index([projectId, isPrimary])
  @@unique([projectId, conceptId])
}

model ReferenceClassification {
  id                    String   @id @default(uuid())
  referenceId           String   @unique
  resourceTypeGeneral   String?
  resourceTypeSpecific  String?
  resourceTypeConceptId String?
  peerReviewStatus      PeerReviewStatus @default(UNKNOWN)
  publicationStage      PublicationStage @default(UNKNOWN)
  doiInteropType        String?
  source                ClassificationSource
  confidence            Float?
  evidenceJson          Json?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  reference             Reference @relation(fields: [referenceId], references: [id], onDelete: Cascade)
  resourceTypeConcept   TaxonomyConcept? @relation(fields: [resourceTypeConceptId], references: [id], onDelete: SetNull)
}

model ReferenceFieldAssignment {
  id           String   @id @default(uuid())
  referenceId  String
  conceptId    String
  isPrimary    Boolean  @default(false)
  source       ClassificationSource
  confidence   Float?
  evidenceJson Json?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  reference    Reference @relation(fields: [referenceId], references: [id], onDelete: Cascade)
  concept      TaxonomyConcept @relation(fields: [conceptId], references: [id], onDelete: Cascade)

  @@index([referenceId, isPrimary])
  @@unique([referenceId, conceptId])
}

model ReferenceIndexMembership {
  id           String   @id @default(uuid())
  referenceId  String
  indexName    IndexName
  indexLabel   String?
  source       ClassificationSource
  status       String
  evidenceJson Json?
  checkedAt    DateTime @default(now())
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  reference    Reference @relation(fields: [referenceId], references: [id], onDelete: Cascade)

  @@unique([referenceId, indexName])
}

model ReferenceKeyword {
  id                String   @id @default(uuid())
  referenceId       String
  keywordText       String
  normalizedKeyword String
  conceptId         String?
  source            KeywordSource
  score             Float?
  isValidated       Boolean  @default(false)
  evidenceJson      Json?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  reference         Reference @relation(fields: [referenceId], references: [id], onDelete: Cascade)
  concept           TaxonomyConcept? @relation(fields: [conceptId], references: [id], onDelete: SetNull)

  @@index([referenceId, normalizedKeyword])
}

model ProjectKeyword {
  id                String   @id @default(uuid())
  projectId         String
  keywordText       String
  normalizedKeyword String
  conceptId         String?
  source            KeywordSource
  score             Float?
  isValidated       Boolean  @default(false)
  evidenceJson      Json?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  project           Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  concept           TaxonomyConcept? @relation(fields: [conceptId], references: [id], onDelete: SetNull)

  @@index([projectId, normalizedKeyword])
}

model LabelEvent {
  id              String   @id @default(uuid())
  projectId       String?
  referenceId     String?
  entityType      String
  labelKind       String
  labelValue      String
  source          ClassificationSource
  confidence      Float?
  evidenceJson    Json?
  createdAt       DateTime @default(now())
}
```

## Minimal Release 0 Variant

If the full model feels too large for the next iteration, start with this reduced slice:

- `ReferenceClassification`
- `ReferenceIndexMembership`
- `ReferenceKeyword`
- `ProjectKnowledgeField`
- `TaxonomyScheme`
- `TaxonomyConcept`

Defer:

- `ReferenceFieldAssignment`
- `ProjectKeyword`
- `LabelEvent`

Even in the reduced slice, keep `evidenceJson`, `source`, and `confidence`.

## Required Small Changes To Existing Models

Keep provider-native typing separate from canonical typing:

```prisma
model Reference {
  id                String   @id @default(uuid())
  ...
  workType          String?
  providerWorkType  String?
  ...
  classification    ReferenceClassification?
  indexMemberships  ReferenceIndexMembership[]
  keywords          ReferenceKeyword[]
  fieldAssignments  ReferenceFieldAssignment[]
}

model Project {
  id          String   @id @default(uuid())
  ...
  knowledgeFields ProjectKnowledgeField[]
  keywords        ProjectKeyword[]
}
```

Migration note:

- rename current `workType` to `providerWorkType` if you want strict semantics
- if a fast migration is preferred, keep `workType` and document it as provider-native until the read path is updated

## Canonical Mapping Rules

### Resource Type Mapping

Store:

- raw provider value in `providerWorkType`
- canonical broad type in `resourceTypeGeneral`
- canonical scholarly type in `resourceTypeSpecific`
- optional taxonomy concept link in `resourceTypeConceptId`

Examples:

- OpenAlex `article` -> `Text` + `journal article`
- Crossref `journal-article` -> `Text` + `journal article`
- Crossref `posted-content` with preprint evidence -> `Text` + `preprint`
- repository thesis record -> `Text` + `master thesis` or `doctoral thesis`

### Peer Review

Do not infer peer review from document type alone.

Rules:

- default to `UNKNOWN`
- set `PEER_REVIEWED` only when the source explicitly supports it
- keep the evidence in `evidenceJson`

### Index Membership

Never flatten this to one boolean.

Store one row per index:

- `OPENALEX`
- `CROSSREF`
- later `DOAJ`, `SCOPUS`, `WEB_OF_SCIENCE`, `SCIELO`, `REDALYC`, `LATINDEX`, `DIALNET`

### Knowledge Field

Project-level field assignment should start from:

- intake topic
- problem context
- program
- optional preset catalog metadata

Reference-level field assignment can later use:

- provider topics
- title
- abstract
- venue
- validated project field

## Keyword Strategy

Use three keyword lanes:

- `controlled`: mapped to a taxonomy concept when possible
- `free_text`: raw useful phrase kept as-is
- `derived`: generated by rules or model, always with source and score

Suggested priority:

1. author or provider keywords
2. controlled concepts from taxonomy
3. derived phrases from title plus abstract
4. later model-suggested keywords

For future model training, do not train on the flattened final keyword list alone.

Keep:

- source text snapshot
- assigned keyword
- source type
- confidence
- validation state
- taxonomy version when concept-mapped

## Backfill Plan

### Phase 1

- seed `TaxonomyScheme`
- seed only the top useful concepts for `FORD` and `COAR`
- create `ReferenceClassification` rows for existing references
- set `resourceTypeSpecific` from current `workType` using a small mapping table
- set `ReferenceIndexMembership` for `OPENALEX` and `CROSSREF`

### Phase 2

- add `ProjectKnowledgeField`
- backfill from project presets and intake heuristics
- expose field labels in project UI and internal prompts

### Phase 3

- add `ReferenceKeyword`
- harvest keywords from provider payloads and title or abstract rules
- expose keyword suggestions in retrieval and export contexts

### Phase 4

- add richer concept mapping, validation, and training exports

## Release 0 Safe Defaults

Use these defaults when metadata is incomplete:

- `peerReviewStatus = UNKNOWN`
- `publicationStage = UNKNOWN`
- no inferred index membership unless it is directly evidenced
- no forced taxonomy concept mapping when only a free-text keyword is available

This preserves traceability and avoids fabricated metadata.

## Why This Fits Ingeniometrix

This model improves:

- reproducibility
- source traceability
- schema validity
- export reliability

It also stays inside Release 0 boundaries because the first phase can be limited to normalized reference typing, index membership, and project field assignment without expanding providers or product scope.
