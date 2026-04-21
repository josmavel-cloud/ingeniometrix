"use client";

import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  FileCheck2,
  LibraryBig,
  SearchCheck,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { LoginForm } from "@/components/auth/login-form";
import { BrandBadge } from "@/components/brand/brand-badge";
import { FloatingNavbar } from "@/components/ui/floating-navbar";

const workflowSteps = [
  {
    title: "Define tu base",
    description: "Crea un proyecto, ajusta el tema y deja listo el intake inicial.",
    cardClassName: "brand-card-lilac",
    icon: LibraryBig,
  },
  {
    title: "Selecciona fuentes",
    description: "Busca con OpenAlex y Crossref y elige evidencia semilla trazable.",
    cardClassName: "brand-card-gold",
    icon: SearchCheck,
  },
  {
    title: "Valida coherencia",
    description: "Genera un blueprint en espanol y revisa faltantes antes de exportar.",
    cardClassName: "brand-card-mint",
    icon: FileCheck2,
  },
];

const valueCards = [
  {
    label: "UPC, UCV y USMP",
    detail: "Plantillas iniciales para posgrado en Peru.",
    cardClassName: "brand-card-lilac",
  },
  {
    label: "Solo texto estructurado",
    detail: "Sin OCR, sin PDFs y sin desviar el alcance del MVP.",
    cardClassName: "brand-card-gold",
  },
  {
    label: "Trazabilidad obligatoria",
    detail: "Cada salida importante debe quedar vinculada a fuentes recuperadas.",
    cardClassName: "brand-card-mint",
  },
];

const guardrails = [
  {
    title: "Asistencia etica",
    description: "Ingeniometrix ayuda a planificar y validar, no a fabricar una tesis completa.",
  },
  {
    title: "Recorrido corto",
    description: "Todo el producto gira alrededor de un flujo claro: intake, fuentes y blueprint.",
  },
  {
    title: "Pensado para revision",
    description: "La interfaz prioriza pasos defendibles para conversar mejor con asesor y jurado.",
  },
];

