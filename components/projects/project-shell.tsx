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
          <div className="flex items-center gap-3">
            <Link
              className="inline-flex items-center rounded-full border border-white/16 px-4 py-2 text-sm font-medium text-slate-100 hover:border-lime-400/70 hover:bg-white/6"
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
        <header className="surface-panel overflow-hidden rounded-[36px] px-6 py-8 sm:px-8 lg:px-10">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/92 px-4 py-2 text-sm text-slate-500 shadow-sm">
              <span className="inline-flex size-2 rounded-full bg-lime-400" />
              Espacio de trabajo Ingeniometrix
            </div>
            <h1 className="font-[var(--font-heading)] text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              {title}
            </h1>
            {description ? (
              <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600">
                {description}
              </p>
            ) : null}
          </div>
        </header>

        {children}
      </section>
    </main>
  );
}
