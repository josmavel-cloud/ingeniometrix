"use client";

import { type DegreeLevel } from "@prisma/client";
import {
  FormEvent,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  BookOpenText,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  GraduationCap,
  Lightbulb,
  RotateCcw,
  Sparkles,
  WandSparkles,
} from "lucide-react";

import {
  getDegreeLevelLabelForLanguage,
  getGenericProgramDefault,
  getPresetDegreeLevelForProject,
  PROJECT_DEGREE_LEVEL_OPTIONS,
} from "@/lib/degree-levels";
import { PROJECT_CAREERS, PROJECT_PRESETS } from "@/lib/project-presets";
import {
  getFeaturedProjectUniversityOptions,
  type ProjectUniversityCode,
} from "@/lib/peru-universities";
import {
  SYSTEM_MASTER_TEMPLATE_ALIAS,
  SYSTEM_MASTER_TEMPLATE_KEY,
} from "@/lib/system-master-template";
import type { SupportedLanguage } from "@/lib/language";
import {
  buildProjectPresetSuggestionEntries,
  getTopicAreaLabel,
  normalizeSearchText,
  type TopicSuggestionTone,
} from "@/lib/topic-suggestion-scoring";

const FEATURED_UNIVERSITIES = getFeaturedProjectUniversityOptions();
const fieldClassName = "brand-input";

const createProjectCopy = {
  es: {
    intro:
      "Primero define el tema base, luego generamos ideas y finalmente eliges una variante final.",
    step: "Paso 1 de 3",
    restart: "Empezar otra vez",
    degree: "Nivel",
    university: "Universidad",
    area: "Carrera o area base",
    areaPlaceholder: "Selecciona una opcion o escribe tu propia area",
    showAreas: "Mostrar areas sugeridas",
    useNewArea: (value: string) => `Usar "${value}" como area nueva`,
    areaHelp:
      "Puedes elegir una opcion sugerida o escribir un area propia. La normalizaremos y registraremos en tiempo real.",
    customAreaRegistered: (label: string) =>
      `Registramos "${label}" como area personalizada.`,
    areaNormalized: (label: string) => `Normalizamos el area como "${label}".`,
    adjusting: " Ajustando...",
    validatingArea: "Validando semanticamente el area...",
    generateIdea: "Generar idea",
    ideaPlaceholder: "Escribe el tema que quieres investigar.",
    ideaHelp:
      "Escribe el tema y confirma la base. Mientras escribes, veras sugerencias relacionadas como en un buscador.",
    confirmTopic: "Confirmar tema base",
    confirmTopicBody:
      "Si este es el nombre correcto, lo usaremos para establecer el contexto de generacion de ideas.",
    useTopic: "Usar este tema",
    keepEditing: "Seguir editando",
    confirmedTopic: "Tema confirmado",
    confirmedTopicBody:
      "Este tema fija el contexto. A partir de aqui generamos ideas y luego variantes.",
    generating: "Generando...",
    limitReached: "Limite alcanzado",
    newIdea: "Nueva idea",
    previousIdea: "Idea anterior",
    nextIdea: "Idea siguiente",
    flowTopic: "Primero confirma el tema.",
    flowConfirmed: "Genera hasta 5 ideas y luego elige una.",
    flowVariant:
      "Ya elegiste una idea principal. Ahora define una variante o continua con esa base.",
    currentIdea: "Idea generada actual",
    ideas: "ideas",
    chooseIdea: "Elegir esta idea",
    fixedIdea: "Idea fijada",
    optionalSettings: "Ajustes opcionales",
    program: "Programa",
    hide: "Ocultar",
    edit: "Editar",
    programPlaceholder: "Ej. Maestria en Gestion Empresarial",
    template: "Plantilla",
    areaSummary: "Area",
    notSpecified: "No especificada",
    finalVariant: "Elegir una variante final",
    relatedVariants: "Variantes e ideas relacionadas",
    variantReadyBody:
      "Ahora ya no editamos lo anterior. Si eliges una variante, esa sera la base final; si no, se usara la idea principal que fijaste.",
    variantWaitingBody:
      "Este bloque se activa despues de elegir una idea principal. Antes de eso, debes confirmar el tema y generar ideas.",
    selectedMainIdea: "Idea principal elegida",
    relatedVariantLabel: "Variantes relacionadas",
    chosenVariant: "Variante elegida",
    variant: "Variante",
    noVariantHint:
      "Si no eliges una variante, continuaremos con la idea principal seleccionada.",
    variantsAppearHint:
      "Aqui apareceran las variantes y temas relacionados cuando fijes una idea principal.",
    creating: "Creando...",
    continue: "Continuar",
    continueReady:
      "Guardaremos la variante elegida o, si no elegiste una, la idea principal seleccionada.",
    continueMissing: "Confirma el tema y luego fija una idea para poder continuar.",
    missingTopic: "Escribe o elige un tema base antes de continuar.",
    topicConfirmedMessage:
      "Tema confirmado. Ahora ya puedes generar ideas relacionadas a partir de esta base.",
    viewingIdea: (index: number, total: number) => `Estas viendo la idea ${index} de ${total}.`,
    ideaLocked:
      "Idea principal elegida. Ahora puedes escoger una variante o continuar con esta idea.",
    missingSeed: "Escribe un area o una idea para poder sugerir variantes.",
    relatedError: "No se pudieron preparar ideas relacionadas.",
    generatedCount: (count: number, max: number) =>
      `Generamos ${count} de ${max} ideas disponibles para esta base.`,
    ideaError:
      "No pudimos generar ideas ahora. Revisa la configuracion LLM o intenta de nuevo.",
    submitMissing:
      "Confirma el tema, elige una idea principal y luego decide si usaras una variante.",
    createError: "No se pudo crear el proyecto.",
    exactTopicRationale: "Usar exactamente el tema que acabas de escribir como base.",
    relatedTopicRationale: "Tema relacionado con tu area.",
  },
  en: {
    intro:
      "First define the base topic, then generate ideas, and finally choose a final variant.",
    step: "Step 1 of 3",
    restart: "Start over",
    degree: "Degree",
    university: "University",
    area: "Career or base area",
    areaPlaceholder: "Select an option or write your own area",
    showAreas: "Show suggested areas",
    useNewArea: (value: string) => `Use "${value}" as a new area`,
    areaHelp:
      "You can choose a suggested option or write your own area. We will normalize and register it in real time.",
    customAreaRegistered: (label: string) =>
      `Registered "${label}" as a custom area.`,
    areaNormalized: (label: string) => `Normalized the area as "${label}".`,
    adjusting: " Adjusting...",
    validatingArea: "Semantically validating the area...",
    generateIdea: "Generate idea",
    ideaPlaceholder: "Write the topic you want to research.",
    ideaHelp:
      "Write the topic and confirm the base. Related suggestions will appear as you type.",
    confirmTopic: "Confirm base topic",
    confirmTopicBody:
      "If this is the correct name, we will use it to set the idea generation context.",
    useTopic: "Use this topic",
    keepEditing: "Keep editing",
    confirmedTopic: "Topic confirmed",
    confirmedTopicBody:
      "This topic sets the context. From here, we generate ideas and then variants.",
    generating: "Generating...",
    limitReached: "Limit reached",
    newIdea: "New idea",
    previousIdea: "Previous idea",
    nextIdea: "Next idea",
    flowTopic: "Confirm the topic first.",
    flowConfirmed: "Generate up to 5 ideas, then choose one.",
    flowVariant:
      "You chose a main idea. Now define a variant or continue with that base.",
    currentIdea: "Current generated idea",
    ideas: "ideas",
    chooseIdea: "Choose this idea",
    fixedIdea: "Idea fixed",
    optionalSettings: "Optional settings",
    program: "Program",
    hide: "Hide",
    edit: "Edit",
    programPlaceholder: "E.g. Master in Business Management",
    template: "Template",
    areaSummary: "Area",
    notSpecified: "Not specified",
    finalVariant: "Choose a final variant",
    relatedVariants: "Variants and related ideas",
    variantReadyBody:
      "Previous fields are now locked. If you choose a variant, it becomes the final base; otherwise, the selected main idea is used.",
    variantWaitingBody:
      "This block opens after you choose a main idea. Before that, confirm the topic and generate ideas.",
    selectedMainIdea: "Selected main idea",
    relatedVariantLabel: "Related variants",
    chosenVariant: "Chosen variant",
    variant: "Variant",
    noVariantHint:
      "If you do not choose a variant, we will continue with the selected main idea.",
    variantsAppearHint:
      "Variants and related topics will appear here once you fix a main idea.",
    creating: "Creating...",
    continue: "Continue",
    continueReady:
      "We will save the chosen variant or, if none is selected, the selected main idea.",
    continueMissing: "Confirm the topic and then fix an idea to continue.",
    missingTopic: "Write or choose a base topic before continuing.",
    topicConfirmedMessage:
      "Topic confirmed. You can now generate related ideas from this base.",
    viewingIdea: (index: number, total: number) =>
      `You are viewing idea ${index} of ${total}.`,
    ideaLocked:
      "Main idea selected. Now choose a variant or continue with this idea.",
    missingSeed: "Write an area or an idea to suggest variants.",
    relatedError: "Could not prepare related ideas.",
    generatedCount: (count: number, max: number) =>
      `Generated ${count} of ${max} available ideas for this base.`,
    ideaError:
      "Could not generate ideas right now. Check the LLM configuration or try again.",
    submitMissing:
      "Confirm the topic, choose a main idea, and then decide whether to use a variant.",
    createError: "Could not create the project.",
    exactTopicRationale: "Use exactly the topic you just typed as the base.",
    relatedTopicRationale: "Topic related to your area.",
  },
};

