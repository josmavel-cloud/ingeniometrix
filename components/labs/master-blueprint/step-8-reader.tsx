"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, FileJson, Layers3, ScrollText, Waypoints } from "lucide-react";

import { JsonViewer } from "@/components/labs/master-blueprint/json-viewer";

type Step8ReaderProps = {
  snapshot: Step8Snapshot;
};

type Step8Snapshot = {
  fixtureCase: string;
  promptPlan: {
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
    research_logic_contract_plan?: {
      mode?: string;
      row_id_format?: string;
      correspondence_rules?: string[];
      step9_prompt_rules?: string[];
      step10_llm_rules?: string[];
      docx_table_contract?: {
        orientation?: string;
        row_count_target?: string;
        required_columns?: string[];
      };
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
  };
};

function StatCard(props: { label: string; value: string }) {
  return (
    <article className="rounded-[22px] border border-[rgba(74,58,97,0.08)] bg-white/90 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
        {props.label}
      </p>
      <p className="mt-2 text-sm leading-6 text-[var(--color-ink)]">{props.value}</p>
    </article>
  );
}

function Pill(props: { children: string }) {
  return (
    <span className="rounded-full border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.72)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
      {props.children}
    </span>
  );
}

export function Step8Reader({ snapshot }: Step8ReaderProps) {
  const [selectedPanel, setSelectedPanel] = useState<
    "overview" | "frame" | "hydration" | "claims" | "prompts" | "raw"
  >("overview");
  const [selectedSectionKey, setSelectedSectionKey] = useState<string | null>(null);

  const generationPlan = snapshot.promptPlan.generation_plan ?? [];
  const hydrationPlan = snapshot.promptPlan.section_evidence_hydration_plan ?? [];
  const manifest = snapshot.promptPlan.prompt_manifest ?? [];
  const claims = snapshot.promptPlan.claims_and_limits_guidance ?? [];
  const methods = snapshot.promptPlan.method_scope_guidance ?? [];
  const selectedSection =
    hydrationPlan.find((item) => item.section_key === selectedSectionKey) ?? hydrationPlan[0] ?? null;
  const selectedManifest =
    manifest.find((item) => item.section_key === selectedSection?.section_key) ?? null;
  const selectedClaim =
    claims.find((item) => item.section_key === selectedSection?.section_key) ?? null;
  const selectedMethod =
    methods.find((item) => item.section_key === selectedSection?.section_key) ?? null;
  const waveSummary = useMemo(() => snapshot.promptPlan.generation_waves ?? [], [snapshot.promptPlan.generation_waves]);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f6f1ea_0%,#fbf8f3_48%,#f5efe8_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6">
        <header className="rounded-[32px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-4xl">
              <Link
                className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]"
                href="/lab/master-blueprint"
              >
                <ArrowLeft className="size-4" />
                Volver al lab
              </Link>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Step 8 / section_planning
              </p>
              <h1 className="mt-2 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
                Step 8 Reader
              </h1>
              <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                Vista exclusiva del planner multi-ola con marco metodologico light, hidratacion de evidencia,
                claims y prompts finales por seccion.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Pill>{snapshot.fixtureCase}</Pill>
              <Pill>{snapshot.promptPlan.artifact_version ?? "sin version"}</Pill>
              <Pill>{snapshot.promptPlan.planner_mode ?? "sin planner_mode"}</Pill>
              <Pill>{snapshot.promptPlan.citation_plan?.style_target ?? "sin citation style"}</Pill>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Secciones planificadas" value={`${generationPlan.length}`} />
          <StatCard label="Planes de hidratacion" value={`${hydrationPlan.length}`} />
          <StatCard label="Guias metodologicas" value={`${methods.length}`} />
          <StatCard
            label="Warnings / followup"
            value={`${snapshot.promptPlan.merge_warnings?.length ?? 0} / ${snapshot.promptPlan.checks?.sections_requiring_followup?.length ?? 0}`}
          />
        </section>

        <nav className="flex flex-wrap gap-2">
          {[
            { key: "overview", label: "Overview", icon: Waypoints },
            { key: "frame", label: "Research frame", icon: Layers3 },
            { key: "hydration", label: "Hydration", icon: ScrollText },
            { key: "claims", label: "Claims", icon: Layers3 },
            { key: "prompts", label: "Prompts", icon: ScrollText },
            { key: "raw", label: "JSON raw", icon: FileJson },
          ].map((item) => {
            const Icon = item.icon;
            const active = selectedPanel === item.key;

            return (
              <button
                key={item.key}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  active
                    ? "bg-[var(--color-accent)] text-white"
                    : "border border-[rgba(74,58,97,0.08)] bg-white text-[var(--color-ink)]"
                }`}
                onClick={() => setSelectedPanel(item.key as typeof selectedPanel)}
                type="button"
              >
                <Icon className="size-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {selectedPanel === "overview" ? (
          <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <article className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-6">
              <h2 className="text-lg font-semibold text-[var(--color-ink)]">Olas y checks</h2>
              <div className="mt-4 grid gap-4">
                {waveSummary.map((wave) => (
                  <div key={wave.wave_key} className="rounded-[22px] border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.56)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--color-ink)]">{wave.label}</p>
                        <p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">{wave.goal}</p>
                      </div>
                      <Pill>{`${wave.ready_count} ready / ${wave.blocked_count} blocked`}</Pill>
                    </div>
                    <p className="mt-3 text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">
                      {wave.section_keys.join(", ")}
                    </p>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-6">
              <h2 className="text-lg font-semibold text-[var(--color-ink)]">Observaciones</h2>
              <div className="mt-4 space-y-4 text-sm leading-7 text-[var(--color-muted)]">
                {(snapshot.promptPlan.global_observations ?? []).map((item) => (
                  <p key={item}>{item}</p>
                ))}
                {(snapshot.promptPlan.merge_warnings ?? []).map((item) => (
                  <p key={item} className="text-[var(--color-warning)]">
                    {item}
                  </p>
                ))}
              </div>
            </article>
          </section>
        ) : null}

        {selectedPanel === "frame" ? (
          <section className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-6">
            <h2 className="text-lg font-semibold text-[var(--color-ink)]">Research frame light</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <StatCard label="Tema refinado" value={snapshot.promptPlan.research_frame_light?.topic_refined ?? "sin dato"} />
              <StatCard label="Tipo de pregunta" value={snapshot.promptPlan.research_frame_light?.study_question_type ?? "sin dato"} />
              <StatCard label="Proposito" value={snapshot.promptPlan.research_frame_light?.study_purpose ?? "sin dato"} />
              <StatCard label="Entregable esperado" value={snapshot.promptPlan.research_frame_light?.expected_deliverable ?? "sin dato"} />
            </div>
            <div className="mt-6 grid gap-4">
              <StatCard label="Caso o unidad de analisis" value={snapshot.promptPlan.research_frame_light?.case_or_unit_of_analysis ?? "sin dato"} />
              <StatCard label="Orientacion metodologica" value={snapshot.promptPlan.research_frame_light?.methodological_orientation ?? "sin dato"} />
              <StatCard label="Techo de claims" value={snapshot.promptPlan.research_frame_light?.claims_ceiling ?? "sin dato"} />
            </div>
            <div className="mt-6 grid gap-4">
              <h3 className="text-base font-semibold text-[var(--color-ink)]">Contrato de logica investigativa</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <StatCard label="Modo" value={snapshot.promptPlan.research_logic_contract_plan?.mode ?? "sin contrato"} />
                <StatCard label="IDs de filas" value={snapshot.promptPlan.research_logic_contract_plan?.row_id_format ?? "sin contrato"} />
                <StatCard
                  label="Reglas de correspondencia"
                  value={snapshot.promptPlan.research_logic_contract_plan?.correspondence_rules?.join(" | ") ?? "sin contrato"}
                />
                <StatCard
                  label="Contrato DOCX"
                  value={
                    snapshot.promptPlan.research_logic_contract_plan?.docx_table_contract
                      ? `${snapshot.promptPlan.research_logic_contract_plan.docx_table_contract.orientation}, ${snapshot.promptPlan.research_logic_contract_plan.docx_table_contract.row_count_target}, ${snapshot.promptPlan.research_logic_contract_plan.docx_table_contract.required_columns?.join(" / ")}`
                      : "sin contrato"
                  }
                />
              </div>
            </div>
          </section>
        ) : null}

        {selectedPanel === "hydration" || selectedPanel === "claims" || selectedPanel === "prompts" ? (
          <section className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
                Secciones
              </p>
              <div className="mt-3 flex max-h-[70vh] flex-col gap-2 overflow-y-auto pr-1">
                {hydrationPlan.map((item) => (
                  <button
                    key={item.section_key}
                    className={`rounded-[18px] border px-3 py-3 text-left text-sm transition ${
                      selectedSection?.section_key === item.section_key
                        ? "border-[var(--color-accent)] bg-[rgba(144,109,74,0.12)] text-[var(--color-ink)]"
                        : "border-[rgba(74,58,97,0.08)] bg-white text-[var(--color-muted)]"
                    }`}
                    onClick={() => setSelectedSectionKey(item.section_key)}
                    type="button"
                  >
                    <p className="font-semibold">{item.section_key}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.14em]">{item.wave}</p>
                  </button>
                ))}
              </div>
            </aside>

            <article className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-6">
              {selectedSection ? (
                <>
                  <h2 className="text-lg font-semibold text-[var(--color-ink)]">{selectedSection.section_key}</h2>
                  {selectedPanel === "hydration" ? (
                    <div className="mt-4 grid gap-4">
                      <StatCard label="Evidence IDs" value={selectedSection.priority_evidence_ids.join(", ") || "sin dato"} />
                      <StatCard label="Original excerpts" value={selectedSection.priority_original_excerpt_ids.join(", ") || "sin dato"} />
                      <StatCard label="Sources" value={selectedSection.priority_source_ids.join(", ") || "sin dato"} />
                      <StatCard label="Assets criticos" value={selectedSection.critical_asset_keys.join(", ") || "sin dato"} />
                      <StatCard label="Estructura requerida" value={selectedSection.required_structure.join(" | ") || "sin dato"} />
                      <StatCard label="Fragmentos prioritarios" value={selectedSection.required_original_fragments.join(" || ") || "sin dato"} />
                    </div>
                  ) : null}
                  {selectedPanel === "claims" ? (
                    <div className="mt-4 grid gap-4">
                      <StatCard label="Claims permitidos" value={selectedClaim?.allowed_claims.join(" | ") || "sin dato"} />
                      <StatCard label="Claims a evitar" value={selectedClaim?.claims_to_avoid.join(" | ") || "sin dato"} />
                      <StatCard label="Claims condicionados" value={selectedClaim?.claims_conditioned.join(" | ") || "sin dato"} />
                      <StatCard label="Validaciones pendientes" value={selectedClaim?.validation_needs.join(" | ") || "sin dato"} />
                      <StatCard label="Guia metodologica" value={selectedMethod ? `${selectedMethod.treatment}: ${selectedMethod.expected_elements.join(" | ")}` : "no aplica"} />
                    </div>
                  ) : null}
                  {selectedPanel === "prompts" ? (
                    <div className="mt-4 space-y-4">
                      <StatCard label="Prompt snippets" value={selectedManifest?.evidence_snippet_ids.join(", ") || "sin dato"} />
                      <StatCard label="Prompt assets" value={uniqueStrings([...(selectedManifest?.critical_asset_keys ?? []), ...(selectedManifest?.useful_asset_keys ?? [])]).join(", ") || "sin dato"} />
                      <div className="rounded-[22px] border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.56)] p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
                          Prompt final
                        </p>
                        <pre className="mt-3 whitespace-pre-wrap break-words text-xs leading-6 text-[var(--color-ink)]">
                          {selectedManifest?.prompt ?? "sin prompt"}
                        </pre>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-[var(--color-muted)]">Sin seccion seleccionada.</p>
              )}
            </article>
          </section>
        ) : null}

        {selectedPanel === "raw" ? (
          <section className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-6">
            <h2 className="text-lg font-semibold text-[var(--color-ink)]">Artifact raw</h2>
            <div className="mt-4">
              <JsonViewer value={snapshot.promptPlan} />
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}
