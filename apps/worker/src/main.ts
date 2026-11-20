/**
 * PaiBot – Startpunkt der Rolle worker: startet den Worker und beendet ihn bei SIGTERM und SIGINT sauber.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { consoleLog } from "./protokoll";
import { installProcessHandlers } from "./prozess";
import { loadWorkerConfig, startWorker } from "./worker";

await installProcessHandlers({
  env: process.env,
  log: consoleLog,
  load: loadWorkerConfig,
  start: startWorker,
  exit: (code) => process.exit(code),
  on: (event, listener) => process.on(event, listener),
});
