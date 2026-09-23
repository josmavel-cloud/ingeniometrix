"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
type Account = { balance: { available: number; total: number; reserved: number; consumed: number }; checkoutAvailable: boolean; trainingConsent: boolean;
  offer: null | { id: string; displayName: string; priceMinor: number; currency: string; planSlots: number; termsVersion: string; privacyVersion: string };
  purchases: Array<{ id: string; status: string; createdAt: string }> };
export const paymentLabels: Record<string, string> = { CREATED: "Preparando pago", CHECKOUT_READY: "Pendiente de pago", PENDING: "Pago pendiente de confirmación", PAID: "Pago confirmado", CANCELLED: "Pago cancelado", FAILED: "Pago no completado", EXPIRED: "Pago vencido", REFUNDED: "Pago reembolsado", CHARGEBACK: "Pago en revisión", REVIEW_REQUIRED: "Compra en revisión" };
export function AccountPanel({ compact = false }: { compact?: boolean }) {
  const [account, setAccount] = useState<Account | null>(null), [error, setError] = useState(""), [pending, setPending] = useState(false), [terms, setTerms] = useState(false);
  useEffect(() => { fetch("/api/commercial", { cache: "no-store" }).then(async (r) => { if (!r.ok) throw new Error(); setAccount(await r.json()); }).catch(() => setError("No se pudo consultar tu paquete.")); }, []);
  async function checkout() {
    if (!account?.offer) return;
    setPending(true); setError("");
    const storageKey = `imx-checkout:${account.offer.id}`;
    // Persist the logical attempt before dispatch, including reload/network failure.
    const requestKey = sessionStorage.getItem(storageKey) || crypto.randomUUID();
    sessionStorage.setItem(storageKey, requestKey);
    try {
      const r = await fetch("/api/commercial", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offerId: account.offer.id, requestKey, termsVersion: account.offer.termsVersion, privacyVersion: account.offer.privacyVersion, acceptTerms: true, acknowledgePrivacy: true }) });
      const result = await r.json(); if (!r.ok) throw new Error(); window.location.assign(result.checkoutUrl);
    } catch { setError("No se pudo abrir el pago. Reintenta; conservamos tu solicitud."); setPending(false); }
  }
  async function consent(value: boolean) {
    const r = await fetch("/api/commercial/consent", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trainingConsent: value }) });
    if (r.ok) setAccount((old) => old && { ...old, trainingConsent: value }); else setError("No se pudo guardar tu preferencia.");
  }
  if (!account) return <p aria-live="polite">{error || "Consultando planes disponibles…"}</p>;
  return <section className="my-4 grid gap-4 rounded-2xl border p-5">
    <p>Planes disponibles: {account.balance.available} de {account.balance.total}{account.balance.reserved ? ` · ${account.balance.reserved} en preparación` : ""}</p>
    {compact ? <Link href="/account">{account.balance.available ? "Ver mi paquete" : "Obtener un paquete de planes"}</Link> : <>
      {account.offer && <><h2>{account.offer.displayName}</h2><p>{new Intl.NumberFormat("es-PE", { style: "currency", currency: account.offer.currency }).format(account.offer.priceMinor / 100)} · {account.offer.planSlots} publicaciones de planes · sin renovación automática</p>
        <p>Oferta de prueba. Precio comercial pendiente de aprobación. No se realizan cobros reales.</p>
        <label><input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} /> Acepto las <Link href="/terms">condiciones de prueba</Link> y reconozco el <Link href="/privacy">aviso de privacidad</Link>.</label>
        <button className="brand-button-primary p-3" disabled={!account.checkoutAvailable || !terms || pending} onClick={checkout}>{pending ? "Abriendo pago…" : "Probar compra de paquete"}</button>
        {!account.checkoutAvailable && <p>El pago de prueba aún no está habilitado.</p>}
        <button onClick={() => { sessionStorage.removeItem(`imx-checkout:${account.offer!.id}`); setError("Nueva solicitud preparada. Revisa primero tus compras pendientes."); }}>Preparar una compra adicional</button>
      </>}
      <h2>Mis compras</h2>{account.purchases.length ? account.purchases.map((p) => <Link key={p.id} href={`/account/purchases/${p.id}`}>{new Date(p.createdAt).toLocaleDateString("es-PE")} — {paymentLabels[p.status] || "En revisión"}</Link>) : <p>Aún no tienes compras.</p>}
      <label><input type="checkbox" checked={account.trainingConsent} onChange={(e) => void consent(e.target.checked)} /> Autorizo opcionalmente el uso de mis aportes propios para mejora interna. Puedo revocarlo aquí. No incluye derechos sobre publicaciones de terceros ni condiciona el servicio.</label>
    </>}{error && <p role="alert">{error}</p>}
  </section>;
}
export function PurchaseStatus({ id }: { id: string }) {
  const [status, setStatus] = useState(""), [error, setError] = useState("");
  useEffect(() => { let alive = true; let polls = 0; const refresh = async () => { try { const r = await fetch(`/api/commercial/purchases/${encodeURIComponent(id)}`, { cache: "no-store" }); if (!r.ok) throw new Error(); const p = await r.json(); if (alive) setStatus(p.status); } catch { if (alive) setError("No se pudo consultar esta compra."); } }; void refresh(); const timer = setInterval(() => { if (++polls >= 60) clearInterval(timer); else void refresh(); }, 5000); return () => { alive = false; clearInterval(timer); }; }, [id]);
  return <p role="status">{error || paymentLabels[status] || "Verificando el estado de tu compra…"}</p>;
}
