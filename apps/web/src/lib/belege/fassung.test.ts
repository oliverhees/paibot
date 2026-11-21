/**
 * PaiBot – die Belege-Seite urteilt über Belege anderer Fassungen des Tors genauso wie Export und
 * Befehl `belege:pruefen`: Einträge wie aus der Datenbank, ohne `parseJsonl`.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { CLI_EXIT, runCli } from "@paibot/receipts";
import * as pruefer from "@paibot/receipts/pruefen";
import { parseJsonl, verifyChain } from "@paibot/receipts/pruefen";
import type { ReceiptEntry } from "@paibot/shared/belege";
import { t } from "@paibot/shared/texte";
import { describe, expect, it } from "vitest";
import {
  alsFassung1,
  FASSUNG_RULES,
  ketteNeuereFassung,
  ketteUnbekanntesFeld,
  TestKette,
  unbekannteAktion,
} from "../../../../../packages/receipts/src/testdaten/fassung-ketten";
import {
  type KettenErgebnis,
  pruefeEinzeln,
  pruefeKette,
  type RegelDaten,
  urteilZustand,
  zeilenStand,
} from "./pruefung";

const REGELN: RegelDaten = { stand: 1, aktive: FASSUNG_RULES, fassungen: FASSUNG_RULES };

/** So kommen die Einträge auf der Seite an: aus der Datenbank, ohne Prüfung der Form. */
function ausDatenbank(kette: TestKette): ReceiptEntry[] {
  return JSON.parse(JSON.stringify(kette.entries)) as ReceiptEntry[];
}

async function seite(kette: TestKette): Promise<KettenErgebnis> {
  return pruefeKette(ausDatenbank(kette), { regeln: REGELN }, pruefer);
}

async function export_(kette: TestKette) {
  const { entries } = parseJsonl(await kette.text());
  return verifyChain(entries, { rules: FASSUNG_RULES });
}

async function befehl(kette: TestKette): Promise<number> {
  const text = await kette.text();
  return runCli(["kette.jsonl"], { readFile: async () => text, out: () => {}, err: () => {} });
}

describe("Belege-Seite und Fassung des Tors", () => {
  it("neuere Fassung (unbekanntes Feld, Aktion, Ergebnis, Code): überall nicht prüfbar", async () => {
    const kette = await ketteNeuereFassung();
    const ergebnis = await seite(kette);
    expect(ergebnis.stufe).toBe("nicht_pruefbar");
    expect(ergebnis.titel).toBe(t("belege.urteil.nicht_pruefbar"));
    expect(ergebnis.punkte).toContainEqual({
      art: "hinweis",
      text: `${t("belege.problem.fassung_unbekannt")} ${t("belege.stelle", { kennung: "B-0002" })}`,
    });
    expect((await export_(kette)).verdict.level).toBe("nicht_pruefbar");
    expect(await befehl(kette)).toBe(CLI_EXIT.nichtPruefbar);
    expect(zeilenStand(2, ergebnis).art).toBe("warn");
  });

  it("nicht prüfbar: Nachrechnen und Zuordnung stehen nicht mit grünem Haken da", async () => {
    const kette = await ketteNeuereFassung();
    const ergebnis = await seite(kette);
    const text = (schluessel: string) => t(schluessel as never, { anzahl: 1 } as never);
    expect(ergebnis.punkte).toContainEqual({
      art: "hinweis",
      text: text("belege.geprueft.entscheidung_nicht_pruefbar"),
    });
    expect(ergebnis.punkte).toContainEqual({
      art: "hinweis",
      text: text("belege.geprueft.paare_nicht_pruefbar"),
    });
    for (const schluessel of ["belege.geprueft.entscheidung", "belege.geprueft.paare"]) {
      expect(ergebnis.punkte.some((p) => p.text === t(schluessel as never))).toBe(false);
    }
    expect(ergebnis.punkte.filter((p) => p.art === "ok").map((p) => p.text)).toEqual([
      t("belege.geprueft.inhalt", { anzahl: 3 }),
      t("belege.geprueft.signatur"),
      t("belege.geprueft.kette", { bis: "B-0003" }),
    ]);
  });

  it("Aktion außerhalb von Fassung 1 ohne Fassungsangabe: überall ungültig", async () => {
    const kette = await TestKette.neu();
    const action = await kette.decision(undefined, unbekannteAktion);
    await kette.result(action, { status: "ok" }, unbekannteAktion);
    expect((await seite(kette)).stufe).toBe("ungueltig");
    expect((await export_(kette)).verdict.level).toBe("ungueltig");
    expect(await befehl(kette)).toBe(CLI_EXIT.ungueltig);
  });

  it("unbekanntes Feld in Fassung 1, auch neben Fassung 99: überall ungültig", async () => {
    for (const auchNeuere of [false, true]) {
      const kette = await ketteUnbekanntesFeld(auchNeuere);
      const ergebnis = await seite(kette);
      expect(ergebnis.stufe, String(auchNeuere)).toBe("ungueltig");
      expect(ergebnis.fehlerSeq).toBe(2);
      expect((await export_(kette)).verdict.level).toBe("ungueltig");
      expect(await befehl(kette)).toBe(CLI_EXIT.ungueltig);
    }
  });

  it("Rückschritt erscheint als Warnung: Warn-Ansicht, Punkt Fehler, die Stufe bleibt gültig", async () => {
    const kette = await TestKette.neu();
    const a = await kette.decision();
    await kette.result(a);
    const b = await kette.decision(undefined, alsFassung1);
    await kette.result(b);
    const ergebnis = await seite(kette);
    expect(ergebnis.stufe).toBe("gueltig");
    expect(ergebnis.warnung).toBe(true);
    expect(urteilZustand(ergebnis.stufe, ergebnis.warnung)).toBe("gebrochen");
    expect(urteilZustand("gueltig")).toBe("gueltig");
    const punkt = ergebnis.punkte.find((p) =>
      p.text.startsWith(t("belege.warnung.fassung_rueckschritt")),
    );
    expect(punkt?.art).toBe("fehler");
    expect(t("belege.warnung.fassung_rueckschritt")).toBe(
      "Warnung: Nach einem Beleg einer neueren Tor-Fassung folgt einer einer älteren. Das kann beim Zurückgehen auf eine ältere PaiBot-Fassung oder kurz beim Update passieren. Ist beides nicht geschehen, ist das ein Warnzeichen.",
    );
  });

  it("Beleg prüfen (einzeln): Entscheidung aus Fassung 99 nicht prüfbar, Ergebnis mit Hinweis auf die Kette", async () => {
    const kette = await ketteNeuereFassung();
    const liste = ausDatenbank(kette);
    const daten = (seq: number) => ({
      beleg: liste[seq - 1] as ReceiptEntry,
      ...(seq > 1 ? { vorgaenger: liste[seq - 2] as ReceiptEntry } : {}),
      ...(seq < liste.length ? { nachfolger: liste[seq] as ReceiptEntry } : {}),
      schluesselBelege: [liste[0] as ReceiptEntry],
      regeln: REGELN,
    });
    const entscheidung = await pruefeEinzeln(daten(2), pruefer);
    expect(entscheidung.stufe).toBe("nicht_pruefbar");
    expect(entscheidung.titel).toBe(t("belege.einzel.nicht_pruefbar"));
    const ergebnis = await pruefeEinzeln(daten(3), pruefer);
    expect(ergebnis.punkte).toContainEqual({
      art: "hinweis",
      text: t("belege.einzel.ergebnis_kette"),
    });
  });
});
