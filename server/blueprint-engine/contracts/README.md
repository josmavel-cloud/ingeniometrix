# Blueprint Engine Contracts

Status: integration contract layer only.

This folder defines the shared boundary between the Evidence Engine handoff
(Lab A / `blueprint_launch`) and the future production Blueprint Engine
(Lab B / `master-blueprint`). These files are intentionally type and schema
contracts only. They do not execute Lab A or Lab B runtime behavior.

## Current Contracts

- `artifact-ref.ts`: immutable references to files, objects, DB blobs, or URLs.
- `evidence-engine-handoff-v1.ts`: TypeScript contract for the Lab A handoff.
- `evidence-engine-handoff-v1.schema.ts`: Zod validation schema for the handoff.
- `blueprint-engine-input-v1.ts`: TypeScript contract for Blueprint Engine input.
- `blueprint-engine-output-v1.ts`: TypeScript contract for Blueprint Engine output.
- `index.ts`: public exports for integration and validation tooling.

## Validation

The read-only validation script is:

```powershell
npx tsx scripts/validate-evidence-handoff-contract.ts
```

It adapts the current consolidated evidence artifact into the outer
`EvidenceEngineHandoffV1` shape, validates that adapted object with the Zod
schema in this folder, and prints a compact report. It must not modify the
original artifact.

## Temporary Current Lab A Adapter

`server/blueprint-engine/adapters/current-lab-a-handoff-adapter.ts` is a
temporary read-only bridge from the current Lab A consolidated evidence artifact
to the future production contracts. It exists so future Lab B integration can
target `EvidenceEngineHandoffV1` and `BlueprintEngineInputV1` without importing
Lab A runtime types.

Production should eventually receive immutable handoff ids and artifact refs
from the Evidence Engine directly. It should not depend on mutable `latest`
local paths.

The adapter smoke script is:

```powershell
npx tsx scripts/build-blueprint-input-from-current-lab-a.ts
```
