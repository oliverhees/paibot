/**
 * PaiBot – typsicherer Zugriff auf die Texte: `t(key, params)`, Listen und Fehlertexte.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { ErrorCode } from "../errors";
import { DEFAULT_LOCALE, type Locale } from "../locale";
import { de } from "./de";

type Catalog = typeof de;

/** Schlüssel, deren Wert ein einzelner Text ist. */
export type TextKey = {
  [K in keyof Catalog]: Catalog[K] extends string ? K : never;
}[keyof Catalog];

/** Schlüssel, deren Wert eine Liste von Texten ist. */
export type ListKey = {
  [K in keyof Catalog]: Catalog[K] extends readonly string[] ? K : never;
}[keyof Catalog];

/** Form eines Text-Katalogs für eine Sprache: gleiche Schlüssel wie Deutsch, beliebige Werte. */
export type Texts = {
  [K in keyof Catalog]: Catalog[K] extends string ? string : readonly string[];
};

/** Namen der Platzhalter in einem Text, z. B. `"sekunden"` für `"… in {sekunden} Sekunden"`. */
export type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}`
  ? Name | Placeholders<Rest>
  : never;

export type TextParams<K extends TextKey> = Record<Placeholders<Catalog[K]>, string | number>;

type TextArgs<K extends TextKey> = [Placeholders<Catalog[K]>] extends [never]
  ? [params?: undefined, locale?: Locale]
  : [params: TextParams<K>, locale?: Locale];

/** Kataloge je Sprache. Deutsch ist vollständig; fehlt eine Sprache, gilt Deutsch. */
const CATALOGS: { readonly de: Texts } & Partial<Record<Locale, Texts>> = { de };

function catalogFor(locale: Locale | undefined): Texts {
  return CATALOGS[locale ?? DEFAULT_LOCALE] ?? CATALOGS.de;
}

/** Alle Schlüssel des deutschen Katalogs. */
export const TEXT_KEYS = Object.keys(de) as (keyof Catalog)[];

/** Liefert den Text zu `key` und setzt die Platzhalter ein. */
export function t<K extends TextKey>(key: K, ...[params, locale]: TextArgs<K>): string {
  const value = catalogFor(locale)[key] as string;
  if (params === undefined) return value;
  const values = params as Record<string, string | number>;
  return value.replace(/\{([a-z_]+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

/** Liefert eine Liste von Texten in fester Reihenfolge. */
export function tList(key: ListKey, locale?: Locale): readonly string[] {
  return catalogFor(locale)[key] as readonly string[];
}

/** Prüft zur Laufzeit, ob ein Schlüssel für einen einzelnen Text existiert. */
export function isTextKey(key: string): key is TextKey {
  return Object.hasOwn(de, key) && typeof de[key as keyof Catalog] === "string";
}

/** Standardtext zu einem Fehlercode. */
export function errorText(code: ErrorCode, locale?: Locale): string {
  return t(`fehler.${code}`, undefined, locale);
}

/** Standard-Ausweg zu einem Fehlercode, falls es einen gibt. */
export function errorWayOut(code: ErrorCode, locale?: Locale): string | undefined {
  const key = `fehler.${code}.ausweg`;
  return isTextKey(key) ? t(key as WayOutKey, undefined, locale) : undefined;
}

type WayOutKey = Extract<TextKey, `fehler.${string}.ausweg`>;

/** Entfernt unsichtbare Steuerzeichen, damit Tests ganze Texte vergleichen können. */
export function ohneSteuerzeichen(text: string): string {
  return text.replace(/[​-‍⁠﻿]/g, "");
}

export { de };
