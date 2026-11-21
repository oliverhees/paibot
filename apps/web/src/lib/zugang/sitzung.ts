/**
 * PaiBot – Sitzungen: anlegen, aus dem Cookie prüfen, gleitend verlängern, beenden; dazu die Cookies.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { hashToken, newToken } from "@paibot/crypto";
import { type Database, repo } from "@paibot/db";
import type { DeviceId, OwnerId } from "@paibot/shared/ids";
import { cookieName, SESSION } from "@paibot/shared/konstanten";
import { _gepruefteSitzung, type GepruefteSitzung } from "./nachweis";

/** Verlängert wird höchstens einmal pro Minute, damit nicht jede Anfrage schreibt. */
export const VERLAENGERN_NACH_MS = 60_000;

/** Liest einen Cookie aus der Kopfzeile `Cookie`. */
export function cookieLesen(kopf: string | null | undefined, name: string): string | undefined {
  if (!kopf) return undefined;
  for (const teil of kopf.split(";")) {
    const gleich = teil.indexOf("=");
    if (gleich < 0) continue;
    if (teil.slice(0, gleich).trim() !== name) continue;
    const wert = teil.slice(gleich + 1).trim();
    return wert === "" ? undefined : wert;
  }
  return undefined;
}

/** Namen und Attribute der Cookies für die eingestellte `APP_URL`. */
export interface CookieRahmen {
  /** `APP_URL` (oder ihr Origin); bestimmt Namen und `Secure`. */
  appUrl: string | undefined;
}

export function sitzungsCookieName(rahmen: CookieRahmen): string {
  return cookieName("sitzung", rahmen.appUrl);
}

export function vorabCookieName(rahmen: CookieRahmen): string {
  return cookieName("vorab", rahmen.appUrl);
}

function sicher(rahmen: CookieRahmen): boolean {
  return rahmen.appUrl?.startsWith("https://") ?? false;
}

/** `Set-Cookie` für die Sitzung: `HttpOnly`, `SameSite=Lax`, `Path=/`, ohne `Domain`. */
export function sitzungsCookie(rahmen: CookieRahmen, wert: string, bleiben: boolean): string {
  const teile = [`${sitzungsCookieName(rahmen)}=${wert}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (sicher(rahmen)) teile.push("Secure");
  if (bleiben) teile.push(`Max-Age=${SESSION.cookieMaxAgeSeconds}`);
  return teile.join("; ");
}

/** `Set-Cookie` für das Vorab-Cookie: `HttpOnly`, `SameSite=Strict`, `Path=/`, ohne `Max-Age`. */
export function vorabCookie(rahmen: CookieRahmen, wert: string): string {
  const teile = [`${vorabCookieName(rahmen)}=${wert}`, "Path=/", "HttpOnly", "SameSite=Strict"];
  if (sicher(rahmen)) teile.push("Secure");
  return teile.join("; ");
}

/** `Set-Cookie`, das ein Cookie löscht. */
export function cookieLoeschen(name: string, rahmen: CookieRahmen, sameSite: "Lax" | "Strict") {
  const teile = [`${name}=`, "Path=/", "HttpOnly", `SameSite=${sameSite}`, "Max-Age=0"];
  if (sicher(rahmen)) teile.push("Secure");
  return teile.join("; ");
}

/** Neuer Wert für ein Vorab-Cookie. */
export function neuerVorabWert(): string {
  return newToken(32);
}

/** Eine neu angelegte Sitzung: der Cookie-Wert (nur für die Antwort) und die geprüfte Sitzung. */
export interface NeueSitzung {
  token: string;
  sitzung: GepruefteSitzung;
}

/**
 * Legt eine Sitzung mit frischem Zufalls-Token an. In der Datenbank steht nur `sha256(token)`; das
 * Token selbst geht nur einmal als Cookie an den Browser.
 */
export async function sitzungAnlegen(
  db: Database,
  ownerId: OwnerId,
  optionen: { now: Date; userAgent?: string | null; deviceId?: DeviceId },
): Promise<NeueSitzung> {
  const token = newToken(32);
  const zeile = await repo.sessions.create(db, {
    tokenHash: hashToken(token),
    ownerId,
    authLevel: "password",
    method: "password",
    now: optionen.now,
    ...(optionen.userAgent ? { userAgent: optionen.userAgent } : {}),
    ...(optionen.deviceId === undefined ? {} : { deviceId: optionen.deviceId }),
  });
  return {
    token,
    sitzung: _gepruefteSitzung({
      id: zeile.id,
      ownerId: zeile.ownerId,
      createdAt: zeile.createdAt,
      expiresAt: zeile.expiresAt,
    }),
  };
}

/**
 * Prüft den Wert eines Sitzungs-Cookies gegen die Datenbank: gleitend höchstens 30 Tage ohne
 * Benutzung, insgesamt höchstens 90 Tage ab dem Anlegen (beides auf dem Server). Verlängert die
 * Sitzung gleitend. `undefined`, wenn es keine gültige Sitzung gibt.
 */
export async function sitzungPruefen(
  db: Database,
  cookieWert: string | undefined,
  now: Date,
): Promise<GepruefteSitzung | undefined> {
  if (cookieWert === undefined || cookieWert.length > 200) return undefined;
  const id = hashToken(cookieWert);
  let zeile = await repo.sessions.findByTokenHash(db, id, { now });
  if (zeile === undefined) return undefined;
  if (now.getTime() - Date.parse(zeile.lastSeenAt) >= VERLAENGERN_NACH_MS) {
    zeile = await repo.sessions.extend(db, id, { now });
    if (zeile === undefined) return undefined;
  }
  return _gepruefteSitzung({
    id: zeile.id,
    ownerId: zeile.ownerId,
    createdAt: zeile.createdAt,
    expiresAt: zeile.expiresAt,
  });
}

/** Beendet die Sitzung (Abmelden). */
export async function sitzungBeenden(db: Database, sitzung: GepruefteSitzung): Promise<boolean> {
  return repo.sessions.end(db, sitzung.id);
}
