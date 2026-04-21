import Link from "next/link";
import type { ReactNode } from "react";

type FloatingNavbarProps = {
  action?: ReactNode;
  compact?: boolean;
};

export function FloatingNavbar({ action, compact = false }: FloatingNavbarProps) {
  return (
    <header className="sticky top-4 z-30 mx-auto w-full max-w-6xl px-4 sm:px-6">
      <div className="flex items-center justify-between rounded-[28px] border border-slate-900/70 bg-slate-950/90 px-5 py-4 text-white shadow-[0_24px_80px_rgba(2,6,23,0.28)] backdrop-blur xl:px-6">
        <Link className="flex min-w-0 flex-col" href="/">
          <span className="font-[var(--font-heading)] text-lg font-semibold tracking-tight">
            Ingeniometrix
          </span>
        </Link>

        {compact ? null : (
          <nav className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
            <a className="hover:text-white" href="#como-funciona">
              Como funciona
            </a>
            <a className="hover:text-white" href="#acceso">
              Acceso rapido
            </a>
            <a className="hover:text-white" href="#ventajas">
              Ventajas
            </a>
          </nav>
        )}

        <div className="flex items-center gap-3">
          {action ?? (
            <a
              className="inline-flex items-center rounded-full border border-white/16 px-4 py-2 text-sm font-medium text-slate-100 hover:border-lime-400/70 hover:bg-white/6"
              href="#acceso"
            >
              Entrar
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
