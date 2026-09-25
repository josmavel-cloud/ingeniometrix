"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFINITION_FIELDS, FIELD_LABELS, definitionReadiness, usable, type ConversationalView, type DefinitionAction, type DefinitionField } from "@/lib/conversational-intake";
import type { IntakeTurnResult } from "@/lib/intake-turn-contract";
import { DefinitionSaveQueue } from "@/lib/definition-save-queue";
import { registerDraftFlush } from "@/lib/draft-save-queue";

type Turn = { requestId: string; kind: string; status: string; inputJson: { message?: string; idea?: string }; resultJson: IntakeTurnResult | null };
type Edit = { field: DefinitionField; value: string; knowledge: "KNOWN" | "UNKNOWN" | "NOT_APPLICABLE" };
const button = "rounded-lg border px-3 py-2 text-sm disabled:opacity-50";
const primary = `${button} bg-[var(--color-plum)] text-white`;
const academicLabel: Record<string, string> = { MAESTRIA: "Maestría", PREGRADO: "Pregrado", PROYECTO_INVESTIGACION: "Proyecto de investigación" };
const publicValue = (field: DefinitionField, value: string) => field === "academicLevel" ? academicLabel[value] ?? "Nivel por revisar" : value;

export function ConversationalIntake({ projectId, ownerId }: { projectId: string; ownerId: string }) {
  const endpoint = `/api/projects/${projectId}/definition`, cacheKey = `imx-intake-pending:${ownerId}:${projectId}`;
  const router = useRouter();
  const [state, setState] = useState<ConversationalView | null>(null), [turns, setTurns] = useState<Turn[]>([]);
  const [available, setAvailable] = useState(false), [message, setMessage] = useState("");
  const [notice, setNotice] = useState("Recuperando tu definición…"), [error, setError] = useState("");
  const [modelBusy, setModelBusy] = useState(false), [review, setReview] = useState(false), [conflict, setConflict] = useState(false);
  const [edit, setEdit] = useState<Edit | null>(null), [dirty, setDirty] = useState(false);
  const queue = useRef<DefinitionSaveQueue | null>(null), pending = useRef<Edit | null>(null), conflictRef = useRef(false);
  const submitted = useRef<{ requestId: string; message: string; baseRevision: number; etag: string } | null>(null);
  const [taxonomy, setTaxonomy] = useState<Array<{ code: string; label: string }>>([]);

  const adopt = useCallback((v: ConversationalView) => {
    if (!queue.current || v.revision >= queue.current.current.revision) {
      if (queue.current) queue.current.current = v;
      setState(v);
    }
  }, []);
  const sendAction = useCallback(async (input: { requestId: string; baseRevision: number; etag: string; action: DefinitionAction }) => {
    const r = await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    const data = await r.json();
    if (!r.ok) {
      if (r.status === 409) { conflictRef.current = true; setConflict(true); }
      throw new Error(data.error ?? "No se pudo guardar. Conserva tu texto y vuelve a iniciar sesión si expiró.");
    }
    return data.state as ConversationalView;
  }, [endpoint]);
  const load = useCallback(async (reset = false) => {
    const r = await fetch(endpoint, { cache: "no-store" });
    if (!r.ok) throw new Error("No se pudo recuperar la definición. Tu texto pendiente se conserva.");
    const data = await r.json();
    if (!data.state) throw new Error("Este proyecto conserva el editor histórico.");
    if (!queue.current || reset) queue.current = new DefinitionSaveQueue(data.state, sendAction);
    adopt(data.state); setTurns(data.state.turns); setAvailable(data.assistanceAvailable);
    setNotice("Borrador recuperado");
  }, [endpoint, adopt, sendAction]);
  useEffect(() => {
    void load().then(() => {
      const raw = sessionStorage.getItem(cacheKey);
      if (raw) { const saved = JSON.parse(raw) as Edit; if (DEFINITION_FIELDS.includes(saved.field)) { setEdit(saved); pending.current = saved; setDirty(true); setNotice("Hay texto local recuperado: revísalo antes de guardarlo."); conflictRef.current = true; setConflict(true); } }
    }).catch(e => setError(e.message));
  }, [load, cacheKey]);
  const flush = useCallback(async () => {
    if (!queue.current) throw new Error("Espera a recuperar el borrador.");
    if (conflictRef.current) throw new Error("Revisa el conflicto antes de continuar.");
    const current = pending.current;
    setNotice("Guardando…");
    try {
      if (current) {
        const v = await queue.current.save({ kind: "EDIT", ...current }); adopt(v);
        if (pending.current === current) { pending.current = null; sessionStorage.removeItem(cacheKey); setDirty(false); }
      }
      const v = await queue.current.flush(); adopt(v); setNotice(`Guardado · revisión ${v.revision}`); setError(""); return v;
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar."); setNotice("Cambios pendientes de guardar"); throw e; }
  }, [adopt, cacheKey]);
  useEffect(() => registerDraftFlush(projectId, async () => (await flush()).revision), [projectId, flush]);
  useEffect(() => {
    if (!dirty || error || conflict) return;
    const timer = setTimeout(() => { void flush().catch(() => undefined); }, 800);
    return () => clearTimeout(timer);
  }, [edit, dirty, error, conflict, flush]);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => { if (pending.current) { e.preventDefault(); e.returnValue = ""; } };
    const click = (e: MouseEvent) => {
      const a = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!a || a.target === "_blank" || e.ctrlKey || e.metaKey || !pending.current || a.href === location.href) return;
      e.preventDefault(); e.stopPropagation(); void flush().then(() => location.assign(a.href)).catch(() => undefined);
    };
    // popstate cannot be cancelled. Persisted local edit survives unmount; saving
    // remains revision-protected and never confirms a definition.
    const pop = () => { if (pending.current) void flush().catch(() => undefined); };
    window.addEventListener("beforeunload", leave); document.addEventListener("click", click, true); window.addEventListener("popstate", pop);
    return () => { window.removeEventListener("beforeunload", leave); document.removeEventListener("click", click, true); window.removeEventListener("popstate", pop); };
  }, [flush]);
  const changeEdit = (next: Edit) => { setEdit(next); pending.current = next; setDirty(true); setReview(false); sessionStorage.setItem(cacheKey, JSON.stringify(next)); };
  const chooseField = async (field: DefinitionField) => {
    try { const v = await flush(); setEdit({ field, value: v.definition.fields[field].value, knowledge: v.definition.fields[field].knowledge }); } catch {}
  };
  const action = async (a: DefinitionAction) => {
    try { await flush(); const v = await queue.current!.save(a); adopt(v); setReview(false); setNotice(`Guardado · revisión ${v.revision}`); } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar."); }
  };
  const submit = async (text: string) => {
    if (!text.trim() || modelBusy) return;
    setModelBusy(true); setError(""); setReview(false);
    try {
      const v = await flush();
      submitted.current ??= { requestId: crypto.randomUUID(), baseRevision: v.revision, etag: v.etag, message: text };
      const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(submitted.current) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "No se pudo enviar. Reintenta la misma solicitud.");
      submitted.current = null; setMessage("");
      await load();
      if (data.status === "FAILED") setError("La asistencia no está disponible. Tu mensaje se guardó; puedes continuar editando la definición.");
      if (data.status === "STALE") setNotice("La respuesta llegó después de otro cambio y no se aplicó. Revisa la definición actual.");
      if (data.status === "RUNNING") setNotice("La solicitud sigue pendiente. No se iniciará otra automáticamente; puedes editar manualmente.");
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo conectar."); }
    finally { setModelBusy(false); }
  };
  useEffect(() => {
    if (edit?.field !== "taxonomy") return;
    const controller = new AbortController();
    const timer = setTimeout(() => { fetch(`/api/topic-areas?q=${encodeURIComponent(edit.value)}`, { signal: controller.signal }).then(r => r.ok ? r.json() : null).then(p => setTaxonomy(p?.suggestions ?? p?.items ?? [])).catch(() => undefined); }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [edit]);
  if (!state) return <p role="status">{error || notice}</p>;
  const d = state.definition, readiness = definitionReadiness(d);
  const latest = [...turns].reverse().find(t => t.kind === "MESSAGE" && t.status === "COMPLETE");
  const proposedQuestion = latest?.resultJson?.nextQuestion;
  const question = proposedQuestion && d.fields[proposedQuestion.field].lastChangedRevision <= (latest?.resultJson?.baseRevision ?? 0) ? proposedQuestion : null;
  const proposals = d.proposals.filter(p => p.status === "PENDING");
  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,1fr)]">
    <section className="surface-panel min-w-0 rounded-3xl p-5" aria-labelledby="conversation-title">
      <h2 id="conversation-title" className="text-xl font-semibold">Define tu investigación</h2>
      <p className="mt-2 text-sm">Una aclaración útil a la vez. Las sugerencias no cambian tu definición hasta que las aceptes.</p>
      <div className="my-5 max-h-[30rem] space-y-3 overflow-y-auto" role="log" aria-label="Conversación académica" aria-live="polite">
        {turns.filter(t => t.kind !== "ACTION").map(t => <article key={t.requestId} className="rounded-xl border p-3 text-sm whitespace-pre-wrap">
          <p><strong>Tú:</strong> {t.inputJson.message ?? t.inputJson.idea}</p>
          {t.status === "COMPLETE" && t.resultJson?.assistantText && <p className="mt-2"><strong>Asesor:</strong> {t.resultJson.assistantText}</p>}
          {t.status === "FAILED" && <p>Mensaje conservado; asistencia no disponible.</p>}
          {t.status === "STALE" && <p>Respuesta anterior a tus últimos cambios; no aplicada.</p>}
          {t.status === "RUNNING" && <p>Asistencia pendiente. No reenvíes la solicitud.</p>}
        </article>)}
      </div>
      {!available && <p role="status" className="my-3 rounded-xl border p-3">La asistencia no está disponible ahora. Puedes definir y confirmar tu investigación con el panel editable.</p>}
      {question && <fieldset className="my-3"><legend className="font-medium">{question.question}</legend><div className="mt-2 flex flex-wrap gap-2">
        {question.options.map(option => <button type="button" key={option} className={button} disabled={modelBusy || !available} onClick={() => void submit(option)}>{option}</button>)}
        <button type="button" className={button} onClick={() => void action({ kind: "EDIT", field: question.field, value: "", knowledge: "UNKNOWN" })}>No lo sé</button>
        <button type="button" className={button} onClick={() => document.getElementById("intake-message")?.focus()}>Prefiero explicarlo</button>
      </div></fieldset>}
      <form onSubmit={e => { e.preventDefault(); void submit(message || "Ayúdame a precisar mi idea original sin inventar información."); }} className="grid gap-3">
        <label htmlFor="intake-message">Tu aclaración o pregunta</label>
        <textarea id="intake-message" maxLength={4000} rows={3} className="rounded-xl border p-3" value={message} onChange={e => setMessage(e.target.value)} disabled={Boolean(submitted.current)} />
        <button className={primary} disabled={modelBusy || !available || conflict}>{modelBusy ? "Revisando tu idea… Puedes seguir editando el panel." : submitted.current ? "Consultar la misma solicitud" : "Continuar conversación"}</button>
      </form>
      <p className="mt-3 text-sm" role="status">{notice}</p>
      {error && <p className="mt-3" role="alert">{error}</p>}
      {conflict ? <div className="my-3 border p-3"><p>Tu texto local se conserva. Carga la revisión actual y compara antes de volver a guardar.</p><button className={button} onClick={() => { void load(true).then(() => { conflictRef.current = false; setConflict(false); setError(""); setDirty(false); setNotice("Revisión actual cargada; tu texto sigue en el editor. Pulsa Guardar para reaplicarlo conscientemente."); }).catch(e => setError(e.message)); }}>Cargar revisión para comparar</button></div> : error && dirty ? <button className={button} onClick={() => void flush().catch(() => undefined)}>Reintentar guardado</button> : null}
    </section>
    <section className="surface-panel min-w-0 rounded-3xl p-5" aria-label="Definición estructurada">
      <details open><summary className="cursor-pointer text-xl font-semibold">Tu investigación</summary>
        <p className="my-3 text-sm">{state.confirmedRevision === state.revision ? "Definición confirmada" : "Borrador: cambios aún no confirmados"}</p>
        <dl className="space-y-3">{DEFINITION_FIELDS.filter(k => k !== "originalIdea" && (d.fields[k].value || ["topic", "object", "purpose", "concepts"].includes(k))).map(k => <div key={k}>
          <dt className="font-semibold">{FIELD_LABELS[k]}</dt><dd className="text-sm whitespace-pre-wrap">{publicValue(k, d.fields[k].value) || (d.fields[k].knowledge === "NOT_APPLICABLE" ? "No aplica" : "Pendiente")}</dd>
          <dd className="flex items-center gap-2 text-xs"><span>{d.fields[k].origin === "USER_EXPLICIT" ? "Lo indicaste" : usable(d.fields[k]) ? "Aceptado" : "Por revisar"}</span><button className={button} onClick={() => void chooseField(k)}>Editar</button></dd>
        </div>)}</dl>
        {proposals.map(p => <article key={p.id} className="my-3 rounded-xl border p-3"><p className="text-xs">Propuesta por revisar · {FIELD_LABELS[p.field]}</p><p>{p.proposed.value || (p.proposed.knowledge === "UNKNOWN" ? "Pendiente" : "No aplica")}</p><div className="mt-2 flex gap-2">
          <button className={button} onClick={() => void action({ kind: "ACCEPT", proposalId: p.id })}>Aceptar</button><button className={button} onClick={() => void action({ kind: "REJECT", proposalId: p.id })}>Rechazar</button></div></article>)}
        {d.ambiguities.filter(a => !a.resolved).map(a => <form key={a.id} className="my-3 border p-3" onSubmit={e => { e.preventDefault(); const answer = String(new FormData(e.currentTarget).get("answer") ?? ""); void action({ kind: "RESOLVE", ambiguityId: a.id, answer }); }}>
          <label>{a.question}<input required name="answer" maxLength={2000} className="mt-2 w-full rounded border p-2" /></label><button className={button}>Resolver</button></form>)}
      </details>
      <details className="mt-5" open={Boolean(edit)}><summary className="cursor-pointer font-semibold">Editar un campo / opciones avanzadas</summary>
        <label htmlFor="definition-field">Campo</label><select id="definition-field" className="my-2 w-full rounded border p-2" value={edit?.field ?? ""} onChange={e => void chooseField(e.target.value as DefinitionField)}><option value="" disabled>Selecciona qué quieres precisar</option>{DEFINITION_FIELDS.filter(k => k !== "originalIdea").map(k => <option key={k} value={k}>{FIELD_LABELS[k]}</option>)}</select>
        {edit && <div className="grid gap-2">
          <label htmlFor="definition-value">{FIELD_LABELS[edit.field]}</label>
          {edit.field === "academicLevel" ? <select id="definition-value" value={edit.value} onChange={e => changeEdit({ ...edit, value: e.target.value, knowledge: "KNOWN" })}><option value="PREGRADO">Pregrado</option><option value="MAESTRIA">Maestría</option><option value="PROYECTO_INVESTIGACION">Proyecto de investigación</option></select> : <textarea id="definition-value" rows={3} className="rounded border p-2" maxLength={8000} value={edit.value} onChange={e => changeEdit({ ...edit, value: e.target.value, knowledge: "KNOWN" })} />}
          {edit.field === "taxonomy" && <div>{taxonomy.slice(0, 6).map(t => <button type="button" className={button} key={t.code} onClick={() => changeEdit({ ...edit, value: t.label, knowledge: "KNOWN" })}>{t.label}</button>)}<p className="text-xs">Puedes indicar un área propia; no es obligatorio elegir una clasificación exacta.</p></div>}
          {edit.field !== "academicLevel" && <div className="flex gap-2"><button className={button} onClick={() => changeEdit({ ...edit, value: "", knowledge: "UNKNOWN" })}>No lo sé</button><button className={button} onClick={() => changeEdit({ ...edit, value: "", knowledge: "NOT_APPLICABLE" })}>No aplica</button></div>}
          <button className={button} disabled={conflict} onClick={() => void flush().catch(() => undefined)}>Guardar este campo</button>
        </div>}
      </details>
      <div className="mt-6 border-t pt-4">
        {readiness.evidenceSearch.reasons.map(r => <p key={r} className="my-2 text-sm">{r}</p>)}
        <button className={primary} disabled={modelBusy || conflict} onClick={() => { void flush().then(() => setReview(true)).catch(() => undefined); }}>Revisar definición</button>
        {review && <div className="mt-4" aria-label="Revisión antes de confirmar"><h3 className="font-semibold">Esto se usará para buscar evidencia</h3><dl>{DEFINITION_FIELDS.filter(k => usable(d.fields[k])).map(k => <div className="my-2" key={k}><dt className="font-medium">{FIELD_LABELS[k]}</dt><dd className="whitespace-pre-wrap text-sm">{publicValue(k, d.fields[k].value)}</dd></div>)}</dl>
          <p className="my-3 text-sm">{proposals.length} propuestas pendientes no se incluirán. Pendientes: {DEFINITION_FIELDS.filter(k => !usable(d.fields[k])).map(k => FIELD_LABELS[k]).join(", ")}. Confirmar no inicia una búsqueda ni aprueba el diseño científico.</p>
          <button className={primary} disabled={readiness.evidenceSearch.status !== "READY" || dirty} onClick={async () => {
            try {
              const v = await flush(); if (v.definitionHash !== state.definitionHash) { setReview(false); throw new Error("Hay cambios nuevos; revisa de nuevo antes de confirmar."); }
              const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "confirm", revision: state.revision, definitionHash: state.definitionHash }) });
              const data = await r.json(); if (!r.ok) throw new Error(data.error); adopt(data.state); setNotice("Definición confirmada. No se ejecutó retrieval."); setReview(false); router.refresh();
            } catch (e) { setError(e instanceof Error ? e.message : "No se pudo confirmar."); }
          }}>Confirmar esta definición para buscar evidencia</button>
        </div>}
      </div>
    </section>
  </div>;
}
