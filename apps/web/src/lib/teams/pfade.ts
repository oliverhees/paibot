/**
 * PaiBot – Pfade der Routen für Bots und Teams im Browser (ohne den Routen-Vertrag zu laden, der
 * Zod braucht). Ein Test prüft, dass sie genau den Pfaden des Vertrags entsprechen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

const teil = encodeURIComponent;

export const TEAM_PFADE = {
  bots: () => "/api/bots",
  bot: (id: string) => `/api/bots/${teil(id)}`,
  botPause: (id: string) => `/api/bots/${teil(id)}/pause`,
  botTeam: (id: string) => `/api/bots/${teil(id)}/team`,
  teams: () => "/api/teams",
  team: (id: string) => `/api/teams/${teil(id)}`,
} as const;
