/**
 * PaiBot – Test-Zugang des Tors: Berechtigungen für Tests auf demselben Weg wie im Tor ausstellen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import {
  ACTIONS,
  type ActionRequest,
  type ActionType,
  actionRequestSchema,
  type Facts,
} from "@paibot/shared/aktionen";
import { invalidInput } from "@paibot/shared/fehler";
import { toIsoTime } from "@paibot/shared/grundtypen";
import { newId, type ReceiptId } from "@paibot/shared/ids";
import type { GatePermit } from "@paibot/shared/tor";
import { issuePermit, revokePermit } from "./permit-registry";

/** Zusätzliche Angaben für eine Test-Berechtigung. */
export interface TestPermitOptions {
  /** Beleg „Entscheidung“, auf den die Berechtigung verweist; ohne Angabe eine neue ID. */
  decisionReceiptId?: ReceiptId;
  /** Zeitpunkt der Ausstellung; ohne Angabe jetzt. */
  issuedAt?: Date;
}

/**
 * Nur für Tests: stellt eine Berechtigung für `action` mit `facts` aus, ohne Regeln und ohne
 * Beleg, und ruft `fn` damit auf. Aktion und Fakten werden wie in `gate.run` gegen die Verträge
 * geprüft (ungültig → `PaiBotError("eingabe_ungueltig")`, `fn` läuft nicht).
 *
 * Die Berechtigung entsteht auf demselben Weg wie im Tor (eingefroren, Ziel und Fakten kopiert,
 * `isGatePermit` erkennt sie) und gilt nur, solange `fn` läuft; danach, auch nach einem Fehler,
 * wird sie zurückgezogen.
 *
 * Produktivcode darf diesen Zugang nicht importieren; eine Lint-Regel lässt ihn nur in Tests zu.
 */
export async function withTestPermit<T extends ActionType, R>(
  action: ActionRequest<T>,
  facts: Facts<T>,
  fn: (permit: GatePermit<T>) => R | Promise<R>,
  options: TestPermitOptions = {},
): Promise<R> {
  const parsedAction = actionRequestSchema.safeParse(action);
  if (!parsedAction.success) throw invalidInput(parsedAction.error, action);
  const checkedAction = parsedAction.data as ActionRequest<T>;
  const parsedFacts = ACTIONS[checkedAction.type].facts.safeParse(facts);
  if (!parsedFacts.success) throw invalidInput(parsedFacts.error, facts);

  const permit = issuePermit(
    checkedAction,
    parsedFacts.data as Facts<T>,
    options.decisionReceiptId ?? newId("receipt"),
    toIsoTime(options.issuedAt ?? new Date()),
  );
  try {
    return await fn(permit);
  } finally {
    revokePermit(permit);
  }
}