export function HomeHero() {
  return (
    <main className="min-h-screen px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <FloatingNavbar />

      <section className="mx-auto flex w-full max-w-[var(--page-max-width)] flex-col gap-8">
        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="surface-panel overflow-hidden rounded-[38px] px-6 py-8 sm:px-8 lg:px-10 lg:py-10"
            initial={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.45 }}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="brand-pill">
                <span className="inline-flex size-2 rounded-full bg-[var(--color-coral)]" />
                Ingeniometrix para maestria y posgrado en Peru
              </div>
              <div className="rounded-[22px] border border-[rgba(74,58,97,0.08)] bg-white/86 px-4 py-3 shadow-[0_12px_30px_rgba(23,19,31,0.05)]">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[rgba(100,94,115,0.62)]">
                  Construido por
                </p>
                <BrandBadge context="company" />
              </div>
            </div>

            <h1 className="mt-6 max-w-3xl font-[var(--font-heading)] text-4xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-5xl lg:text-6xl">
              Planifica tesis con una ruta clara, trazable y en espanol.
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-8 text-[var(--color-muted)] sm:text-lg">
              Ingeniometrix convierte una idea dispersa en un proyecto mejor
              estructurado, con intake guiado, fuentes recuperables y un blueprint
              listo para revisar con tu asesor.
            </p>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
              <a
                className="brand-button-primary px-6 py-3 text-sm font-semibold"
                href="#acceso"
              >
                Empezar recorrido
                <ArrowRight className="ml-2 size-4" />
              </a>
              <a
                className="brand-button-secondary px-6 py-3 text-sm font-semibold"
                href="#como-funciona"
              >
                Ver etapas
              </a>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {valueCards.map((item, index) => (
                <motion.article
                  animate={{ opacity: 1, y: 0 }}
                  className={`rounded-[28px] p-5 ${item.cardClassName}`}
                  initial={{ opacity: 0, y: 16 }}
                  key={item.label}
                  transition={{ delay: 0.08 * index, duration: 0.42 }}
                >
                  <p className="text-sm font-semibold text-[var(--color-ink)]">{item.label}</p>
                  <p className="mt-2 text-sm leading-6 text-[rgba(23,19,31,0.72)]">
                    {item.detail}
                  </p>
                </motion.article>
              ))}
            </div>
          </motion.div>

          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="grid gap-6"
            initial={{ opacity: 0, y: 18 }}
            transition={{ delay: 0.1, duration: 0.45 }}
          >
            <section className="brand-card-primary rounded-[38px] p-6 sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.22em] text-white/64">
                    Ruta MVP
                  </p>
                  <h2 className="mt-3 font-[var(--font-heading)] text-3xl font-semibold">
                    Tu progreso se entiende en segundos.
                  </h2>
                </div>
                <div className="rounded-full bg-white/12 px-4 py-2 text-sm font-semibold text-white">
                  3 etapas
                </div>
              </div>

              <p className="mt-4 max-w-md text-sm leading-7 text-white/78">
                El estilo visual toma la logica de las referencias: jerarquia fuerte,
                tarjetas suaves por bloque y un siguiente paso siempre visible.
              </p>

              <div className="mt-6 brand-progress-rail">
                <div className="brand-progress-fill w-[68%]" />
              </div>

              <div className="mt-6 grid gap-3">
                {workflowSteps.map((step, index) => {
                  const Icon = step.icon;

                  return (
                    <div
                      className="flex items-center gap-4 rounded-[26px] bg-white/10 px-4 py-4"
                      key={step.title}
                    >
                      <div className="inline-flex size-11 items-center justify-center rounded-full bg-white/14">
                        <Icon className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white">
                          {index + 1}. {step.title}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-white/72">
                          {step.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="surface-panel rounded-[36px] p-6 sm:p-8" id="acceso">
              <p className="brand-kicker">Acceso</p>
              <h2 className="mt-3 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
                Entra y crea tu primer proyecto.
              </h2>
              <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                Esta primera version ya te deja estructurar el tema, recuperar
                fuentes y revisar un blueprint sin salirte del alcance etico de
                Ingeniometrix.
              </p>
              <div className="mt-6">
                <LoginForm />
              </div>
            </section>
          </motion.div>
        </section>

        <section className="grid gap-6 lg:grid-cols-3" id="como-funciona">
          {workflowSteps.map((step, index) => {
            const Icon = step.icon;

            return (
              <motion.article
                animate={{ opacity: 1, y: 0 }}
                className={`surface-panel rounded-[34px] p-6 ${step.cardClassName}`}
                initial={{ opacity: 0, y: 18 }}
                key={step.title}
                transition={{ delay: 0.08 * index, duration: 0.42 }}
              >
                <div className="inline-flex size-12 items-center justify-center rounded-full bg-white/58">
                  <Icon className="size-5 text-[var(--color-ink)]" />
                </div>
                <p className="mt-5 text-sm font-semibold uppercase tracking-[0.18em] text-[rgba(23,19,31,0.52)]">
                  Etapa {index + 1}
                </p>
                <h3 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
                  {step.title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-[rgba(23,19,31,0.72)]">
                  {step.description}
                </p>
              </motion.article>
            );
          })}
        </section>

        <section className="surface-panel rounded-[36px] px-6 py-7 sm:px-8" id="criterios">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="brand-pill">
                <ShieldCheck className="size-4 text-[var(--color-mint-strong)]" />
                Criterios de Ingeniometrix
              </div>
              <h2 className="mt-5 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
                Un estilo amable, pero con disciplina academica.
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-7 text-[var(--color-muted)]">
              Las referencias inspiran una interfaz mas guiada y colorida. Nosotros la
              adaptamos a Ingeniometrix con un tono mas serio, orientado a trazabilidad,
              claridad y soporte real para tesis.
            </p>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {guardrails.map((item, index) => (
              <motion.article
                animate={{ opacity: 1, y: 0 }}
                className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-5"
                initial={{ opacity: 0, y: 16 }}
                key={item.title}
                transition={{ delay: 0.08 * index, duration: 0.42 }}
              >
                <div className="inline-flex size-10 items-center justify-center rounded-full bg-[rgba(219,193,255,0.32)]">
                  <Sparkles className="size-4 text-[var(--color-plum)]" />
                </div>
                <h3 className="mt-4 font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
                  {item.description}
                </p>
              </motion.article>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <span className="brand-pill">
              <BookOpenCheck className="size-4 text-[var(--color-plum)]" />
              Espanol primero
            </span>
            <span className="brand-pill">
              <SearchCheck className="size-4 text-[var(--color-coral)]" />
              OpenAlex + Crossref
            </span>
            <span className="brand-pill">
              <CheckCircle2 className="size-4 text-[var(--color-mint-strong)]" />
              Sin fraude academico
            </span>
          </div>
        </section>
      </section>
    </main>
  );
}
