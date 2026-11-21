/**
 * PaiBot – Pfade der Chat-Routen für den Browser (ohne den Routen-Vertrag zu laden, der Zod
 * braucht). Ein Test prüft, dass sie genau den Pfaden des Vertrags entsprechen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

const teil = encodeURIComponent;

export const CHAT_PFADE = {
  unterhaltungen: () => "/api/unterhaltungen",
  unterhaltung: (id: string) => `/api/unterhaltungen/${teil(id)}`,
  nachrichten: (id: string) => `/api/unterhaltungen/${teil(id)}/nachrichten`,
  schleuse: (id: string) => `/api/unterhaltungen/${teil(id)}/schleuse`,
  abbrechen: (id: string, laufId: string) =>
    `/api/unterhaltungen/${teil(id)}/laeufe/${teil(laufId)}/abbrechen`,
  suche: (suchwort: string, ab?: number) =>
    `/api/suche?q=${teil(suchwort)}${ab === undefined || ab === 0 ? "" : `&ab=${ab}`}`,
  export: (id: string) => `/api/unterhaltungen/${teil(id)}/export`,
  neuErzeugen: (id: string, antwortId: string) =>
    `/api/unterhaltungen/${teil(id)}/antworten/${teil(antwortId)}/neu`,
} as const;

/** Adresse einer Unterhaltung mit Sprung zu einer Nachricht (Treffer der Suche). */
export function stellenAdresse(id: string, nachrichtId: string): string {
  return `/chat/${teil(id)}?stelle=${teil(nachrichtId)}`;
}

/** Adresse der Seite einer Unterhaltung. */
export function unterhaltungsAdresse(id: string): string {
  return `/chat/${teil(id)}`;
}
