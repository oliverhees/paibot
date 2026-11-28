/**
 * PaiBot – Bausteine für Bots und Teams: Seitenleiste, Bot-Seite, Team-Verwaltung, Team-Entwurf, Teams-Übersicht.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-27
 */

export { TeamsAnsicht, type TeamsAnsichtProps } from "./Ansicht";
export { BotMenue, type BotMenueProps } from "./BotMenue";
export { beispielDaten, SZENEN as TEAMS_SZENEN, VORLAGE_TEAM_ID } from "./beispiel";
export {
  ENTWURF_VERFALL_TAGE,
  type EntwurfAuswahlBot,
  type EntwurfStatus,
  EntwurfVorschau,
  type EntwurfVorschauProps,
} from "./Entwurf";
export { TeamsSeitenleiste, type TeamsSeitenleisteProps } from "./Seitenleiste";
export { Steckbrief } from "./Steckbrief";
export type * from "./typen";
export { TeamsUebersicht } from "./Uebersicht";
export { type TeamAenderung, TeamVerwaltung, type TeamVerwaltungProps } from "./Verwaltung";
