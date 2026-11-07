export const APP_NAME = "Paibot";

export const SUPPORTED_LOCALES = ["de", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "de";

/** Liefert eine unterstützte Sprache; unbekannte Werte fallen auf Deutsch zurück. */
export function resolveLocale(value: string | null | undefined): Locale {
  const short = value?.toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_LOCALES.find((locale) => locale === short) ?? DEFAULT_LOCALE;
}
