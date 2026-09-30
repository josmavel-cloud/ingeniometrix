"use client";
import { useEffect, useId, useState } from "react";
export type KnowledgeArea = { code: string; label: string; parentCode: string | null; breadcrumb?: string };
export function KnowledgeAreaCombobox({ value, onChange, disabled = false }: {
  value: KnowledgeArea | null; onChange: (area: KnowledgeArea | null) => void; disabled?: boolean;
}) {
  const id = useId(), [query, setQuery] = useState(value?.label ?? ""), [items, setItems] = useState<KnowledgeArea[]>([]);
  const [open, setOpen] = useState(false), [active, setActive] = useState(-1), [error, setError] = useState("");
  useEffect(() => { if (value) setQuery(value.label); }, [value]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetch(`/api/topic-areas?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
        .then(payload => { setItems(payload.suggestions ?? []); setActive(-1); setError(""); })
        .catch(() => { if (!controller.signal.aborted) setError("No pudimos cargar el catálogo. Vuelve a abrir el selector."); });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, open]);
  function choose(item: KnowledgeArea) { onChange(item); setQuery(item.label); setOpen(false); }
  return <div className="relative grid gap-2">
    <label htmlFor={id} className="font-semibold">Área de conocimiento, campo o especialidad</label>
    <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`}
      aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined} autoComplete="off" disabled={disabled}
      className="rounded-xl border p-3 focus:outline-2 focus:outline-[var(--color-plum)]" value={query}
      placeholder="Busca un área o especialidad" onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
      onChange={e => { setQuery(e.target.value); onChange(null); setOpen(true); }}
      onKeyDown={e => {
        if (e.key === "Escape") { setOpen(false); e.preventDefault(); }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setOpen(true); setActive(current => Math.max(0, Math.min(items.length - 1, current + (e.key === "ArrowDown" ? 1 : -1)))); }
        if (e.key === "Enter" && open) { e.preventDefault(); if (items[active]) choose(items[active]); }
      }} />
    {open && <ul id={`${id}-list`} role="listbox" className="absolute top-full z-20 max-h-64 w-full overflow-auto rounded-xl border bg-white p-2 shadow-lg">
      {items.map((item, index) => <li id={`${id}-${index}`} key={item.code} role="option" aria-selected={value?.code === item.code}
        className={`cursor-pointer rounded-lg p-3 ${active === index ? "bg-[var(--color-lilac)]/40" : "hover:bg-slate-50"}`}
        onPointerDown={e => e.preventDefault()} onClick={() => choose(item)}>
        <span className="block font-medium">{item.label}</span><span className="text-xs text-slate-500">{item.breadcrumb ?? item.code}</span>
      </li>)}
      {!items.length && <li className="p-3 text-sm">Sin coincidencias en el catálogo.</li>}
    </ul>}
    {error && <p role="status" className="text-sm">{error}</p>}
  </div>;
}
