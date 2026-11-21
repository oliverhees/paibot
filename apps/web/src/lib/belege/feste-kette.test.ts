/**
 * PaiBot – die Belege-Seite prüft die feste Kette aus der Zeit vor der Tor-Fassung
 * (`packages/receipts/src/testdaten/kette-vor-fassung.jsonl`, Herkunft dort im Test
 * `feste-kette.test.ts`) wie Export und Befehl: Einträge wie aus der Datenbank, ohne `parseJsonl`.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { readFileSync } from "node:fs";
import * as pruefer from "@paibot/receipts/pruefen";
import type { ReceiptEntry } from "@paibot/shared/belege";
import { ACTIVE_STANDARD_RULES, STANDARD_RULE_VERSIONS } from "@paibot/shared/tor";
import { describe, expect, it } from "vitest";
import { pruefeKette, type RegelDaten } from "./pruefung";

const DATEI = new URL(
  "../../../../../packages/receipts/src/testdaten/kette-vor-fassung.jsonl",
  import.meta.url,
);
const FASSUNGEN = STANDARD_RULE_VERSIONS.map((rule, index) => ({ ...rule, seq: index + 1 }));
const REGELN: RegelDaten = {
  stand: FASSUNGEN.length,
  fassungen: FASSUNGEN,
  aktive: FASSUNGEN.filter((rule) => ACTIVE_STANDARD_RULES.some((a) => a.id === rule.id)),
};

/** Einträge so, wie die Seite sie aus der Datenbank bekommt: nur JSON, ohne Prüfung der Form. */
function eintraege(): ReceiptEntry[] {
  const zeilen = readFileSync(DATEI, "utf8").trim().split("\n").slice(1);
  return zeilen.map((zeile) => JSON.parse(zeile) as ReceiptEntry);
}

describe("feste Kette vom Stand vor der Tor-Fassung auf der Belege-Seite", () => {
  it("jede Prüfung ok, Urteil vertrauenswürdig", async () => {
    const liste = eintraege();
    const ergebnis = await pruefeKette(liste, { regeln: REGELN }, pruefer);
    expect(ergebnis.stufe).toBe("gueltig");
    expect(ergebnis.geprueft).toBe(10);
    expect(ergebnis.fehlerSeq).toBeUndefined();
    expect(ergebnis.punkte.filter((p) => p.art === "fehler")).toEqual([]);
  });
});
