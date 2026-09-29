"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFINITION_FIELDS, FIELD_LABELS, ambiguityBlocksSearch, canDeferAmbiguity, definitionReadiness, usable, type ConversationalView, type DefinitionAction, type DefinitionField } from "@/lib/conversational-intake";
import type { IntakeTurnResult } from "@/lib/intake-turn-contract";
import { DefinitionSaveQueue } from "@/lib/definition-save-queue";
import { registerDraftFlush } from "@/lib/draft-save-queue";

type Turn = { requestId: string; kind: string; status: string; inputJson: { message?: string; idea?: string; initial?: boolean }; resultJson: IntakeTurnResult | null };
type Edit = { field: DefinitionField; value: string; knowledge: "KNOWN" | "UNKNOWN" | "NOT_APPLICABLE" };
const button = "brand-button-secondary px-3 py-2 text-sm font-medium disabled:opacity-50";
const primary = "brand-button-primary px-5 py-2.5 text-sm font-semibold disabled:opacity-50";
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
  const [actionBusy, setActionBusy] = useState(false), [confirming, setConfirming] = useState(false);
  const reviewing = useRef<{ revision: number; definitionHash: string } | null>(null);
  const actionLock = useRef(false), confirmationLock = useRef(false);
  const queue = useRef<DefinitionSaveQueue | null>(null), pending = useRef<Edit | null>(null), conflictRef = useRef(false);
  const submitted = useRef<{ requestId: string; message: string; baseRevision: number; etag: string; initial?: true } | null>(null);
  const initialStarted = useRef(false), thread = useRef<HTMLDivElement | null>(null), advanced = useRef<HTMLDetailsElement | null>(null);
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
    try { const v = await flush(); advanced.current!.open = true; setEdit({ field, value: v.definition.fields[field].value, knowledge: v.definition.fields[field].knowledge }); } catch {}
  };
  const action = async (a: DefinitionAction) => {
    if (actionLock.current || confirmationLock.current || conflictRef.current) return;
    actionLock.current = true; setActionBusy(true); setReview(false);
    try { await flush(); const v = await queue.current!.save(a); adopt(v); setNotice(`Guardado · revisión ${v.revision}`); } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar."); }
    finally { actionLock.current = false; setActionBusy(false); }
  };
  const submit = async (text: string, initial = false) => {
    if (!text.trim() || !available || modelBusy || conflictRef.current) return;
    setModelBusy(true); setError(""); setReview(false);
    try {
      const v = await flush();
      submitted.current ??= { requestId: crypto.randomUUID(), baseRevision: v.revision, etag: v.etag, message: text, ...(initial ? { initial: true as const } : {}) };
      const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(submitted.current), signal: AbortSignal.timeout(90000) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "No se pudo enviar. Reintenta la misma solicitud.");
      submitted.current = null; if (!initial) setMessage("");
      await load();
      if (data.status === "FAILED") setError("La asistencia no está disponible. Tu mensaje se guardó; puedes continuar editando la definición.");
      if (data.status === "STALE") setNotice("La respuesta llegó después de otro cambio y no se aplicó. Revisa la definición actual.");
      if (data.status === "RUNNING") setNotice("La solicitud sigue pendiente. No se iniciará otra automáticamente; puedes editar manualmente.");
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo conectar."); }
    finally { setModelBusy(false); }
  };
  useEffect(() => {
    if (!state || !available || initialStarted.current || turns.some(t => t.kind === "MESSAGE") || state.revision !== 1 || state.confirmedRevision !== null || edit || dirty || conflict) return;
    initialStarted.current = true;
    void submit(state.definition.fields.originalIdea.value, true);
    // A loaded project is analyzed once. Existing turns and the persisted request
    // identity prevent an extra inference on reload or React effect replay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.id, available, turns.length]);
  useEffect(() => { if (thread.current) thread.current.scrollTop = thread.current.scrollHeight; }, [turns]);
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
  const blocking = d.ambiguities.filter(ambiguityBlocksSearch);
  const proposals = d.proposals.filter(p => p.status === "PENDING").sort((a, b) => Number(blocking.some(q => q.field === b.field)) - Number(blocking.some(q => q.field === a.field)));
  const busy = actionBusy || confirming;
  const confirmReason = conflict ? "Carga la revisión actual y resuelve el conflicto antes de continuar." : dirty ? "Guardando los cambios antes de continuar…" : modelBusy ? "Espera a que termine la respuesta; después revisa la definición." : busy ? "Guardando la definición…" : readiness.evidenceSearch.reasons[0];
  const summaryFields: DefinitionField[] = ["topic", d.fields.purpose.value ? "purpose" : "problem", "object", "context", "concepts", "intendedOutput"];
  const shownFields = summaryFields.filter(k => k === "topic" || (k === "object" && !usable(d.fields.concepts)) || usable(d.fields[k]));
  const otherConfirmed = DEFINITION_FIELDS.filter(k => usable(d.fields[k]) && !shownFields.includes(k));
  const proposalCard = (p: typeof proposals[number]) => <article key={p.id} className="rounded-[20px] border border-[var(--color-line)] bg-white/90 p-3 sm:p-4">
    <p className="text-xs font-medium text-[var(--color-muted)]">Sugerencia · {FIELD_LABELS[p.field]}</p>
    <p className="mt-1 text-sm leading-6">{p.proposed.value || (p.proposed.knowledge === "UNKNOWN" ? "Por definir" : "No aplica")}</p>
    <div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" className={primary} disabled={busy || conflict} onClick={() => void action({ kind: "ACCEPT", proposalId: p.id })}>Correcto</button>
      <button type="button" className={button} onClick={() => { advanced.current!.open = true; setEdit({ field: p.field, value: p.proposed.value, knowledge: p.proposed.knowledge }); requestAnimationFrame(() => document.getElementById("definition-value")?.focus()); }}>Cambiar</button>
      <button type="button" disabled={busy || conflict} className="px-2 text-xs text-[var(--color-muted)] underline" onClick={() => void action({ kind: "REJECT", proposalId: p.id })}>Descartar</button></div>
  </article>;
  return <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(255px,320px)] lg:items-start">
    <section className="surface-panel flex h-[min(48vh,30rem)] min-h-[23rem] min-w-0 flex-col rounded-[32px] p-4 sm:h-[min(60vh,44rem)] sm:min-h-[27rem] sm:p-6" aria-labelledby="conversation-title">
      <h2 id="conversation-title" className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">Define tu investigación</h2>
      <p className="mt-1 text-sm text-[var(--color-muted)]">Partimos de tu idea. Revisa solo lo que necesite una decisión tuya.</p>
      <div ref={thread} className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1" role="log" aria-label="Conversación académica" aria-live="polite">
        {turns.filter(t => t.kind !== "ACTION").map(t => <article key={t.requestId} className="space-y-2 text-sm leading-6 whitespace-pre-wrap">
          {(t.kind === "INITIAL_IDEA" || !t.inputJson.initial) && <p className="ml-auto max-w-[88%] rounded-[20px] bg-[var(--color-plum)] px-4 py-3 text-white"><span className="sr-only">Tú: </span>{t.inputJson.message ?? t.inputJson.idea}</p>}
          {t.status === "COMPLETE" && t.resultJson?.assistantText && <p className="max-w-[92%] rounded-[20px] border border-[var(--color-line)] bg-white/90 px-4 py-3"><span className="sr-only">Asesor: </span>{t.resultJson.assistantText}</p>}
          {t.status === "FAILED" && <p>Tu mensaje se conservó; la asistencia no está disponible.</p>}
          {t.status === "STALE" && <p>Respuesta anterior a tus últimos cambios; no aplicada.</p>}
          {t.status === "RUNNING" && <p>Preparando una propuesta a partir de tu idea…</p>}
        </article>)}
        {proposals.length > 0 && <div className="space-y-2" aria-label="Sugerencias por revisar">
          <p className="text-xs font-semibold text-[var(--color-muted)]">Revisa estas propuestas antes de usarlas</p>
          {proposals.slice(0, 2).map(proposalCard)}
          {proposals.length > 2 && <details className="text-sm"><summary className="cursor-pointer text-[var(--color-plum)]">Ver {proposals.length - 2} sugerencias más</summary><div className="mt-2 space-y-2">{proposals.slice(2).map(proposalCard)}</div></details>}
        </div>}
        {question && <fieldset className="rounded-[20px] border border-[var(--color-line)] bg-white/90 p-3"><legend className="px-1 font-medium">{question.question}</legend><div className="mt-2 flex flex-wrap gap-2">
          {question.options.map(option => <button type="button" key={option} className={button} disabled={modelBusy || !available} onClick={() => void submit(option)}>{option}</button>)}
          <button type="button" className={button} onClick={() => void action({ kind: "EDIT", field: question.field, value: "", knowledge: "UNKNOWN" })}>No lo sé</button>
          <button type="button" className="px-2 text-sm text-[var(--color-plum)] underline" onClick={() => document.getElementById("intake-message")?.focus()}>Prefiero explicarlo</button>
        </div></fieldset>}
        {!available && <p role="status" className="rounded-[20px] border border-[var(--color-line)] p-3 text-sm">La asistencia no está disponible ahora. Puedes editar y confirmar tu investigación en el panel.</p>}
      </div>
      <div className="mt-3 border-t border-[var(--color-line)] pt-3">
        <form onSubmit={e => { e.preventDefault(); if (message.trim()) void submit(message); }} className="rounded-[24px] border border-[var(--color-line)] bg-white p-3 shadow-sm focus-within:ring-2 focus-within:ring-[var(--color-lilac)]">
          <label className="sr-only" htmlFor="intake-message">Escribe una aclaración o pregunta</label>
          <textarea id="intake-message" maxLength={4000} rows={2} placeholder="Escribe una aclaración o pregunta…" className="max-h-40 min-h-16 w-full resize-y border-0 bg-transparent px-2 py-1 text-sm leading-6 outline-none" value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (message.trim()) void submit(message); } }} disabled={!available || modelBusy || Boolean(submitted.current)} />
          <div className="flex items-center justify-between gap-3"><span className="text-xs text-[var(--color-muted)]">Enter envía · Mayús+Enter crea una línea</span><button className={primary} disabled={!message.trim() || modelBusy || !available || conflict}>{modelBusy ? "Preparando…" : "Enviar"}</button></div>
        </form>
        <p className="mt-2 text-xs text-[var(--color-muted)]" role="status">{notice}</p>
        {error && <p className="mt-2 text-sm" role="alert">{error}</p>}
        {error && submitted.current && !dirty && <button type="button" className={button} onClick={() => void submit(submitted.current!.message, Boolean(submitted.current!.initial))}>Reintentar la misma solicitud</button>}
        {conflict ? <div className="mt-2 rounded-xl border p-3 text-sm"><p>Tu texto local se conserva. Carga la revisión actual y compara antes de guardar.</p><button className={button} onClick={() => { void load(true).then(() => { conflictRef.current = false; setConflict(false); setError(""); setDirty(false); setNotice("Revisión actual cargada; tu texto sigue en el editor. Pulsa Guardar para reaplicarlo conscientemente."); }).catch(e => setError(e.message)); }}>Cargar revisión para comparar</button></div> : error && dirty ? <button className={button} onClick={() => void flush().catch(() => undefined)}>Reintentar guardado</button> : null}
      </div>
    </section>
    <aside className="surface-panel min-w-0 rounded-[32px] p-4 sm:p-5 lg:sticky lg:top-24" aria-label="Definición estructurada">
      <h2 className="font-[var(--font-heading)] text-lg font-semibold">Tu investigación</h2>
      <p className="mt-1 text-xs text-[var(--color-muted)]">{state.confirmedRevision === state.revision ? "Definición confirmada" : "Borrador por confirmar"}</p>
      <dl className="mt-4 space-y-3">{shownFields.map(k => <div key={k} className="border-b border-[var(--color-line)] pb-3">
        <dt className="text-xs font-semibold text-[var(--color-muted)]">{k === "topic" ? "Tema / intención" : FIELD_LABELS[k]}</dt>
        <dd className="mt-1 text-sm leading-5 whitespace-pre-wrap">{publicValue(k, d.fields[k].value) || (d.fields[k].knowledge === "NOT_APPLICABLE" ? "No aplica" : "Por precisar")}</dd>
        <dd><button type="button" className="mt-1 text-xs text-[var(--color-plum)] underline" onClick={() => void chooseField(k)}>Editar</button></dd>
      </div>)}</dl>
      <details ref={advanced} className="mt-4" ><summary className="cursor-pointer text-sm font-semibold text-[var(--color-plum)]">Más detalles</summary>
        <label htmlFor="definition-field">Campo</label><select id="definition-field" className="my-2 w-full rounded border p-2" value={edit?.field ?? ""} onChange={e => void chooseField(e.target.value as DefinitionField)}><option value="" disabled>Selecciona qué quieres precisar</option>{DEFINITION_FIELDS.filter(k => k !== "originalIdea").map(k => <option key={k} value={k}>{FIELD_LABELS[k]}</option>)}</select>
        {edit && <div className="grid gap-2">
          <label htmlFor="definition-value">{FIELD_LABELS[edit.field]}</label>
          {edit.field === "academicLevel" ? <select id="definition-value" value={edit.value} onChange={e => changeEdit({ ...edit, value: e.target.value, knowledge: "KNOWN" })}><option value="PREGRADO">Pregrado</option><option value="MAESTRIA">Maestría</option><option value="PROYECTO_INVESTIGACION">Proyecto de investigación</option></select> : <textarea id="definition-value" rows={3} className="rounded border p-2" maxLength={8000} value={edit.value} onChange={e => changeEdit({ ...edit, value: e.target.value, knowledge: "KNOWN" })} />}
          {edit.field === "taxonomy" && <div>{taxonomy.slice(0, 6).map(t => <button type="button" className={button} key={t.code} onClick={() => changeEdit({ ...edit, value: t.label, knowledge: "KNOWN" })}>{t.label}</button>)}<p className="text-xs">Puedes indicar un área propia; no es obligatorio elegir una clasificación exacta.</p></div>}
          {edit.field !== "academicLevel" && <div className="flex gap-2"><button className={button} onClick={() => changeEdit({ ...edit, value: "", knowledge: "UNKNOWN" })}>No lo sé</button><button className={button} onClick={() => changeEdit({ ...edit, value: "", knowledge: "NOT_APPLICABLE" })}>No aplica</button></div>}
          <button className={button} disabled={conflict} onClick={() => void flush().catch(() => undefined)}>Guardar este campo</button>
        </div>}
        {d.ambiguities.filter(a => !a.resolved && !ambiguityBlocksSearch(a)).map(a => <form key={a.id} className="mt-3 rounded-xl border p-3 text-sm" onSubmit={e => { e.preventDefault(); const answer = String(new FormData(e.currentTarget).get("answer") ?? ""); void action({ kind: "RESOLVE", ambiguityId: a.id, answer }); }}>
          <label>{a.question}<input required name="answer" maxLength={2000} className="mt-2 w-full rounded border p-2" /></label><button className={button}>Resolver</button></form>)}
      </details>
      <div className="mt-5 border-t border-[var(--color-line)] pt-4">
        {readiness.evidenceSearch.reasons.map(r => <p key={r} className="my-2 text-xs text-[var(--color-muted)]">{r}</p>)}
        {blocking.map(a => <form key={a.id} className="my-3 rounded-xl border border-[var(--color-line)] p-3 text-sm" onSubmit={e => { e.preventDefault(); void action({ kind: "RESOLVE", ambiguityId: a.id, answer: String(new FormData(e.currentTarget).get("answer") ?? "") }); }}>
          <label>{a.question}<input required name="answer" maxLength={2000} className="mt-2 w-full rounded border p-2" /></label>
          <button className={button} disabled={busy || conflict}>Guardar aclaración</button>
          {canDeferAmbiguity(a) && <button type="button" className="mt-2 text-xs underline" disabled={busy || conflict} onClick={() => void action({ kind: "DEFER", ambiguityId: a.id })}>Dejar pendiente; buscar con la definición aceptada</button>}
        </form>)}
        <button className={primary} disabled={modelBusy || conflict || busy} onClick={() => { void flush().then(v => { reviewing.current = { revision: v.revision, definitionHash: v.definitionHash }; setReview(true); }).catch(() => undefined); }}>Revisar definición</button>
        {review && <div className="mt-4 text-sm" aria-label="Revisión antes de confirmar"><h3 className="font-semibold">Esto entendimos para buscar evidencia</h3><dl>{shownFields.filter(k => usable(d.fields[k])).map(k => <div className="my-2" key={k}><dt className="font-medium">{FIELD_LABELS[k]}</dt><dd className="whitespace-pre-wrap">{publicValue(k, d.fields[k].value)}</dd></div>)}</dl>
          {otherConfirmed.length > 0 && <details><summary className="cursor-pointer text-[var(--color-plum)]">Ver otros valores que se incluirán</summary><dl>{otherConfirmed.map(k => <div className="my-2" key={k}><dt className="font-medium">{FIELD_LABELS[k]}</dt><dd className="whitespace-pre-wrap">{publicValue(k, d.fields[k].value)}</dd></div>)}</dl></details>}
          <p className="my-3 text-xs text-[var(--color-muted)]">{proposals.length ? `${proposals.length} propuestas sin aceptar no se incluirán. ` : ""}{readiness.evidenceSearch.reasons.length ? "Resuelve los puntos anteriores para continuar. " : ""}La confirmación prepara la búsqueda; no inicia una generación.</p>
          <button type="button" className="mb-3 text-sm text-[var(--color-plum)] underline" onClick={() => { setReview(false); document.getElementById("intake-message")?.focus(); }}>Seguir aclarando</button>
          {confirmReason && <p id="confirmation-reason" role="status" className="my-2 text-xs">{confirmReason}</p>}
          <button className={primary} aria-describedby={confirmReason ? "confirmation-reason" : undefined} disabled={readiness.evidenceSearch.status !== "READY" || dirty || conflict || modelBusy || busy} onClick={async () => {
            if (confirmationLock.current || actionLock.current || conflictRef.current) return;
            confirmationLock.current = true; setConfirming(true);
            try {
              const v = await flush(); if (v.definitionHash !== reviewing.current?.definitionHash || v.revision !== reviewing.current?.revision) { setReview(false); throw new Error("Hay cambios nuevos; revisa de nuevo antes de confirmar."); }
              const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "confirm", revision: v.revision, definitionHash: v.definitionHash }) });
              const data = await r.json();
              if (!r.ok) { if (r.status === 409) { conflictRef.current = true; setConflict(true); setReview(false); } throw new Error(data.error); }
              adopt(data.state); setNotice("Definición confirmada. Puedes buscar fuentes cuando lo decidas."); setReview(false);
              router.push(`/projects/${projectId}?step=evidence`); router.refresh();
            } catch (e) { setError(e instanceof Error ? e.message : "No se pudo confirmar."); }
            finally { confirmationLock.current = false; setConfirming(false); }
          }}>Confirmar para buscar evidencia</button>
        </div>}
      </div>
    </aside>
  </div>;
}
