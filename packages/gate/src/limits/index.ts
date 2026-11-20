/**
 * PaiBot – Grenzen des Tors (G-01 bis G-05) als kleine, reine Funktionen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { ActionRequest, Facts } from "@paibot/shared/aktionen";
import { LIMIT_NAMES, type LimitCheck, type LimitName } from "@paibot/shared/tor";
import { notImplemented } from "@paibot/stub";

/**
 * Eine Grenze: rein, ohne I/O. Liefert immer genau einen `LimitCheck` mit ihrem Namen; für
 * Aktionen, die sie nicht betrifft, mit `result: "entfaellt"`.
 */
export type LimitFn = (action: ActionRequest, facts: Facts) => LimitCheck;

/** Reihenfolge der Grenzen in jeder Entscheidung: G-01 bis G-05. */
export const LIMIT_ORDER: readonly LimitName[] = LIMIT_NAMES;

/**
 * G-01 `schleuse_gefordert`: betrifft `modell.anfragen`. Ist `requestedMode` `on`, muss `route`
 * `schleuse` sein und `schleuseReachable` gelten, sonst `verletzt` (kein Rückfall auf direkt).
 * Bei `off` `ok`. `value`: die Route.
 */
export function limitSchleuseGefordert(action: ActionRequest, facts: Facts): LimitCheck {
  return notImplemented("gate.limitSchleuseGefordert", action, facts);
}

/**
 * G-02 `anbieter_region`: betrifft `modell.anfragen`. `providerEnabled` muss gelten und `region`
 * `eu` oder `local` sein; `non_eu` ist `verletzt`. `value`: die Region.
 */
export function limitAnbieterRegion(action: ActionRequest, facts: Facts): LimitCheck {
  return notImplemented("gate.limitAnbieterRegion", action, facts);
}

/**
 * G-03 `laenge`: betrifft `nachricht.senden` und `modell.anfragen`. `inputChars` höchstens
 * `maxInputChars`; bei `modell.anfragen` zusätzlich `maxOutputTokens` höchstens
 * `botMaxOutputTokens`. `value`: `inputChars`.
 */
export function limitLaenge(action: ActionRequest, facts: Facts): LimitCheck {
  return notImplemented("gate.limitLaenge", action, facts);
}

/**
 * G-04 `tagesbudget`: betrifft `modell.anfragen`. Ohne `dailyTokenBudget` `entfaellt`; sonst muss
 * `tokensToday` kleiner als das Budget sein. `value`: `tokensToday`.
 */
export function limitTagesbudget(action: ActionRequest, facts: Facts): LimitCheck {
  return notImplemented("gate.limitTagesbudget", action, facts);
}

/**
 * G-05 `not_aus`: betrifft jede Aktion mit dem Fakt `killSwitch` (`nachricht.senden`,
 * `modell.anfragen`). Ist er gesetzt, `verletzt`. `value`: der Schalter.
 */
export function limitNotAus(action: ActionRequest, facts: Facts): LimitCheck {
  return notImplemented("gate.limitNotAus", action, facts);
}

/** Alle Grenzen nach Namen. */
export const LIMIT_FUNCTIONS: Readonly<Record<LimitName, LimitFn>> = {
  schleuse_gefordert: limitSchleuseGefordert,
  anbieter_region: limitAnbieterRegion,
  laenge: limitLaenge,
  tagesbudget: limitTagesbudget,
  not_aus: limitNotAus,
};

/** Prüft alle Grenzen in der Reihenfolge `LIMIT_ORDER`; das Ergebnis hat immer fünf Einträge. */
export function checkLimits(action: ActionRequest, facts: Facts): LimitCheck[] {
  return notImplemented("gate.checkLimits", action, facts);
}
