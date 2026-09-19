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
};

export function WorkflowStageNav({ items, language }: WorkflowStageNavProps) {
  const copy = getProjectUiCopy(language).workflow;

  return (
    <nav className="surface-panel rounded-[28px] p-3 lg:sticky lg:top-24 lg:z-20">
      <div className="grid gap-2 sm:grid-cols-5">
        {items.map((item) => (
          <a
            aria-current={item.current ? "step" : undefined}
            className={`rounded-[20px] border px-3 py-3 transition-transform hover:-translate-y-0.5 ${
              item.current
                ? "border-[var(--color-plum)] bg-[var(--color-plum)] text-white shadow-[0_14px_28px_rgba(52,20,95,0.16)]"
                : item.active
                  ? "border-[rgba(52,20,95,0.14)] bg-[rgba(236,216,255,0.58)]"
                  : "border-[rgba(74,58,97,0.08)] bg-white/72"
            }`}
            href={item.href}
            key={item.step}
          >
            <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${item.current ? "text-white/64" : "text-[rgba(100,94,115,0.72)]"}`}>
              {item.current ? "Ahora" : `${copy.stepPrefix} ${item.step}`}
            </p>
            <p className={`mt-1 font-[var(--font-heading)] text-base font-semibold ${item.current ? "text-white" : "text-[var(--color-ink)]"}`}>
              {item.title}
            </p>
          </a>
        ))}
      </div>
    </nav>
  );
}
