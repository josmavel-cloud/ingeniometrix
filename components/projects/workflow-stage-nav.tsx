type WorkflowStageItem = {
  href: string;
  step: string;
  title: string;
  description: string;
  active: boolean;
};

type WorkflowStageNavProps = {
  items: WorkflowStageItem[];
};

export function WorkflowStageNav({ items }: WorkflowStageNavProps) {
  return (
    <nav className="surface-panel sticky top-24 z-20 rounded-[28px] p-3">
      <div className="grid gap-3 lg:grid-cols-4">
        {items.map((item) => (
          <a
            className={`rounded-[22px] border px-4 py-4 transition-transform hover:-translate-y-0.5 ${
              item.active
                ? "border-[rgba(52,20,95,0.14)] bg-[rgba(236,216,255,0.7)]"
                : "border-[rgba(74,58,97,0.08)] bg-white/72"
            }`}
            href={item.href}
            key={item.step}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.72)]">
              Paso {item.step}
            </p>
            <p className="mt-2 font-[var(--font-heading)] text-lg font-semibold text-[var(--color-ink)]">
              {item.title}
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
              {item.description}
            </p>
          </a>
        ))}
      </div>
    </nav>
  );
}
