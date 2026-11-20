/**
 * PaiBot – Anker und Kopfzeile des Exports aus der Datenbank (nur auf dem Server).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { type Database, repo } from "@paibot/db";
import type { ChainAnchor, ReceiptExportHeader } from "@paibot/shared/belege";
import { PaiBotError } from "@paibot/shared/fehler";
import { t } from "@paibot/shared/texte";
import type { RuleHistory } from "./nachrechnen";
import { createAnchor } from "./verify";

/**
 * Der aktuelle Anker: Start-Beleg und letzter Beleg der Kette in der Datenbank. `undefined`, wenn
 * die Kette noch leer ist. Zum Anzeigen, Kopieren und Herunterladen (`encodeAnchor`).
 */
export async function currentAnchor(
  db: Database,
  time: Date = new Date(),
): Promise<ChainAnchor | undefined> {
  const head = await repo.belege.head(db);
  if (head === undefined) return undefined;
  const start = await repo.belege.getBySeq(db, 1);
  if (start === undefined) throw new PaiBotError("intern", { text: t("belege.kette.ohne_start") });
  return createAnchor(start, head, time);
}

/**
 * Kopfzeile eines Exports: Installation aus dem Start-Beleg, öffentliche Schlüssel aus der
 * Datenbank (nur zur Anzeige) und der aktuelle Anker. Fehler `einrichtung_offen`, solange die
 * Kette keinen Start hat.
 */
export async function exportHeader(
  db: Database,
  time: Date = new Date(),
): Promise<ReceiptExportHeader> {
  const anchor = await currentAnchor(db, time);
  if (anchor === undefined) {
    throw new PaiBotError("einrichtung_offen", { text: t("belege.kette.ohne_start") });
  }
  return {
    format: "pb-belege",
    v: 1,
    installationId: anchor.installationId,
    publicKeys: await repo.installationKeys.listPublic(db),
    anchor,
  };
}

/** Regel-Fassungen aus der Datenbank zum Nachrechnen (`reevaluate`, `verifyChain`). */
export function ruleHistory(db: Database): RuleHistory {
  return {
    asOf: (stand) => repo.rules.listActiveAsOf(db, stand),
    current: () => repo.rules.listActive(db),
  };
}
