/**
 * PaiBot – Wartezeit auf Sperren der Datenbank beim Trennen einer App. Läuft gerade ein Abgleich,
 * der die Zeile der App hält, wartet das Trennen höchstens `SPERR_WARTEZEIT_MS` und endet dann mit
 * einer klaren Meldung, statt ohne Ende zu hängen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { type Database, repo } from "@paibot/db";
import { PaiBotError } from "@paibot/shared/fehler";

/** Längste Wartezeit auf eine Sperre in Millisekunden. */
export const SPERR_WARTEZEIT_MS = 3000;

/** SQLSTATE des Treibers (auch wenn Drizzle den Fehler einpackt). */
function sqlStatus(fehler: unknown): string | undefined {
  let aktuell: unknown = fehler;
  for (let tiefe = 0; tiefe < 5 && typeof aktuell === "object" && aktuell !== null; tiefe++) {
    const code = (aktuell as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    aktuell = (aktuell as { cause?: unknown }).cause;
  }
  return undefined;
}

/**
 * Führt `arbeit` in einer Transaktion mit begrenzter Wartezeit auf Sperren aus. Wartet sie zu
 * lange (`lock_not_available`, 55P03), endet es mit `limit_erreicht` und einem Satz, der sagt, was
 * zu tun ist; die Transaktion wird zurückgenommen.
 */
export async function mitSperrzeit<T>(
  db: Database,
  arbeit: (tx: Database) => Promise<T>,
): Promise<T> {
  try {
    return await repo.withTransaction(db, async (tx) => {
      await tx.execute(`set local lock_timeout = ${SPERR_WARTEZEIT_MS}`);
      return arbeit(tx);
    });
  } catch (fehler) {
    if (sqlStatus(fehler) === "55P03") {
      throw new PaiBotError("limit_erreicht", {
        text: "Die App wird gerade abgeglichen oder geändert.",
        ausweg: "Warte einen Moment und trenne sie dann noch einmal.",
        retryAfterSeconds: 5,
      });
    }
    throw fehler;
  }
}
