/**
 * PaiBot – Wahl der Fassung des Startbereichs einer leeren Unterhaltung: Namen, Standard, Prüfung
 * eines gelesenen Werts und das Merken je Browser in einem Cookie. Ein Cookie statt des
 * Browser-Speichers, weil der Server es mitgeschickt bekommt und die richtige Fassung schon beim
 * ersten Bild zeichnet (kein Wechsel nach dem Laden). Es steht nichts am Server und nichts in der
 * Datenbank.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

export const START_FASSUNGEN = ["begruessung", "startbrett", "stille"] as const;
export type StartFassung = (typeof START_FASSUNGEN)[number];

/** Ab Werk. */
export const STANDARD_FASSUNG: StartFassung = "begruessung";

/** Name des Cookies im Browser. */
export const FASSUNG_COOKIE = "paibot_startbereich";

/** So lange wird die Wahl gemerkt (ein Jahr, in Sekunden). */
const FASSUNG_DAUER = 60 * 60 * 24 * 365;

/** Prüft einen gelesenen Wert; Unbekanntes oder Fehlendes ergibt den Standard. */
export function fassungAus(wert: unknown): StartFassung {
  return typeof wert === "string" && (START_FASSUNGEN as readonly string[]).includes(wert)
    ? (wert as StartFassung)
    : STANDARD_FASSUNG;
}

/** Zeile für `document.cookie`; bei https zusätzlich `Secure`. */
export function fassungCookie(fassung: StartFassung, https: boolean): string {
  return `${FASSUNG_COOKIE}=${fassung}; Path=/; Max-Age=${FASSUNG_DAUER}; SameSite=Lax${https ? "; Secure" : ""}`;
}

/** Liest die Wahl aus einer Cookie-Zeile (`a=1; b=2`). */
export function fassungAusCookies(zeile: string | undefined): StartFassung {
  const treffer = (zeile ?? "")
    .split(";")
    .map((teil) => teil.trim())
    .find((teil) => teil.startsWith(`${FASSUNG_COOKIE}=`));
  return fassungAus(treffer?.slice(FASSUNG_COOKIE.length + 1));
}

/** Merkt die Wahl im Browser. Ohne Cookies bleibt es still bei der Wahl dieser Seite. */
export function fassungMerken(fassung: StartFassung): void {
  try {
    // biome-ignore lint/suspicious/noDocumentCookie: Die Cookie Store API fehlt in Firefox; der Wert ist eine von uns geprüfte Fassung.
    document.cookie = fassungCookie(fassung, window.location.protocol === "https:");
  } catch {
    // Cookies gesperrt: nur nicht merken.
  }
}
