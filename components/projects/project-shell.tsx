import Link from "next/link";
import type { ReactNode } from "react";

import { LogoutButton } from "@/components/auth/logout-button";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import { FloatingNavbar } from "@/components/ui/floating-navbar";
import { getProjectUiCopy } from "@/lib/project-ui-copy";
import { getRequestLanguage } from "@/server/i18n/request-language";

type ProjectShellProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

export async function ProjectShell({ title, description, children }: ProjectShellProps) {
  const language = await getRequestLanguage();
  const t = getProjectUiCopy(language);

  return (
    <main className="min-h-screen px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <FloatingNavbar
        action={
          <div className="flex items-center gap-3">
            <LanguageToggle initialLanguage={language} />
            <Link
              className="brand-button-secondary px-4 py-2 text-sm font-semibold"
              href="/projects"
            >
              {language === "en" ? "Projects" : "Proyectos"}
            </Link>
            <LogoutButton language={language} />
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
                {language === "en" ? "Ingeniometrix workspace" : "Workspace Ingeniometrix"}
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
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-white/64">
                {t.workflow.guidedFlow}
              </p>
              <p className="mt-3 font-[var(--font-heading)] text-xl font-semibold text-white">
                {t.workflow.guidedFlowTitle}
              </p>
              <p className="mt-3 text-sm leading-7 text-white/76">
                {t.workflow.guidedFlowDescription}
              </p>
            </div>
          </div>
        </header>

        {children}
      </section>
    </main>
  );
}
