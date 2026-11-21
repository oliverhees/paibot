/**
 * PaiBot – alle Fassungen der Tor-Auswertung. Das Tor entscheidet immer mit `GATE_FORMAT`; das
 * Nachrechnen eines Belegs nimmt die Fassung des Belegs.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { GATE_FORMAT } from "@paibot/shared/tor";
import { GATE_FORMAT_1 } from "./fassung-1";
import type { GateFormatSpec } from "./typ";

export type { EvaluatedRule, FormatLimitFn, FormatPrecondition, GateFormatSpec } from "./typ";

/** Eingefrorene Beschreibung je Fassung. Eine Fassung wird nie geändert, nur neue kommen dazu. */
export const GATE_FORMATS: Readonly<Record<1, GateFormatSpec>> = { 1: GATE_FORMAT_1 };

/** Höchste Fassung, die dieser Stand kennt. */
export const KNOWN_GATE_FORMAT = Math.max(...Object.keys(GATE_FORMATS).map(Number));

/** Beschreibung der Fassung `format`; `undefined`, wenn dieser Stand sie nicht kennt. */
export function gateFormatSpec(format: number): GateFormatSpec | undefined {
  return Object.hasOwn(GATE_FORMATS, format)
    ? GATE_FORMATS[format as keyof typeof GATE_FORMATS]
    : undefined;
}

/** Die Fassung, mit der das Tor jetzt entscheidet. */
export function currentGateFormat(): GateFormatSpec {
  const spec = gateFormatSpec(GATE_FORMAT);
  if (spec === undefined) throw new TypeError(`Fassung ${GATE_FORMAT} fehlt.`);
  return spec;
}
