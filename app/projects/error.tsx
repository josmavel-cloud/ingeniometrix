"use client";

import Link from "next/link";

type ProjectsErrorProps = {
  reset: () => void;
};

export default function ProjectsError({ reset }: ProjectsErrorProps) {
  return (
    <main className="flex min-h-screen items-center px-4 py-12 sm:px-6">
      <section className="surface-panel mx-auto w-full max-w-2xl rounded-[34px] p-6 text-center sm:p-10">
        <p className="brand-kicker">Workspace no disponible</p>
        <h1 className="mt-4 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
          No pudimos cargar esta parte del proyecto.
        </h1>
        <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">
          Puede ser una interrupcion temporal de la conexion o del servicio. Tus datos no se
          modificaron; intenta cargar el workspace nuevamente.
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            className="brand-button-primary px-5 py-3 text-sm font-semibold"
            onClick={reset}
            type="button"
          >
            Reintentar
          </button>
          <Link className="brand-button-secondary px-5 py-3 text-sm font-semibold" href="/workspace">
            Volver al acceso
          </Link>
        </div>
      </section>
    </main>
  );
}
