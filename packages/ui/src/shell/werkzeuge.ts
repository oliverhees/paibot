/**
 * PaiBot – Werkzeuge der Seitenleiste ein- und ausklappen (Zustand je Browser).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

/** Zustand „Werkzeuge eingeklappt“ der Seitenleiste, je Browser gemerkt. */

/** Schlüssel im Speicher des Browsers. */
export const WERKZEUGE_SCHLUESSEL = "paibot.werkzeuge.eingeklappt";

type Speicher = Pick<Storage, "getItem" | "setItem">;

function standardSpeicher(): Speicher | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** Ob die Werkzeuge eingeklappt sind; ohne Speicher (privates Fenster, gesperrt) offen. */
export function leseEingeklappt(speicher: Speicher | undefined = standardSpeicher()): boolean {
  try {
    return speicher?.getItem(WERKZEUGE_SCHLUESSEL) === "1";
  } catch {
    return false;
  }
}

/** Merkt den Zustand; scheitert der Speicher, bleibt es still beim Zustand dieser Sitzung. */
export function merkeEingeklappt(
  eingeklappt: boolean,
  speicher: Speicher | undefined = standardSpeicher(),
): void {
  try {
    speicher?.setItem(WERKZEUGE_SCHLUESSEL, eingeklappt ? "1" : "0");
  } catch {
    // Speicher voll oder gesperrt: nur nicht merken.
  }
}
