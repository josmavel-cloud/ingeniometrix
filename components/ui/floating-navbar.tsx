import Link from "next/link";
import type { ReactNode } from "react";

import { BrandBadge } from "@/components/brand/brand-badge";

type FloatingNavbarProps = {
  action?: ReactNode;
  compact?: boolean;
};

export function FloatingNavbar({ action, compact = false }: FloatingNavbarProps) {
  return (
    <header className="sticky top-4 z-30 mx-auto w-full max-w-6xl px-4 sm:px-6">
      <div className="flex items-center justify-between rounded-[30px] border border-[rgba(74,58,97,0.12)] bg-[rgba(255,255,255,0.84)] px-5 py-4 text-[var(--color-ink)] shadow-[0_20px_50px_rgba(23,19,31,0.08)] backdrop-blur xl:px-6">
        <Link className="min-w-0" href="/">
          <BrandBadge compact={compact} />
        </Link>

        {compact ? null : (
          <nav className="hidden items-center gap-6 text-sm text-[var(--color-muted)] md:flex">
            <a className="hover:text-[var(--color-plum)]" href="#como-funciona">
              Recorrido
            </a>
            <a className="hover:text-[var(--color-plum)]" href="#acceso">
              Entrar
            </a>
            <a className="hover:text-[var(--color-plum)]" href="#criterios">
              Criterios
            </a>
          </nav>
        )}

        <div className="flex items-center gap-3">
          {action ?? (
            <a
              className="brand-button-primary px-4 py-2 text-sm font-semibold"
              href="#acceso"
            >
              Crear proyecto
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
