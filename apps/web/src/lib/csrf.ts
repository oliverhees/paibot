/**
 * PaiBot – Schutz gegen untergeschobene Anfragen (CSRF): Herkunft prüfen und Prüfzeichen ableiten
 * und vergleichen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { type DerivedKey, hashToken, hmac, safeEqual, toBase64Url } from "@paibot/crypto";
import { CSRF } from "@paibot/shared/konstanten";

/** Methoden ohne Wirkung; alle anderen gelten als verändernd und werden geprüft. */
const OHNE_WIRKUNG = new Set(["GET", "HEAD", "OPTIONS"]);

export function istVeraendernd(methode: string): boolean {
  return !OHNE_WIRKUNG.has(methode.toUpperCase());
}

/** Prüfzeichen zu einer Sitzung: HMAC über `csrf:<sessions.id>`. */
export function pruefzeichenSitzung(schluessel: DerivedKey<"session-v1">, sitzungsId: string) {
  return toBase64Url(hmac(schluessel, `csrf:${sitzungsId}`));
}

/** Prüfzeichen ohne Sitzung: HMAC über `vorab:<Wert des Vorab-Cookies>`. */
export function pruefzeichenVorab(schluessel: DerivedKey<"session-v1">, vorabWert: string) {
  return toBase64Url(hmac(schluessel, `vorab:${vorabWert}`));
}

/** Prüfzeichen zum Wert des Sitzungs-Cookies (ohne Datenbank: die ID ist dessen SHA-256). */
export function pruefzeichenZuCookie(schluessel: DerivedKey<"session-v1">, cookieWert: string) {
  return pruefzeichenSitzung(schluessel, hashToken(cookieWert));
}

export type HerkunftErgebnis = "ok" | "herkunft_falsch";

/**
 * Herkunft einer verändernden Anfrage: `Origin` muss genau dem Origin von `APP_URL` entsprechen.
 * Fehlt der Kopf oder ist `APP_URL` nicht gesetzt, wird abgelehnt. Meldet der Browser zusätzlich
 * `Sec-Fetch-Site`, muss es `same-origin` sein.
 */
export function pruefeHerkunft(kopf: Headers, erwartet: string | undefined): HerkunftErgebnis {
  if (erwartet === undefined) return "herkunft_falsch";
  const origin = kopf.get("origin");
  if (origin === null || origin !== erwartet) return "herkunft_falsch";
  const seite = kopf.get("sec-fetch-site");
  if (seite !== null && seite !== "same-origin") return "herkunft_falsch";
  return "ok";
}

export type PruefzeichenErgebnis = "ok" | "pruefzeichen_fehlt";

/**
 * Vergleicht das Prüfzeichen aus der Kopfzeile `X-Pb-Pruefzeichen` in konstanter Zeit mit den
 * erlaubten Werten. Fehlt es oder passt keins: `pruefzeichen_fehlt`.
 */
export function pruefePruefzeichen(
  kopf: Headers,
  erlaubt: readonly (string | undefined)[],
): PruefzeichenErgebnis {
  const gesendet = kopf.get(CSRF.header);
  if (gesendet === null || gesendet === "") return "pruefzeichen_fehlt";
  let passt = false;
  for (const wert of erlaubt) {
    if (wert !== undefined && safeEqual(gesendet, wert)) passt = true;
  }
  return passt ? "ok" : "pruefzeichen_fehlt";
}
