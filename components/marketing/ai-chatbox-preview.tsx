import type { SupportedLanguage } from "@/lib/language";
import { getChatboxCopy } from "@/lib/marketing/portal-copy";

import {
  ArrowUpRight,
  Bot,
  BrainCircuit,
  CheckCircle2,
  FileText,
  Mic,
  Paperclip,
  Search,
  SendHorizontal,
  Settings2,
  Sparkles,
  UserRound,
} from "lucide-react";

type AiChatboxPreviewProps = {
  language?: SupportedLanguage;
};

const topicIcons = [BrainCircuit, FileText, Search, ArrowUpRight];

export function AiChatboxPreview({ language = "es" }: AiChatboxPreviewProps) {
  const copy = getChatboxCopy(language);

  return (
    <form
      action="/workspace"
      className="rounded-[32px] border border-[rgba(74,58,97,0.12)] bg-white p-3 shadow-[0_24px_70px_rgba(23,19,31,0.08)]"
      method="get"
    >
      <div className="overflow-hidden rounded-[26px] border border-[rgba(74,58,97,0.08)] bg-[#fdfcff]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(74,58,97,0.08)] bg-white px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-plum)]">
              <Bot className="size-5 text-white" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--color-ink)]">
                IngenioIA
              </p>
              <p className="truncate text-xs text-[var(--color-muted)]">
                {copy.assistantSubtitle}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--color-muted)]">
            <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(74,58,97,0.08)] bg-white px-3 py-2">
              <BrainCircuit className="size-4 text-[var(--color-plum)]" />
              {copy.mode}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(74,58,97,0.08)] bg-white px-3 py-2">
              <Settings2 className="size-4 text-[var(--color-plum)]" />
              {copy.snapshot}
            </span>
          </div>
        </div>

        <div className="space-y-5 px-4 py-5 sm:px-5">
          <div className="flex items-start gap-3">
            <span className="mt-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-[rgba(74,58,97,0.1)] bg-white">
              <UserRound className="size-4 text-[var(--color-muted)]" />
            </span>
            <div className="max-w-[42rem] rounded-[22px] rounded-tl-md bg-[#f2eff7] px-5 py-4">
              <p className="text-sm leading-7 text-[var(--color-ink)]">
                {copy.userMessage}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="mt-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-plum)]">
              <Sparkles className="size-4 text-white" />
            </span>
            <div className="max-w-[46rem] rounded-[22px] rounded-tl-md border border-[rgba(74,58,97,0.08)] bg-white px-5 py-4">
              <p className="text-sm font-semibold text-[var(--color-ink)]">
                {copy.assistantMessage}
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {copy.responseItems.map((item) => (
                  <div
                    className="rounded-[18px] border border-[rgba(74,58,97,0.08)] bg-[#fffdf9] p-3"
                    key={item.title}
                  >
                    <CheckCircle2 className="size-4 text-[var(--color-mint-strong)]" />
                    <p className="mt-2 text-sm font-semibold text-[var(--color-ink)]">
                      {item.title}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[var(--color-muted)]">
                      {item.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {copy.suggestedTopics.map((topic, index) => {
              const Icon = topicIcons[index] ?? BrainCircuit;

              return (
                <label
                  className="cursor-pointer rounded-2xl border border-[rgba(74,58,97,0.1)] bg-white px-4 py-3 text-sm font-semibold text-[var(--color-muted)] transition hover:border-[rgba(52,20,95,0.28)] has-[:checked]:border-[var(--color-plum)] has-[:checked]:bg-[rgba(52,20,95,0.06)] has-[:checked]:text-[var(--color-plum)]"
                  key={topic}
                >
                  <input
                    className="sr-only"
                    defaultChecked={index === 0}
                    name="tema_sugerido"
                    type="radio"
                    value={topic}
                  />
                  <span className="flex items-start gap-3">
                    <Icon className="mt-0.5 size-4 shrink-0" />
                    <span>{topic}</span>
                  </span>
                </label>
              );
            })}
          </div>

          <div className="rounded-[26px] border border-[rgba(74,58,97,0.12)] bg-white p-3">
            <textarea
              className="min-h-28 w-full resize-none rounded-[20px] border-0 bg-transparent px-3 py-3 text-base leading-7 text-[var(--color-ink)] outline-none placeholder:text-[rgba(100,94,115,0.58)]"
              name="idea"
              placeholder={copy.ideaPlaceholder}
            />

            <div className="mt-2 flex flex-col gap-3 border-t border-[rgba(74,58,97,0.08)] pt-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  aria-label={copy.attachLabel}
                  className="inline-flex size-10 items-center justify-center rounded-full border border-[rgba(74,58,97,0.08)] bg-[#f7f4fb] text-[var(--color-muted)]"
                  type="button"
                >
                  <Paperclip className="size-4" />
                </button>
                <button
                  aria-label={copy.searchLabel}
                  className="inline-flex size-10 items-center justify-center rounded-full border border-[rgba(74,58,97,0.08)] bg-[#f7f4fb] text-[var(--color-muted)]"
                  type="button"
                >
                  <Search className="size-4" />
                </button>
                {copy.settings.map((setting) => (
                  <label
                    className="inline-flex items-center gap-2 rounded-full border border-[rgba(74,58,97,0.08)] bg-[#f7f4fb] px-3 py-2 text-xs font-semibold text-[var(--color-muted)]"
                    key={setting.name}
                  >
                    <span className="hidden sm:inline">{setting.label}</span>
                    <select
                      className="max-w-32 bg-transparent text-xs font-semibold text-[var(--color-ink)] outline-none"
                      defaultValue={setting.options[0]}
                      name={setting.name}
                    >
                      {setting.options.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  aria-label={copy.dictateLabel}
                  className="inline-flex size-11 items-center justify-center rounded-full border border-[rgba(74,58,97,0.08)] bg-white text-[var(--color-muted)]"
                  type="button"
                >
                  <Mic className="size-4" />
                </button>
                <button
                  className="inline-flex items-center justify-center rounded-full bg-[var(--color-plum)] px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(52,20,95,0.18)]"
                  type="submit"
                >
                  {copy.submit}
                  <SendHorizontal className="ml-2 size-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
