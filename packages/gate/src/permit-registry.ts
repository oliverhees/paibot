/**
 * PaiBot – Ausstellen und Zurückziehen von Berechtigungen. Nur intern im Tor, nicht exportiert.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { ActionRequest, ActionType, Facts } from "@paibot/shared/aktionen";
import type { IsoTime } from "@paibot/shared/grundtypen";
import type { ReceiptId } from "@paibot/shared/ids";
import type { GatePermit } from "@paibot/shared/tor";

/** Alle gerade gültigen Berechtigungen. Nur Objekte in dieser Menge sind echt. */
const issued = new WeakSet<object>();

function deepFreeze<V>(value: V): V {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}

/** Stellt eine Berechtigung aus. Ziel und Fakten werden kopiert und eingefroren. */
export function issuePermit<T extends ActionType>(
  action: ActionRequest<T>,
  facts: Facts<T>,
  decisionReceiptId: ReceiptId,
  issuedAt: IsoTime,
): GatePermit<T> {
  const permit = deepFreeze({
    actionId: action.actionId,
    action: action.type,
    actor: action.actor,
    target: structuredClone(action.target),
    facts: structuredClone(facts),
    decisionReceiptId,
    issuedAt,
  });
  issued.add(permit);
  return permit as unknown as GatePermit<T>;
}

/** Zieht eine Berechtigung zurück; danach erkennt `isGatePermit` sie nicht mehr. */
export function revokePermit(permit: object): void {
  issued.delete(permit);
}

/** Ist das Objekt eine gerade gültige, vom Tor ausgestellte Berechtigung? */
export function isIssuedPermit(value: unknown): value is object {
  return typeof value === "object" && value !== null && issued.has(value);
}
