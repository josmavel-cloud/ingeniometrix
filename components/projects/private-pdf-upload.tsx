"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPdfPlaceholder } from "./user-pdf-placeholder";
type State = { capability: { enabled: boolean }; draftRevision?: number; documents: Array<{
  id: string; fileName: string; status: string; identityStatus: string; extractionStatus: string; referenceId: string | null
}> };
export function PrivatePdfUpload({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [state, setState] = useState<State | null>(null), [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [consent, setConsent] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  async function refresh() { const r = await fetch(`/api/projects/${projectId}/documents`, { cache: "no-store" }); if (r.ok) setState(await r.json()); }
  useEffect(() => { void refresh(); }, [projectId]);
  if (!state?.capability.enabled) return <UserPdfPlaceholder />;
  async function upload(file?: File) {
    if (!file || !state) return;
    setBusy(true); setMessage(""); setUploadPercent(0);
    try {
      if (file.size > 30 * 1024 * 1024 || file.type !== "application/pdf") throw new Error();
      const auth = await fetch("/api/transfers/authorize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purpose: "UPLOAD", projectId, fileName: file.name, byteSize: file.size, draftRevision: state.draftRevision, trainingConsent: consent }) });
      if (!auth.ok) throw new Error();
      const grant = await auth.json();
      await new Promise<void>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("PUT", grant.url);
        request.setRequestHeader("Content-Type", "application/pdf");
        request.setRequestHeader("Authorization", `Bearer ${grant.token}`);
        request.upload.onprogress = event => {
          if (event.lengthComputable) setUploadPercent(Math.floor(event.loaded * 100 / event.total));
        };
        request.onerror = () => reject(new Error("UPLOAD_NETWORK_FAILED"));
        request.onload = () => request.status >= 200 && request.status < 300
          ? resolve() : reject(new Error("UPLOAD_REJECTED"));
        request.send(file);
      });
      setUploadPercent(null);
      setMessage("Archivo recibido de forma privada. Preparando identidad y texto sin validar aún su pertinencia.");
      const processed = await fetch(`/api/projects/${projectId}/documents/${grant.documentId}`, { method: "POST" });
      if (!processed.ok) setMessage("PDF guardado en cuarentena. La preparación falló; puedes reintentarla.");
      else setMessage("PDF preparado. Comprueba su identidad y pertinencia antes de utilizarlo como evidencia.");
    } catch { setMessage("No se pudo guardar el PDF. Máximo 2 archivos de 30 MB; recarga si cambió tu borrador."); }
    finally { setBusy(false); setUploadPercent(null); await refresh(); router.refresh(); }
  }
  async function act(id: string, method: "POST" | "DELETE") {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/projects/${projectId}/documents/${id}`, { method });
      if (!response.ok) throw new Error();
      setMessage(method === "DELETE" ? "PDF retirado del proyecto." : "PDF preparado; su pertinencia sigue pendiente de revisión.");
    } catch { setMessage("No se pudo completar la acción. Reintenta en unos segundos."); }
    finally { setBusy(false); await refresh(); router.refresh(); }
  }
  return <section className="surface-panel rounded-2xl p-5"><h3>PDF adicionales (opcional)</h3>
    <p>Máximo 2 PDF de 30 MB. La carga no confirma pertinencia ni identidad bibliográfica.</p>
    <label><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> Autorizo opcionalmente el uso interno de mis aportes propios; no concede derechos sobre publicaciones ajenas.</label>
    <input aria-label="Cargar PDF privado" type="file" accept="application/pdf" disabled={busy} onChange={(e) => void upload(e.target.files?.[0])} />
    <p role="status">{busy ? uploadPercent === null ? "Preparando PDF…" : `Cargando PDF: ${uploadPercent}%` : message}</p>
    <ul className="mt-3 grid gap-2">{state.documents.map((d) => <li className="rounded-xl border border-slate-200 p-3 text-sm" key={d.id}>
      <span className="font-medium">{d.fileName}</span>
      <span className="ml-2 text-slate-600">{d.status === "PREPARED"
        ? d.identityStatus === "MATCHED" ? "Vinculado a una fuente existente" : "Identidad por revisar"
        : d.status === "QUARANTINED" ? "Recibido, pendiente de preparación" : d.status === "REJECTED" ? "No admitido" : "Carga pendiente"}</span>
      {d.status === "QUARANTINED" ? <button className="ml-3 underline" disabled={busy} onClick={() => void act(d.id, "POST")} type="button">Reintentar preparación</button> : null}
      <button className="ml-3 underline" disabled={busy} onClick={() => void act(d.id, "DELETE")} type="button">Quitar</button>
    </li>)}</ul>
  </section>;
}
