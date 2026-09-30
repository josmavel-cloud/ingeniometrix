import Link from "next/link";
import { AccountPanel } from "@/components/commercial/account-panel";
import { GoogleButton } from "@/components/auth/google-button";
import { requireCurrentUser } from "@/lib/backend-http";
export const dynamic = "force-dynamic";
export default async function AccountPage() {
  await requireCurrentUser();
  return <main className="mx-auto max-w-3xl p-8"><h1>Mi cuenta</h1><Link href="/projects">Volver a mis proyectos</Link><AccountPanel /><GoogleButton link /><p className="mt-3">Para vincular Google, inicia sesión con tu cuenta existente en los últimos 15 minutos.</p></main>;
}
