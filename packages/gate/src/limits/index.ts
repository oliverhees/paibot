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
import type { LimitCheck, LimitName } from "@paibot/shared/tor";
import {
  limitAnbieterRegion as anbieterRegion1,
  GATE_FORMAT_1,
  limitLaenge as laenge1,
  limitNotAus as notAus1,
  limitSchleuseGefordert as schleuseGefordert1,
  limitTagesbudget as tagesbudget1,
} from "../fassungen/fassung-1";

/**
 * Eine Grenze: rein, ohne I/O. Liefert immer genau einen `LimitCheck` mit ihrem Namen; für
 * Aktionen, die sie nicht betrifft, mit `result: "entfaellt"`.
 *
 * Die Grenzen hier sind die der aktuellen Fassung (`GATE_FORMAT`, heute Fassung 1; ein Test
 * prüft, dass beides zusammenpasst); die eingefrorenen Umsetzungen stehen in `../fassungen/`. Ob eine Aktion einen Fakt kennt (G-05),
 * richtet sich nach der Aktionsliste dieser Fassung, nicht nach den heutigen Verträgen.
 */
export type LimitFn = (action: ActionRequest, facts: Facts) => LimitCheck;

/** Reihenfolge der Grenzen in jeder Entscheidung: G-01 bis G-05. */
export const LIMIT_ORDER: readonly LimitName[] = GATE_FORMAT_1.limitOrder;

/**
 * G-01 `schleuse_gefordert`: betrifft `modell.anfragen`. Ist `requestedMode` `on`, muss `route`
 * `schleuse` sein und `schleuseReachable` gelten, sonst `verletzt` (kein Rückfall auf direkt).
 * Bei `off` `ok`. `value`: die Route.
 */
export const limitSchleuseGefordert: LimitFn = schleuseGefordert1;

/**
 * G-02 `anbieter_region`: betrifft `modell.anfragen`. `providerEnabled` muss gelten und `region`
 * `eu` oder `local` sein; `non_eu` ist `verletzt`. `value`: die Region.
 */
export const limitAnbieterRegion: LimitFn = anbieterRegion1;

/**
 * G-03 `laenge`: betrifft `nachricht.senden` und `modell.anfragen`. `inputChars` höchstens
 * `maxInputChars`; bei `modell.anfragen` zusätzlich `maxOutputTokens` höchstens
 * `botMaxOutputTokens`. `value`: `inputChars`.
 */
export const limitLaenge: LimitFn = laenge1;

/**
 * G-04 `tagesbudget`: betrifft `modell.anfragen`. Ohne `dailyTokenBudget` `entfaellt`; sonst muss
 * `tokensToday` kleiner als das Budget sein. `value`: `tokensToday`.
 */
export const limitTagesbudget: LimitFn = tagesbudget1;

/**
 * G-05 `not_aus`: betrifft jede Aktion, deren Fakten laut Fassung `killSwitch` kennen
 * (`nachricht.senden`, `modell.anfragen`, `werkzeug.aufrufen`, …), und jede, die ihn trotzdem
 * mitbringt. Ist er gesetzt oder fehlt er, `verletzt`. `value`: der Schalter.
 */
export const limitNotAus: LimitFn = notAus1;

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
  return GATE_FORMAT_1.checkLimits(action, facts);
}
