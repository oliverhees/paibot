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

/**
 * Eine Grenze: rein, ohne I/O. Liefert immer genau einen `LimitCheck` mit ihrem Namen; für
 * Aktionen, die sie nicht betrifft, mit `result: "entfaellt"`.
 */
export type LimitFn = (action: ActionRequest, facts: Facts) => LimitCheck;

/** Reihenfolge der Grenzen in jeder Entscheidung: G-01 bis G-05. */
export const LIMIT_ORDER: readonly LimitName[] = LIMIT_NAMES;

type FactRecord = Readonly<Record<string, unknown>>;

/** Liest einen Fakt nur, wenn er wirklich in den Fakten steht (nicht aus dem Prototyp). */
function fact(facts: Facts, name: string): unknown {
  const record = facts as unknown as FactRecord;
  return Object.hasOwn(record, name) ? record[name] : undefined;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function check(name: LimitName, ok: boolean, value?: string | number | boolean): LimitCheck {
  const result: LimitCheck = { name, result: ok ? "ok" : "verletzt" };
  if (value !== undefined) result.value = value;
  return result;
}

function notApplicable(name: LimitName): LimitCheck {
  return { name, result: "entfaellt" };
}

function scalarOrUndefined(value: unknown): string | number | boolean | undefined {
  if (typeof value === "string") return value.slice(0, 200);
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  return undefined;
}

/**
 * G-01 `schleuse_gefordert`: betrifft `modell.anfragen`. Ist `requestedMode` `on`, muss `route`
 * `schleuse` sein und `schleuseReachable` gelten, sonst `verletzt` (kein Rückfall auf direkt).
 * Bei `off` `ok`. `value`: die Route.
 */
export function limitSchleuseGefordert(action: ActionRequest, facts: Facts): LimitCheck {
  const name = "schleuse_gefordert";
  if (action.type !== "modell.anfragen") return notApplicable(name);
  const mode = fact(facts, "requestedMode");
  const route = fact(facts, "route");
  const value = scalarOrUndefined(route);
  if (mode === "off") return check(name, true, value);
  // Alles außer ausdrücklich „aus“ verlangt die Datenschleuse (auch ein fehlender Modus).
  return check(name, route === "schleuse" && fact(facts, "schleuseReachable") === true, value);
}

/**
 * G-02 `anbieter_region`: betrifft `modell.anfragen`. `providerEnabled` muss gelten und `region`
 * `eu` oder `local` sein; `non_eu` ist `verletzt`. `value`: die Region.
 */
export function limitAnbieterRegion(action: ActionRequest, facts: Facts): LimitCheck {
  const name = "anbieter_region";
  if (action.type !== "modell.anfragen") return notApplicable(name);
  const region = fact(facts, "region");
  const allowed = region === "eu" || region === "local";
  return check(name, fact(facts, "providerEnabled") === true && allowed, scalarOrUndefined(region));
}

/**
 * G-03 `laenge`: betrifft `nachricht.senden` und `modell.anfragen`. `inputChars` höchstens
 * `maxInputChars`; bei `modell.anfragen` zusätzlich `maxOutputTokens` höchstens
 * `botMaxOutputTokens`. `value`: `inputChars`.
 */
export function limitLaenge(action: ActionRequest, facts: Facts): LimitCheck {
  const name = "laenge";
  if (action.type !== "nachricht.senden" && action.type !== "modell.anfragen") {
    return notApplicable(name);
  }
  const inputChars = fact(facts, "inputChars");
  const maxInputChars = fact(facts, "maxInputChars");
  let ok = isCount(inputChars) && isCount(maxInputChars) && inputChars <= maxInputChars;
  if (action.type === "modell.anfragen") {
    const maxOutput = fact(facts, "maxOutputTokens");
    const botMaxOutput = fact(facts, "botMaxOutputTokens");
    ok = ok && isCount(maxOutput) && isCount(botMaxOutput) && maxOutput <= botMaxOutput;
  }
  return check(name, ok, isCount(inputChars) ? inputChars : undefined);
}

/**
 * G-04 `tagesbudget`: betrifft `modell.anfragen`. Ohne `dailyTokenBudget` `entfaellt`; sonst muss
 * `tokensToday` kleiner als das Budget sein. `value`: `tokensToday`.
 */
export function limitTagesbudget(action: ActionRequest, facts: Facts): LimitCheck {
  const name = "tagesbudget";
  if (action.type !== "modell.anfragen") return notApplicable(name);
  const budget = fact(facts, "dailyTokenBudget");
  if (budget === undefined) return notApplicable(name);
  const tokensToday = fact(facts, "tokensToday");
  return check(
    name,
    isCount(budget) && isCount(tokensToday) && tokensToday < budget,
    isCount(tokensToday) ? tokensToday : undefined,
  );
}

/**
 * G-05 `not_aus`: betrifft jede Aktion mit dem Fakt `killSwitch` (`nachricht.senden`,
 * `modell.anfragen`). Ist er gesetzt, `verletzt`. `value`: der Schalter.
 */
export function limitNotAus(action: ActionRequest, facts: Facts): LimitCheck {
  const name = "not_aus";
  const killSwitch = fact(facts, "killSwitch");
  const concerned =
    action.type === "nachricht.senden" ||
    action.type === "modell.anfragen" ||
    killSwitch !== undefined;
  if (!concerned) return notApplicable(name);
  // Nur ein ausdrückliches `false` lässt die Aktion durch; ein fehlender Schalter gilt als an.
  return check(
    name,
    killSwitch === false,
    typeof killSwitch === "boolean" ? killSwitch : undefined,
  );
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
  return LIMIT_ORDER.map((name) => LIMIT_FUNCTIONS[name](action, facts));
}
