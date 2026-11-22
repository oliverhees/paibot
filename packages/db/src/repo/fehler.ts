/**
 * PaiBot – Fehler aus der Datenbank lesen und in die Fehlercodes der Verträge übersetzen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { PaiBotError, type RunStatus } from "@paibot/shared";

/** SQLSTATE-Klassen, die die Zugriffsfunktionen übersetzen. */
export const SQLSTATE = {
  fremdschluessel: "23503",
  /** Löschen verhindert durch `on delete restrict`; Postgres meldet je nach Fall 23001 oder 23503. */
  verhindert: "23001",
  eindeutig: "23505",
  pruefbedingung: "23514",
} as const;

/** Name des Teil-Index, der höchstens einen aktiven Lauf je Unterhaltung zulässt. */
export const AKTIVER_LAUF_INDEX = "runs_ein_offener_lauf_je_unterhaltung";

export interface PgFehler {
  code?: string;
  constraint?: string;
}

/** Liest SQLSTATE und Constraint-Namen aus dem Fehler des Treibers (auch wenn Drizzle ihn einpackt). */
export function pgFehler(fehler: unknown): PgFehler {
  let aktuell: unknown = fehler;
  for (let tiefe = 0; tiefe < 5 && typeof aktuell === "object" && aktuell !== null; tiefe++) {
    const objekt = aktuell as Record<string, unknown>;
    if (typeof objekt.code === "string" && /^[0-9A-Z]{5}$/.test(objekt.code)) {
      const constraint = objekt.constraint ?? objekt.constraint_name;
      return {
        code: objekt.code,
        ...(typeof constraint === "string" ? { constraint } : {}),
      };
    }
    aktuell = objekt.cause;
  }
  return {};
}

/** Eingabefehler für ein einzelnes Feld, etwa ein doppelter Name. */
export function feldFehler(feld: string): PaiBotError {
  return new PaiBotError("eingabe_ungueltig", { felder: [{ feld, code: "ungueltig" }] });
}

/**
 * Führt die Arbeit aus und übersetzt Datenbankfehler. Liefert `zuordnen` keinen Fehler,
 * wird der ursprüngliche Fehler unverändert weitergegeben.
 */
export async function uebersetzen<T>(
  arbeit: () => Promise<T>,
  zuordnen: (fehler: PgFehler) => PaiBotError | undefined,
): Promise<T> {
  try {
    return await arbeit();
  } catch (fehler) {
    if (fehler instanceof PaiBotError) throw fehler;
    const uebersetzt = zuordnen(pgFehler(fehler));
    if (uebersetzt === undefined) throw fehler;
    throw uebersetzt;
  }
}

/** Standard-Abbildung: fehlender Verweis = nicht gefunden, verletzte Prüfbedingung = ungültige Eingabe. */
export function standardFehler(fehler: PgFehler): PaiBotError | undefined {
  if (fehler.code === SQLSTATE.fremdschluessel) return new PaiBotError("nicht_gefunden");
  if (fehler.code === SQLSTATE.pruefbedingung) {
    return new PaiBotError("eingabe_ungueltig", {
      felder: [{ feld: "eingabe", code: "ungueltig" }],
    });
  }
  return undefined;
}

/**
 * Ein Statuswechsel, den der Ablauf nicht kennt (etwa ein beendeter Lauf, der wieder startet).
 * Das ist ein Fehler im Aufrufer, die Oberfläche bekommt nur `intern`.
 */
export class StatuswechselError extends PaiBotError {
  readonly gegenstand: "lauf" | "nachricht" | "werkzeug";
  readonly gegenstandId: string;
  readonly von: RunStatus | string;
  readonly nach: RunStatus | string;

  constructor(
    gegenstand: "lauf" | "nachricht" | "werkzeug",
    gegenstandId: string,
    von: RunStatus | string,
    nach: RunStatus | string,
  ) {
    super("intern");
    this.name = "StatuswechselError";
    this.message = `Unerlaubter Statuswechsel (${gegenstand} ${gegenstandId}): ${von} -> ${nach}`;
    this.gegenstand = gegenstand;
    this.gegenstandId = gegenstandId;
    this.von = von;
    this.nach = nach;
  }
}
