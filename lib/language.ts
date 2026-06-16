export const APP_DEFAULT_LANGUAGE = "es";
export const APP_DEFAULT_LOCALE = "es-PE";
export const LANGUAGE_COOKIE_NAME = "imx_lang";
export const SUPPORTED_LANGUAGES = ["es", "en"] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

function normalizeLocaleValue(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}

export function isSupportedLanguage(
  value: string | null | undefined,
): value is SupportedLanguage {
  return SUPPORTED_LANGUAGES.includes(value as SupportedLanguage);
}

export function normalizeLanguageCode(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  const language = normalized && normalized.length >= 2 ? normalized.slice(0, 2) : null;

  return isSupportedLanguage(language) ? language : null;
}

export function localeToLanguage(locale: string | null | undefined) {
  const normalizedLocale = normalizeLocaleValue(locale);

  if (!normalizedLocale) {
    return APP_DEFAULT_LANGUAGE;
  }

  return normalizeLanguageCode(normalizedLocale.split("-")[0]) ?? APP_DEFAULT_LANGUAGE;
}

export function resolveLanguageFromHeader(value: string | null | undefined) {
  const candidates =
    value
      ?.split(",")
      .map((part) => part.split(";")[0]?.trim())
      .filter(Boolean) ?? [];

  for (const candidate of candidates) {
    const language = localeToLanguage(candidate);

    if (isSupportedLanguage(language)) {
      return language;
    }
  }

  return APP_DEFAULT_LANGUAGE;
}

export function resolveLanguageContext(input?: {
  userLocale?: string | null;
  projectLanguage?: string | null;
  languageOverride?: string | null;
}) {
  const userLocale = normalizeLocaleValue(input?.userLocale) ?? APP_DEFAULT_LOCALE;
  const userLanguage = localeToLanguage(userLocale);
  const projectLanguage = normalizeLanguageCode(input?.projectLanguage);
  const languageOverride = normalizeLanguageCode(input?.languageOverride);
  const appLanguage = APP_DEFAULT_LANGUAGE;

  return {
    appLanguage,
    appLocale: APP_DEFAULT_LOCALE,
    userLocale,
    userLanguage,
    projectLanguage: projectLanguage ?? APP_DEFAULT_LANGUAGE,
    activeLanguage: languageOverride ?? projectLanguage ?? userLanguage ?? appLanguage,
  };
}

export function resolveHtmlLanguage(input?: {
  userLocale?: string | null;
  languageOverride?: string | null;
}) {
  return normalizeLanguageCode(input?.languageOverride) ?? localeToLanguage(input?.userLocale);
}

export function getLanguageLabel(value: string | null | undefined) {
  switch (normalizeLanguageCode(value)) {
    case "es":
      return "Espanol";
    case "en":
      return "English";
    default:
      return "Otro idioma";
  }
}

export function getLocaleForLanguage(language: string | null | undefined) {
  return normalizeLanguageCode(language) === "en" ? "en-US" : APP_DEFAULT_LOCALE;
}

export function getLanguageInstruction(language: string | null | undefined) {
  return normalizeLanguageCode(language) === "en"
    ? "Respond in English."
    : "Responde en espanol.";
}
