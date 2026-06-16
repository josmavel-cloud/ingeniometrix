type StatusTone = "plum" | "lilac" | "gold" | "mint" | "blush" | "slate";

type ProjectStatusMeta = {
  label: string;
  summary: string;
  nextStep: string;
  stage: number;
  tone: StatusTone;
};

const STATUS_META: Record<string, ProjectStatusMeta> = {
  DRAFT: {
    label: "Base por definir",
    summary: "Todavia falta convertir la idea inicial en un intake utilizable.",
    nextStep: "Completa el intake para dejar lista la base del proyecto.",
    stage: 1,
    tone: "lilac",
  },
  INTAKE_READY: {
    label: "Intake listo",
    summary: "La base del proyecto ya permite buscar fuentes iniciales.",
    nextStep: "Ejecuta la busqueda y filtra fuentes semilla trazables.",
    stage: 2,
    tone: "gold",
  },
  SEARCHING: {
    label: "Buscando fuentes",
    summary: "Ingeniometrix esta consultando OpenAlex y Crossref.",
    nextStep: "Espera los resultados y selecciona las referencias mas utiles.",
    stage: 2,
    tone: "gold",
  },
  SOURCES_REVIEW: {
    label: "Fuentes en revision",
    summary: "Ya hay referencias cargadas, pero aun falta elegir el set semilla.",
    nextStep: "Guarda una seleccion corta y representativa para continuar.",
    stage: 2,
    tone: "gold",
  },
  SOURCES_SELECTED: {
    label: "Fuentes seleccionadas",
    summary: "El proyecto ya tiene evidencia suficiente para generar un blueprint.",
    nextStep: "Genera el blueprint para validar coherencia y trazabilidad.",
    stage: 3,
    tone: "mint",
  },
  BLUEPRINT_GENERATING: {
    label: "Generando blueprint",
    summary: "Ingeniometrix esta estructurando el plan con las fuentes elegidas.",
    nextStep: "Revisa el resultado apenas termine la generacion.",
    stage: 3,
    tone: "mint",
  },
  BLUEPRINT_READY: {
    label: "Blueprint listo",
    summary: "Ya tienes una version estructurada del plan con reporte de coherencia.",
    nextStep: "Revisa faltantes, supuestos y prepara la exportacion.",
    stage: 4,
    tone: "plum",
  },
  EXPORT_READY: {
    label: "Listo para exportar",
    summary: "El proyecto ya esta en una etapa final de salida y documentacion.",
    nextStep: "Exporta o revisa la version mas reciente antes de cerrar.",
    stage: 4,
    tone: "plum",
  },
  ARCHIVED: {
    label: "Archivado",
    summary: "Este proyecto se mantiene como referencia historica.",
    nextStep: "Reabre o crea uno nuevo si necesitas seguir trabajando.",
    stage: 4,
    tone: "slate",
  },
};

export function getProjectStatusMeta(status: string): ProjectStatusMeta {
  return (
    STATUS_META[status] ?? {
      label: status,
      summary: "Estado no clasificado todavia.",
      nextStep: "Revisa el proyecto para continuar.",
      stage: 1,
      tone: "slate",
    }
  );
}

export function getProjectStatusToneClasses(status: string) {
  const tone = getProjectStatusMeta(status).tone;

  if (tone === "plum") {
    return "border-[rgba(52,20,95,0.14)] bg-[rgba(219,193,255,0.24)] text-[#34145f]";
  }

  if (tone === "gold") {
    return "border-[rgba(239,193,77,0.22)] bg-[rgba(255,240,184,0.72)] text-[#7a5600]";
  }

  if (tone === "mint") {
    return "border-[rgba(24,169,153,0.18)] bg-[rgba(213,247,239,0.86)] text-[#127b6f]";
  }

  if (tone === "blush") {
    return "border-[rgba(255,111,97,0.2)] bg-[rgba(255,215,223,0.86)] text-[#b74b4b]";
  }

  if (tone === "lilac") {
    return "border-[rgba(185,137,255,0.18)] bg-[rgba(236,216,255,0.86)] text-[#6a3ab2]";
  }

  return "border-[rgba(74,58,97,0.14)] bg-[rgba(244,241,248,0.94)] text-[#645e73]";
}
