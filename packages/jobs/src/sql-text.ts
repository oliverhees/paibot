/**
 * PaiBot – Brücke von einer offenen Datenbank-Transaktion zur Warteschlange: SQL mit Parametern
 * wird zu reinem Text mit sicheren Literalen, den jede Verbindung oder Transaktion ausführen kann.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { randomBytes } from "node:crypto";
import type { SqlExecutor } from "./vertrag";

/**
 * Führt eine SQL-Anweisung als reinen Text aus (ohne Parameter) und liefert die Zeilen, entweder
 * als Liste oder als Objekt mit `rows`. So arbeiten z. B. `tx.execute(text)` einer
 * Drizzle-Transaktion (postgres-js: Liste, PGlite: `{ rows }`) oder `client.query(text)`.
 */
export type SqlTextRunner = (text: string) => Promise<unknown>;

/** Nur Ziffern, Buchstaben und Unterstrich: ein Tag für Dollar-Anführungszeichen. */
const TAG_ZEICHEN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function istWortzeichen(zeichen: string | undefined): boolean {
  return zeichen !== undefined && /[A-Za-z0-9_$]/.test(zeichen);
}

/**
 * Text in Dollar-Anführungszeichen mit einem zufälligen Tag, das im Text nicht vorkommt. Ein
 * solches Literal hängt weder von `standard_conforming_strings` noch von Rückstrichen ab: Der
 * Inhalt wird von Postgres unverändert übernommen.
 */
function textLiteral(wert: string): string {
  if (wert.includes("\u0000")) {
    throw new TypeError("SQL-Parameter: Text mit NUL-Zeichen ist nicht erlaubt.");
  }
  for (;;) {
    const tag = `pb_${randomBytes(6).toString("hex")}`;
    const klammer = `$${tag}$`;
    if (!wert.includes(klammer)) return `${klammer}${wert}${klammer}`;
  }
}

/** Ein Wert als SQL-Literal. Erlaubt sind Text, endliche Zahlen, Wahrheitswerte, Zeit und leer. */
export function sqlLiteral(wert: unknown): string {
  if (wert === null || wert === undefined) return "NULL";
  if (typeof wert === "boolean") return wert ? "TRUE" : "FALSE";
  if (typeof wert === "number") {
    if (!Number.isFinite(wert)) {
      throw new TypeError("SQL-Parameter: nur endliche Zahlen sind erlaubt.");
    }
    return wert < 0 || Object.is(wert, -0) ? `(${wert})` : String(wert);
  }
  if (typeof wert === "bigint") return wert < 0n ? `(${wert})` : String(wert);
  if (typeof wert === "string") return textLiteral(wert);
  if (wert instanceof Date) {
    if (Number.isNaN(wert.getTime())) throw new TypeError("SQL-Parameter: ungültige Zeit.");
    return textLiteral(wert.toISOString());
  }
  throw new TypeError(`SQL-Parameter: Werte der Art „${typeof wert}“ werden nicht unterstützt.`);
}

/** Länge eines Dollar-Anführungszeichens ab `start` (`$$` oder `$tag$`), sonst 0. */
function dollarKlammer(text: string, start: number): number {
  const ende = text.indexOf("$", start + 1);
  if (ende < 0) return 0;
  const tag = text.slice(start + 1, ende);
  if (tag !== "" && !TAG_ZEICHEN.test(tag)) return 0;
  return ende - start + 1;
}

/**
 * Setzt die Parameter `$1`, `$2`, … als Literale in den SQL-Text ein. Platzhalter in Texten,
 * Namen in doppelten Anführungszeichen, Dollar-Anführungszeichen und Kommentaren bleiben
 * unberührt. Ein Platzhalter ohne Wert wirft.
 */
