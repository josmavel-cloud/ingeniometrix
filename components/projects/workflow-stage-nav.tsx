import type { SupportedLanguage } from "@/lib/language";
import { getProjectUiCopy } from "@/lib/project-ui-copy";

type WorkflowStageItem = {
  href: string;
  step: string;
  title: string;
  description: string;
  active: boolean;
  current: boolean;
};

type WorkflowStageNavProps = {
  items: WorkflowStageItem[];
  language: SupportedLanguage;
  compact?: boolean;
};

export function WorkflowStageNav({ items, language, compact = false }: WorkflowStageNavProps) {
  const copy = getProjectUiCopy(language).workflow;

  return (
    <nav className={`surface-panel rounded-[28px] lg:sticky lg:top-24 lg:z-20 ${compact ? "p-2" : "p-3"}`}>
      <div className={`grid gap-2 ${compact ? "grid-cols-3" : items.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-4"}`}>
        {items.map((item) => (
          <a
            aria-current={item.current ? "step" : undefined}
            className={`rounded-[20px] border transition-transform hover:-translate-y-0.5 ${compact ? "min-w-0 px-2 py-2" : "px-3 py-3"} ${
              item.current
                ? "border-[var(--color-plum)] bg-[var(--color-plum)] text-white shadow-[0_14px_28px_rgba(52,20,95,0.16)]"
                : item.active
                  ? "border-[rgba(52,20,95,0.14)] bg-[rgba(236,216,255,0.58)]"
                  : "border-[rgba(74,58,97,0.08)] bg-white/72"
            }`}
            href={item.href}
            key={item.step}
          >
            <p className={`font-semibold uppercase tracking-[0.18em] ${compact ? "text-[10px]" : "text-xs"} ${item.current ? "text-white/64" : "text-[rgba(100,94,115,0.72)]"}`}>
              {item.current ? "Ahora" : `${copy.stepPrefix} ${item.step}`}
            </p>
            <p className={`mt-1 font-[var(--font-heading)] font-semibold ${compact ? "text-xs sm:text-sm" : "text-base"} ${item.current ? "text-white" : "text-[var(--color-ink)]"}`}>
              {item.title}
            </p>
          </a>
        ))}
      </div>
    </nav>
  );
}
