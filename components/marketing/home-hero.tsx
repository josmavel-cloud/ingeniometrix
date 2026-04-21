"use client";

import { motion } from "framer-motion";
import {
  CalendarRange,
  FileCheck2,
  LayoutTemplate,
  MoveRight,
  Sparkles,
  Waypoints,
} from "lucide-react";

import { LoginForm } from "@/components/auth/login-form";
import { FloatingNavbar } from "@/components/ui/floating-navbar";

const floatingCards = [
  {
    title: "Ruta de tesis",
    description: "Convierte un tema difuso en una ruta clara y defendible.",
    icon: Waypoints,
    className:
      "hero-card-float left-4 top-8 hidden max-w-[220px] lg:block xl:left-0",
  },
  {
    title: "Plan listo para asesor",
    description: "Alinea mejor tus objetivos, alcance y metodologia desde el inicio.",
    icon: FileCheck2,
    className:
      "hero-card-float-delay right-4 top-16 hidden max-w-[220px] lg:block xl:right-0",
  },
  {
    title: "Hitos con claridad",
    description: "Visualiza avances, riesgos y siguientes pasos con menos friccion.",
    icon: CalendarRange,
    className:
      "hero-card-float-reverse bottom-28 left-12 hidden max-w-[220px] lg:block xl:left-8",
  },
  {
    title: "Estructura de investigacion",
    description: "Organiza problema, preguntas y decisiones con una base mas solida.",
    icon: LayoutTemplate,
    className:
      "hero-card-float-slow bottom-20 right-10 hidden max-w-[220px] lg:block xl:right-6",
  },
];

const featureStrip = [
  {
    title: "Claridad desde el dia uno",
    description: "Empieza tu tesis con una estructura mas enfocada y menos improvisacion.",
    icon: Sparkles,
  },
  {
    title: "Progreso visible",
    description: "Transforma un tema complejo en pasos concretos y mas faciles de revisar.",
    icon: CalendarRange,
  },
  {
    title: "Base lista para dialogar",
    description: "Prepara un plan que tu asesor pueda entender y discutir mejor.",
    icon: FileCheck2,
  },
];

export function HomeHero() {
  return (
    <main className="min-h-screen px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <FloatingNavbar />

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <div className="relative overflow-hidden rounded-[40px] border border-slate-200/80 bg-white/70 px-6 pb-8 pt-28 shadow-[0_30px_90px_rgba(15,23,42,0.12)] backdrop-blur sm:px-10 lg:px-12">
          {floatingCards.map((card, index) => {
            const Icon = card.icon;

            return (
              <motion.article
                animate={{ opacity: 1, y: 0 }}
                className={`surface-panel absolute rounded-[28px] border border-slate-200/70 bg-white/88 p-4 ${card.className}`}
                initial={{ opacity: 0, y: 16 }}
                key={card.title}
                transition={{ delay: 0.15 * index, duration: 0.5 }}
              >
                <div className="mb-3 inline-flex rounded-2xl bg-lime-100 p-2 text-slate-900">
                  <Icon className="size-4" />
                </div>
                <h3 className="font-[var(--font-heading)] text-sm font-semibold text-slate-950">
                  {card.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {card.description}
                </p>
              </motion.article>
            );
          })}

          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto flex max-w-3xl flex-col items-center text-center"
            initial={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.5 }}
          >
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/92 px-4 py-2 text-sm text-slate-600 shadow-sm">
              <span className="inline-flex size-2 rounded-full bg-lime-400" />
              Ingeniometrix
            </div>

            <h1 className="max-w-4xl font-[var(--font-heading)] text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
              Planifica tu tesis con claridad.
            </h1>
            <p className="mt-6 max-w-2xl text-balance text-base leading-8 text-slate-600 sm:text-lg">
              Ingeniometrix te ayuda a convertir una tesis compleja en una ruta mas
              estructurada, clara y facil de discutir con tu asesor.
            </p>

            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row">
              <a
                className="inline-flex items-center justify-center rounded-full bg-lime-400 px-6 py-3 text-sm font-semibold text-slate-950 shadow-[0_16px_40px_rgba(163,230,53,0.35)] hover:-translate-y-0.5 hover:bg-lime-300"
                href="#acceso"
              >
                Empezar ahora
                <MoveRight className="ml-2 size-4" />
              </a>
              <a
                className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-950"
                href="#como-funciona"
              >
                Ver como funciona
              </a>
            </div>
          </motion.div>

          <motion.section
            animate={{ opacity: 1, y: 0 }}
            className="mt-12 grid gap-6 lg:grid-cols-[1.25fr_0.95fr]"
            id="como-funciona"
            initial={{ opacity: 0, y: 20 }}
            transition={{ delay: 0.15, duration: 0.5 }}
          >
            <div className="surface-panel rounded-[32px] p-6 sm:p-8">
              <div className="grid gap-6 sm:grid-cols-3">
                {featureStrip.map((item) => {
                  const Icon = item.icon;

                  return (
                    <div
                      className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-5"
                      key={item.title}
                    >
                      <div className="mb-4 inline-flex rounded-2xl bg-slate-950 p-2 text-lime-300">
                        <Icon className="size-4" />
                      </div>
                      <h2 className="font-[var(--font-heading)] text-base font-semibold text-slate-950">
                        {item.title}
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {item.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="surface-panel rounded-[32px] p-6 sm:p-8" id="acceso">
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-400">
                Acceso rapido
              </p>
              <h2 className="mt-3 font-[var(--font-heading)] text-2xl font-semibold text-slate-950">
                Entra y empieza a estructurar tu tesis hoy.
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Esta version del MVP ya te deja crear proyectos, completar el intake
                y probar la busqueda de fuentes con menos friccion.
              </p>
              <div className="mt-6">
                <LoginForm />
              </div>
            </div>
          </motion.section>
        </div>

        <section
          className="surface-panel grid gap-4 rounded-[32px] px-6 py-5 sm:grid-cols-3 sm:px-8"
          id="ventajas"
        >
          <div>
            <p className="font-[var(--font-heading)] text-base font-semibold text-slate-950">
              Ruta de tesis
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Avanza desde el tema inicial hasta un plan mas ordenado y accionable.
            </p>
          </div>
          <div>
            <p className="font-[var(--font-heading)] text-base font-semibold text-slate-950">
              Estructura para revision
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Organiza mejor tus decisiones para llegar con mas claridad a la asesoria.
            </p>
          </div>
          <div>
            <p className="font-[var(--font-heading)] text-base font-semibold text-slate-950">
              Hitos guiados
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Aprovecha asistencia inteligente sin convertir el producto en un atajo fraudulento.
            </p>
          </div>
        </section>
      </section>
    </main>
  );
}
