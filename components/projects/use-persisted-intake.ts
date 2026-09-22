"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { DraftSaveQueue, registerDraftFlush } from "@/lib/draft-save-queue";
import { draftIntakeFrom, type DraftIntake, type DraftView } from "@/lib/project-draft-contract";

export function usePersistedIntake(projectId: string, form: DraftIntake, setForm: (form: DraftIntake) => void) {
  const currentForm = useRef(form); currentForm.current = form;
  const queue = useRef<DraftSaveQueue | null>(null);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("Recuperando tu borrador…");
  const [error, setError] = useState<string | null>(null);
  const conflict = useRef(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setReady(false); queue.current = null;
    fetch(`/api/projects/${projectId}/draft`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("No se pudo recuperar el borrador. Tus cambios no se sobrescribirán.");
      const { draft } = await response.json() as { draft: DraftView };
      if (controller.signal.aborted) return;
      queue.current = new DraftSaveQueue(draft, async (revision, intake, etag) => {
        const response = await fetch(`/api/projects/${projectId}/draft`, { method: "PUT", headers: { "Content-Type": "application/json", "If-Match": etag }, body: JSON.stringify({ revision, etag, intake }), keepalive: true });
        const payload = await response.json();
        if (!response.ok) { conflict.current = response.status === 409; throw new Error(payload.error ?? "No se pudo guardar."); }
        return payload.draft;
      });
      conflict.current = false; setForm(draftIntakeFrom(draft.intake)); setReady(true); setError(null); setMessage("Borrador recuperado.");
    }).catch((e) => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, [projectId, reload, setForm]);
  const save = useCallback(async (intake: DraftIntake) => {
    if (!queue.current) throw new Error("Espera a que se recupere el borrador.");
    setMessage("Guardando…");
    try {
      const saved = await queue.current.save(intake);
      setMessage(`Guardado · revisión ${saved.revision}`); return saved;
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar."); setMessage("Cambios pendientes de guardar"); throw e; }
  }, []);
  const confirm = useCallback(async (intake: DraftIntake) => {
    const saved = await save(intake);
    // Unchanged legacy revision 0 is already confirmed by the existing intake.
    if (saved.revision === 0 && saved.confirmedRevision === 0) return 0;
    const response = await fetch(`/api/projects/${projectId}/draft`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: saved.revision }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "No se pudo confirmar la revisión.");
    setMessage(`Definición confirmada · revisión ${saved.revision}`);
    return saved.revision;
  }, [projectId, save]);
  useEffect(() => registerDraftFlush(projectId, () => confirm(currentForm.current)), [projectId, confirm]);
  useEffect(() => {
    if (!ready || error || queue.current?.matches(form)) return;
    setMessage("Cambios pendientes de guardar");
    const timer = setTimeout(() => { void save(form).catch(() => undefined); }, 800);
    return () => clearTimeout(timer);
  }, [form, ready, error, save]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (queue.current && !queue.current.matches(currentForm.current)) { event.preventDefault(); event.returnValue = ""; }
    };
    const guardNavigation = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") as HTMLAnchorElement | null : null;
      if (anchor && new URL(anchor.href).pathname !== location.pathname && queue.current && !queue.current.matches(currentForm.current)) {
        event.preventDefault(); event.stopPropagation();
        void save(currentForm.current).then(() => { location.assign(anchor.href); }).catch(() => undefined);
      }
    };
    window.addEventListener("beforeunload", beforeUnload); document.addEventListener("click", guardNavigation, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", guardNavigation, true); };
  }, [save]);
  return { ready, message, error, confirm, canRetry: !conflict.current && Boolean(queue.current), retrySaving: () => { if (conflict.current || !queue.current) return; queue.current.retry(); setError(null); void save(currentForm.current).catch(() => undefined); }, reloadSaved: () => setReload((v) => v + 1) };
}
