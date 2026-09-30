"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, X } from "lucide-react";
import { ConversationalIntake } from "./conversational-intake";

export function ResearchChatDrawer({ projectId, ownerId }: { projectId: string; ownerId: string }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const router = useRouter();
  const close = () => { setOpen(false); requestAnimationFrame(() => { trigger.current?.focus(); router.refresh(); }); };
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { close(); return; }
      if (event.key !== "Tab" || !panel.current) return;
      const focusable = [...panel.current.querySelectorAll<HTMLElement>("button:not([disabled]),a[href],textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex='-1'])")];
      if (!focusable.length) return;
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); };
  }, [open, router]);
  return <>
    <button ref={trigger} type="button" className="brand-button-secondary inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold" onClick={() => setOpen(true)}>
      <MessageCircle aria-hidden="true" className="size-4" />Refinar investigación
    </button>
    {open && <div className="fixed inset-0 z-50 bg-[var(--color-ink)]/60 p-2 sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <section ref={panel} role="dialog" aria-modal="true" aria-label="Refinar investigación" className="ml-auto flex h-full w-full max-w-5xl flex-col overflow-y-auto rounded-[24px] bg-white p-3 shadow-2xl sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3"><p className="text-sm text-[var(--color-muted)]">Los cambios de alcance se revisan antes de volver a buscar fuentes o generar un plan.</p>
          <button ref={closeButton} type="button" className="brand-button-secondary inline-flex items-center gap-2 px-3 py-2 text-sm" onClick={close}><X aria-hidden="true" className="size-4" />Cerrar</button></div>
        <ConversationalIntake projectId={projectId} ownerId={ownerId} />
      </section>
    </div>}
  </>;
}
