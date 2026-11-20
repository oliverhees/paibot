/**
 * PaiBot – Körper eines Belegs aus den Angaben des Tors bzw. der Einrichtung bauen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { ActionRequest } from "@paibot/shared/aktionen";
import type {
  KeyChangeFacts,
  ReceiptBody,
  ReceiptResult,
  ReceiptUndo,
} from "@paibot/shared/belege";
import type { HmacDigest, IsoTime, Sha256Digest } from "@paibot/shared/grundtypen";
import type { InstallationId, KeyId, ReceiptId } from "@paibot/shared/ids";
import type { Decision } from "@paibot/shared/tor";
import { notImplemented } from "@paibot/stub";

/** Inhalt eines neuen Belegs, ohne die Angaben zur Kette. */
export type ReceiptDraft =
  | {
      type: "start";
      facts: { installationId: InstallationId; publicKey: string; software: string };
    }
  | { type: "key_change"; facts: KeyChangeFacts }
  | {
      type: "decision";
      action: ActionRequest;
      /** Entscheidung des Tors; `matchedRules` wird im Beleg zu `decision.rules`. */
      decision: Decision;
      /** Fakten, die das Tor gesehen hat: nur Ganzzahlen, Texte, Schalter, keine Inhalte. */
      facts: Readonly<Record<string, unknown>>;
      context?: { digest: HmacDigest };
      undo?: ReceiptUndo;
    }
  | { type: "result"; action: ActionRequest; result: ReceiptResult; undo?: ReceiptUndo };

/** Angaben zur Kette, die erst unter der Sperre feststehen. */
export interface ChainLink {
  id: ReceiptId;
  seq: number;
  time: IsoTime;
  /** Prüfsumme des vorigen Eintrags, beim ersten Eintrag `ZERO_PREV`. */
  prev: Sha256Digest;
  /** Schlüssel, der diesen Eintrag signiert. */
  keyId: KeyId;
}

/**
 * Baut den Körper eines Belegs mit `v: 1`. Felder ohne Wert werden weggelassen, nie `null`;
 * `Decision.matchedRules` wird zu `decision.rules`.
 *
 * Zusagen: Das Ergebnis besteht `receiptBodySchema`; es enthält keine Inhalte von Nachrichten.
 * Fehler: `PaiBotError("eingabe_ungueltig")`, wenn das Ergebnis das Schema nicht besteht
 * (z. B. Gleitkommazahl in den Fakten).
 */
export function buildReceipt(draft: ReceiptDraft, link: ChainLink): ReceiptBody {
  return notImplemented("receipts.buildReceipt", draft, link);
}
