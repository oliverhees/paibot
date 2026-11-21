/**
 * PaiBot – Bekannte Geräte: Ein Browser, in dem du dich schon einmal angemeldet hast, bekommt ein
 * signiertes, langlebiges Cookie. Damit wartet er beim Anmelden nicht hinter der gemeinsamen
 * Bremse, die bei vielen Fehlversuchen für alle anderen gilt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { type DerivedKey, hmac, newToken, safeEqual, toBase64Url } from "@paibot/crypto";
import type { CookieRahmen } from "./sitzung";

/** Gültigkeit des Cookies im Browser in Sekunden (400 Tage, mehr erlauben Browser nicht). */
export const GERAET_MAX_AGE_SEKUNDEN = 400 * 24 * 60 * 60;

const KENNUNG = /^[A-Za-z0-9_-]{32}$/;
const ZEICHEN = /^[A-Za-z0-9_-]{43}$/;

/** Name des Cookies; bei https mit `__Host-` (nur diese Adresse, nur über https). */
export function geraetCookieName(rahmen: CookieRahmen): string {
  return rahmen.appUrl?.startsWith("https://") ? "__Host-pb_geraet" : "pb_geraet";
}

function zeichen(schluessel: DerivedKey<"session-v1">, kennung: string): string {
  return toBase64Url(hmac(schluessel, `geraet:${kennung}`));
}

/** Neuer Wert: zufällige Kennung und ihr Prüfzeichen, getrennt durch einen Punkt. */
export function neuerGeraetWert(schluessel: DerivedKey<"session-v1">): string {
  const kennung = newToken(24);
  return `${kennung}.${zeichen(schluessel, kennung)}`;
}

/** Hat der Wert ein gültiges Prüfzeichen dieser Installation? */
export function istBekanntesGeraet(
  schluessel: DerivedKey<"session-v1">,
  wert: string | undefined,
): boolean {
  if (wert === undefined || wert.length > 100) return false;
  const [kennung = "", pruef = "", rest] = wert.split(".");
  if (rest !== undefined || !KENNUNG.test(kennung) || !ZEICHEN.test(pruef)) return false;
  return safeEqual(pruef, zeichen(schluessel, kennung));
}

/** `Set-Cookie` für ein bekanntes Gerät: nur für Anfragen von PaiBot selbst, nie für Skripte. */
export function geraetCookie(rahmen: CookieRahmen, wert: string): string {
  const teile = [
    `${geraetCookieName(rahmen)}=${wert}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${GERAET_MAX_AGE_SEKUNDEN}`,
  ];
  if (rahmen.appUrl?.startsWith("https://")) teile.push("Secure");
  return teile.join("; ");
}
