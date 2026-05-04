# Master Blueprint Lab Fixtures

Caso base precargado para el laboratorio visual y el runner aislado del
`MasterBlueprintEngine`.

## Caso incluido

- `default`

## Contrato del fixture

- `synthetic-project.json`
- `synthetic-source-gate.json`
- `synthetic-acquisition.json`
- `synthetic-pdf-downloads.json`
- `synthetic-evidence-packs.json`
- `synthetic-evidence-ledger.json`

## Uso

- UI: `app/lab/master-blueprint/page.tsx`
- API de ejecucion: `app/api/labs/master-blueprint/execute/route.ts`
- Runner CLI: `npm run lab:master-blueprint:steps-5-11`
