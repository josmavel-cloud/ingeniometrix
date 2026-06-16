# 2026-04-23 - IMX-REPORT - Master Template LATAM

## Summary

Created a shared system template in Neon with key `MASTER_TEMPLATE_LATAM`.

This template is intended as the canonical LATAM base for:

- thesis plans
- research project plans
- multidisciplinary academic planning documents

It is compatible with institutional overlays and now acts as the generic reporting fallback in the reporting runtime.

## Database record

- `Template.key`: `MASTER_TEMPLATE_LATAM`
- `Template.name`: `MasterTemplate - LATAM Research Plan`
- `Template.ownerType`: `SYSTEM`
- `Template.status`: `ACTIVE`
- `TemplateVersion.versionNumber`: `1`
- `TemplateVersion.documentKind`: `TEMPLATE_GUIDE`
- `TemplateVersion.reviewStatus`: `REVIEWED`

## Runtime access

- Constant and loader:
  - `server/reporting/template-runtime/master-template.ts`
- Generic blueprint/reporting fallback now points to:
  - `MASTER_TEMPLATE_LATAM`

## Contents

The template includes:

- cover template with Ingeniometrix fallback logo
- editorial rules for Word/DOCX-compatible rendering
- methodology-aligned section tree
- explicit split between general and specific objectives
- consistency matrix as a native table section
- references and annexes

## Notes

- The template is stored in Neon with one source record and one logo asset record.
- The logo asset is backed by binary data in the database, not just a local path.
