/**
 * PaiBot – die Körper der Verwaltungs-Routen von Bots und Teams, an einer Stelle. Die Seiten
 * bauen ihre Anfragen nur hier, damit ein Feldname nie am Vertrag vorbeigeht: `koerper.test.ts`
 * prüft jeden Körper gegen die Eingabe seiner Route (`packages/shared/src/inputs.ts`).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import { BOT_COLORS, type BotColor } from "@paibot/shared/objekte";
import { formFuer, type TeamAenderung } from "@paibot/ui";
import { abnahmeGespeichert } from "./ansicht";

/** Ein Team anlegen: nur der Name. */
export function teamAnlegenKoerper(name: string) {
  return { name };
}

/**
 * Aussehen des nächsten Bots: die Farben der Reihe nach, damit zwei Bots nicht gleich aussehen.
 * Die Form gehört fest zur Farbe (`formFuer`), deshalb hat das Formular kein eigenes Feld dafür.
 */
export function naechstesAussehen(schon: number) {
  const color = (BOT_COLORS[schon % BOT_COLORS.length] ?? "blau") as BotColor;
  return { color, avatarShape: formFuer(color) };
}

/** Einen weiteren Bot anlegen: Name, Aufgabe und das Aussehen; Modell und Team kommen später. */
export function botAnlegenKoerper(name: string, rolle: string, schon: number) {
  return { name, role: rolle, ...naechstesAussehen(schon) };
}

/** Pause eines Bots setzen oder aufheben. */
export function botPauseKoerper(pausiert: boolean) {
  return { paused: pausiert };
}

/**
 * Bot einem Team zuordnen. Beim Herausnehmen bleibt `teamId` weg: `botTeamInput` kennt nur ein
 * optionales Feld, ein `null` wäre eine ungültige Eingabe.
 */
export function botTeamKoerper(teamId: string | undefined) {
  return teamId === undefined || teamId === "" ? {} : { teamId };
}

/** Ein Team ändern. `lead: null` nimmt die Leitung weg. */
export function teamAendernKoerper(aenderung: TeamAenderung) {
  return {
    name: aenderung.name,
    lead: aenderung.leitungId === "" ? null : aenderung.leitungId,
    collaboration: aenderung.zusammenarbeit,
    acceptance: abnahmeGespeichert(aenderung.abnahme),
  };
}
