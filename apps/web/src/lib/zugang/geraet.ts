/**
 * PaiBot – Bekannte Geräte: Ein Browser, in dem du dich anmeldest, bekommt ein signiertes Cookie,
 * dessen Kennung auf dem Server im Geräte-Verzeichnis steht (nur als SHA-256). Ein Cookie ohne
 * gültigen Eintrag gilt nicht. Ein bekanntes Gerät wartet beim Anmelden nicht hinter der
 * gemeinsamen Bremse und nicht hinter dem Limit seiner Adresse, hat dafür aber ein eigenes Limit.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { type DerivedKey, hashToken, hmac, newToken, safeEqual, toBase64Url } from "@paibot/crypto";
import { type Database, repo } from "@paibot/db";
import { type CookieRahmen, cookieLesen, cookieLoeschen } from "./sitzung";

/** Gültigkeit eines Geräts in Sekunden (90 Tage ab der letzten Anmeldung damit). */
export const GERAET_MAX_AGE_SEKUNDEN = 90 * 24 * 60 * 60;

const KENNUNG = /^[A-Za-z0-9_-]{32}$/;
const ZEICHEN = /^[A-Za-z0-9_-]{43}$/;

/** Name des Cookies; bei https mit `__Host-` (nur diese Adresse, nur über https). */
export function geraetCookieName(rahmen: CookieRahmen): string {
  return rahmen.appUrl?.startsWith("https://") ? "__Host-pb_geraet" : "pb_geraet";
}

function zeichen(schluessel: DerivedKey<"session-v1">, kennung: string): string {
  return toBase64Url(hmac(schluessel, `geraet-v2:${kennung}`));
}

/** Ein neuer Cookie-Wert (nur für die Antwort) und der Hash, der auf dem Server steht. */
export interface GeraetWert {
  wert: string;
  tokenHash: string;
}

/** Neuer Wert: zufällige Kennung und ihr Prüfzeichen, getrennt durch einen Punkt. */
export function neuerGeraetWert(schluessel: DerivedKey<"session-v1">): GeraetWert {
  const kennung = newToken(24);
  return { wert: `${kennung}.${zeichen(schluessel, kennung)}`, tokenHash: hashToken(kennung) };
}

/** Hash der Kennung, wenn das Prüfzeichen stimmt (ohne Blick in die Datenbank). */
export function geraetHash(
  schluessel: DerivedKey<"session-v1">,
  wert: string | undefined,
): string | undefined {
  if (wert === undefined || wert.length > 100) return undefined;
  const [kennung = "", pruef = "", rest] = wert.split(".");
  if (rest !== undefined || !KENNUNG.test(kennung) || !ZEICHEN.test(pruef)) return undefined;
  return safeEqual(pruef, zeichen(schluessel, kennung)) ? hashToken(kennung) : undefined;
}

/**
 * Das bekannte Gerät zu einem Cookie-Wert: gültiges Prüfzeichen und ein gültiger Eintrag im
 * Verzeichnis (nicht widerrufen, nicht abgelaufen). Gefälschte Werte kosten keine Abfrage.
 */
export async function bekanntesGeraet(
  db: Database,
  schluessel: DerivedKey<"session-v1">,
  wert: string | undefined,
  now: Date,
): Promise<repo.geraete.GeraetEintrag | undefined> {
  const tokenHash = geraetHash(schluessel, wert);
  if (tokenHash === undefined) return undefined;
  return repo.geraete.findByToken(db, tokenHash, { now });
}

/** Ablauf eines Geräts, das jetzt angelegt oder benutzt wird. */
export function geraetAblauf(now: Date): Date {
  return new Date(now.getTime() + GERAET_MAX_AGE_SEKUNDEN * 1000);
}

/** Wert des Geräte-Cookies aus der Kopfzeile `Cookie`. */
export function geraetAusAnfrage(request: Request, rahmen: CookieRahmen): string | undefined {
  return cookieLesen(request.headers.get("cookie"), geraetCookieName(rahmen));
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

/** `Set-Cookie`, das das Geräte-Cookie im Browser löscht. */
export function geraetCookieLoeschen(rahmen: CookieRahmen): string {
  return cookieLoeschen(geraetCookieName(rahmen), rahmen, "Strict");
}
