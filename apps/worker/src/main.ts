/**
 * PaiBot – Startpunkt der Rolle worker: startet den Worker und beendet ihn bei SIGTERM und SIGINT sauber.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { loadWorkerConfig, startWorker } from "./worker";

const env = process.env;
const worker = await startWorker(loadWorkerConfig(env), env);

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    void worker.stop().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  });
}
