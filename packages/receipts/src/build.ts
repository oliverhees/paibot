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
import {
  type KeyChangeFacts,
  RECEIPT_VERSION,
  type ReceiptBody,
  type ReceiptResult,
  type ReceiptUndo,
  receiptBodySchema,
} from "@paibot/shared/belege";
import { invalidInput, PaiBotError } from "@paibot/shared/fehler";
import type { HmacDigest, IsoTime, Sha256Digest } from "@paibot/shared/grundtypen";
import type { InstallationId, KeyId, ReceiptId } from "@paibot/shared/ids";
import type { Decision, ListDecision } from "@paibot/shared/tor";
import { CanonicalizeError, type CanonicalValue, canonicalize } from "./canonical";

/** Inhalt eines neuen Belegs, ohne die Angaben zur Kette. */
export type ReceiptDraft =
  | {
      type: "start";
      facts: {
        installationId: InstallationId;
        publicKey: string;
        software: string;
        /** Fassung der Kette (`RECEIPT_CHAIN_FORMAT`); fehlt bei älteren Ketten. */
        format?: number;
      };
    }
  | { type: "key_change"; facts: KeyChangeFacts }
  | {
      type: "decision";
      action: ActionRequest;
      /**
       * Entscheidung des Tors; `matchedRules` wird im Beleg zu `decision.rules`. Das Tor liefert
       * immer eine `Decision` mit Regelstand; `ListDecision` bleibt für Belege älterer Form.
       */
      decision: Decision | ListDecision;
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
  const common = {
    v: RECEIPT_VERSION,
    id: link.id,
    seq: link.seq,
    time: link.time,
    prev: link.prev,
    keyId: link.keyId,
  };

  let body: Record<string, unknown>;
  switch (draft.type) {
    case "start":
    case "key_change":
      body = { ...common, type: draft.type, facts: draft.facts };
      break;
    case "decision":
      body = {
        ...common,
        type: "decision",
        action: draft.action,
        decision: {
          outcome: draft.decision.outcome,
          stage: draft.decision.stage,
          rules: draft.decision.matchedRules,
          limits: draft.decision.limits,
          preconditions: draft.decision.preconditions,
          ruleStand: draft.decision.ruleStand,
          reason: draft.decision.reason,
        },
        facts: draft.facts,
        context: draft.context,
        undo: draft.undo,
      };
      break;
    case "result":
      body = {
        ...common,
        type: "result",
        action: draft.action,
        result: draft.result,
        undo: draft.undo,
      };
      break;
    default:
      throw new PaiBotError("eingabe_ungueltig");
  }

  const clean = withoutUndefined(body) as Record<string, unknown>;
  const parsed = receiptBodySchema.safeParse(clean);
  if (!parsed.success) throw invalidInput(parsed.error, clean);
  try {
    canonicalize(clean as CanonicalValue);
  } catch (error) {
    if (error instanceof CanonicalizeError)
      throw new PaiBotError("eingabe_ungueltig", { cause: error });
    throw error;
  }
  return clean as unknown as ReceiptBody;
}

/**
 * Kopiert Objekte und Listen ohne Felder mit dem Wert `undefined`, damit optionale Angaben im
 * Beleg fehlen statt leer zu sein. Andere Werte bleiben unverändert.
 */
function withoutUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutUndefined);
  if (value === null || typeof value !== "object") return value;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  const copy: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) copy[key] = withoutUndefined(entry);
  }
  return copy;
}
