export const APP_DEFAULT_LANGUAGE = "es";
export const APP_DEFAULT_LOCALE = "es-PE";

function normalizeLocaleValue(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}

export function normalizeLanguageCode(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.length >= 2 ? normalized.slice(0, 2) : null;
}

export function localeToLanguage(locale: string | null | undefined) {
  const normalizedLocale = normalizeLocaleValue(locale);

  if (!normalizedLocale) {
    return APP_DEFAULT_LANGUAGE;
  }

  return normalizeLanguageCode(normalizedLocale.split("-")[0]) ?? APP_DEFAULT_LANGUAGE;
}

export function resolveLanguageContext(input?: {
  userLocale?: string | null;
  projectLanguage?: string | null;
}) {
  const userLocale = normalizeLocaleValue(input?.userLocale) ?? APP_DEFAULT_LOCALE;
  const userLanguage = localeToLanguage(userLocale);
  const projectLanguage =
    normalizeLanguageCode(input?.projectLanguage) ?? APP_DEFAULT_LANGUAGE;
  const appLanguage = APP_DEFAULT_LANGUAGE;

  return {
    appLanguage,
    appLocale: APP_DEFAULT_LOCALE,
    userLocale,
    userLanguage,
    projectLanguage,
    activeLanguage: projectLanguage || userLanguage || appLanguage,
  };
}

export function resolveHtmlLanguage(input?: { userLocale?: string | null }) {
  return localeToLanguage(input?.userLocale);
}

export function getLanguageLabel(value: string | null | undefined) {
  switch (normalizeLanguageCode(value)) {
    case "es":
      return "Espanol";
    case "en":
      return "Ingles";
    case "pt":
      return "Portugues";
    case "fr":
      return "Frances";
    case "it":
      return "Italiano";
    case "de":
      return "Aleman";
    default:
      return "Otro idioma";
  }
}
