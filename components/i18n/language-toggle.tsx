"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  LANGUAGE_COOKIE_NAME,
  normalizeLanguageCode,
  type SupportedLanguage,
} from "@/lib/language";

type LanguageToggleProps = {
  initialLanguage: SupportedLanguage;
};

function setLanguageCookie(language: SupportedLanguage) {
  document.cookie = `${LANGUAGE_COOKIE_NAME}=${language}; path=/; max-age=31536000; samesite=lax`;
}

function detectBrowserLanguage() {
  const candidates = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];

  for (const candidate of candidates) {
    const language = normalizeLanguageCode(candidate);

    if (language) {
      return language;
    }
  }

  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    if (timezone?.startsWith("America/")) {
      return "es";
    }
  } catch {
    return "es";
  }

  return "es";
}

export function LanguageToggle({ initialLanguage }: LanguageToggleProps) {
  const router = useRouter();
  const [language, setLanguage] = useState<SupportedLanguage>(initialLanguage);

  function refreshWithCookie() {
    router.refresh();
    window.location.reload();
  }

  useEffect(() => {
    const hasCookie = document.cookie
      .split(";")
      .some((item) => item.trim().startsWith(`${LANGUAGE_COOKIE_NAME}=`));

    if (hasCookie) {
      return;
    }

    const detectedLanguage = detectBrowserLanguage();
    setLanguage(detectedLanguage);
    setLanguageCookie(detectedLanguage);
    refreshWithCookie();
  }, [router]);

  function switchLanguage(nextLanguage: SupportedLanguage) {
    if (nextLanguage === language) {
      return;
    }

    setLanguage(nextLanguage);
    window.localStorage.setItem(LANGUAGE_COOKIE_NAME, nextLanguage);
    setLanguageCookie(nextLanguage);
    refreshWithCookie();
  }

  return (
    <div
      aria-label={language === "en" ? "Language" : "Idioma"}
      className="inline-flex rounded-full border border-[rgba(74,58,97,0.12)] bg-white/82 p-1 text-xs font-semibold shadow-[0_10px_24px_rgba(23,19,31,0.06)]"
      role="group"
    >
      {(["es", "en"] as const).map((option) => {
        const isActive = option === language;

        return (
          <button
            aria-pressed={isActive}
            className={[
              "rounded-full px-3 py-1.5 transition",
              isActive
                ? "bg-[var(--color-plum)] text-white"
                : "text-[var(--color-muted)] hover:text-[var(--color-plum)]",
            ].join(" ")}
            key={option}
            onClick={() => switchLanguage(option)}
            type="button"
          >
            {option.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
