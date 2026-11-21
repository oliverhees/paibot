/**
 * PaiBot – Zugang für Server-Seiten: Sitzung prüfen (sonst umleiten) und das Prüfzeichen für den
 * Seitenkopf. Jede Seite der App prüft die Sitzung selbst, nicht nur der Proxy.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prozessDienste } from "./dienste";
import type { GepruefteSitzung } from "./nachweis";
import { SEITE_ANMELDEN, SEITE_APP, SEITE_EINRICHTUNG, type ZugangsZustand } from "./weiterleitung";
import { pruefzeichenFuerSeite, zustandFuer } from "./zustand";

async function cookieKopf(): Promise<string | null> {
  return (await headers()).get("cookie");
}

/** Zustand der aktuellen Anfrage (Einrichtung, Anmeldung). */
export async function seitenZustand(): Promise<ZugangsZustand & { sitzung?: GepruefteSitzung }> {
  return zustandFuer(await cookieKopf(), prozessDienste());
}

/**
 * Für jede Seite der angemeldeten App: liefert die geprüfte Sitzung. Ohne Einrichtung geht es zu
 * `/einrichtung`, ohne gültige Sitzung zu `/anmelden`.
 */
export async function besitzerSeite(): Promise<GepruefteSitzung> {
  const zustand = await seitenZustand();
  if (zustand.eingerichtet === false) redirect(SEITE_EINRICHTUNG);
  if (zustand.sitzung === undefined) redirect(SEITE_ANMELDEN);
  return zustand.sitzung;
}

/** Für `/anmelden`: ohne Einrichtung zur Einrichtung, mit Sitzung in die App. */
export async function anmeldeSeite(): Promise<ZugangsZustand> {
  const zustand = await seitenZustand();
  if (zustand.eingerichtet === false) redirect(SEITE_EINRICHTUNG);
  if (zustand.angemeldet) redirect(SEITE_APP);
  return zustand;
}

/** Für `/einrichtung`: nach der Einrichtung zur Anmeldung bzw. in die App. */
export async function einrichtungsSeite(): Promise<ZugangsZustand> {
  const zustand = await seitenZustand();
  if (zustand.eingerichtet === true) redirect(zustand.angemeldet ? SEITE_APP : SEITE_ANMELDEN);
  return zustand;
}

/** Prüfzeichen für `<meta name="pb-pruefzeichen">` dieser Anfrage. */
export async function seitenPruefzeichen(): Promise<string | undefined> {
  return pruefzeichenFuerSeite(await cookieKopf(), prozessDienste());
}
