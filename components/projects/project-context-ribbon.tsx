import type { DegreeLevel } from "@prisma/client";

import { getDegreeLevelLabelForLanguage } from "@/lib/degree-levels";
import type { SupportedLanguage } from "@/lib/language";
import { getProjectUiCopy } from "@/lib/project-ui-copy";
import { getTemplateDisplayLabel } from "@/lib/system-master-template";

type ProjectContextRibbonProps = {
  universityLabel?: string | null;
  degreeLevel: DegreeLevel;
  program: string;
  templateKey: string;
  topicSeedText: string;
  selectedTopicLabel: string;
  topicOriginLabel: string;
  language: SupportedLanguage;
};

export function ProjectContextRibbon({
  universityLabel,
  degreeLevel,
  program,
  templateKey,
  topicSeedText,
  selectedTopicLabel,
  topicOriginLabel,
  language,
}: ProjectContextRibbonProps) {
  const copy = getProjectUiCopy(language).contextRibbon;
  const items = [
    ...(universityLabel ? [{ label: copy.university, value: universityLabel }] : []),
    {
      label: copy.degree,
      value: getDegreeLevelLabelForLanguage(degreeLevel, language),
    },
    {
      label: copy.program,
      value: program,
    },
    {
      label: copy.template,
      value: getTemplateDisplayLabel(templateKey),
    },
    {
      label: copy.seedIdea,
      value: topicSeedText,
    },
    {
      label: copy.activeTopic,
      value: selectedTopicLabel,
    },
    {
      label: copy.origin,
      value: topicOriginLabel,
    },
  ];

  return (
    <details className="surface-panel rounded-[28px] p-4 sm:p-5">
      <summary className="cursor-pointer list-none">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="brand-kicker">{copy.kicker}</p>
            <p className="mt-2 truncate text-sm font-semibold text-[var(--color-ink)] sm:text-base">
              {selectedTopicLabel}
            </p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              {[universityLabel, program].filter(Boolean).join(" | ")}
            </p>
          </div>
          <span className="brand-pill shrink-0">Ver contexto</span>
        </div>
      </summary>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {items.map((item) => (
          <article
            className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/76 p-4"
            key={item.label}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.62)]">
              {item.label}
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--color-ink)]">
              {item.value}
            </p>
          </article>
        ))}
      </div>
    </details>
  );
}
