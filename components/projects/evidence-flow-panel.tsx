"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpenCheck } from "lucide-react";
import { startProjectPlan } from "@/lib/generation-client";

type Prepared = { referenceId: string; status: string; evidenceLevel?: string; warnings?: string[] };
type Evidence = { id: string; version: number; readiness: string; selectedSourceCount: number;
  unresolvedGapCount: number; limitations: string[]; isCurrent: boolean };

const statusLabel: Record<string, string> = {
  NOT_PREPARED: "Pendiente de preparación", PREPARED_FULL_TEXT: "Documento preparado",
  STALE: "Preparación desactualizada; vuelve a preparar",
  PREPARED_ABSTRACT: "Resumen disponible", METADATA_ONLY: "Solo metadatos disponibles",
  FAILED_ACCESS: "Documento no disponible; fuente conservada", IDENTITY_REVIEW_REQUIRED: "Identidad por revisar",
};

export function EvidenceFlowPanel({ projectId, ownerId, selectedCount, confirmedDefinitionHash }: { projectId: string; ownerId: string;
  selectedCount: number; confirmedDefinitionHash?: string | null }) {
  const router = useRouter();
  const submission = useRef(false);
  const [items, setItems] = useState<Prepared[]>([]);
  const [evidenceSet, setEvidenceSet] = useState<Evidence | null>(null);
  const [sufficiency, setSufficiency] = useState<{ readiness: string; selectedUsable: number; selectedCore: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  async function refresh() {
    const [prep, evidence, sources] = await Promise.all([
      fetch(`/api/projects/${projectId}/sources/prepare`, { cache: "no-store" }),
      fetch(`/api/projects/${projectId}/evidence-set`, { cache: "no-store" }),
      fetch(`/api/projects/${projectId}/references`, { cache: "no-store" }),
    ]);
    if (sources.ok) { const result = await sources.json(); setSufficiency(result.sufficiency ?? null);
      window.dispatchEvent(new CustomEvent("imx-source-status", { detail: { projectId, ...result.sufficiency } })); }
    if (prep.ok) setItems((await prep.json()).items ?? []);
    if (evidence.ok) setEvidenceSet((await evidence.json()).evidenceSet ?? null);
  }
  useEffect(() => {
    void refresh();
    const onSelection = () => { void refresh(); };
    window.addEventListener("imx-selection-saved", onSelection);
    return () => window.removeEventListener("imx-selection-saved", onSelection);
  }, [projectId, selectedCount]);
  async function continueToPlan() {
    if (submission.current) return;
    submission.current = true;
    setBusy(true); setError(null); setMessage(null);
    try {
      await startProjectPlan(projectId, ownerId, confirmedDefinitionHash, true);
      setMessage("Preparando tus fuentes. Puedes volver a este proyecto cuando quieras.");
      router.push(`/projects/${projectId}?step=plan`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo completar la operación."); }
    finally { submission.current = false; setBusy(false); }
  }
  return <section className="surface-panel rounded-[28px] p-5 sm:p-7">
    <div className="flex items-start gap-3"><BookOpenCheck className="mt-1 size-5 text-[var(--color-plum)]" aria-hidden="true" />
      <div><h2 className="font-[var(--font-heading)] text-xl font-semibold">Tus fuentes para el plan</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">Al continuar, guardaremos las fuentes elegidas y prepararemos la evidencia necesaria. La generación puede consumir créditos de tu cuenta.</p></div></div>
    <button className="brand-button-primary mt-5 inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold disabled:opacity-50"
      disabled={busy || !sufficiency || sufficiency.readiness === "BLOCKED"} onClick={() => void continueToPlan()} type="button">
      {busy ? "Guardando tu selección…" : "Continuar al plan"}<ArrowRight className="size-4" aria-hidden="true" />
    </button>
    <p className="mt-3 text-sm" aria-live="polite">{sufficiency ? `${sufficiency.selectedUsable} fuentes utilizables seleccionadas; ${sufficiency.selectedCore} centrales.` : "Comprobando tus fuentes…"}
      {sufficiency?.readiness === "BLOCKED" ? " Necesitas al menos tres fuentes utilizables, incluidas dos centrales cuando la búsqueda haya agotado sus alternativas." : sufficiency?.readiness === "READY_WITH_LIMITATIONS" ? " Puedes continuar con las limitaciones de las fuentes relacionadas elegidas." : ""}</p>
    <ul className="mt-4 grid gap-2 text-sm">{items.map(item => <li className="rounded-xl border border-slate-200 p-3" key={item.referenceId}>
      {statusLabel[item.status] ?? "Requiere revisión"}</li>)}</ul>
    {evidenceSet ? <p className="mt-4 text-sm text-slate-700">Estado de la evidencia: {evidenceSet.isCurrent
      ? evidenceSet.readiness === "READY" ? "listo" : "listo con limitaciones" : "desactualizado por cambios en fuentes o definición"}.
      {evidenceSet.unresolvedGapCount ? ` ${evidenceSet.unresolvedGapCount} vacío(s) material(es) sin resolver.` : ""}</p> : null}
    {error ? <p className="mt-3 text-sm text-rose-700" role="alert">{error}</p> : null}
    {message ? <p className="mt-3 text-sm text-emerald-700" role="status">{message}</p> : null}
  </section>;
}
