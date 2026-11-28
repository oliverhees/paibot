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

/**
 * Startet die Warteschlange beim Serverstart. Die Web-App ist die Besitzerin der Warteschlange und
 * übernimmt deshalb ihre Wartung (alte Aufträge entfernen, Statistik und deren Teil-Tabellen); der
 * Worker darf dort nur lesen und schreiben. Ohne `DATABASE_URL` geschieht nichts. Ein Fehler steht
 * im Log und bricht den Start nicht ab; beim ersten Einreihen wird es erneut versucht.
 */
export function warteschlangeBeimStart(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<void> {
  if (!env.DATABASE_URL) return Promise.resolve();
  return warteschlange()
    .start()
    .then(
      () => console.log("[paibot] Warteschlange gestartet (Wartung läuft in der Web-App)."),
      (error: unknown) => {
        const art = error instanceof Error ? error.name : typeof error;
        console.warn(`[paibot] Warteschlange beim Start nicht gestartet (${art}).`);
      },
    );
}
