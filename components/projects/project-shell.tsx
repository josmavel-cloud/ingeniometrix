import Link from "next/link";
import type { ReactNode } from "react";

import { LogoutButton } from "@/components/auth/logout-button";
import { BrandBadge } from "@/components/brand/brand-badge";
import { FloatingNavbar } from "@/components/ui/floating-navbar";

type ProjectShellProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

export function ProjectShell({ title, description, children }: ProjectShellProps) {
  return (
    <main className="min-h-screen px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <FloatingNavbar
        action={
          <div className="flex items-center gap-3">
            <Link
              className="brand-button-secondary px-4 py-2 text-sm font-semibold"
              href="/projects"
            >
              Proyectos
            </Link>
            <LogoutButton />
          </div>
        }
        compact
      />

      <section className="mx-auto mt-8 flex w-full max-w-6xl flex-col gap-8">
        <header className="surface-panel overflow-hidden rounded-[38px] px-6 py-8 sm:px-8 lg:px-10">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div className="max-w-3xl">
              <div className="brand-pill">
                <span className="inline-flex size-2 rounded-full bg-[var(--color-coral)]" />
                Workspace Ingeniometrix
              </div>
              <h1 className="mt-5 font-[var(--font-heading)] text-3xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-4xl">
                {title}
              </h1>
              {description ? (
                <p className="mt-4 max-w-2xl text-base leading-8 text-[var(--color-muted)]">
                  {description}
                </p>
              ) : null}
            </div>

            <div className="brand-card-primary rounded-[30px] px-5 py-5">
              <div className="mb-4 rounded-[20px] bg-white px-4 py-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[rgba(100,94,115,0.62)]">
                  Marca
                </p>
                <BrandBadge context="company" />
              </div>
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-white/64">
                Flujo guiado
              </p>
              <p className="mt-3 font-[var(--font-heading)] text-xl font-semibold text-white">
                Un solo recorrido, sin paneles innecesarios.
              </p>
              <p className="mt-3 text-sm leading-7 text-white/76">
                Define el proyecto, completa el intake, selecciona fuentes y valida
                el blueprint. Todo lo demas queda fuera del MVP.
              </p>
            </div>
          </div>
        </header>

        {children}
      </section>
    </main>
  );
}
