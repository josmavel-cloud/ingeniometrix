"use client";

type JsonViewerProps = {
  title?: string;
  value: unknown;
  className?: string;
};

export function JsonViewer({ title, value, className }: JsonViewerProps) {
  return (
    <section
      className={`overflow-hidden rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/92 ${className ?? ""}`}
    >
      {title ? (
        <header className="border-b border-[rgba(74,58,97,0.08)] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
            {title}
          </p>
        </header>
      ) : null}
      <pre className="max-h-[28rem] overflow-auto px-4 py-4 text-[12px] leading-6 text-[var(--color-ink)]">
        {JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}
