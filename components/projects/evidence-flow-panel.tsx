"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Prepared = { referenceId: string; status: string; evidenceLevel?: string; warnings?: string[] };
type Evidence = { id: string; version: number; readiness: string; selectedSourceCount: number;
  unresolvedGapCount: number; limitations: string[]; isCurrent: boolean };

const statusLabel: Record<string, string> = {
  NOT_PREPARED: "Pendiente de preparación", PREPARED_FULL_TEXT: "Documento preparado",
  STALE: "Preparación desactualizada; vuelve a preparar",
  PREPARED_ABSTRACT: "Resumen disponible", METADATA_ONLY: "Solo metadatos disponibles",
  FAILED_ACCESS: "Documento no disponible; fuente conservada", IDENTITY_REVIEW_REQUIRED: "Identidad por revisar",
};

export function EvidenceFlowPanel({ projectId, selectedCount }: { projectId: string; selectedCount: number }) {
  const [items, setItems] = useState<Prepared[]>([]);
  const [evidenceSet, setEvidenceSet] = useState<Evidence | null>(null);
  const [busy, setBusy] = useState<"prepare" | "confirm" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  async function refresh() {
    const [prep, evidence] = await Promise.all([
      fetch(`/api/projects/${projectId}/sources/prepare`, { cache: "no-store" }),
      fetch(`/api/projects/${projectId}/evidence-set`, { cache: "no-store" }),
    ]);
    if (prep.ok) setItems((await prep.json()).items ?? []);
    if (evidence.ok) setEvidenceSet((await evidence.json()).evidenceSet ?? null);
  }
  useEffect(() => {
    void refresh();
    const onSelection = () => { void refresh(); };
    window.addEventListener("imx-selection-saved", onSelection);
    return () => window.removeEventListener("imx-selection-saved", onSelection);
  }, [projectId, selectedCount]);
  async function submit(kind: "prepare" | "confirm") {
    if (busy) return;
    setBusy(kind); setError(null); setMessage(null);
    try {
      const endpoint = kind === "prepare" ? "sources/prepare" : "evidence-set";
      const response = await fetch(`/api/projects/${projectId}/${endpoint}`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "No se pudo completar la operación.");
      setMessage(kind === "prepare" ? "Fuentes seleccionadas preparadas. Revisa sus límites antes de confirmar."
        : "Conjunto de evidencia congelado. Los cambios posteriores crearán una nueva versión.");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo completar la operación."); }
    finally { setBusy(null); }
  }
  return <section className="surface-panel rounded-[28px] p-5 sm:p-7">
    <h2 className="font-[var(--font-heading)] text-xl font-semibold">Preparar y confirmar evidencia</h2>
    <p className="mt-2 text-sm leading-6 text-slate-600">Guarda primero tu selección. La preparación conserva las fuentes sin documento y declara sus límites; confirmar crea una versión inmutable para el plan.</p>
    <div className="mt-4 flex flex-wrap gap-3">
      <button className="brand-button-secondary px-4 py-2 text-sm font-semibold disabled:opacity-50"
        disabled={Boolean(busy) || selectedCount === 0} onClick={() => void submit("prepare")} type="button">
        {busy === "prepare" ? "Preparando…" : "Preparar fuentes seleccionadas"}
      </button>
      <button className="brand-button px-4 py-2 text-sm font-semibold disabled:opacity-50"
        disabled={Boolean(busy) || selectedCount === 0 || items.some(item => ["NOT_PREPARED", "STALE"].includes(item.status))}
        onClick={() => void submit("confirm")} type="button">
        {busy === "confirm" ? "Confirmando…" : "Confirmar fuentes"}
      </button>
    </div>
    <ul className="mt-4 grid gap-2 text-sm">{items.map(item => <li className="rounded-xl border border-slate-200 p-3" key={item.referenceId}>
      {statusLabel[item.status] ?? "Requiere revisión"}</li>)}</ul>
    {evidenceSet ? <p className="mt-4 text-sm text-slate-700">EvidenceSet v{evidenceSet.version}: {evidenceSet.isCurrent
      ? evidenceSet.readiness === "READY" ? "listo" : "listo con limitaciones" : "desactualizado por cambios en fuentes o definición"}.
      {evidenceSet.unresolvedGapCount ? ` ${evidenceSet.unresolvedGapCount} vacío(s) material(es) sin resolver.` : ""}</p> : null}
    {evidenceSet?.isCurrent ? <Link className="mt-3 inline-block text-sm font-semibold underline" href={`/projects/${projectId}?step=plan`}>Continuar al plan de tesis</Link> : null}
    {error ? <p className="mt-3 text-sm text-rose-700" role="alert">{error}</p> : null}
    {message ? <p className="mt-3 text-sm text-emerald-700" role="status">{message}</p> : null}
  </section>;
}
