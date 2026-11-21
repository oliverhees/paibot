/**
 * PaiBot – Grenzen des Tors (G-01 bis G-05, G-16 bis G-18) als kleine, reine Funktionen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { ActionRequest, Facts } from "@paibot/shared/aktionen";
import { GATE_FORMAT, type GateLimitName, type LimitCheck } from "@paibot/shared/tor";
import { currentGateFormat, gateFormatSpec } from "../fassungen/index";

/**
 * Eine Grenze: rein, ohne I/O. Liefert immer genau einen `LimitCheck` mit ihrem Namen; für
 * Aktionen, die sie nicht betrifft, mit `result: "entfaellt"`.
 *
 * Die Grenzen hier sind die der aktuellen Fassung (`GATE_FORMAT`, `currentGateFormat()`); die
 * eingefrorenen Umsetzungen stehen in `../fassungen/`. Ob eine Aktion einen Fakt kennt (G-05),
 * richtet sich nach der Aktionsliste der Fassung, nicht nach den heutigen Verträgen.
 */
export type LimitFn = (action: ActionRequest, facts: Facts) => LimitCheck;

// Beim Laden nicht werfen: Kennt dieser Stand `GATE_FORMAT` nicht (nur in Tests mit verstellter
// Fassung möglich), bleiben Liste und Funktionen leer, und `checkLimits` meldet den Fehler.
const CURRENT = gateFormatSpec(GATE_FORMAT);

/** Reihenfolge der Grenzen in jeder Entscheidung (die der aktuellen Fassung). */
export const LIMIT_ORDER: readonly GateLimitName[] = CURRENT?.limitOrder ?? [];

/** Alle Grenzen der aktuellen Fassung nach Namen. */
export const LIMIT_FUNCTIONS = (CURRENT?.limits ?? {}) as Readonly<Record<GateLimitName, LimitFn>>;

/**
 * G-01 `schleuse_gefordert`: betrifft `modell.anfragen`. Ist `requestedMode` `on`, muss `route`
 * `schleuse` sein und `schleuseReachable` gelten, sonst `verletzt` (kein Rückfall auf direkt).
 * Bei `off` `ok`. `value`: die Route.
 */
export const limitSchleuseGefordert: LimitFn = LIMIT_FUNCTIONS.schleuse_gefordert;

/**
 * G-02 `anbieter_region`: betrifft `modell.anfragen`. `providerEnabled` muss gelten und `region`
 * `eu` oder `local` sein; `non_eu` ist `verletzt`. `value`: die Region.
 */
export const limitAnbieterRegion: LimitFn = LIMIT_FUNCTIONS.anbieter_region;

/**
 * G-03 `laenge`: betrifft `nachricht.senden` und `modell.anfragen`. `inputChars` höchstens
 * `maxInputChars`; bei `modell.anfragen` zusätzlich `maxOutputTokens` höchstens
 * `botMaxOutputTokens`. `value`: `inputChars`.
 */
export const limitLaenge: LimitFn = LIMIT_FUNCTIONS.laenge;

/**
 * G-04 `tagesbudget`: betrifft `modell.anfragen`. Ohne `dailyTokenBudget` `entfaellt`; sonst muss
 * `tokensToday` kleiner als das Budget sein. `value`: `tokensToday`.
 */
export const limitTagesbudget: LimitFn = LIMIT_FUNCTIONS.tagesbudget;

/**
 * G-05 `not_aus`: betrifft jede Aktion, deren Fakten laut Fassung `killSwitch` kennen
 * (`nachricht.senden`, `modell.anfragen`, `werkzeug.aufrufen`, …), und jede, die ihn trotzdem
 * mitbringt. Ist er gesetzt oder fehlt er, `verletzt`. `value`: der Schalter.
 */
export const limitNotAus: LimitFn = LIMIT_FUNCTIONS.not_aus;

/**
 * G-16 `lauf_schritte`: betrifft `modell.anfragen`. `step` kleiner als `maxSteps`; fehlt ein
 * Fakt oder ist er keine Ganzzahl ab 0, `verletzt`. `value`: `step`.
 */
export const limitLaufSchritte: LimitFn = LIMIT_FUNCTIONS.lauf_schritte;

/**
 * G-17 `lauf_aufrufe`: betrifft die Aktionen in `TOOL_GATE_ACTIONS`. `callsInRun` kleiner als
 * `maxCallsPerRun`; fehlt ein Fakt oder ist er keine Ganzzahl ab 0, `verletzt`. `value`:
 * `callsInRun`.
 */
export const limitLaufAufrufe: LimitFn = LIMIT_FUNCTIONS.lauf_aufrufe;

/**
 * G-18 `lauf_token`: betrifft `modell.anfragen`. `runTokens + stepTokenEstimate` höchstens
 * `maxRunTokens`; fehlt ein Fakt oder ist er keine Ganzzahl ab 0, `verletzt`. `value`: die Summe
 * (nur wenn beide Summanden Zahlen sind).
 */
export const limitLaufToken: LimitFn = LIMIT_FUNCTIONS.lauf_token;

/** Prüft alle Grenzen in der Reihenfolge `LIMIT_ORDER` (je Grenze genau ein Eintrag). */
export function checkLimits(action: ActionRequest, facts: Facts): LimitCheck[] {
  return currentGateFormat().checkLimits(action, facts);
}
