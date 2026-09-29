import Link from "next/link";
import type { ReactNode } from "react";

import { LogoutButton } from "@/components/auth/logout-button";
import { FloatingNavbar } from "@/components/ui/floating-navbar";

type ProjectShellProps = {
  title: string;
  description?: string;
  children: ReactNode;
  compactHeader?: boolean;
};

export function ProjectShell({ title, description, children, compactHeader = false }: ProjectShellProps) {
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

      <section className={`mx-auto flex w-full max-w-6xl flex-col ${compactHeader ? "mt-4 gap-4" : "mt-6 gap-6"}`}>
        <header className={`surface-panel rounded-[32px] ${compactHeader ? "px-5 py-4 sm:px-6" : "px-6 py-6 sm:px-8"}`}>
          <div className="brand-pill">
            <span className="inline-flex size-2 rounded-full bg-[var(--color-coral)]" />
            Workspace Ingeniometrix
          </div>
          <h1 className={`font-[var(--font-heading)] font-semibold tracking-tight text-[var(--color-ink)] ${compactHeader ? "mt-2 line-clamp-2 text-lg sm:line-clamp-1 sm:text-xl" : "mt-4 text-3xl sm:text-4xl"}`}>
            {title}
          </h1>
          {description ? (
            <p className={`max-w-3xl text-[var(--color-muted)] ${compactHeader ? "mt-1 text-xs" : "mt-3 text-sm leading-7 sm:text-base"}`}>
              {description}
            </p>
          ) : null}
        </header>

        {children}
      </section>
    </main>
  );
}
