import { Step7Reader } from "@/components/labs/master-blueprint/step-7-reader";
import { loadMasterBlueprintLabFixtureSet } from "@/server/blueprint-v2/lab/fixture-loader";
import { runMasterBlueprintLabThroughStep } from "@/server/blueprint-v2/lab/pipeline";
import type { TemplateQualityContractArtifact } from "@/server/blueprint-v2/lab/template-quality-contract";
import type { MasterBlueprintLabSyntheticOverview } from "@/lib/labs/master-blueprint/types";
import type { TemplateRuntimeInspectionArtifact } from "@/server/blueprint-v2/lab/template-runtime-inspector";

export default async function MasterBlueprintStep7Page() {
  const fixtures = await loadMasterBlueprintLabFixtureSet({
    caseName: "blueprint-launch-latest",
  });
  const execution = await runMasterBlueprintLabThroughStep({
    fixtures,
    throughStep: "master_template_runtime",
    allowLlm: false,
  });

  return (
    <Step7Reader
      snapshot={{
        fixtureCase: execution.fixtureCase,
        importedOverview: execution.inspectors.syntheticOverview as MasterBlueprintLabSyntheticOverview,
        sourceRegistry: execution.inspectors.sourceRegistry as {
          source_registry?: Array<{
            source_id: string;
            reference_id: string | null;
            origin: string;
            title: string;
            year: number | null;
            pdf_url?: string | null;
            landing_page_url?: string | null;
          }>;
        },
        pdfDownloads: execution.inspectors.pdfDownloads as {
          records?: Array<{
            source_id: string;
            status: string;
            stored_file_path?: string | null;
            resolved_pdf_url?: string | null;
          }>;
        },
        evidencePacks: execution.inspectors.evidencePacks as unknown as Array<{
          source_id: string;
          snippets?: Array<{ snippet_id: string; label: string; text: string }>;
          assets?: Array<{
            asset_key: string;
            kind: "image" | "equation" | "table";
            title: string;
            caption: string | null;
            file_path: string | null;
            mime_type: string | null;
            text_content: string | null;
            page_number: number | null;
          }>;
        }>,
        evidenceLedger: execution.inspectors.evidenceLedger as {
          source_registry?: Array<{
            source_id: string;
            title: string;
          }>;
          snippets?: Array<{
            snippet_id: string;
            source_id: string | null;
            origin: string;
            label: string;
            text: string;
            section_hint_keys?: string[];
            confidence?: number;
          }>;
          assets?: Array<{
            source_id: string;
            asset_key: string;
            title: string;
            kind: "image" | "equation" | "table";
            caption: string | null;
            page_number: number | null;
            file_path: string | null;
            mime_type: string | null;
            text_content: string | null;
          }>;
          assumptions?: Array<{
            assumption_id: string;
            statement: string;
            section_keys?: string[];
          }>;
        },
        masterTemplateRuntime: execution.artifacts.masterTemplateRuntime as {
          template_name?: string;
          template_key?: string;
          template_version_id?: string;
          required_section_keys?: string[];
          sections?: Array<{ semantic_key?: string; title?: string }>;
        },
        templateImportContext: execution.artifacts.templateImportContext as {
          source_snapshot?: {
            source_lab?: string;
            lab_state_path?: string;
            latest_consolidated_evidence_path?: string | null;
            materialized_content_dir?: string;
            extracted_assets_dir?: string;
            resolved_materialized_run_id?: string | null;
            resolved_assets_run_id?: string | null;
            resolved_consolidated_run_id?: string | null;
          };
          imported_project_context?: {
            knowledge_area_label?: string | null;
            topic?: string;
            problem_context?: string | null;
            target_population?: string | null;
            preferred_methodology?: string | null;
          };
          imported_evidence_context?: {
            selected_source_count?: number;
            materialized_pdf_count?: number;
            materialized_web_count?: number;
            total_snippet_count?: number;
            total_asset_count?: number;
            evidence_unit_count?: number;
            original_excerpt_count?: number;
            asset_reference_count?: number;
            section_dossier_count?: number;
            overall_readiness?: string | null;
            quality_gate_status?: string | null;
            baseline_comparison_status?: string | null;
          };
          source_id_bridge?: Array<{
            imported_source_id: string;
            fixture_source_id: string | null;
            title: string;
            materialized_source_available?: boolean;
            imported_asset_count?: number;
            imported_direct_excerpt_count?: number;
            has_pdf_materialization?: boolean;
            top_section_keys?: string[];
          }>;
          proposal_context?: {
            method_candidate?: { method_family?: string | null };
            framework_candidate?: { core_framework?: string | null };
            dominant_methods?: string[];
            dominant_frameworks?: string[];
            evidence_gaps?: string[];
          };
          section_alignment_map?: Array<{
            section_key: string;
            template_title: string;
            readiness: string;
            enough_to_draft: boolean;
            mapped_imported_section_keys: string[];
            imported_source_ids: string[];
            recommended_snippet_ids: string[];
            recommended_asset_keys: string[];
            generation_priority: string;
            generation_role: string;
            direct_excerpt_count?: number;
            asset_reference_count?: number;
            has_citable_original_excerpt?: boolean;
            has_critical_assets_candidate?: boolean;
            dominant_evidence_types?: string[];
            dossier_summary?: string | null;
            gap_labels?: string[];
            notes?: string[];
          }>;
          imported_handoff_summary?: {
            ready_for_steps_7_11?: boolean | null;
            quality_gate_status?: string | null;
            baseline_comparison_status?: string | null;
            handoff_notes?: string[];
            traceability_warnings?: string[];
            previous_lab_warnings?: string[];
            read_only_input_paths?: string[];
            next_lab_should_read?: string[];
            next_lab_should_not_modify?: string[];
          };
          checks?: {
            mapped_section_count?: number;
            weak_sections?: string[];
            blocked_sections?: string[];
            missing_local_context?: boolean;
            missing_regulatory_context?: boolean;
            missing_mass_timber_support?: boolean;
            selected_sources_match?: boolean;
            stale_snapshot_detected?: boolean;
          };
          warnings?: string[];
        },
        templateRuntimeInspection: execution.artifacts
          .templateRuntimeInspection as unknown as TemplateRuntimeInspectionArtifact,
        templateQualityContract: execution.artifacts
          .templateQualityContract as unknown as TemplateQualityContractArtifact,
      }}
    />
  );
}
