import { cookies, headers } from "next/headers";

import {
  LANGUAGE_COOKIE_NAME,
  normalizeLanguageCode,
  resolveLanguageFromHeader,
  type SupportedLanguage,
} from "@/lib/language";

export async function getRequestLanguage(): Promise<SupportedLanguage> {
  const cookieStore = await cookies();
  const cookieLanguage = normalizeLanguageCode(
    cookieStore.get(LANGUAGE_COOKIE_NAME)?.value,
  );

  if (cookieLanguage) {
    return cookieLanguage;
  }

  const headerStore = await headers();
  return resolveLanguageFromHeader(headerStore.get("accept-language"));
}
