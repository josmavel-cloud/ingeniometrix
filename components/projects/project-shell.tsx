import Link from "next/link";
import type { ReactNode } from "react";

import { LogoutButton } from "@/components/auth/logout-button";
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
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            <Link
              className="brand-button-secondary px-4 py-2 text-sm font-semibold"
              href="/projects"
            >
              Proyectos
            </Link>
            <LogoutButton language="es" />
          </div>
        }
        compact
      />

      <section className="mx-auto mt-6 flex w-full max-w-6xl flex-col gap-6">
        <header className="surface-panel rounded-[32px] px-6 py-6 sm:px-8">
          <div className="brand-pill">
            <span className="inline-flex size-2 rounded-full bg-[var(--color-coral)]" />
            Workspace Ingeniometrix
          </div>
          <h1 className="mt-4 font-[var(--font-heading)] text-3xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-4xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--color-muted)] sm:text-base">
              {description}
            </p>
          ) : null}
        </header>

        {children}
      </section>
    </main>
  );
}
