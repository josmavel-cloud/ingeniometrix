import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { BrandBadge } from "@/components/brand/brand-badge";
import { getCurrentUser } from "@/server/auth/session";
import { GoogleButton } from "@/components/auth/google-button";

export const dynamic = "force-dynamic";

export default async function WorkspaceEntryPage({ searchParams }: { searchParams: Promise<{ auth?: string }> }) {
  const authState = (await searchParams).auth;
  const user = await getCurrentUser();

  if (user) {
    redirect("/projects");
  }

  return (
    <main className="flex min-h-screen items-center px-4 py-8 sm:px-6 lg:px-8">
      <section className="surface-panel mx-auto w-full max-w-xl rounded-[36px] p-6 sm:p-9">
        <Link className="inline-flex" href="/">
          <BrandBadge compact context="company" />
        </Link>

        <div className="mt-8">
          <p className="brand-kicker">Acceso al MVP</p>
          <h1 className="mt-3 font-[var(--font-heading)] text-3xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-4xl">
            Continua tu investigacion.
          </h1>
          <p className="mt-4 text-base leading-8 text-[var(--color-muted)]">
            Ingresa para crear un proyecto, buscar evidencia y preparar tu plan de tesis.
          </p>
        </div>

        <div className="mt-7">
          {authState && <p role="alert" className="mb-4">{authState === "account_link_required" ? "Ya tienes una cuenta. Ingresa con tu contraseña y vincula Google desde Mi cuenta." : "No se pudo completar el acceso. Intenta nuevamente."}</p>}
          <GoogleButton />
          <details className="mt-6"><summary>Acceder con una cuenta existente</summary><div className="mt-4"><LoginForm /></div></details>
        </div>

        <p className="mt-6 border-t border-[rgba(74,58,97,0.08)] pt-5 text-sm leading-6 text-[var(--color-muted)]">
          El acceso esta disponible para cuentas habilitadas de Ingeniometrix.
        </p>
      </section>
    </main>
  );
}
