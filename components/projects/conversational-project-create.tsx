"use client";
import { useEffect, useRef, useState } from "react";
import { KnowledgeAreaCombobox, type KnowledgeArea } from "./knowledge-area-combobox";
import type { ResearchIdeaOption } from "@/lib/research-idea-options";
import { useRouter } from "next/navigation";

export function ConversationalProjectCreate({ initialIdea, ownerId }: { initialIdea: string; ownerId: string }) {
  const [entry, setEntry] = useState<"own" | "help">("own");
  const [area, setArea] = useState<KnowledgeArea | null>(null);
  const [options, setOptions] = useState<{ operationId: string; options: ResearchIdeaOption[] } | null>(null);
  const [choice, setChoice] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [idea, setIdea] = useState(initialIdea), [level, setLevel] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const request = useRef<{ intakeMode: "conversation"; idea: string; degreeLevel: string; requestId: string; topicAreaId?: string; ideaChoice?: { operationId: string; index: number } } | null>(null);
  const router = useRouter();
  const pendingKey = `imx-intake-create:${ownerId}`;
  useEffect(() => {
    const stored = sessionStorage.getItem(pendingKey);
    if (stored) {
      try { const saved = JSON.parse(stored); if (saved.intakeMode === "conversation" && typeof saved.requestId === "string") { request.current = saved; setIdea(saved.idea); setLevel(saved.degreeLevel); setError("Hay una creación pendiente. Reintentar reutiliza la misma solicitud, sin duplicar el proyecto."); } } catch {}
    }
  }, [pendingKey]);
  return <form className="mx-auto grid max-w-2xl gap-5" onSubmit={async e => {
    e.preventDefault(); if (busy) return; setBusy(true); setError("");
    request.current ??= { intakeMode: "conversation", idea, degreeLevel: level, requestId: crypto.randomUUID(), ...(area ? { topicAreaId: area.code } : {}), ...(entry === "help" && options && choice !== null ? { ideaChoice: { operationId: options.operationId, index: choice } } : {}) };
    sessionStorage.setItem(pendingKey, JSON.stringify(request.current));
    try {
      const response = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request.current) });
      const payload = await response.json();
      if (!response.ok) throw new Error("No se pudo crear. Conservamos tu idea; puedes reintentar la misma solicitud.");
      sessionStorage.removeItem(pendingKey);
      router.replace(`/projects/${payload.project.id}?step=define`);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo conectar."); setBusy(false); }
  }}>
    <div role="group" aria-label="Cómo quieres comenzar" className="grid gap-3 sm:grid-cols-2">
      <button type="button" aria-pressed={entry === "own"} disabled={busy || Boolean(request.current)} className="brand-button-secondary p-4" onClick={() => setEntry("own")}>Ya tengo una idea</button>
      <button type="button" aria-pressed={entry === "help"} disabled={busy || Boolean(request.current)} className="brand-button-secondary p-4" onClick={() => setEntry("help")}>Ayúdame a encontrar una idea</button>
    </div>
    <KnowledgeAreaCombobox value={area} disabled={busy || generating || Boolean(request.current)} onChange={next => { setArea(next); setOptions(null); setChoice(null); }} />
    {entry === "own" && <>
    <label className="text-xl font-semibold" htmlFor="research-idea">Cuéntame qué quieres investigar.</label>
    <p>Solo dime el área que te interesa y te ayudo a plantear una investigación. También puedes escribir una idea detallada.</p>
    <textarea id="research-idea" className="min-h-36 rounded-xl border p-4" minLength={2} maxLength={8000} required value={idea} disabled={busy || Boolean(request.current)} onChange={e => setIdea(e.target.value)} />
    </>}
    <label htmlFor="academic-level">Nivel académico</label>
    <select id="academic-level" required className="rounded-xl border p-3" value={level} disabled={busy || Boolean(request.current)} onChange={e => { setLevel(e.target.value); setOptions(null); setChoice(null); }}>
      <option value="">Selecciona tu nivel</option><option value="PREGRADO">Pregrado</option><option value="MAESTRIA">Maestría</option><option value="PROYECTO_INVESTIGACION">Proyecto de investigación</option>
    </select>
    {entry === "help" && <>
      <p className="text-sm">Generaremos tres propuestas para explorar. Son sugerencias de IA y podrás refinarlas antes de confirmar.</p>
      <button type="button" disabled={generating || !area || !level || busy} className="brand-button-primary p-3 disabled:opacity-50" onClick={async () => {
        setGenerating(true); setError("");
        try {
          const response = await fetch("/api/projects/idea-options", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topicAreaId: area!.code, degreeLevel: level }) });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error ?? "No pudimos generar las ideas.");
          setOptions(payload); setChoice(null);
        } catch (failure) { setError(failure instanceof Error ? failure.message : "No pudimos conectar."); }
        finally { setGenerating(false); }
      }}>{generating ? "Preparando tres propuestas…" : "Generar ideas"}</button>
      <div role="radiogroup" aria-label="Elige una propuesta" className="grid gap-3">
        {options?.options.map((option, index) => <label key={index} className="surface-panel cursor-pointer rounded-2xl p-4">
          <input type="radio" name="idea-option" checked={choice === index} onChange={() => { setChoice(index); setIdea(option.workingTitle); }} />
          <span className="ml-2 font-semibold">{option.workingTitle}</span>
          <p className="mt-2 text-sm">{option.briefProblem}</p><p className="mt-2 text-sm">{option.whyItIsViable}</p>
          <p className="mt-2 text-xs text-slate-600">Por comprobar: {option.uncertainties.join("; ") || "La evidencia disponible y la factibilidad del estudio."}</p>
        </label>)}
      </div>
    </>}
    {error && <p role="alert">{error}</p>}
    <button disabled={busy || generating || (entry === "help" && choice === null)} className="rounded-xl bg-[var(--color-plum)] p-3 text-white">{busy ? "Guardando tu idea…" : request.current ? "Reintentar creación" : "Comenzar mi definición"}</button>
  </form>;
}
