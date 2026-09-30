"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, UploadCloud, X, RotateCcw } from "lucide-react";
import { UserPdfPlaceholder } from "./user-pdf-placeholder";

type Document = { id: string; fileName: string; byteSize: number | null; status: string; identityStatus: string; createdAt: string };
type State = { capability: { enabled: boolean }; draftRevision?: number; documents: Document[] };
type Pending = { file: File; progress: number | null; error: string | null };
const activeCount = (documents: Document[]) => documents.filter(doc =>
  ["PREPARED", "QUARANTINED", "UPLOADING"].includes(doc.status) ||
  doc.status === "AWAITING_UPLOAD" && Date.now() - new Date(doc.createdAt).getTime() < 600_000).length;

export function PrivatePdfUpload({ projectId }: { projectId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);

  async function refresh() {
    const response = await fetch(`/api/projects/${projectId}/documents`, { cache: "no-store" });
    if (!response.ok) throw new Error("No se pudieron consultar los documentos.");
    const next = await response.json() as State;
    setState(next); window.dispatchEvent(new Event("imx-selection-saved")); return next;
  }
  useEffect(() => { void refresh().catch(() => setMessage("No se pudieron cargar los PDF.")); }, [projectId]);
  if (!state?.capability.enabled) return <UserPdfPlaceholder />;

  async function upload(file?: File) {
    if (!file || busy) return;
    if (activeCount(state!.documents) >= 2) { setMessage("Puedes añadir como máximo dos PDF."); return; }
    if (file.size > 30 * 1024 * 1024 || file.size < 5 || !/\.pdf$/i.test(file.name)) {
      setMessage("Elige un PDF de hasta 30 MiB."); return;
    }
    setBusy(true); setMessage(""); setPending({ file, progress: 0, error: null });
    let grantId: string | null = null, uploaded = false;
    try {
      const current = await refresh();
      if (activeCount(current.documents) >= 2 || current.draftRevision === undefined) throw new Error("El proyecto cambió. Revisa tus documentos y vuelve a intentar.");
      const auth = await fetch("/api/transfers/authorize", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: "UPLOAD", projectId, fileName: file.name, byteSize: file.size,
          draftRevision: current.draftRevision, trainingConsent: consent }) });
      if (!auth.ok) throw new Error(auth.status === 409 ? "El proyecto o el límite de PDF cambió. Revisa la lista y vuelve a intentar." : "No se pudo autorizar la carga.");
      const grant = await auth.json() as { url: string; token: string; documentId: string };
      grantId = grant.documentId;
      await new Promise<void>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("PUT", grant.url);
        request.setRequestHeader("Content-Type", "application/pdf");
        request.setRequestHeader("Authorization", `Bearer ${grant.token}`);
        request.upload.onprogress = event => { if (event.lengthComputable) setPending({ file,
          progress: Math.floor(event.loaded * 100 / event.total), error: null }); };
        request.onerror = () => reject(new Error("Se interrumpió la carga. Puedes reintentar."));
        request.onload = () => {
          if (request.status >= 200 && request.status < 300) { resolve(); return; }
          let message = "No pudimos completar la carga del PDF. Conserva tu archivo e inténtalo más tarde.";
          try { const payload = JSON.parse(request.responseText); if (typeof payload.error === "string" && !/^[A-Z_]+$/.test(payload.error)) message = payload.error; } catch {}
          reject(new Error(message));
        };
        request.send(file);
      });
      uploaded = true;
      const processed = await fetch(`/api/projects/${projectId}/documents/${grant.documentId}`, { method: "POST" });
      setMessage(processed.ok ? "PDF guardado de forma privada. Su pertinencia se revisará al continuar." :
        "PDF recibido; no pudimos verificarlo todavía. Puedes reintentar desde la lista.");
      setPending(null);
    } catch (error) {
      if (grantId && !uploaded) await fetch(`/api/projects/${projectId}/documents/${grantId}`, { method: "DELETE" }).catch(() => undefined);
      setPending({ file, progress: null, error: error instanceof Error ? error.message : "No se pudo cargar el PDF." });
    }
    finally { setBusy(false); await refresh().catch(() => undefined); router.refresh(); if (input.current) input.current.value = ""; }
  }

  async function act(id: string, method: "POST" | "DELETE") {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/projects/${projectId}/documents/${id}`, { method });
      if (!response.ok) throw new Error();
      setMessage(method === "DELETE" ? "PDF retirado del conjunto actual." : "Volvimos a verificar el PDF.");
    } catch { setMessage("No se pudo completar la acción. Puedes reintentar."); }
    finally { setBusy(false); await refresh().catch(() => undefined); router.refresh(); }
  }

  const full = activeCount(state.documents) >= 2;
  return <section className="surface-panel rounded-[28px] p-5 sm:p-6" aria-labelledby="pdf-heading">
    <h3 id="pdf-heading" className="font-[var(--font-heading)] text-lg font-semibold text-[var(--color-ink)]">¿Tienes documentos relevantes? <span className="text-sm font-normal text-[var(--color-muted)]">Opcional</span></h3>
    <p className="mt-1 text-sm text-[var(--color-muted)]">Hasta dos PDF de 30 MiB. La carga no confirma su pertinencia científica.</p>
    {!full && <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-[var(--color-lilac-strong)] bg-[rgba(219,193,255,0.13)] p-4 text-sm text-[var(--color-plum)] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--color-plum)]"
      onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void upload(event.dataTransfer.files[0]); }}>
      <UploadCloud className="size-6 shrink-0" aria-hidden="true" />
      <span>Arrastra tu PDF o <strong>selecciona un archivo</strong></span>
      <input ref={input} type="file" accept="application/pdf,.pdf" className="sr-only" disabled={busy}
        aria-describedby="pdf-hint" onChange={event => void upload(event.target.files?.[0])} />
    </label>}
    <p id="pdf-hint" className="mt-2 text-xs text-[var(--color-muted)]">El archivo se conserva en almacenamiento privado. Máximo dos archivos activos.</p>
    <label className="mt-3 flex items-start gap-2 text-xs text-[var(--color-muted)]"><input type="checkbox" checked={consent}
      onChange={event => setConsent(event.target.checked)} />Autorizo opcionalmente el uso interno de mis aportes propios; no concede derechos sobre publicaciones ajenas.</label>
    <ul className="mt-4 grid gap-2" aria-label="PDF del proyecto">{state.documents.map(doc => <li key={doc.id}
      className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--color-line)] bg-white/80 p-3 text-sm">
      <FileText className="size-5 shrink-0 text-[var(--color-plum)]" aria-hidden="true" />
      <div className="min-w-0 flex-1"><p className="break-all font-medium">{doc.fileName}</p>
        <p className="text-xs text-[var(--color-muted)]">{doc.byteSize ? `${(doc.byteSize / 1048576).toFixed(1)} MiB · ` : ""}{doc.status === "PREPARED" ? "Recibido" : doc.status === "QUARANTINED" ? "Pendiente de verificación" : "Carga pendiente"}</p></div>
      {doc.status === "QUARANTINED" && <button type="button" disabled={busy} className="inline-flex items-center gap-1 text-[var(--color-plum)] underline focus-visible:outline-2" onClick={() => void act(doc.id, "POST")} aria-label={`Reintentar verificación de ${doc.fileName}`}><RotateCcw className="size-4" aria-hidden="true" />Reintentar</button>}
      <button type="button" disabled={busy} className="inline-flex items-center gap-1 text-[var(--color-plum)] underline focus-visible:outline-2" onClick={() => void act(doc.id, "DELETE")} aria-label={`Quitar ${doc.fileName}`}><X className="size-4" aria-hidden="true" />Quitar</button>
    </li>)}</ul>
    {pending && <div className="mt-3 rounded-xl border border-[var(--color-line)] p-3 text-sm" role="status">
      <p className="break-all">{pending.file.name} · {pending.error ?? (pending.progress === null ? "Verificando…" : `Cargando ${pending.progress}%`)}</p>
      {pending.progress !== null && !pending.error && <progress className="mt-2 w-full" max={100} value={pending.progress} />}
      {pending.error && <button className="mt-2 inline-flex items-center gap-1 text-[var(--color-plum)] underline" type="button" onClick={() => void upload(pending.file)}><RotateCcw className="size-4" aria-hidden="true" />Reintentar</button>}
    </div>}
    {message && <p className="mt-3 text-sm text-[var(--color-plum)]" role="status">{message}</p>}
  </section>;
}
