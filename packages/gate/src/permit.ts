/**
 * PaiBot – Berechtigungen des Tors erkennen. Ausgestellt werden sie nur im Tor selbst.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { ActionType } from "@paibot/shared/aktionen";
import type { GatePermit } from "@paibot/shared/tor";
import { notImplemented } from "@paibot/stub";

/**
 * Prüft zur Laufzeit, ob `value` eine echte, von diesem Tor ausgestellte Berechtigung ist (nicht
 * nur ein Objekt mit denselben Feldern), optional für eine bestimmte Aktion. Die Anbieter-Schicht
 * gibt ohne `true` kein Modell heraus.
 */
export function isGatePermit<T extends ActionType>(
  value: unknown,
  action?: T,
): value is GatePermit<T> {
  return notImplemented("gate.isGatePermit", value, action);
}
