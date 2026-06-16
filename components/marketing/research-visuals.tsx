import Image from "next/image";

import type { SupportedLanguage } from "@/lib/language";
import { getPortalVisualCopy } from "@/lib/marketing/portal-copy";

type VisualSize = "default" | "compact";

type VisualProps = {
  size?: VisualSize;
  className?: string;
  language?: SupportedLanguage;
};

export function ThesisPlanMockup({
  size = "default",
  className = "",
  language = "es",
}: VisualProps) {
  const compact = size === "compact";
  const copy = getPortalVisualCopy(language).thesisPlan;

  return (
    <div
      className={`overflow-hidden rounded-[32px] border border-[rgba(74,58,97,0.1)] bg-[linear-gradient(145deg,#fffdf9_0%,#f5effc_58%,#effbf8_100%)] p-4 shadow-[0_22px_52px_rgba(23,19,31,0.08)] ${className}`}
    >
      <div className="rounded-[26px] border border-[rgba(74,58,97,0.08)] bg-white/90 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[rgba(100,94,115,0.64)]">
              {copy.eyebrow}
            </p>
            <h3 className="mt-3 max-w-xl font-[var(--font-heading)] text-2xl font-semibold leading-tight text-[var(--color-ink)] sm:text-3xl">
              {copy.title}
            </h3>
          </div>
          <span className="rounded-full bg-[var(--color-plum)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
            {copy.badge}
          </span>
        </div>

        <div className={`mt-6 grid gap-4 ${compact ? "" : "lg:grid-cols-[1fr_0.86fr]"}`}>
          <div className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-[rgba(244,241,248,0.76)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[rgba(100,94,115,0.64)]">
              {copy.refinedTopicLabel}
            </p>
            <p className="mt-2 text-sm leading-7 text-[var(--color-ink)]">
              {copy.refinedTopic}
            </p>
          </div>

          <div className="rounded-[24px] border border-[rgba(24,169,153,0.18)] bg-[rgba(157,231,214,0.18)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[rgba(100,94,115,0.64)]">
              {copy.evidenceLabel}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {copy.evidenceTags.map((tag) => (
                <span
                  className="rounded-full border border-[rgba(74,58,97,0.08)] bg-white/84 px-3 py-1 text-xs font-semibold text-[var(--color-muted)]"
                  key={tag}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {copy.sections.map(([title, detail]) => (
            <div
              className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white px-4 py-3"
              key={title}
            >
              <p className="font-[var(--font-heading)] text-lg font-semibold text-[var(--color-ink)]">
                {title}
              </p>
              <p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">
                {detail}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SnapshotPoster({
  size = "default",
  className = "",
  language = "es",
}: VisualProps) {
  const compact = size === "compact";
  const copy = getPortalVisualCopy(language).snapshotPoster;

  return (
    <div
      className={`overflow-hidden rounded-[32px] border border-[rgba(52,20,95,0.16)] bg-[linear-gradient(160deg,#170c2a_0%,#2a104d_46%,#4f297f_100%)] p-5 text-white shadow-[0_28px_64px_rgba(42,16,77,0.22)] ${className}`}
    >
      <div className="relative overflow-hidden rounded-[26px] border border-white/12 bg-white/10 p-5">
        <div className="absolute -right-16 -top-16 size-44 rounded-full bg-[rgba(157,231,214,0.22)] blur-2xl" />
        <div className="absolute -bottom-16 -left-16 size-48 rounded-full bg-[rgba(219,193,255,0.28)] blur-2xl" />

        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/58">
            {copy.eyebrow}
          </p>
          <h3 className="mt-3 max-w-2xl font-[var(--font-heading)] text-3xl font-semibold leading-tight sm:text-4xl">
            {copy.title}
          </h3>
          <p className="mt-4 text-sm leading-7 text-white/72">
            {copy.description}
          </p>

          <div className={`mt-6 grid gap-3 ${compact ? "" : "sm:grid-cols-2"}`}>
            {copy.axes.map((axis) => (
              <div
                className="rounded-[20px] border border-white/10 bg-white/10 px-4 py-3"
                key={axis}
              >
                <p className="text-sm font-semibold text-white">{axis}</p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/12">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#efc14d,#9de7d6)]"
                    style={{ width: "72%" }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-[22px] border border-white/10 bg-white/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/56">
              {copy.keywordsLabel}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {copy.keywords.map((tag) => (
                <span
                  className="rounded-full bg-white/12 px-3 py-1 text-xs font-semibold text-white/82"
                  key={tag}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ResearchFlowDiagram({
  className = "",
  language = "es",
}: VisualProps) {
  const copy = getPortalVisualCopy(language).researchFlow;

  return (
    <div className={`surface-panel rounded-[36px] px-6 py-7 sm:px-8 ${className}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <div className="brand-pill">{copy.eyebrow}</div>
          <h2 className="mt-5 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
            {copy.title}
          </h2>
        </div>
        <p className="max-w-xl text-sm leading-7 text-[var(--color-muted)]">
          {copy.description}
        </p>
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-5">
        {copy.steps.map((step, index) => (
          <div className="relative" key={step.label}>
            <div className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-5 shadow-[0_14px_28px_rgba(23,19,31,0.05)]">
              <div className="inline-flex size-12 items-center justify-center rounded-full bg-[linear-gradient(135deg,rgba(219,193,255,0.46),rgba(157,231,214,0.28))] font-[var(--font-heading)] text-lg font-semibold text-[var(--color-ink)]">
                {index + 1}
              </div>
              <p className="mt-4 font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                {step.label}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                {step.detail}
              </p>
            </div>
            {index < copy.steps.length - 1 ? (
              <div className="hidden lg:block">
                <div className="absolute right-[-0.65rem] top-1/2 z-10 size-5 -translate-y-1/2 rotate-45 rounded-[0.35rem] border-r border-t border-[rgba(74,58,97,0.14)] bg-white" />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function EvidenceTraceMap({
  className = "",
  language = "es",
}: VisualProps) {
  const copy = getPortalVisualCopy(language).evidenceMap;

  return (
    <div
      className={`rounded-[34px] border border-[rgba(52,20,95,0.16)] bg-[linear-gradient(160deg,rgba(23,12,42,0.96),rgba(42,16,77,0.94)_42%,rgba(79,41,127,0.9)_100%)] p-6 text-white shadow-[0_28px_64px_rgba(42,16,77,0.26)] ${className}`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/56">
            {copy.eyebrow}
          </p>
          <h3 className="mt-3 font-[var(--font-heading)] text-3xl font-semibold">
            {copy.title}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {[
            ["/providers/openai.png", "OpenAI"],
            ["/providers/openalex.png", "OpenAlex"],
            ["/providers/crossref.svg", "Crossref"],
          ].map(([src, label]) => (
            <span
              className={
                label === "Crossref"
                  ? "inline-flex h-11 w-24 items-center justify-center rounded-full bg-white/92 p-2"
                  : "inline-flex size-11 items-center justify-center rounded-full bg-white/92 p-2"
              }
              key={label}
            >
              <Image
                alt={label}
                className={label === "Crossref" ? "h-auto w-20" : "h-auto w-7"}
                height={96}
                src={src}
                width={128}
              />
            </span>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {copy.steps.map((step, index) => (
          <div
            className="rounded-[22px] border border-white/10 bg-white/10 px-4 py-4"
            key={step}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/48">
              {String(index + 1).padStart(2, "0")}
            </p>
            <p className="mt-2 font-[var(--font-heading)] text-xl font-semibold text-white">
              {step}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