export function inlineSqlParameters(text: string, values: readonly unknown[] = []): string {
  let aus = "";
  let i = 0;
  while (i < text.length) {
    const zeichen = text[i] as string;
    const naechstes = text[i + 1];

    // Kommentar bis Zeilenende
    if (zeichen === "-" && naechstes === "-") {
      const ende = text.indexOf("\n", i);
      const bis = ende < 0 ? text.length : ende;
      aus += text.slice(i, bis);
      i = bis;
      continue;
    }
    // Block-Kommentar, auch verschachtelt
    if (zeichen === "/" && naechstes === "*") {
      let tiefe = 0;
      let j = i;
      while (j < text.length) {
        if (text[j] === "/" && text[j + 1] === "*") {
          tiefe += 1;
          j += 2;
        } else if (text[j] === "*" && text[j + 1] === "/") {
          tiefe -= 1;
          j += 2;
          if (tiefe === 0) break;
        } else j += 1;
      }
      aus += text.slice(i, j);
      i = j;
      continue;
    }
    // Text in einfachen Anführungszeichen ('' ist ein Zeichen; bei E'…' auch Rückstriche)
    if (zeichen === "'") {
      const mitRueckstrich = /[eE]/.test(text[i - 1] ?? "") && !istWortzeichen(text[i - 2]);
      let j = i + 1;
      while (j < text.length) {
        if (mitRueckstrich && text[j] === "\\") {
          j += 2;
          continue;
        }
        if (text[j] === "'") {
          if (text[j + 1] === "'") {
            j += 2;
            continue;
          }
          break;
        }
        j += 1;
      }
      aus += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    // Name in doppelten Anführungszeichen
    if (zeichen === '"') {
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === '"') {
          if (text[j + 1] === '"') {
            j += 2;
            continue;
          }
          break;
        }
        j += 1;
      }
      aus += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (zeichen === "$" && !istWortzeichen(text[i - 1])) {
      // Platzhalter $1, $2, …
      const treffer = /^\$(\d+)/.exec(text.slice(i));
      if (treffer) {
        const nummer = Number(treffer[1]);
        if (nummer < 1 || nummer > values.length) {
          throw new RangeError(`SQL-Parameter $${nummer} hat keinen Wert.`);
        }
        aus += sqlLiteral(values[nummer - 1]);
        i += treffer[0].length;
        continue;
      }
      // Text in Dollar-Anführungszeichen
      const laenge = dollarKlammer(text, i);
      if (laenge > 0) {
        const klammer = text.slice(i, i + laenge);
        const ende = text.indexOf(klammer, i + laenge);
        const bis = ende < 0 ? text.length : ende + laenge;
        aus += text.slice(i, bis);
        i = bis;
        continue;
      }
    }
    aus += zeichen;
    i += 1;
  }
  return aus;
}

function zeilenAus(ergebnis: unknown): unknown[] {
  if (Array.isArray(ergebnis)) return [...ergebnis];
  if (
    ergebnis !== null &&
    typeof ergebnis === "object" &&
    Array.isArray((ergebnis as { rows?: unknown }).rows)
  ) {
    return (ergebnis as { rows: unknown[] }).rows;
  }
  throw new TypeError("SQL-Ergebnis ohne Zeilen.");
}

/**
 * Macht aus einer Funktion, die reinen SQL-Text ausführt, einen `SqlExecutor` für
 * `enqueueRun(…, { executor })`. Damit landet der Auftrag in der Transaktion des Aufrufers:
 *
 * ```ts
 * await db.transaction(async (tx) => {
 *   // … Nachricht, Lauf, Ereignisse …
 *   await queue.enqueueRun(job, { executor: textSqlExecutor((text) => tx.execute(text)) });
 * });
 * ```
 *
 * Die Parameter werden als Literale eingesetzt (`inlineSqlParameters`); Werte anderer Art als
 * Text, Zahl, Wahrheitswert, Zeit oder leer lehnt die Brücke ab, statt sie zu raten.
 */
export function textSqlExecutor(run: SqlTextRunner): SqlExecutor {
  return {
    executeSql: async (text, values) => ({
      rows: zeilenAus(await run(inlineSqlParameters(text, values ?? []))),
    }),
  };
}
