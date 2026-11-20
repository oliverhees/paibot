/**
 * PaiBot – Warteschlange für Läufe: bringt Läufe zuverlässig in den Worker. Der übrige Code kennt
 * nur diese Schnittstelle, nicht die Bibliothek dahinter.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { PgBoss } from "pg-boss";
import { buildQueue } from "./pgboss-queue";
import { QUEUE_SCHEMA, QUEUE_SUPERVISION, type Queue, type QueueOptions } from "./vertrag";

export * from "./vertrag";

/**
 * Baut die Warteschlange für die Datenbank unter `databaseUrl`. Verbindet erst mit `start`.
 */
export function createQueue(databaseUrl: string, options?: QueueOptions): Queue {
  const max = options?.maxConnections;
  if (max !== undefined && (!Number.isInteger(max) || max < 1)) {
    throw new RangeError("maxConnections muss eine ganze Zahl ab 1 sein");
  }
  const boss = new PgBoss({
    connectionString: databaseUrl,
    schema: QUEUE_SCHEMA,
    useListenNotify: true,
    monitorIntervalSeconds: QUEUE_SUPERVISION.monitorIntervalSeconds,
    superviseIntervalSeconds: QUEUE_SUPERVISION.superviseIntervalSeconds,
    ...(max === undefined ? {} : { max }),
  });
  return buildQueue(boss);
}
