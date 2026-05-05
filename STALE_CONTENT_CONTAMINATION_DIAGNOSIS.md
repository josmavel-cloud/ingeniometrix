# Stale Content Contamination Diagnosis

Batch: 3C.2

Current diagnostic run inspected:

`artifacts-local/lab-b-full-diagnostic-docx-runs/case-001-seismic-isolators-peruvian-buildings/2026-05-05T02-14-14-456Z`

Current handoff inspected:

`artifacts-local/evidence-selected-source-runs/case-001-seismic-isolators-peruvian-buildings/2026-05-04T18-13-11-093Z/evidence-handoff-v1.json`

## Findings

### Where previous intake content can enter the current run

1. `server/blueprint-v2/lab/template-import-context.ts` still had a legacy Step 7 compatibility field named `missing_mass_timber_support` and old-topic warning text for Toronto/Canada/mass-timber. The contract diagnostic runner did not depend on old latest Lab A state, but the generated Step 7 artifact still carried this stale key name.
2. `server/blueprint-v2/lab/artifact-reader.ts` intentionally loads the latest local Lab B artifact folder for lab inspection. This is useful for read-only debugging, but it is not safe as a production-shaped source of truth unless the loaded run is checked against the active handoff hash.
3. `server/blueprint-v2/lab/template-import-context.ts` can read mutable `latest-*` Lab A paths and resolve latest materialized/extracted asset folders. This is a stale-content risk if used outside read-only lab inspection.
4. `server/blueprint-v2/lab/steps-11-13-runner.ts` can select latest Lab B run folders when `runDir` is omitted. That is acceptable for old lab scripts, but unsafe for handoff-driven production-shaped execution.
5. `scripts/run-lab-b-full-diagnostic-docx.ts` previously wrote only a light fresh-run warning report and did not block severe stale source/asset/topic contamination before DOCX.
6. The current `EvidenceEngineHandoffV1` still contains mutable `latest-consolidated-evidence.json` artifact refs because the current Lab A adapter preserves the source artifact ref. In diagnostic mode this is a warning; in production mode immutable handoff refs should replace it.

### Are mutable latest paths still used?

Yes. The inspected run shows `latest-consolidated-evidence.json` in `evidence-handoff-v1.json`, `blueprint-engine-input.json`, and `05-step-7-template-import-context.json`. This is now surfaced as `mutable_latest_path_count` and remains a production-safety warning/block depending on mode.

### Are cached Step 9/10/11/12/13 artifacts reused without checking handoff hash?

The handoff-driven full diagnostic runner sets `reuse_cached_artifacts: false` and writes to a new run folder. It does not reuse Step 9-13 outputs. However, separate lab readers/runners can load latest run folders, so the new fresh-run isolation guard is now applied in the handoff-driven runner before DOCX rendering.

### Are extracted assets/equations/images read from a previous run folder?

The inspected DOCX run did not show stale public media from another Lab B run. The risk was structural: asset refs were not being checked against the current handoff asset registry before DOCX rendering. The new guard checks section, figure, equation, and asset placement refs against current source/evidence/asset IDs.

### Are template/import-context artifacts carrying old topic/intake text?

Yes, as an artifact field name: `missing_mass_timber_support`. The old topic text itself was not rendered into public DOCX, but the field was stale and could influence prompts if set true in another path. It has been replaced with generic `missing_technique_specific_support`.

### Are DOCX media assets selected from stale asset folders?

No stale media folder was confirmed in the inspected run. The new guard now blocks media refs from other `artifacts-local/lab-b-full-diagnostic-docx-runs`, `artifacts-local/evidence-selected-source-runs`, or `artifacts-local/blueprint-v2-lab` folders unless they belong to the current output/evidence run or are deterministic template assets.

### Are captions or equations coming from stale assets?

The inspected run did not confirm stale public captions/equations, but there was no hard gate. The new scan checks figure/equation plans, asset placements, and public document fields for stale asset/source/evidence refs and old-topic markers.

### Are section drafts or document models reused when input hashes differ?

The current full diagnostic runner regenerates them into a fresh timestamped folder. The risk remains in generic latest-run lab readers. The new handoff-driven guard records the current `handoff_id`, `evidence_run_id`, and `immutable_snapshot_hash` and fails if public-facing refs point elsewhere.

### Are fallback or test assets semantically tied to an old topic?

The previous deterministic hero fallback was generic but weak. It was not tied to an old topic. The hero policy and fallback now derive from the current title/topic/workflow and explicitly avoid backend/debug/stale markers.

## Implemented Guard

New helper:

`server/blueprint-engine/quality/fresh-run-isolation.ts`

It verifies:

- source refs belong to the current handoff source registry;
- evidence refs belong to the current handoff evidence units;
- asset refs belong to the current handoff asset registry or are deterministic template assets;
- mutable latest paths are counted and flagged;
- paths from other run folders are blocked;
- public-facing text is scanned for known old-topic markers and foreign handoff/run IDs.

Diagnostic mode blocks severe stale source/asset/topic findings unless `--allow-stale-content` is explicitly passed. The default package script does not pass that flag.

## Remaining Deferred Work

- Replace Lab A `latest-consolidated-evidence.json` artifact refs with immutable production handoff refs when production handoff storage exists.
- Add handoff-hash validation to legacy latest-run readers if those paths remain useful after Release 0.
- Expand deterministic topic-contamination markers after the second intake/methodology iteration provides richer topic signatures.
