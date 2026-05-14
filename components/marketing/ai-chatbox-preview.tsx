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

const suggestedTopics = [
  "IA en retroalimentación académica",
  "Clima laboral y desempeño",
  "Gestión de riesgos en construcción",
  "Lectura crítica en educación superior",
];

const responseItems = [
  {
    title: "Tema más claro",
    description: "Delimita alcance, población y foco inicial.",
  },
  {
    title: "Ejes de análisis",
    description: "Ordena variables, conceptos y posibles relaciones.",
  },
  {
    title: "Ruta revisable",
    description: "Declara supuestos y próximos pasos.",
  },
];

const settings = [
  {
    label: "Salida",
    name: "salida",
    options: ["Snapshot visual", "Plan inicial", "Ruta de lectura"],
  },
  {
    label: "Enfoque",
    name: "enfoque",
    options: ["Plan de tesis", "Artículo", "Proyecto aplicado"],
  },
  {
    label: "Fuentes",
    name: "fuentes",
    options: ["Abiertas y trazables", "Base académica", "Sin búsqueda por ahora"],
  },
];

export function AiChatboxPreview() {
  return (
    <form
      action="mailto:hola@simetrika.pe?subject=Idea%20inicial%20para%20Ingeniometrix"
      className="rounded-[32px] border border-[rgba(74,58,97,0.12)] bg-white p-3 shadow-[0_24px_70px_rgba(23,19,31,0.08)]"
      encType="text/plain"
      method="post"
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
                Asistente de investigación
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--color-muted)]">
            <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(74,58,97,0.08)] bg-white px-3 py-2">
              <BrainCircuit className="size-4 text-[var(--color-plum)]" />
              Modo tesis
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(74,58,97,0.08)] bg-white px-3 py-2">
              <Settings2 className="size-4 text-[var(--color-plum)]" />
              Snapshot
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
                Tengo una idea de investigación, pero todavía está muy amplia.
                Quiero convertirla en una base clara para mi plan de tesis.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="mt-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-plum)]">
              <Sparkles className="size-4 text-white" />
            </span>
            <div className="max-w-[46rem] rounded-[22px] rounded-tl-md border border-[rgba(74,58,97,0.08)] bg-white px-5 py-4">
              <p className="text-sm font-semibold text-[var(--color-ink)]">
                Podemos ordenar tu punto de partida sin reemplazar la revisión académica.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {responseItems.map((item) => (
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
            {suggestedTopics.map((topic, index) => {
              const Icon = [BrainCircuit, FileText, Search, ArrowUpRight][index] ?? BrainCircuit;

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
              placeholder="Escribe tu tema o idea inicial..."
            />

            <div className="mt-2 flex flex-col gap-3 border-t border-[rgba(74,58,97,0.08)] pt-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  aria-label="Adjuntar contexto"
                  className="inline-flex size-10 items-center justify-center rounded-full border border-[rgba(74,58,97,0.08)] bg-[#f7f4fb] text-[var(--color-muted)]"
                  type="button"
                >
                  <Paperclip className="size-4" />
                </button>
                <button
                  aria-label="Activar búsqueda"
                  className="inline-flex size-10 items-center justify-center rounded-full border border-[rgba(74,58,97,0.08)] bg-[#f7f4fb] text-[var(--color-muted)]"
                  type="button"
                >
                  <Search className="size-4" />
                </button>
                {settings.map((setting) => (
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
                  aria-label="Dictar idea"
                  className="inline-flex size-11 items-center justify-center rounded-full border border-[rgba(74,58,97,0.08)] bg-white text-[var(--color-muted)]"
                  type="button"
                >
                  <Mic className="size-4" />
                </button>
                <button
                  className="inline-flex items-center justify-center rounded-full bg-[var(--color-plum)] px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(52,20,95,0.18)]"
                  type="submit"
                >
                  Solicitar snapshot
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
