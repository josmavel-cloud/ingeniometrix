import Link from "next/link";
import { notFound } from "next/navigation";
import { PurchaseStatus } from "@/components/commercial/account-panel";
import { requireCurrentUser } from "@/server/auth/session";
import { purchaseForUser } from "@/server/commercial/purchases";
export const dynamic = "force-dynamic";
export default async function PurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser(); const { id } = await params;
  try { await purchaseForUser(user.id, id); } catch { notFound(); }
  return <main className="mx-auto max-w-3xl p-8"><h1>Estado de la compra</h1><PurchaseStatus id={id} /><p>El paquete se habilita cuando verificamos el pago. Puedes volver más tarde.</p><Link href="/account">Ver mi cuenta</Link></main>;
}
