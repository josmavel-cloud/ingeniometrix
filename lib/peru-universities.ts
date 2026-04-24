import peruUniversitiesJson from "@/lib/assets/peru-universities.json";

export type ProjectUniversityCode =
  | "PUCP"
  | "UPT"
  | "UNMSM"
  | "UNI"
  | "UP"
  | "UPC"
  | "UPCH"
  | "ULIMA"
  | "UDEP"
  | "USMP"
  | "UCV"
  | "OTHER";

export type ProjectTemplateKey =
  | "UPC_POSGRADO"
  | "UCV_POSGRADO"
  | "USMP_POSGRADO"
  | "GENERIC_POSGRADO_PE";

export type PeruUniversityManagementType = "PUBLICA" | "PRIVADA";
export type PeruUniversityLicensureStatus =
  | "LICENCIA OTORGADA"
  | "LICENCIA DENEGADA"
  | "NO PRESENTADO";

export type PeruUniversityRecord = {
  suneduCode: string;
  slug: string;
  name: string;
  managementType: PeruUniversityManagementType;
  licensureStatus: PeruUniversityLicensureStatus;
  licenseStartDate: string | null;
  licenseEndDate: string | null;
  licensurePeriodYears: number | null;
  department: string;
  province: string;
  district: string;
  ubigeo: string | null;
  latitude: number | null;
  longitude: number | null;
  featuredProjectUniversityCode: Exclude<ProjectUniversityCode, "OTHER"> | null;
};

export type ProjectUniversityOption = {
  code: Exclude<ProjectUniversityCode, "OTHER">;
  shortName: string;
  label: string;
  managementType: PeruUniversityManagementType | null;
  licensureStatus: PeruUniversityLicensureStatus | null;
  department: string | null;
  province: string | null;
  templateKey: ProjectTemplateKey;
};

const FEATURED_PROJECT_UNIVERSITY_CODES = [
  "PUCP",
  "UPT",
  "UPC",
  "UNI",
  "USMP",
] as const satisfies readonly Exclude<ProjectUniversityCode, "OTHER">[];

const FEATURED_PROJECT_UNIVERSITY_SHORT_NAMES: Record<
  Exclude<ProjectUniversityCode, "OTHER">,
  string
> = {
  PUCP: "PUCP",
  UPT: "UPT",
  UNMSM: "UNMSM",
  UNI: "UNI",
  UP: "UP",
  UPC: "UPC",
  UPCH: "UPCH",
  ULIMA: "ULima",
  UDEP: "UDEP",
  USMP: "USMP",
  UCV: "UCV",
};

const PROJECT_UNIVERSITY_FALLBACK_LABELS: Record<ProjectUniversityCode, string> = {
  PUCP: "Pontificia Universidad Catolica del Peru",
  UPT: "Universidad Privada de Tacna",
  UNMSM: "Universidad Nacional Mayor de San Marcos",
  UNI: "Universidad Nacional de Ingenieria",
  UP: "Universidad del Pacifico",
  UPC: "Universidad Peruana de Ciencias Aplicadas",
  UPCH: "Universidad Peruana Cayetano Heredia",
  ULIMA: "Universidad de Lima",
  UDEP: "Universidad de Piura",
  USMP: "Universidad de San Martin de Porres",
  UCV: "Universidad Cesar Vallejo",
  OTHER: "Otra universidad",
};

const PROJECT_UNIVERSITY_TEMPLATE_KEYS: Record<ProjectUniversityCode, ProjectTemplateKey> = {
  PUCP: "GENERIC_POSGRADO_PE",
  UPT: "GENERIC_POSGRADO_PE",
  UNMSM: "GENERIC_POSGRADO_PE",
  UNI: "GENERIC_POSGRADO_PE",
  UP: "GENERIC_POSGRADO_PE",
  UPC: "UPC_POSGRADO",
  UPCH: "GENERIC_POSGRADO_PE",
  ULIMA: "GENERIC_POSGRADO_PE",
  UDEP: "GENERIC_POSGRADO_PE",
  USMP: "USMP_POSGRADO",
  UCV: "UCV_POSGRADO",
  OTHER: "GENERIC_POSGRADO_PE",
};

const PERU_UNIVERSITIES = peruUniversitiesJson as PeruUniversityRecord[];

const PROJECT_UNIVERSITY_NAME_HINTS: Record<
  Exclude<ProjectUniversityCode, "OTHER">,
  readonly string[]
