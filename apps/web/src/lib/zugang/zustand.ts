/**
 * PaiBot – Zustand für Proxy und Seiten: ist PaiBot eingerichtet, gehört die Anfrage zu einer
 * gültigen Sitzung, und welches Prüfzeichen bekommt die Seite.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { type Database, repo } from "@paibot/db";
import { pruefzeichenVorab, pruefzeichenZuCookie } from "../csrf";
import type { ZugangsDienste } from "./dienste";
import type { GepruefteSitzung } from "./nachweis";
import { cookieLesen, sitzungPruefen, sitzungsCookieName, vorabCookieName } from "./sitzung";
import type { ZugangsZustand } from "./weiterleitung";

const EINGERICHTET = Symbol.for("paibot.web.eingerichtet");
type Halter = { [EINGERICHTET]?: boolean };

/**
 * Ist PaiBot eingerichtet? Ein `true` bleibt für den Prozess gespeichert (eine Einrichtung lässt
 * sich nicht zurücknehmen); vorher wird jedes Mal nachgesehen.
 */
export async function istEingerichtet(db: Database): Promise<boolean> {
  const halter = globalThis as Halter;
  if (halter[EINGERICHTET]) return true;
  const fertig = await repo.settings.isSetupComplete(db);
  if (fertig) halter[EINGERICHTET] = true;
  return fertig;
}

/** Zustand einer Anfrage aus ihrer Kopfzeile `Cookie`. Ohne erreichbare Datenbank: unbekannt. */
export async function zustandFuer(
  cookieKopf: string | null,
  d: ZugangsDienste,
): Promise<ZugangsZustand & { sitzung?: GepruefteSitzung }> {
  let db: Database;
  try {
    db = d.db();
  } catch {
    return { eingerichtet: undefined, angemeldet: false };
  }
  try {
    const eingerichtet = await istEingerichtet(db);
    if (!eingerichtet) return { eingerichtet, angemeldet: false };
    const wert = cookieLesen(cookieKopf, sitzungsCookieName({ appUrl: d.appOrigin() }));
    const sitzung = await sitzungPruefen(db, wert, d.uhr.now());
    return sitzung === undefined
      ? { eingerichtet, angemeldet: false }
      : { eingerichtet, angemeldet: true, sitzung };
  } catch {
    return { eingerichtet: undefined, angemeldet: false };
  }
}

/**
 * Prüfzeichen für den Seitenkopf (`<meta name="pb-pruefzeichen">`): mit Sitzungs-Cookie das der
 * Sitzung, sonst das des Vorab-Cookies. Ohne beides oder ohne `PAIBOT_SECRET`: keins.
 */
export function pruefzeichenFuerSeite(cookieKopf: string | null, d: ZugangsDienste) {
  try {
    const rahmen = { appUrl: d.appOrigin() };
    const schluessel = d.schluessel().sitzung;
    const sitzung = cookieLesen(cookieKopf, sitzungsCookieName(rahmen));
    if (sitzung !== undefined) return pruefzeichenZuCookie(schluessel, sitzung);
    const vorab = cookieLesen(cookieKopf, vorabCookieName(rahmen));
    return vorab === undefined ? undefined : pruefzeichenVorab(schluessel, vorab);
  } catch {
    return undefined;
  }
}
