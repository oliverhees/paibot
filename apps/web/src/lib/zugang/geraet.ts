/**
 * PaiBot – Bekannte Geräte: Ein Browser, in dem du dich angemeldet hast, bekommt ein signiertes
 * Cookie, dessen Kennung auch auf dem Server steht (nur als SHA-256). Damit wartet er beim Anmelden
 * nicht hinter der gemeinsamen Bremse und nicht hinter dem Limit seiner Adresse; dafür hat jedes
 * Gerät ein eigenes, kleines Limit. Abmelden, „Alle Sitzungen beenden“ und ein neues Passwort
 * entfernen die Geräte auf dem Server, danach gilt das Cookie nicht mehr.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { type DerivedKey, hashToken, hmac, newToken, safeEqual, toBase64Url } from "@paibot/crypto";
import { type Database, repo } from "@paibot/db";
import type { OwnerId } from "@paibot/shared/ids";
import { type CookieRahmen, cookieLesen, cookieLoeschen } from "./sitzung";

/** Gültigkeit eines Geräts in Sekunden (90 Tage, wie die längste Sitzung; jede Anmeldung erneuert es). */
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

/** Kennung aus einem Cookie-Wert mit gültigem Prüfzeichen dieser Installation, sonst `undefined`. */
function kennungAus(
  schluessel: DerivedKey<"session-v1">,
  wert: string | undefined,
): string | undefined {
  if (wert === undefined || wert.length > 100) return undefined;
  const [kennung = "", pruef = "", rest] = wert.split(".");
  if (rest !== undefined || !KENNUNG.test(kennung) || !ZEICHEN.test(pruef)) return undefined;
  return safeEqual(pruef, zeichen(schluessel, kennung)) ? kennung : undefined;
}

/** Ein neues Gerät: Cookie-Wert (nur für die Antwort) und der Hash, der auf dem Server steht. */
export interface NeuesGeraet {
  wert: string;
  idHash: string;
}

/** Neuer Wert: zufällige Kennung und ihr Prüfzeichen, getrennt durch einen Punkt. */
export function neuerGeraetWert(schluessel: DerivedKey<"session-v1">): NeuesGeraet {
  const kennung = newToken(24);
  return { wert: `${kennung}.${zeichen(schluessel, kennung)}`, idHash: hashToken(kennung) };
}

/** Hash der Kennung, wenn das Prüfzeichen stimmt (ohne Blick in die Datenbank). */
export function geraetHash(
  schluessel: DerivedKey<"session-v1">,
  wert: string | undefined,
): string | undefined {
  const kennung = kennungAus(schluessel, wert);
  return kennung === undefined ? undefined : hashToken(kennung);
}

/**
 * Ist der Wert ein bekanntes Gerät: gültiges Prüfzeichen und ein gültiger Eintrag auf dem Server?
 * Liefert den Hash der Kennung oder `undefined`. Gefälschte Werte kosten keine Abfrage.
 */
export async function bekanntesGeraet(
  db: Database,
  schluessel: DerivedKey<"session-v1">,
  wert: string | undefined,
  now: Date,
): Promise<string | undefined> {
  const idHash = geraetHash(schluessel, wert);
  if (idHash === undefined) return undefined;
  return (await repo.geraete.find(db, idHash, { now })) === undefined ? undefined : idHash;
}

/**
 * Legt ein neues Gerät für den Besitzer an (nach Anmeldung oder Einrichtung). Ein Gerät, das der
 * Browser schon mitbringt (`bisher`), wird dabei ersetzt.
 */
export async function geraetAnlegen(
  db: Database,
  schluessel: DerivedKey<"session-v1">,
  ownerId: OwnerId,
  optionen: { now: Date; bisher?: string | undefined },
): Promise<NeuesGeraet> {
  const alt = geraetHash(schluessel, optionen.bisher);
  if (alt !== undefined) await repo.geraete.remove(db, alt);
  const neu = neuerGeraetWert(schluessel);
  await repo.geraete.create(db, {
    idHash: neu.idHash,
    ownerId,
    now: optionen.now,
    expiresAt: new Date(optionen.now.getTime() + GERAET_MAX_AGE_SEKUNDEN * 1000),
  });
  return neu;
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