> = {
  PUCP: ["pontificia universidad catolica del peru"],
  UPT: ["universidad privada de tacna"],
  UNMSM: ["universidad nacional mayor de san marcos"],
  UNI: ["universidad nacional de ingenieria"],
  UP: ["universidad del pacifico"],
  UPC: ["universidad peruana de ciencias aplicadas"],
  UPCH: ["universidad peruana cayetano heredia"],
  ULIMA: ["universidad de lima"],
  UDEP: ["universidad de piura"],
  USMP: ["universidad de san martin de porres"],
  UCV: ["universidad cesar vallejo"],
};

function normalizeUniversityText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/s\.a\.c\.|s\.a\.|s\.r\.l\.|asociacion civil/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findUniversityRecordByCode(code: Exclude<ProjectUniversityCode, "OTHER">) {
  const directRecord = PERU_UNIVERSITIES.find(
    (university) => university.featuredProjectUniversityCode === code,
  );

  if (directRecord) {
    return directRecord;
  }

  const normalizedHints = PROJECT_UNIVERSITY_NAME_HINTS[code].map((hint) =>
    normalizeUniversityText(hint),
  );

  return (
    PERU_UNIVERSITIES.find((university) => {
      const normalizedName = normalizeUniversityText(university.name);
      const normalizedSlug = normalizeUniversityText(university.slug);

      return normalizedHints.some(
        (hint) => normalizedName.includes(hint) || normalizedSlug.includes(hint),
      );
    }) ?? null
  );
}

const FEATURED_PROJECT_UNIVERSITY_OPTIONS = FEATURED_PROJECT_UNIVERSITY_CODES.map((code) => {
  const record = findUniversityRecordByCode(code);

  return {
    code,
    shortName: FEATURED_PROJECT_UNIVERSITY_SHORT_NAMES[code],
    label: PROJECT_UNIVERSITY_FALLBACK_LABELS[code],
    managementType: record?.managementType ?? null,
    licensureStatus: record?.licensureStatus ?? null,
    department: record?.department ?? null,
    province: record?.province ?? null,
    templateKey: PROJECT_UNIVERSITY_TEMPLATE_KEYS[code],
  };
}) satisfies readonly ProjectUniversityOption[];

export function getPeruUniversities() {
  return PERU_UNIVERSITIES;
}

export function getFeaturedProjectUniversityOptions() {
  return FEATURED_PROJECT_UNIVERSITY_OPTIONS;
}

export function getProjectTemplateKeyForUniversity(
  universityCode: ProjectUniversityCode,
): ProjectTemplateKey {
  return PROJECT_UNIVERSITY_TEMPLATE_KEYS[universityCode];
}

export function getUniversityRecordByProjectCode(code: ProjectUniversityCode) {
  if (code === "OTHER") {
    return null;
  }

  return findUniversityRecordByCode(code);
}

export function getUniversityDisplayNameByCode(code: ProjectUniversityCode) {
  return getUniversityRecordByProjectCode(code)?.name ?? PROJECT_UNIVERSITY_FALLBACK_LABELS[code];
}

export function buildUniversityResearchContext(code: ProjectUniversityCode) {
  const record = getUniversityRecordByProjectCode(code);
  const displayName = getUniversityDisplayNameByCode(code);
  const locationParts = [record?.district, record?.province, record?.department].filter(
    (value): value is string => Boolean(value?.trim()),
  );
  const locationLabel =
    locationParts.length > 0 ? `${locationParts.join(", ")}, Peru` : "Peru";
  const managementLabel =
    record?.managementType === "PUBLICA"
      ? "universidad publica"
      : record?.managementType === "PRIVADA"
        ? "universidad privada"
        : "universidad";
  const territorialScope =
    record?.department?.trim().toLowerCase() === "lima"
      ? "entorno metropolitano y urbano con alta demanda de investigacion aplicada"
      : "entorno regional donde conviene priorizar problemas aplicados y observables";

  return {
    universityName: displayName,
    locationLabel,
    managementLabel,
    territorialScope,
    contextSummary: `${displayName}, ${managementLabel}, ubicada en ${locationLabel}. Considera este dato solo como contexto academico y territorial para delimitar problemas, tendencias y lineas de investigacion plausibles.`,
  };
}

export const PERU_UNIVERSITIES_SOURCE = {
  dataset:
    "SUNEDU - Licenciamiento Institucional (datosabiertos.gob.pe, recurso CSV)",
  resourceUpdatedAt: "2024-08-28",
  country: "PE",
} as const;
