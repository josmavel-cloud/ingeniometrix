import Image from "next/image";
import Link from "next/link";

import { BrandBadge } from "@/components/brand/brand-badge";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import { AiChatboxPreview } from "@/components/marketing/ai-chatbox-preview";
import {
  ResearchFlowDiagram,
  SnapshotPoster,
  ThesisPlanMockup,
} from "@/components/marketing/research-visuals";
import { getCampaignCopy } from "@/lib/marketing/portal-copy";
import { getRequestLanguage } from "@/server/i18n/request-language";

import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Mail,
  Route,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

const stepIcons = [FileText, Sparkles, ClipboardCheck, Route];

export async function SnapshotLanding() {
  const language = await getRequestLanguage();
  const copy = getCampaignCopy(language);

  return (
    <main className="min-h-screen overflow-x-hidden px-4 pb-14 pt-6 sm:px-6 lg:px-8">
      <header className="sticky top-4 z-30 mx-auto w-full max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[28px] border border-[rgba(74,58,97,0.12)] bg-[rgba(255,255,255,0.9)] px-3 py-3 shadow-[0_18px_45px_rgba(23,19,31,0.07)] backdrop-blur sm:gap-3 sm:px-5">
          <Link className="min-w-0 flex-1" href="/">
            <BrandBadge compact context="company" />
          </Link>

          <nav className="hidden items-center gap-1 text-sm font-semibold text-[var(--color-muted)] lg:flex">
            <a className="rounded-full px-3 py-2 hover:bg-white hover:text-[var(--color-plum)]" href="#chatbox">
              {copy.nav.chatbox}
            </a>
            <a className="rounded-full px-3 py-2 hover:bg-white hover:text-[var(--color-plum)]" href="#entrega">
              {copy.nav.delivery}
            </a>
            <a className="rounded-full px-3 py-2 hover:bg-white hover:text-[var(--color-plum)]" href="#faq">
              {copy.nav.faq}
            </a>
          </nav>

          <div className="flex min-w-0 items-center gap-2">
            <LanguageToggle initialLanguage={language} />
            <span className="hidden sm:inline-flex">
              <Link className="brand-button-secondary px-4 py-2 text-sm font-semibold" href="/">
                {copy.nav.portal}
              </Link>
            </span>
            <Link className="brand-button-primary px-3 py-2 text-sm font-semibold sm:px-4" href="/workspace">
              {copy.nav.login}
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto mt-8 flex w-full max-w-[var(--page-max-width)] flex-col gap-6">
        <section className="rounded-[40px] border border-[rgba(74,58,97,0.1)] bg-[rgba(255,255,255,0.72)] px-5 py-8 shadow-[0_24px_70px_rgba(23,19,31,0.08)] backdrop-blur sm:px-8 lg:px-10 lg:py-10">
          <div className="grid gap-9 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <div className="brand-pill">{copy.hero.eyebrow}</div>
              <h1 className="mt-7 max-w-3xl text-balance font-[var(--font-heading)] text-[2.8rem] font-semibold leading-[1.02] tracking-[-0.03em] text-[var(--color-ink)] sm:text-6xl">
                {copy.hero.title}
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-[var(--color-muted)] sm:text-lg">
                {copy.hero.description}
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a
                  className="inline-flex items-center justify-center rounded-full bg-[var(--color-plum)] px-6 py-3 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(52,20,95,0.18)]"
                  href="#chatbox"
                >
                  {copy.hero.primaryCta}
                  <ArrowRight className="ml-2 size-4" />
                </a>
                <a
                  className="inline-flex items-center justify-center rounded-full border border-[rgba(74,58,97,0.12)] bg-white px-6 py-3 text-sm font-semibold text-[var(--color-ink)]"
                  href="#entrega"
                >
                  {copy.hero.secondaryCta}
                </a>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {copy.hero.signals.map((item) => (
                  <div className="rounded-2xl border border-[rgba(74,58,97,0.08)] bg-white/78 px-4 py-3" key={item}>
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="size-4 text-[var(--color-mint-strong)]" />
                      <span className="text-sm font-semibold text-[var(--color-ink)]">{item}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="relative mt-7 min-h-[230px] overflow-hidden rounded-[32px] border border-[rgba(74,58,97,0.12)] bg-[var(--color-plum)] shadow-[0_24px_70px_rgba(23,19,31,0.1)] sm:min-h-[280px]">
                <Image
                  alt={copy.hero.imageAlt}
                  className="object-cover object-center"
                  fill
                  priority
                  sizes="(min-width: 1024px) 34rem, 100vw"
                  src="/marketing/hero-premium-ai-library-v3.png"
                />
                <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(23,12,42,0.82)_0%,rgba(23,12,42,0.42)_52%,rgba(23,12,42,0.1)_100%)]" />
                <div className="absolute inset-x-4 bottom-4 rounded-[24px] border border-white/12 bg-white/12 p-4 text-white shadow-[0_18px_44px_rgba(0,0,0,0.18)] backdrop-blur-md sm:inset-x-5 sm:bottom-5 sm:p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/62">
                    {copy.hero.overlayEyebrow}
                  </p>
                  <h2 className="mt-2 max-w-lg font-[var(--font-heading)] text-2xl font-semibold leading-tight sm:text-3xl">
                    {copy.hero.overlayTitle}
                  </h2>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-white/82">
                    {copy.hero.tags.map((item) => (
                      <span className="rounded-full border border-white/12 bg-white/12 px-3 py-1.5" key={item}>
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div id="chatbox">
              <AiChatboxPreview language={language} />
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          {copy.painSignals.map((item) => (
            <article
              className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-6 shadow-[0_16px_38px_rgba(23,19,31,0.05)]"
              key={item.title}
            >
              <div className="inline-flex size-14 items-center justify-center rounded-2xl bg-[#f5f1fb]">
                <Image
                  alt={item.title}
                  className="h-auto w-11"
                  height={96}
                  src={item.iconSrc}
                  width={96}
                />
              </div>
              <h2 className="mt-5 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
                {item.title}
              </h2>
              <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                {item.description}
              </p>
            </article>
          ))}
        </section>

        <ResearchFlowDiagram language={language} />

        <section className="grid gap-6 lg:grid-cols-[0.88fr_1.12fr] lg:items-start" id="entrega">
          <article className="rounded-[34px] border border-[rgba(74,58,97,0.1)] bg-white/88 p-6 shadow-[0_18px_50px_rgba(23,19,31,0.06)] sm:p-7">
            <p className="brand-kicker">{copy.deliverablesSection.eyebrow}</p>
            <h2 className="mt-4 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
              {copy.deliverablesSection.title}
            </h2>
            <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">
              {copy.deliverablesSection.description}
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {copy.deliverablesSection.items.map((item) => (
                <div className="flex items-start gap-3" key={item}>
                  <CheckCircle2 className="mt-1 size-4 shrink-0 text-[var(--color-mint-strong)]" />
                  <span className="text-sm leading-7 text-[var(--color-muted)]">{item}</span>
                </div>
              ))}
            </div>
            <ThesisPlanMockup className="mt-6" language={language} size="compact" />
          </article>

          <SnapshotPoster language={language} />
        </section>

        <section className="rounded-[34px] border border-[rgba(74,58,97,0.1)] bg-white/86 px-6 py-7 shadow-[0_18px_50px_rgba(23,19,31,0.06)] sm:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="brand-pill">{copy.how.eyebrow}</div>
              <h2 className="mt-5 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
                {copy.how.title}
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-7 text-[var(--color-muted)]">
              {copy.how.description}
            </p>
          </div>

          <div className="mt-7 grid gap-4 lg:grid-cols-4">
            {copy.how.steps.map((step, index) => {
              const StepIcon = stepIcons[index] ?? FileText;

              return (
                <article
                  className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white p-5"
                  key={step.title}
                >
                  <div className="inline-flex size-11 items-center justify-center rounded-2xl bg-[#f5f1fb] text-[var(--color-plum)]">
                    <StepIcon className="size-5" />
                  </div>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-[rgba(100,94,115,0.64)]">
                    {copy.how.stepPrefix} {index + 1}
                  </p>
                  <h3 className="mt-2 font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                    {step.title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                    {step.description}
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="rounded-[34px] border border-[rgba(74,58,97,0.1)] bg-white/86 px-6 py-7 shadow-[0_18px_50px_rgba(23,19,31,0.06)] sm:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="brand-pill">{copy.traceability.eyebrow}</div>
              <h2 className="mt-5 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
                {copy.traceability.title}
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-7 text-[var(--color-muted)]">
              {copy.traceability.description}
            </p>
          </div>

          <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {copy.traceability.providers.map((item) => (
              <article
                className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white p-5"
                key={item.name}
              >
                <div className="flex items-center gap-3">
                  <Image
                    alt={item.name}
                    className={`h-auto ${item.logoClassName}`}
                    height={128}
                    src={item.logoSrc}
                    width={128}
                  />
                  {"hideName" in item && item.hideName ? null : (
                    <h3 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                      {item.name}
                    </h3>
                  )}
                </div>
                <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">
                  {item.description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr] lg:items-start">
          <article className="rounded-[34px] border border-[rgba(74,58,97,0.1)] bg-white/88 p-6 shadow-[0_18px_50px_rgba(23,19,31,0.06)] sm:p-7">
            <div className="inline-flex size-12 items-center justify-center rounded-2xl bg-[#f5f1fb]">
              <ShieldCheck className="size-5 text-[var(--color-plum)]" />
            </div>
            <p className="mt-5 brand-kicker">{copy.responsible.eyebrow}</p>
            <h2 className="mt-4 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
              {copy.responsible.title}
            </h2>
            <div className="mt-6 space-y-3">
              {copy.responsible.items.map((item) => (
                <div className="flex items-start gap-3" key={item}>
                  <CheckCircle2 className="mt-1 size-4 shrink-0 text-[var(--color-mint-strong)]" />
                  <span className="text-sm leading-7 text-[var(--color-muted)]">{item}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-[34px] border border-[rgba(52,20,95,0.14)] bg-[var(--color-plum)] p-6 text-white shadow-[0_24px_60px_rgba(52,20,95,0.22)] sm:p-7">
            <Sparkles className="size-6 text-white" />
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.24em] text-white/56">
              {copy.promise.eyebrow}
            </p>
            <h2 className="mt-4 font-[var(--font-heading)] text-3xl font-semibold">
              {copy.promise.title}
            </h2>
            <p className="mt-4 text-sm leading-7 text-white/74">
              {copy.promise.description}
            </p>
          </article>
        </section>

        <section className="rounded-[34px] border border-[rgba(74,58,97,0.1)] bg-white/86 px-6 py-7 shadow-[0_18px_50px_rgba(23,19,31,0.06)] sm:px-8" id="faq">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="brand-pill">{copy.faq.eyebrow}</div>
              <h2 className="mt-5 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
                {copy.faq.title}
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-7 text-[var(--color-muted)]">
              {copy.faq.description}
            </p>
          </div>

          <div className="mt-7 grid gap-4 md:grid-cols-2">
            {copy.faq.items.map((item) => (
              <article
                className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white p-5"
                key={item.question}
              >
                <h3 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                  {item.question}
                </h3>
                <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                  {item.answer}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section
          className="overflow-hidden rounded-[36px] border border-[rgba(52,20,95,0.16)] bg-[var(--color-plum)] px-6 py-7 text-white shadow-[0_24px_60px_rgba(52,20,95,0.22)] sm:px-8"
          id="solicitar"
        >
          <div className="grid gap-6 lg:grid-cols-[0.88fr_1.12fr] lg:items-start">
            <div>
              <Mail className="size-6 text-white" />
              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.24em] text-white/56">
                {copy.access.eyebrow}
              </p>
              <h2 className="mt-4 font-[var(--font-heading)] text-3xl font-semibold sm:text-4xl">
                {copy.access.title}
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/74 sm:text-base">
                {copy.access.description}
              </p>
            </div>

            <form
              action="/workspace"
              className="rounded-[28px] border border-white/12 bg-white/10 p-6"
              method="get"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/56">
                {copy.access.formEyebrow}
              </p>
              <h3 className="mt-3 font-[var(--font-heading)] text-2xl font-semibold">
                {copy.access.formTitle}
              </h3>
              <p className="mt-3 text-sm leading-7 text-white/74">
                {copy.access.formDescription}
              </p>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {copy.access.fields.map((field) => (
                  <label className="block" key={field.name}>
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/56">
                      {field.label}
                    </span>
                    <input
                      className="brand-input mt-2 w-full bg-white/96"
                      name={field.name}
                      placeholder={field.placeholder}
                      required
                      type={field.type}
                    />
                  </label>
                ))}
                <label className="block sm:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/56">
                    {copy.access.ideaLabel}
                  </span>
                  <textarea
                    className="brand-textarea mt-2 w-full bg-white/96"
                    name="tema"
                    placeholder={copy.access.ideaPlaceholder}
                    required
                  />
                </label>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-[var(--color-plum)] shadow-[0_18px_40px_rgba(255,255,255,0.14)]"
                  type="submit"
                >
                  {copy.access.submit}
                  <ArrowRight className="ml-2 size-4" />
                </button>
                <a
                  className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/10 px-6 py-3 text-sm font-semibold text-white"
                  href="#chatbox"
                >
                  {copy.access.secondary}
                </a>
              </div>
            </form>
          </div>
        </section>

        <footer className="rounded-[30px] border border-[rgba(74,58,97,0.08)] bg-white/78 px-6 py-7 shadow-[0_14px_40px_rgba(23,19,31,0.05)] sm:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
                Ingeniometrix
              </p>
              <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
                {copy.footer.description}
              </p>
              <p className="mt-3 text-xs uppercase tracking-[0.2em] text-[rgba(100,94,115,0.72)]">
                (c) {copy.footer.rights}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              <Link className="brand-pill hover:text-[var(--color-plum)]" href="/">
                {copy.footer.portal}
              </Link>
              <a className="brand-pill hover:text-[var(--color-plum)]" href="mailto:hola@simetrika.pe">
                hola@simetrika.pe
              </a>
              <a className="brand-pill hover:text-[var(--color-plum)]" href="#solicitar">
                {copy.footer.snapshot}
              </a>
            </div>
          </div>
        </footer>
      </section>
    </main>
  );
}
