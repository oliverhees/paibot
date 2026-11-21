/**
 * PaiBot – eine Warteschlange je Prozess der Web-App zum Einreihen von Läufen, in derselben
 * Transaktion wie Nachricht, Lauf und Ereignisse.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { Database } from "@paibot/db";
import { createQueue, type Queue, type RunJob, textSqlExecutor } from "@paibot/jobs";
import { PaiBotError } from "@paibot/shared/fehler";

/** Was die Route „Nachricht senden“ von der Warteschlange braucht; in Tests ersetzbar. */
export interface Einreihen {
  /** Verbindet die Warteschlange (vor der Transaktion, damit sie darin nur noch schreibt). */
  bereit(): Promise<void>;
  /** Reiht den Lauf in der offenen Transaktion `tx` ein. */
  lauf(job: RunJob, tx: Database): Promise<void>;
}

/** Höchstens so viele Verbindungen öffnet die Warteschlange in der Web-App. */
const VERBINDUNGEN = 2;

const SCHLUESSEL = Symbol.for("paibot.web.warteschlange");
type Halter = { [SCHLUESSEL]?: { url: string; queue: Queue } };

function warteschlange(): Queue {
  const url = process.env.DATABASE_URL;
  if (!url) throw new PaiBotError("intern");
  const halter = globalThis as Halter;
  const vorhanden = halter[SCHLUESSEL];
  if (vorhanden && vorhanden.url === url) return vorhanden.queue;
  const queue = createQueue(url, { maxConnections: VERBINDUNGEN });
  halter[SCHLUESSEL] = { url, queue };
  return queue;
}

/** Brücke von der Transaktion zur Warteschlange: SQL als Text über `tx.execute`. */
export function executorFuer(tx: Database) {
  return textSqlExecutor((text) => tx.execute(text));
}

/** Einreihen mit der Warteschlange des Prozesses (`DATABASE_URL`). */
export const prozessEinreihen: Einreihen = {
  bereit: () => warteschlange().start(),
  lauf: async (job, tx) => {
    await warteschlange().enqueueRun(job, { executor: executorFuer(tx) });
  },
};
