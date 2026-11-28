/**
 * PaiBot – Einstellungen von Vitest für die Lint-Regeln (jeder Fall startet Biome einmal).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Mehrere Tests dieses Pakets legen Probe-Dateien im Arbeitsbaum an (`regeln.test.ts`,
    // `akteur-besitzer.test.ts`, `mcp-schicht.test.ts`; Ordner `__<art>_versuch_<pid>__`), während
    // andere denselben Arbeitsbaum durchsuchen (`doku-check.test.ts`,
    // `leser-nachrichten.test.ts`, `schreiber-bots-teams.test.ts`). Parallel gelesen sieht ein Test
    // die Probe eines anderen und wird grundlos rot – beobachtet an „der Quelltext der Schicht ist
    // frei von Verstößen“ und „die echten Entwickler-Seiten bestehen die Prüfung“. Hintereinander
    // kann das nicht passieren; der ganze Lauf dauert so etwa anderthalb Minuten.
    fileParallelism: false,
  },
});
