import { Step8Reader } from "@/components/labs/master-blueprint/step-8-reader";
import { loadMasterBlueprintLabFixtureSet } from "@/server/blueprint-v2/lab/fixture-loader";
import { runMasterBlueprintLabThroughStep } from "@/server/blueprint-v2/lab/pipeline";

export default async function MasterBlueprintStep8Page() {
  const fixtures = await loadMasterBlueprintLabFixtureSet({
    caseName: "blueprint-launch-latest",
  });
  const execution = await runMasterBlueprintLabThroughStep({
    fixtures,
    throughStep: "prompt_planning",
    allowLlm: true,
  });

  return (
    <Step8Reader
      snapshot={{
        fixtureCase: execution.fixtureCase,
        promptPlan: execution.artifacts.promptPlan as {
          artifact_version?: string;
          planner_mode?: string;
          llm_provider?: string | null;
          llm_model?: string | null;
          refined_intake_context?: {
            refined_topic_es?: string;
            normalized_problem_es?: string;
            normalized_methodology_es?: string | null;
            normalized_population_es?: string | null;
          };
          research_frame_light?: {
            topic_refined?: string;
            problem_core?: string;
            case_or_unit_of_analysis?: string | null;
            study_purpose?: string;
            study_question_type?: string;
            methodological_orientation?: string;
            expected_deliverable?: string;
            scope_limits?: string[];
            claims_ceiling?: string;
          };
          generation_waves?: Array<{
            wave_key: string;
            label: string;
            goal?: string;
            section_keys: string[];
            ready_count: number;
            blocked_count: number;
          }>;
          section_evidence_hydration_plan?: Array<{
            section_key: string;
            wave: string;
            priority_evidence_ids: string[];
            priority_original_excerpt_ids: string[];
            priority_snippet_ids: string[];
            priority_source_ids: string[];
            critical_asset_keys: string[];
            useful_asset_keys: string[];
            claims_allowed: string[];
            claims_to_avoid: string[];
            key_gaps: string[];
            required_structure: string[];
            min_words: number | null;
            max_words: number | null;
            required_original_fragments: string[];
            chunk_rehydration_hints: string[];
          }>;
          method_scope_guidance?: Array<{
            section_key: string;
            treatment: string;
            expected_elements: string[];
            supporting_method_signals: string[];
            avoid: string[];
          }>;
          claims_and_limits_guidance?: Array<{
            section_key: string;
            allowed_claims: string[];
            claims_to_avoid: string[];
            claims_conditioned: string[];
            validation_needs: string[];
          }>;
          final_sections_guidance?: {
            late_section_keys?: string[];
            abstract_rule?: string;
            keywords_rule?: string;
            references_rule?: string;
            title_refinement_rule?: string;
          };
          generation_plan?: Array<{
            section_key: string;
            title: string;
            wave?: string;
            generation_strategy?: string;
            prompt_mode?: string;
            readiness?: string;
            source_ids?: string[];
            snippet_ids?: string[];
            critical_asset_keys?: string[];
            useful_asset_keys?: string[];
            min_words?: number | null;
            max_words?: number | null;
            support_strategy?: string | null;
          }>;
          prompt_manifest?: Array<{
            section_key: string;
            title: string;
            prompt: string;
            evidence_snippet_ids: string[];
            critical_asset_keys?: string[];
            useful_asset_keys?: string[];
          }>;
          asset_inclusion_plan?: Array<{
            section_key: string;
            wave: string;
            asset_policy: string;
            critical_asset_keys: string[];
            useful_asset_keys: string[];
          }>;
          revision_pass_plan?: Array<{
            section_key: string;
            enabled: boolean;
            revision_goals: string[];
            trigger_conditions: string[];
          }>;
          citation_plan?: {
            style_target?: string | null;
          };
          checks?: {
            weak_sections?: string[];
            blocked_sections?: string[];
            sections_requiring_followup?: string[];
          };
          global_observations?: string[];
          merge_warnings?: string[];
        },
      }}
    />
  );
}
