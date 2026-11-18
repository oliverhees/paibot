/**
 * PaiBot – gemeinsame Konstanten und Sprachauswahl für alle Pakete.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-07
 */

export const APP_NAME = "PaiBot";

export const SUPPORTED_LOCALES = ["de", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "de";

/** Liefert eine unterstützte Sprache; unbekannte Werte fallen auf Deutsch zurück. */
export function resolveLocale(value: string | null | undefined): Locale {
  const short = value?.toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_LOCALES.find((locale) => locale === short) ?? DEFAULT_LOCALE;
}
