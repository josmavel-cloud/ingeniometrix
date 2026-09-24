"use client";
import { useEffect, useState } from "react";
import { UserPdfPlaceholder } from "./user-pdf-placeholder";
type State = { capability: { enabled: boolean }; draftRevision?: number; documents: Array<{ id: string; fileName: string; status: string }> };
export function PrivatePdfUpload({ projectId }: { projectId: string }) {
  const [state, setState] = useState<State | null>(null), [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [consent, setConsent] = useState(false);
  async function refresh() { const r = await fetch(`/api/projects/${projectId}/documents`, { cache: "no-store" }); if (r.ok) setState(await r.json()); }
  useEffect(() => { void refresh(); }, [projectId]);
  if (!state?.capability.enabled) return <UserPdfPlaceholder />;
  async function upload(file?: File) {
    if (!file || !state) return;
    setBusy(true); setMessage("");
    try {
      if (file.size > 30 * 1024 * 1024 || file.type !== "application/pdf") throw new Error();
      const auth = await fetch("/api/transfers/authorize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purpose: "UPLOAD", projectId, fileName: file.name, byteSize: file.size, draftRevision: state.draftRevision, trainingConsent: consent }) });
      if (!auth.ok) throw new Error();
      const grant = await auth.json();
      const result = await fetch(grant.url, { method: "PUT", credentials: "omit", headers: { "Content-Type": "application/pdf", Authorization: `Bearer ${grant.token}` }, body: file });
      if (!result.ok) throw new Error();
      setMessage("Archivo recibido de forma privada. Pendiente de revisión; aún no se usa como evidencia.");
    } catch { setMessage("No se pudo guardar el PDF. Máximo 2 archivos de 30 MB; recarga si cambió tu borrador."); }
    finally { setBusy(false); await refresh(); }
  }
  return <section className="surface-panel rounded-2xl p-5"><h3>PDF adicionales (opcional)</h3>
    <p>Máximo 2 PDF de 30 MB. Se guardan en cuarentena; la incorporación a evidencia requiere una revisión posterior.</p>
    <label><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> Autorizo opcionalmente el uso interno de mis aportes propios; no concede derechos sobre publicaciones ajenas.</label>
    <input aria-label="Cargar PDF privado" type="file" accept="application/pdf" disabled={busy} onChange={(e) => void upload(e.target.files?.[0])} />
    <p role="status">{busy ? "Guardando archivo…" : message}</p>
    <ul>{state.documents.map((d) => <li key={d.id}>{d.fileName} — {d.status === "QUARANTINED" ? "Recibido, pendiente de revisión" : d.status === "REJECTED" ? "No admitido" : "Carga pendiente"}</li>)}</ul>
  </section>;
}
