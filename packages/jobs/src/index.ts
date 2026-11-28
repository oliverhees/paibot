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
import { buildQueue, prepareQueueWith } from "./pgboss-queue";
import {
  type PrepareQueueOptions,
  QUEUE_SCHEMA,
  QUEUE_SUPERVISION,
  type Queue,
  type QueueOptions,
} from "./vertrag";

export * from "./sql-text";
export * from "./vertrag";

/**
 * Suchpfad jeder Verbindung der Warteschlange. Er wird beim Verbindungsaufbau mitgeschickt und gilt
 * damit vor einer Einstellung an der Rolle (`ALTER ROLE … SET search_path`). Die Abfragen der
 * Bibliothek nennen ihr Schema selbst; Namen aus dem System-Katalog kommen so immer aus `pg_catalog`.
 */
export const QUEUE_SEARCH_PATH = "pg_catalog,public";

/** Verbindungs-Angaben der Warteschlange (Adresse und fester Suchpfad). */
export function queueConnection(databaseUrl: string): {
  connectionString: string;
  options: string;
} {
  return { connectionString: databaseUrl, options: `-c search_path=${QUEUE_SEARCH_PATH}` };
}

/**
 * Baut die Warteschlange für die Datenbank unter `databaseUrl`. Verbindet erst mit `start`.
 *
 * Das Schema `QUEUE_SCHEMA` legt im Betrieb der Migrations-Schritt an und übergibt es der
 * App-Rolle. Die Warteschlange richtet darin nur ihre Tabellen ein; ein Recht zum Anlegen von
 * Schemas in der Datenbank braucht die Verbindung nicht. Nur wenn das Schema fehlt, versucht `start`
 * es anzulegen (geht nur mit einer Rolle, die das darf, etwa in der Entwicklung).
 *
 * Mit `rolle: "worker"` richtet `start` nichts ein und wartet nichts; die Warteschlange muss vorher
 * mit `prepareQueue` eingerichtet sein, sonst scheitert `start`.
 */
export function createQueue(databaseUrl: string, options?: QueueOptions): Queue {
  const max = options?.maxConnections;
  if (max !== undefined && (!Number.isInteger(max) || max < 1)) {
    throw new RangeError("maxConnections muss eine ganze Zahl ab 1 sein");
  }
  const worker = options?.rolle === "worker";
  const boss = new PgBoss({
    ...queueConnection(databaseUrl),
    schema: QUEUE_SCHEMA,
    createSchema: false,
    useListenNotify: true,
    monitorIntervalSeconds: QUEUE_SUPERVISION.monitorIntervalSeconds,
    superviseIntervalSeconds: QUEUE_SUPERVISION.superviseIntervalSeconds,
    ...(worker ? { migrate: false, supervise: false, schedule: false } : {}),
    ...(max === undefined ? {} : { max }),
  });
  return buildQueue(boss, { nurArbeiten: worker });
}

/**
 * Richtet die Warteschlange mit der App-Rolle unter `appUrl` ein (Migrations-Schritt): Tabellen im
 * Schema `QUEUE_SCHEMA` installieren bzw. auf den Stand der Bibliothek bringen, die Warteschlange
 * `run` anlegen und ihre Werte setzen, der Worker-Rolle (falls angegeben) ihre Rechte geben. Danach
 * sind alle Verbindungen geschlossen. Beliebig oft wiederholbar.
 */
export async function prepareQueue(
  appUrl: string,
  options: PrepareQueueOptions = {},
): Promise<void> {
  const boss = new PgBoss({
    ...queueConnection(appUrl),
    schema: QUEUE_SCHEMA,
    createSchema: false,
    supervise: false,
    schedule: false,
    useListenNotify: false,
    max: 1,
  });
  await prepareQueueWith(boss, options);
}
