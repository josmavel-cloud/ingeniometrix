import { getDegreeLevelLabelForLanguage } from "@/lib/degree-levels";
import type { DegreeLevel } from "@prisma/client";

type ProjectSummarySidebarProps = {
  title: string;
  degreeLevel: DegreeLevel;
  area: string | null;
  problem: string | null;
  context: string | null;
  methodology: string | null;
  pendingDecisions: string | null;
  selectedSources: number;
  latestVersion: number | null;
  progress: number;
};

function valueOrPending(value: string | null) {
  return value?.trim() || "Pendiente de definir";
}

export function ProjectSummarySidebar(props: ProjectSummarySidebarProps) {
  return (
    <details className="surface-panel rounded-[28px] p-5 xl:sticky xl:top-28" open>
      <summary className="cursor-pointer font-[var(--font-heading)] text-lg font-semibold text-[var(--color-ink)]">Tu investigación hasta ahora</summary>
      <div className="mt-5 grid gap-4 text-sm">
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">Título provisional</p><p className="mt-1 leading-6 text-[var(--color-ink)]">{props.title}</p></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-[rgba(244,241,248,0.8)] p-3"><p className="text-xs text-[var(--color-muted)]">Nivel</p><p className="mt-1 font-semibold">{getDegreeLevelLabelForLanguage(props.degreeLevel, "es")}</p></div>
          <div className="rounded-2xl bg-[rgba(244,241,248,0.8)] p-3"><p className="text-xs text-[var(--color-muted)]">Área</p><p className="mt-1 font-semibold">{valueOrPending(props.area)}</p></div>
        </div>
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">Problema</p><p className="mt-1 line-clamp-5 leading-6">{valueOrPending(props.problem)}</p></div>
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">Contexto</p><p className="mt-1 leading-6">{valueOrPending(props.context)}</p></div>
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">Enfoque o diseño</p><p className="mt-1 leading-6">{valueOrPending(props.methodology)}</p></div>
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">Decisiones pendientes</p><p className="mt-1 leading-6">{valueOrPending(props.pendingDecisions)}</p></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-[rgba(74,58,97,0.08)] p-3"><p className="text-2xl font-semibold text-[var(--color-plum)]">{props.selectedSources}</p><p className="text-xs text-[var(--color-muted)]">fuentes seleccionadas</p></div>
          <div className="rounded-2xl border border-[rgba(74,58,97,0.08)] p-3"><p className="text-2xl font-semibold text-[var(--color-plum)]">{props.latestVersion ?? "—"}</p><p className="text-xs text-[var(--color-muted)]">última versión</p></div>
        </div>
        <div><div className="flex justify-between text-xs text-[var(--color-muted)]"><span>Progreso</span><span>{props.progress}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[rgba(74,58,97,0.08)]"><div className="h-full rounded-full bg-[var(--color-plum)]" style={{ width: `${props.progress}%` }} /></div></div>
      </div>
    </details>
  );
}
