/**
 * PaiBot – Pfade der App-Routen für den Browser. Ohne den Routen-Vertrag zu laden (kein Zod im
 * Browser); ein Test hält sie gleich mit `API_ROUTEN`.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

const teil = encodeURIComponent;

export const APP_PFADE = {
  liste: () => "/api/apps",
  verbinden: () => "/api/apps",
  neuVerbinden: (id: string) => `/api/apps/${teil(id)}/verbindung`,
  werkzeuge: (id: string) => `/api/apps/${teil(id)}/werkzeuge`,
  werkzeugEinstufen: (id: string, werkzeug: string) =>
    `/api/apps/${teil(id)}/werkzeuge/${teil(werkzeug)}`,
  werkzeugVerlauf: (id: string, werkzeug: string) =>
    `/api/apps/${teil(id)}/werkzeuge/${teil(werkzeug)}/verlauf`,
  zugriff: (id: string, bot: string) => `/api/apps/${teil(id)}/zugriff/${teil(bot)}`,
  trennen: (id: string) => `/api/apps/${teil(id)}`,
} as const;
