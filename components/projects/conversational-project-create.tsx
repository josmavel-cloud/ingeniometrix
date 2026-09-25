"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function ConversationalProjectCreate({ initialIdea }: { initialIdea: string }) {
  const [idea, setIdea] = useState(initialIdea), [level, setLevel] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const request = useRef<{ intakeMode: "conversation"; idea: string; degreeLevel: string; requestId: string } | null>(null);
  const router = useRouter();
  return <form className="mx-auto grid max-w-2xl gap-5" onSubmit={async e => {
    e.preventDefault(); if (busy) return; setBusy(true); setError("");
    request.current ??= { intakeMode: "conversation", idea, degreeLevel: level, requestId: crypto.randomUUID() };
    try {
      const response = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request.current) });
      const payload = await response.json();
      if (!response.ok) throw new Error("No se pudo crear. Conservamos tu idea; puedes reintentar la misma solicitud.");
      router.push(`/projects/${payload.project.id}?step=define`);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo conectar."); setBusy(false); }
  }}>
    <label className="text-xl font-semibold" htmlFor="research-idea">Cuéntame qué quieres investigar.</label>
    <p>Puedes escribir una idea general o un tema detallado. No necesitas decidir el método todavía.</p>
    <textarea id="research-idea" className="min-h-36 rounded-xl border p-4" minLength={8} maxLength={8000} required value={idea} disabled={busy || Boolean(request.current)} onChange={e => setIdea(e.target.value)} />
    <label htmlFor="academic-level">Nivel académico</label>
    <select id="academic-level" required className="rounded-xl border p-3" value={level} disabled={busy || Boolean(request.current)} onChange={e => setLevel(e.target.value)}>
      <option value="">Selecciona tu nivel</option><option value="PREGRADO">Pregrado</option><option value="MAESTRIA">Maestría</option><option value="PROYECTO_INVESTIGACION">Proyecto de investigación</option>
    </select>
    {error && <p role="alert">{error}</p>}
    <button disabled={busy} className="rounded-xl bg-[var(--color-plum)] p-3 text-white">{busy ? "Guardando tu idea…" : request.current ? "Reintentar creación" : "Comenzar mi definición"}</button>
  </form>;
}