type TopicAreaOption = {
  label: string;
  canonicalAreaId: string | null;
  canonicalAreaLabel: string | null;
  source: "catalog" | "custom";
};

type IdeaDraft = {
  title: string;
  rationale: string;
};

type TopicFlowStage = "topic_input" | "topic_confirmed" | "variant_selection";

type NormalizedAreaResult = TopicAreaOption & {
  confidence: "high" | "medium" | "low";
};

const MAX_GENERATED_IDEAS = 5;

async function readJsonSafe<T>(response: Response) {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function findCareerMatch(value: string) {
  const normalizedValue = normalizeSearchText(value);

  if (!normalizedValue) {
    return null;
  }

  return (
    PROJECT_CAREERS.find(
      (career) => normalizeSearchText(career.label) === normalizedValue,
    ) ??
    PROJECT_CAREERS.find((career) =>
      normalizeSearchText(career.label).includes(normalizedValue),
    ) ??
    null
  );
}

function getProgramDefault(careerId: string | null, degreeLevel: DegreeLevel) {
  const presetDegreeLevel = getPresetDegreeLevelForProject(degreeLevel);

  return (
    PROJECT_PRESETS.find(
      (preset) =>
        preset.careerId === careerId && preset.degreeLevel === presetDegreeLevel,
    )?.program ?? getGenericProgramDefault(degreeLevel)
  );
}

function getSuggestionCardClassName(tone: TopicSuggestionTone, isActive: boolean) {
  const toneClassName =
    tone === "gold"
      ? "brand-card-gold"
      : tone === "mint"
        ? "brand-card-mint"
        : tone === "blush"
          ? "brand-card-blush"
          : "brand-card-lilac";

  return [
    "w-full rounded-[28px] border p-5 text-left shadow-[0_18px_44px_rgba(23,19,31,0.06)]",
    toneClassName,
    isActive
      ? "border-[rgba(52,20,95,0.38)] ring-4 ring-[rgba(219,193,255,0.42)]"
      : "border-transparent hover:-translate-y-[1px]",
  ].join(" ");
}

function buildDefaultAreaOptions() {
  return PROJECT_CAREERS.map((career) => ({
    label: career.label,
    canonicalAreaId: career.id,
    canonicalAreaLabel: career.label,
    source: "catalog" as const,
  }));
}

function mergeTopicAreaOptions(...groups: TopicAreaOption[][]) {
  const merged = new Map<string, TopicAreaOption>();

  for (const group of groups) {
    for (const option of group) {
      merged.set(normalizeSearchText(option.label), option);
    }
  }

  return Array.from(merged.values());
}

type CreateProjectFormProps = {
  initialInterestText?: string;
  language?: SupportedLanguage;
};

export function CreateProjectForm({
  initialInterestText = "",
  language = "es",
}: CreateProjectFormProps) {
  const router = useRouter();
  const copy = createProjectCopy[language];
  const [degreeLevel, setDegreeLevel] = useState<DegreeLevel>("POSGRADO");
  const [university, setUniversity] = useState<ProjectUniversityCode>("PUCP");
  const [areaQuery, setAreaQuery] = useState(PROJECT_CAREERS[0]?.label ?? "");
  const [program, setProgram] = useState(
    getProgramDefault(PROJECT_CAREERS[0]?.id ?? null, "POSGRADO"),
  );
  const [interestText, setInterestText] = useState(initialInterestText.trim());
  const [selectedSuggestionId, setSelectedSuggestionId] = useState("");
  const [areaOptions, setAreaOptions] = useState<TopicAreaOption[]>(
    buildDefaultAreaOptions(),
  );
  const [isAreaDropdownOpen, setIsAreaDropdownOpen] = useState(false);
  const [flowStage, setFlowStage] = useState<TopicFlowStage>("topic_input");
  const [confirmedTopic, setConfirmedTopic] = useState<string | null>(null);
  const [pendingTopicConfirmation, setPendingTopicConfirmation] = useState<string | null>(
    null,
  );
  const [generatedIdeas, setGeneratedIdeas] = useState<IdeaDraft[]>([]);
  const [generatedIdeaVariants, setGeneratedIdeaVariants] = useState<
    Record<string, IdeaDraft[]>
  >({});
  const [activeGeneratedIdeaIndex, setActiveGeneratedIdeaIndex] = useState(0);
  const [ideaDraftError, setIdeaDraftError] = useState<string | null>(null);
  const [ideaDraftMessage, setIdeaDraftMessage] = useState<string | null>(null);
  const [normalizedAreaMessage, setNormalizedAreaMessage] = useState<string | null>(null);
  const [selectedIdeaTitle, setSelectedIdeaTitle] = useState<string | null>(null);
  const [selectedVariantTitle, setSelectedVariantTitle] = useState<string | null>(null);
  const [isProgramEditable, setIsProgramEditable] = useState(false);
  const [hasManualProgram, setHasManualProgram] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isGeneratingIdeas, startIdeaTransition] = useTransition();
  const [isNormalizingArea, startNormalizingAreaTransition] = useTransition();
  const deferredInterestText = useDeferredValue(interestText);
  const deferredAreaQuery = useDeferredValue(areaQuery);

  const selectedAreaOption = useMemo(() => {
    const normalizedAreaQuery = normalizeSearchText(areaQuery);

    if (!normalizedAreaQuery) {
      return null;
    }

    return (
      areaOptions.find(
        (option) => normalizeSearchText(option.label) === normalizedAreaQuery,
      ) ?? null
    );
  }, [areaOptions, areaQuery]);

  const matchedCareer = useMemo(() => {
    if (selectedAreaOption?.canonicalAreaId) {
      return (
        PROJECT_CAREERS.find((career) => career.id === selectedAreaOption.canonicalAreaId) ??
        findCareerMatch(areaQuery)
      );
    }

    return findCareerMatch(areaQuery);
  }, [areaQuery, selectedAreaOption]);
  const topicAreaId = selectedAreaOption?.canonicalAreaId ?? matchedCareer?.id ?? null;
  const topicAreaLabel =
    areaQuery.trim().length > 0
      ? areaQuery.trim()
      : selectedAreaOption?.canonicalAreaLabel ?? getTopicAreaLabel(topicAreaId) ?? null;

  const suggestionEntries = useMemo(
    () =>
      buildProjectPresetSuggestionEntries({
        areaId: topicAreaId,
        degreeLevel: getPresetDegreeLevelForProject(degreeLevel),
        university,
        templateKey: SYSTEM_MASTER_TEMPLATE_KEY,
        interestText: deferredInterestText,
        limit: 5,
      }),
    [deferredInterestText, degreeLevel, topicAreaId, university],
  );

  const selectedSuggestion =
    suggestionEntries.find((entry) => entry.preset.id === selectedSuggestionId)?.preset ??
    suggestionEntries[0]?.preset ??
    null;
  const activeGeneratedIdea = generatedIdeas[activeGeneratedIdeaIndex] ?? null;
  const visibleSuggestionEntries = suggestionEntries.slice(0, 5);
  const normalizedAreaQuery = normalizeSearchText(areaQuery);
  const hasExactAreaOption = areaOptions.some(
    (option) => normalizeSearchText(option.label) === normalizedAreaQuery,
  );
  const selectedIdea =
    generatedIdeas.find(
      (idea) => normalizeSearchText(idea.title) === normalizeSearchText(selectedIdeaTitle ?? ""),
    ) ?? null;
  const selectedIdeaVariants = selectedIdea
    ? generatedIdeaVariants[normalizeSearchText(selectedIdea.title)] ?? []
    : [];
  const topicLiveSuggestions = useMemo(() => {
    const typedTitle = interestText.trim();
    const typedKey = normalizeSearchText(typedTitle);
    const suggestions: IdeaDraft[] = [];

    if (typedTitle) {
      suggestions.push({
        title: typedTitle,
        rationale: copy.exactTopicRationale,
      });
    }

    for (const entry of visibleSuggestionEntries) {
      const title = entry.preset.title;
      const key = normalizeSearchText(title);

      if (key && key !== typedKey) {
        suggestions.push({
          title,
          rationale: entry.reasons[0] ?? copy.relatedTopicRationale,
        });
      }
    }

    return suggestions.slice(0, 5);
  }, [interestText, visibleSuggestionEntries]);
  const hasCustomIdea = interestText.trim().length > 0;
  const canGenerateIdeas =
    flowStage !== "variant_selection" &&
    generatedIdeas.length < MAX_GENERATED_IDEAS &&
    (!isGeneratingIdeas && (!!topicAreaLabel || interestText.trim().length > 0));
  const finalTopicTitle = selectedVariantTitle ?? selectedIdea?.title ?? null;
  const hasFinalIdeaSelection = !!selectedIdea;
  const canContinue =
    !isPending &&
    program.trim().length > 0 &&
    !!finalTopicTitle &&
    hasFinalIdeaSelection &&
    flowStage === "variant_selection";

  function resetIdeaFlowState() {
    setGeneratedIdeas([]);
    setGeneratedIdeaVariants({});
    setActiveGeneratedIdeaIndex(0);
    setSelectedIdeaTitle(null);
    setSelectedVariantTitle(null);
    setIdeaDraftMessage(null);
    setIdeaDraftError(null);
  }

  function restartPlanningFlow() {
    setFlowStage("topic_input");
    setConfirmedTopic(null);
    setPendingTopicConfirmation(null);
    setInterestText("");
    setSelectedSuggestionId("");
    setNormalizedAreaMessage(null);
    setIsAreaDropdownOpen(false);
    resetIdeaFlowState();
    setError(null);
  }

  function beginTopicEditing() {
    setFlowStage("topic_input");
    setConfirmedTopic(null);
    setPendingTopicConfirmation(null);
    resetIdeaFlowState();
  }

  function openTopicConfirmation(candidateTitle: string) {
    const trimmedTitle = candidateTitle.trim();

    if (!trimmedTitle) {
      return;
    }

    setPendingTopicConfirmation(trimmedTitle);
    setError(null);
  }

  function confirmTopicSelection(candidateTitle?: string) {
    const confirmedTitle = candidateTitle?.trim() || interestText.trim();

    if (!confirmedTitle) {
      setError(copy.missingTopic);
      return;
    }

    setInterestText(confirmedTitle);
    setConfirmedTopic(confirmedTitle);
    setPendingTopicConfirmation(null);
    setSelectedSuggestionId("");
    resetIdeaFlowState();
    setFlowStage("topic_confirmed");
    setIdeaDraftMessage(copy.topicConfirmedMessage);
  }

  function applyGeneratedIdea(index: number) {
    const idea = generatedIdeas[index];

    if (!idea) {
      return;
    }

    setActiveGeneratedIdeaIndex(index);
    setInterestText(idea.title);
    setIdeaDraftMessage(copy.viewingIdea(index + 1, generatedIdeas.length));
  }

  function handleIdeaTextChange(nextValue: string) {
    setInterestText(nextValue);
    setError(null);

    if (generatedIdeas.length === 0 || !generatedIdeas[activeGeneratedIdeaIndex]) {
      return;
    }

    setGeneratedIdeas((current) =>
      current.map((idea, index) =>
        index === activeGeneratedIdeaIndex
          ? {
              ...idea,
              title: nextValue,
            }
          : idea,
      ),
    );
  }

  function lockIdeaSelection() {
    const currentIdea = generatedIdeas[activeGeneratedIdeaIndex];

    if (!currentIdea) {
      return;
    }

    setSelectedIdeaTitle(currentIdea.title);
    setSelectedVariantTitle(null);
    setFlowStage("variant_selection");
    setIdeaDraftMessage(copy.ideaLocked);
  }

  useEffect(() => {
    let isCancelled = false;

    void (async () => {
      try {
        const response = await fetch(
          `/api/topic-areas?q=${encodeURIComponent(deferredAreaQuery.trim())}`,
        );
        const payload = await readJsonSafe<{
          error?: string;
          suggestions?: TopicAreaOption[];
        }>(response);

        if (isCancelled || !response.ok || !payload?.suggestions) {
          return;
        }

        setAreaOptions(
          mergeTopicAreaOptions(buildDefaultAreaOptions(), payload.suggestions),
        );
      } catch {
        // Mantiene las opciones locales sin romper la pantalla.
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [deferredAreaQuery]);

  useEffect(() => {
    const trimmedQuery = deferredAreaQuery.trim();

    if (!trimmedQuery || hasExactAreaOption) {
      return;
    }

    let isCancelled = false;

    const timer = window.setTimeout(() => {
      startNormalizingAreaTransition(async () => {
        try {
          const response = await fetch("/api/topic-areas", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              label: trimmedQuery,
            }),
          });
          const payload = await readJsonSafe<{
            error?: string;
            normalizedArea?: NormalizedAreaResult | null;
          }>(response);

          if (isCancelled || !response.ok || !payload?.normalizedArea) {
            return;
          }

          const normalizedArea = payload.normalizedArea;
          const normalizedOption: TopicAreaOption = {
            label: normalizedArea.label,
            canonicalAreaId: normalizedArea.canonicalAreaId,
            canonicalAreaLabel: normalizedArea.canonicalAreaLabel,
            source: normalizedArea.source,
          };

          setAreaOptions((current) =>
            mergeTopicAreaOptions([normalizedOption], current, buildDefaultAreaOptions()),
          );

          if (
            normalizedArea.confidence !== "low" &&
            normalizeSearchText(trimmedQuery) !== normalizeSearchText(normalizedArea.label)
          ) {
            setAreaQuery(normalizedArea.label);
          }

          setNormalizedAreaMessage(
            normalizedArea.confidence === "low"
              ? copy.customAreaRegistered(normalizedArea.label)
              : copy.areaNormalized(normalizedArea.label),
          );
        } catch {
          // Evita romper el formulario si la normalizacion falla.
        }
      });
    }, 450);

    return () => {
      isCancelled = true;
      window.clearTimeout(timer);
    };
  }, [deferredAreaQuery, hasExactAreaOption, startNormalizingAreaTransition]);

  useEffect(() => {
    if (hasManualProgram) {
      return;
    }

    setProgram(getProgramDefault(topicAreaId, degreeLevel));
  }, [degreeLevel, hasManualProgram, topicAreaId]);

  useEffect(() => {
    if (selectedSuggestion && selectedSuggestionId !== selectedSuggestion.id) {
      setSelectedSuggestionId(selectedSuggestion.id);
    }
  }, [selectedSuggestion, selectedSuggestionId]);

  async function requestIdeaDrafts(options?: {
    seedText?: string;
  }) {
    const normalizedSeedText =
      options?.seedText?.trim() ||
      interestText.trim() ||
      confirmedTopic?.trim() ||
      "";

    if (!topicAreaLabel && normalizedSeedText.length === 0) {
      setIdeaDraftError(copy.missingSeed);
      return;
    }

    setIdeaDraftError(null);
    setIdeaDraftMessage(null);

    startIdeaTransition(async () => {
      try {
        const response = await fetch("/api/projects/idea-drafts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            degreeLevel,
            university,
            program,
            language,
            topicAreaId: topicAreaId ?? undefined,
            topicAreaLabel: topicAreaLabel ?? undefined,
            seedText: normalizedSeedText || undefined,
            existingTitles: generatedIdeas.map((idea) => idea.title),
          }),
        });
        const payload = await readJsonSafe<{
          error?: string;
          generatedIdea?: IdeaDraft;
          relatedIdeas?: IdeaDraft[];
          resolvedArea?: {
            topicAreaId: string | null;
            topicAreaLabel: string | null;
          };
        }>(response);

        if (!response.ok || !payload?.generatedIdea) {
          setIdeaDraftError(payload?.error ?? copy.relatedError);
          return;
        }

        const normalizedGeneratedTitle = normalizeSearchText(payload.generatedIdea.title);
        const nextIdeas = (() => {
          const alreadyExists = generatedIdeas.some(
            (idea) =>
              normalizeSearchText(idea.title) === normalizedGeneratedTitle,
          );

          if (alreadyExists) {
            return generatedIdeas;
          }

          return [...generatedIdeas, payload.generatedIdea].slice(0, MAX_GENERATED_IDEAS);
        })();
        const nextIndex = Math.max(
          nextIdeas.findIndex(
            (idea) => normalizeSearchText(idea.title) === normalizedGeneratedTitle,
          ),
          0,
        );

        setGeneratedIdeas(nextIdeas);
        setActiveGeneratedIdeaIndex(nextIndex);
        setGeneratedIdeaVariants((current) => ({
          ...current,
          [normalizedGeneratedTitle]: payload.relatedIdeas?.slice(0, 4) ?? [],
        }));
        setInterestText(payload.generatedIdea.title);

        if (payload.resolvedArea?.topicAreaLabel && !areaQuery.trim()) {
          setAreaQuery(payload.resolvedArea.topicAreaLabel);
        }

        setIdeaDraftMessage(copy.generatedCount(nextIdeas.length, MAX_GENERATED_IDEAS));
      } catch {
        setIdeaDraftError(copy.ideaError);
      }
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!finalTopicTitle || !hasFinalIdeaSelection || flowStage !== "variant_selection") {
      setError(copy.submitMissing);
      return;
    }

    startTransition(async () => {
      const trimmedIdea = finalTopicTitle.trim();
      const shouldUseCatalogSuggestion =
        !selectedIdea &&
        !selectedVariantTitle &&
        !!selectedSuggestion &&
        normalizeSearchText(selectedSuggestion.title) === normalizeSearchText(trimmedIdea);

      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          catalogTopicId: shouldUseCatalogSuggestion ? selectedSuggestion.id : undefined,
          customIdeaText: shouldUseCatalogSuggestion ? undefined : trimmedIdea,
          title: trimmedIdea,
          degreeLevel,
          university,
          program,
          language,
          topicAreaId: topicAreaId ?? undefined,
          topicAreaLabel: topicAreaLabel ?? undefined,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        project?: { id: string };
      };

      if (!response.ok || !payload.project) {
        setError(payload.error ?? copy.createError);
        return;
      }

      router.push(`/projects/${payload.project.id}#intake`);
      router.refresh();
    });
  }

  return (
    <form className="grid gap-6" onSubmit={handleSubmit}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-2">
          <p className="text-sm leading-6 text-[var(--color-muted)]">
            {copy.intro}
          </p>
          <div className="inline-flex w-fit rounded-full border border-[rgba(74,58,97,0.1)] bg-[rgba(244,241,248,0.8)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
            {copy.step}
          </div>
        </div>
        {flowStage !== "topic_input" ? (
          <button
            className="brand-button-secondary px-4 py-2 text-sm font-semibold"
            onClick={restartPlanningFlow}
            type="button"
          >
            <RotateCcw className="mr-2 size-4" />
            {copy.restart}
          </button>
        ) : null}
      </div>

      <section className="grid gap-5">
        <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="grid gap-3 rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-[rgba(255,255,255,0.72)] p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <span className="inline-flex size-10 items-center justify-center rounded-[16px] bg-[rgba(219,193,255,0.3)] text-[var(--color-plum)]">
                <GraduationCap className="size-4" />
              </span>
              <label
                className="text-sm font-semibold text-[var(--color-muted)]"
                htmlFor="project-degree"
              >
                {copy.degree}
              </label>
            </div>
            <select
              className={fieldClassName}
              disabled={flowStage !== "topic_input"}
              id="project-degree"
              onChange={(event) => setDegreeLevel(event.target.value as DegreeLevel)}
              value={degreeLevel}
            >
              {PROJECT_DEGREE_LEVEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {getDegreeLevelLabelForLanguage(option.value, language)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-[rgba(255,255,255,0.72)] p-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex size-10 items-center justify-center rounded-[16px] bg-[rgba(157,231,214,0.28)] text-[var(--color-mint-strong)]">
                <Building2 className="size-4" />
              </span>
              <label className="text-sm font-semibold text-[var(--color-muted)]">
                {copy.university}
              </label>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              {FEATURED_UNIVERSITIES.map((option) => {
                const isActive = option.code === university;

                return (
                  <button
                    className={[
                      "rounded-[20px] border px-4 py-3 text-left text-sm font-semibold transition-transform",
                      isActive
                        ? "border-[rgba(52,20,95,0.34)] bg-[rgba(255,255,255,0.96)] text-[var(--color-ink)] shadow-[0_12px_28px_rgba(52,20,95,0.12)]"
                        : "border-[rgba(74,58,97,0.1)] bg-[rgba(255,255,255,0.82)] text-[var(--color-muted)] hover:-translate-y-[1px]",
                    ].join(" ")}
                    key={option.code}
                    onClick={() => {
                      if (flowStage !== "topic_input") {
                        return;
                      }

                      setUniversity(option.code);
                    }}
                    disabled={flowStage !== "topic_input"}
                    type="button"
                  >
                    {option.shortName}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="grid gap-2 rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-[rgba(255,255,255,0.72)] p-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex size-10 items-center justify-center rounded-[16px] bg-[rgba(255,190,201,0.28)] text-[var(--color-coral)]">
                <BookOpenText className="size-4" />
              </span>
              <label
                className="text-sm font-semibold text-[var(--color-muted)]"
                htmlFor="project-career"
              >
                {copy.area}
              </label>
            </div>
            <div className="relative">
              <input
                autoComplete="off"
                className={`${fieldClassName} pr-11`}
                disabled={flowStage !== "topic_input"}
                id="project-career"
                onBlur={() => {
                  window.setTimeout(() => setIsAreaDropdownOpen(false), 120);
                }}
                onChange={(event) => {
                  beginTopicEditing();
                  setNormalizedAreaMessage(null);
                  setAreaQuery(event.target.value);
                  setIsAreaDropdownOpen(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    setIsAreaDropdownOpen(false);
                  }
                }}
                onFocus={() => setIsAreaDropdownOpen(true)}
                placeholder={copy.areaPlaceholder}
                value={areaQuery}
              />
              <button
                aria-label={copy.showAreas}
                className="absolute inset-y-0 right-3 my-auto inline-flex size-8 items-center justify-center rounded-full text-[var(--color-muted)] hover:bg-[rgba(74,58,97,0.06)]"
                disabled={flowStage !== "topic_input"}
                onClick={() => setIsAreaDropdownOpen((current) => !current)}
                type="button"
              >
                <ChevronDown className="size-4" />
              </button>
              {isAreaDropdownOpen ? (
                <div className="absolute z-20 mt-2 max-h-64 w-full overflow-auto rounded-[22px] border border-[rgba(74,58,97,0.12)] bg-white p-2 shadow-[0_18px_44px_rgba(23,19,31,0.1)]">
                  {areaOptions.map((option) => {
                    const isSelected =
                      normalizeSearchText(option.label) === normalizedAreaQuery;

                    return (
                      <button
                        className={[
                          "flex w-full items-center justify-between rounded-[16px] px-3 py-3 text-left text-sm",
                          isSelected
                            ? "bg-[rgba(219,193,255,0.22)] text-[var(--color-ink)]"
                            : "text-[var(--color-muted)] hover:bg-[rgba(74,58,97,0.04)]",
                        ].join(" ")}
                        key={`${option.source}-${option.label}`}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          beginTopicEditing();
                          setNormalizedAreaMessage(null);
                          setAreaQuery(option.label);
                          setIsAreaDropdownOpen(false);
                        }}
                        type="button"
                      >
                        <span>{option.label}</span>
                        {isSelected ? <Check className="size-4 text-[var(--color-plum)]" /> : null}
                      </button>
                    );
                  })}
                  {areaQuery.trim() && !hasExactAreaOption ? (
                    <button
                      className="mt-1 flex w-full items-center justify-between rounded-[16px] border border-dashed border-[rgba(74,58,97,0.12)] px-3 py-3 text-left text-sm text-[var(--color-ink)] hover:bg-[rgba(74,58,97,0.04)]"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        beginTopicEditing();
                        setNormalizedAreaMessage(null);
                        setIsAreaDropdownOpen(false);
                      }}
                      type="button"
                    >
                      <span>{copy.useNewArea(areaQuery.trim())}</span>
                      <Sparkles className="size-4 text-[var(--color-plum)]" />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            <p className="text-sm leading-6 text-[var(--color-muted)]">
              {copy.areaHelp}
            </p>
            {normalizedAreaMessage ? (
              <p className="text-sm text-emerald-700">
                {normalizedAreaMessage}
                {isNormalizingArea ? copy.adjusting : ""}
              </p>
            ) : isNormalizingArea ? (
              <p className="text-sm text-[var(--color-muted)]">
                {copy.validatingArea}
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-[rgba(255,255,255,0.72)] p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex size-10 items-center justify-center rounded-[16px] bg-[rgba(239,193,77,0.24)] text-[var(--color-gold)]">
                  <Lightbulb className="size-4" />
                </span>
                <label
                  className="text-sm font-semibold text-[var(--color-muted)]"
                  htmlFor="project-interest"
                >
                  {copy.generateIdea}
                </label>
              </div>
            </div>
            <div className="relative">
              <textarea
                className="brand-textarea min-h-[180px] text-base"
                disabled={flowStage === "variant_selection"}
                id="project-interest"
                onChange={(event) => {
                  handleIdeaTextChange(event.target.value);
                }}
                placeholder={copy.ideaPlaceholder}
                rows={7}
                value={interestText}
              />
            </div>
            <p className="text-sm leading-6 text-[var(--color-muted)]">
              {copy.ideaHelp}
            </p>
            {pendingTopicConfirmation && flowStage === "topic_input" ? (
              <div className="rounded-[22px] border border-[rgba(52,20,95,0.14)] bg-[rgba(250,247,253,0.95)] p-4">
                <p className="text-sm font-semibold text-[var(--color-ink)]">
                  {copy.confirmTopic}
                </p>
                <p className="mt-2 font-[var(--font-heading)] text-lg font-semibold text-[var(--color-ink)]">
                  {pendingTopicConfirmation}
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                  {copy.confirmTopicBody}
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    className="brand-button-primary px-4 py-2 text-sm font-semibold"
                    onClick={() => confirmTopicSelection(pendingTopicConfirmation)}
                    type="button"
                  >
                    {copy.useTopic}
                  </button>
                  <button
                    className="brand-button-secondary px-4 py-2 text-sm font-semibold"
                    onClick={() => setPendingTopicConfirmation(null)}
                    type="button"
                  >
                    {copy.keepEditing}
                  </button>
                </div>
              </div>
            ) : null}
            {confirmedTopic ? (
              <div className="rounded-[22px] border border-[rgba(74,58,97,0.08)] bg-[rgba(250,247,253,0.9)] p-4">
                <p className="text-sm font-semibold text-[var(--color-ink)]">
                  {copy.confirmedTopic}
                </p>
                <p className="mt-2 font-[var(--font-heading)] text-lg font-semibold text-[var(--color-ink)]">
                  {confirmedTopic}
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                  {copy.confirmedTopicBody}
                </p>
              </div>
            ) : null}
            <div className="flex flex-wrap items-start gap-3">
              <div className="grid gap-2">
                <button
                  className="brand-button-secondary px-4 py-2 text-sm font-semibold disabled:cursor-wait disabled:opacity-70"
                  disabled={!canGenerateIdeas}
                  onClick={() => requestIdeaDrafts()}
                  type="button"
                >
                  <WandSparkles className="mr-2 size-4" />
                  {isGeneratingIdeas
                    ? copy.generating
                    : generatedIdeas.length >= MAX_GENERATED_IDEAS
                      ? copy.limitReached
                      : generatedIdeas.length > 0
                        ? copy.newIdea
                        : copy.generateIdea}
                </button>
                <div className="flex items-center gap-2">
                  <button
                    aria-label={copy.previousIdea}
                    className="inline-flex size-8 items-center justify-center rounded-full border border-[rgba(74,58,97,0.1)] text-[var(--color-muted)] disabled:opacity-40"
                    disabled={activeGeneratedIdeaIndex === 0 || flowStage === "variant_selection"}
                    onClick={() => applyGeneratedIdea(activeGeneratedIdeaIndex - 1)}
                    type="button"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <button
                    aria-label={copy.nextIdea}
                    className="inline-flex size-8 items-center justify-center rounded-full border border-[rgba(74,58,97,0.1)] text-[var(--color-muted)] disabled:opacity-40"
                    disabled={
                      activeGeneratedIdeaIndex >= generatedIdeas.length - 1 ||
                      flowStage === "variant_selection"
                    }
                    onClick={() => applyGeneratedIdea(activeGeneratedIdeaIndex + 1)}
                    type="button"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              </div>
              <p className="text-sm leading-6 text-[var(--color-muted)]">
                {flowStage === "topic_input"
                  ? copy.flowTopic
                  : flowStage === "topic_confirmed"
                    ? copy.flowConfirmed
                    : copy.flowVariant}
              </p>
            </div>
            {ideaDraftError ? (
              <p className="text-sm text-rose-600">{ideaDraftError}</p>
            ) : null}
            {ideaDraftMessage ? (
              <p className="text-sm text-emerald-700">{ideaDraftMessage}</p>
            ) : null}
            {generatedIdeas.length > 0 ? (
              <div className="rounded-[22px] border border-[rgba(74,58,97,0.08)] bg-[rgba(250,247,253,0.9)] p-4">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-ink)]">
                    {copy.currentIdea}
                  </p>
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted)]">
                    {activeGeneratedIdeaIndex + 1}/{generatedIdeas.length} {copy.ideas}
                  </p>
                </div>
                {activeGeneratedIdea ? (
                  <div className="mt-3 grid gap-3">
                    <div>
                      <p className="font-[var(--font-heading)] text-lg font-semibold text-[var(--color-ink)]">
                        {activeGeneratedIdea.title}
                      </p>
                      <p className="text-sm leading-6 text-[rgba(23,19,31,0.72)]">
                        {activeGeneratedIdea.rationale}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button
                        className="brand-button-primary px-4 py-2 text-sm font-semibold"
                        disabled={flowStage === "variant_selection"}
                        onClick={lockIdeaSelection}
                        type="button"
                      >
                        {copy.chooseIdea}
                      </button>
                      {selectedIdea &&
                      normalizeSearchText(selectedIdea.title) ===
                        normalizeSearchText(activeGeneratedIdea.title) ? (
                        <span className="inline-flex rounded-full bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(23,19,31,0.64)]">
                          {copy.fixedIdea}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <details className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-[rgba(255,255,255,0.72)] p-5">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--color-ink)]">
          {copy.optionalSettings}
        </summary>
        <div className="mt-4 grid gap-4">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-semibold text-[rgba(23,19,31,0.72)]">
                {copy.program}
              </p>
              <button
                className="brand-button-secondary px-4 py-2 text-sm font-semibold"
                disabled={flowStage !== "topic_input"}
                onClick={() => setIsProgramEditable((current) => !current)}
                type="button"
              >
                {isProgramEditable ? copy.hide : copy.edit}
              </button>
            </div>

            {isProgramEditable ? (
              <input
                className={fieldClassName}
                disabled={flowStage !== "topic_input"}
                onChange={(event) => {
                  setProgram(event.target.value);
                  setHasManualProgram(true);
                }}
                placeholder={copy.programPlaceholder}
                required
                value={program}
              />
            ) : (
              <p className="text-sm leading-6 text-[var(--color-muted)]">
                {program}
              </p>
            )}
          </div>

          <div className="grid gap-2 text-sm leading-6 text-[var(--color-muted)] sm:grid-cols-2">
            <p>
              <strong>{copy.template}:</strong> {SYSTEM_MASTER_TEMPLATE_ALIAS}
            </p>
            <p>
              <strong>{copy.areaSummary}:</strong> {topicAreaLabel || copy.notSpecified}
            </p>
            <p>
              <strong>{copy.degree}:</strong> {getDegreeLevelLabelForLanguage(degreeLevel, language)}
            </p>
            <p>
              <strong>{copy.university}:</strong>{" "}
              {FEATURED_UNIVERSITIES.find((option) => option.code === university)?.shortName ??
                university}
            </p>
          </div>
        </div>
      </details>

      <details
        className={[
          "rounded-[28px] border p-5",
          flowStage === "variant_selection"
            ? "border-[rgba(74,58,97,0.08)] bg-[rgba(255,255,255,0.72)]"
            : "border-dashed border-[rgba(74,58,97,0.12)] bg-[rgba(249,247,252,0.72)] opacity-80",
        ].join(" ")}
      >
        <summary className="cursor-pointer text-sm font-semibold text-[var(--color-ink)]">
          {flowStage === "variant_selection"
            ? copy.finalVariant
            : copy.relatedVariants}
        </summary>
        <div className="mt-4 grid gap-4">
          <p className="text-sm leading-6 text-[var(--color-muted)]">
            {flowStage === "variant_selection"
              ? copy.variantReadyBody
              : copy.variantWaitingBody}
          </p>

          {flowStage === "variant_selection" && selectedIdea ? (
            <div className="grid gap-3">
              <p className="text-sm font-semibold text-[rgba(23,19,31,0.72)]">
                {copy.selectedMainIdea}
              </p>
              <div className="rounded-[22px] border border-[rgba(74,58,97,0.08)] bg-[rgba(250,247,253,0.9)] p-4">
                <p className="font-[var(--font-heading)] text-lg font-semibold text-[var(--color-ink)]">
                  {selectedIdea.title}
                </p>
                <p className="mt-2 text-sm leading-6 text-[rgba(23,19,31,0.72)]">
                  {selectedIdea.rationale}
                </p>
              </div>
            </div>
          ) : null}

          {flowStage === "variant_selection" && selectedIdeaVariants.length > 0 ? (
            <div className="grid gap-3">
              <p className="text-sm font-semibold text-[rgba(23,19,31,0.72)]">
                {copy.relatedVariantLabel}
              </p>
              {selectedIdeaVariants.map((idea, index) => (
                <button
                  className={getSuggestionCardClassName(
                    index === 0 ? "mint" : index === 1 ? "lilac" : "gold",
                    normalizeSearchText(selectedVariantTitle ?? "") ===
                      normalizeSearchText(idea.title),
                  )}
                  key={`${idea.title}-${index}`}
                  onClick={() => {
                    setSelectedVariantTitle(idea.title);
                  }}
                  type="button"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="max-w-2xl">
                      <p className="font-[var(--font-heading)] text-lg font-semibold text-[var(--color-ink)]">
                        {idea.title}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[rgba(23,19,31,0.72)]">
                        {idea.rationale}
                      </p>
                    </div>
                    <span className="inline-flex rounded-full bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(23,19,31,0.64)]">
                      {normalizeSearchText(selectedVariantTitle ?? "") ===
                      normalizeSearchText(idea.title)
                        ? copy.chosenVariant
                        : copy.variant}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : null}

          {flowStage === "variant_selection" ? (
            <div className="rounded-[22px] border border-dashed border-[rgba(74,58,97,0.12)] px-4 py-4 text-sm leading-6 text-[var(--color-muted)]">
              {copy.noVariantHint}
            </div>
          ) : (
            <div className="rounded-[22px] border border-dashed border-[rgba(74,58,97,0.12)] px-4 py-4 text-sm leading-6 text-[var(--color-muted)]">
              {copy.variantsAppearHint}
            </div>
          )}
        </div>
      </details>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          className="brand-button-primary px-5 py-3 text-sm font-semibold disabled:cursor-wait disabled:opacity-70"
          disabled={!canContinue}
          type="submit"
        >
          {isPending ? copy.creating : copy.continue}
        </button>
        <p className="text-sm leading-6 text-[var(--color-muted)]">
          {flowStage === "variant_selection"
            ? copy.continueReady
            : copy.continueMissing}
        </p>
      </div>
    </form>
  );
}
