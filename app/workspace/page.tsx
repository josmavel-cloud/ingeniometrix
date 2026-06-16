import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser } from "@/server/auth/session";

export default async function WorkspaceEntryPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/projects");
  }

  return (
    <main className="min-h-screen px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="surface-panel overflow-hidden rounded-[38px] px-6 py-8 sm:px-8 lg:px-10">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div className="max-w-3xl">
              <div className="brand-pill">
                <span className="inline-flex size-2 rounded-full bg-[var(--color-coral)]" />
                Workspace Ingeniometrix
              </div>
              <h1 className="mt-5 font-[var(--font-heading)] text-3xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-4xl">
                Entrada directa al producto.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-8 text-[var(--color-muted)]">
                Usa esta ruta para entrar al workspace real desde el portal publico.
                El acceso esta limitado a usuarios habilitados previamente en el
                backend.
              </p>
            </div>

            <div className="brand-card-primary rounded-[30px] px-5 py-5">
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-white/64">
                Acceso MVP
              </p>
              <p className="mt-3 font-[var(--font-heading)] text-xl font-semibold text-white">
                Inicia sesion y entra al flujo productivo.
              </p>
              <p className="mt-3 text-sm leading-7 text-white/76">
                Desde ahi podras crear proyectos, completar intake, seleccionar
                fuentes y probar el blueprint sin volver al portal.
              </p>
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="surface-panel rounded-[32px] p-6 sm:p-8">
            <p className="brand-kicker">Iniciar sesion</p>
            <h2 className="mt-3 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
              Entra al workspace principal.
            </h2>
            <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
              Solo las cuentas creadas en el backend pueden entrar a <span className="font-semibold text-[var(--color-ink)]">/projects</span>.
            </p>

            <div className="mt-6">
              <LoginForm />
            </div>
          </div>

          <div className="grid gap-4">
            <article className="rounded-[28px] p-5 brand-card-lilac">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[rgba(23,19,31,0.52)]">
                Ruta principal
              </p>
              <h3 className="mt-2 font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                Proyectos
              </h3>
              <p className="mt-2 text-sm leading-6 text-[rgba(23,19,31,0.72)]">
                El entry real del producto hoy esta en <span className="font-semibold">/projects</span>.
              </p>
            </article>

            <article className="rounded-[28px] p-5 brand-card-mint">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[rgba(23,19,31,0.52)]">
                Laboratorio
              </p>
              <h3 className="mt-2 font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                Blueprint Lab
              </h3>
              <p className="mt-2 text-sm leading-6 text-[rgba(23,19,31,0.72)]">
                Si necesitas pruebas controladas, tambien puedes entrar al laboratorio tecnico del MasterBlueprintEngine.
              </p>
              <div className="mt-5">
                <Link
                  className="brand-button-secondary px-5 py-3 text-sm font-semibold"
                  href="/lab/master-blueprint"
                >
                  Abrir lab
                </Link>
              </div>
            </article>

            <article className="rounded-[28px] p-5 brand-card-gold">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[rgba(23,19,31,0.52)]">
                Portal
              </p>
              <h3 className="mt-2 font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                Volver al sitio publico
              </h3>
              <p className="mt-2 text-sm leading-6 text-[rgba(23,19,31,0.72)]">
                El portal de marketing sigue disponible aparte y ya no deberia bloquear tu entrada al producto.
              </p>
              <div className="mt-5">
                <Link
                  className="brand-button-secondary px-5 py-3 text-sm font-semibold"
                  href="/"
                >
                  Ir al portal
                </Link>
              </div>
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}
