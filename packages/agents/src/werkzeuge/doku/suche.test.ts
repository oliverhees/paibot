/**
 * PaiBot – Tests: Suche im Doku-Index. Feste Fragen gegen den echten Index (mit Treffer und
 * Fallen ohne Treffer), gleiche Ergebnisse bei gleicher Eingabe, Obergrenzen und Ausschnitt um
 * den ersten Treffer.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { beforeAll, describe, expect, it } from "vitest";
import { dokuIndexAusText } from "./index-laden";
import {
  bereiteIndexVor,
  type GeladenerDokuIndex,
  MAX_ABSCHNITTE,
  MAX_TEXT_JE_ABSCHNITT,
  MAX_ZEICHEN_GESAMT,
  sucheImIndex,
  woerter,
} from "./suche";
import { echterIndexText } from "./testdaten/echter-index";
import {
  abschnitt,
  FALLEN,
  GLEICHSTAND,
  GOLDEN_FAELLE,
  KLEIN,
  LANG,
  SPAETES_WORT,
  type TestAbschnitt,
  VIELE_TREFFER,
  VIELES_WORT,
} from "./testdaten/indizes";

// Die Gegenprobe im Kommentar ist die Änderung, die den Fall rot machen muss.

let echt: GeladenerDokuIndex;
beforeAll(async () => {
  echt = dokuIndexAusText(await echterIndexText());
});

const klein = (abschnitte: readonly TestAbschnitt[]) =>
  bereiteIndexVor({ version: "9.9.9-test", pruefsumme: `sha256:${"0".repeat(64)}` }, abschnitte);

describe("Feste Fragen gegen den echten Index", () => {
  // Gegenprobe: Gewichtung Titel und Text vertauschen bzw. die Bedingung „jeder Begriff“ weglassen
  // → mindestens ein Fall rot.
  for (const fall of GOLDEN_FAELLE) {
    it(`„${fall.frage}“ liefert ${fall.seite}${fall.anker === undefined ? "" : `#${fall.anker}`}`, () => {
      const treffer = sucheImIndex(echt, [fall.frage]);
      expect(treffer.length).toBeGreaterThan(0);
      expect(treffer.length).toBeLessThanOrEqual(MAX_ABSCHNITTE);
      const ids = treffer.map((t) => t.id);
      if (fall.anker === undefined) {
        expect(
          treffer.some((t) => t.seite === fall.seite),
          ids.join(", "),
        ).toBe(true);
      } else {
        expect(ids).toContain(`${fall.seite}#${fall.anker}`);
      }
    });
  }
  for (const frage of FALLEN) {
    it(`„${frage}“ findet nichts`, () => {
      expect(sucheImIndex(echt, [frage])).toEqual([]);
    });
  }
  it("andere Begriffe zählen mit: Falle als Frage, Treffer-Wort als anderer Begriff", () => {
    const [falle] = FALLEN;
    expect(sucheImIndex(echt, [falle as string, "Tagesbudget"]).length).toBeGreaterThan(0);
  });
});

describe("Gleiche Eingabe, gleiches Ergebnis", () => {
  // Gegenprobe: Sortierung über `Math.random` oder die Reihenfolge eines `Set` der Eingabe.
  it("zweimal suchen und den Index zweimal laden: dieselben Abschnitte in derselben Reihenfolge", async () => {
    const zweiter = dokuIndexAusText(await echterIndexText());
    for (const fall of GOLDEN_FAELLE) {
      const a = sucheImIndex(echt, [fall.frage]);
      expect(sucheImIndex(echt, [fall.frage])).toEqual(a);
      expect(sucheImIndex(zweiter, [fall.frage])).toEqual(a);
    }
  });

  it("Gleichstand der Punkte: Reihenfolge im Index (gleich lange Texte), sonst kürzerer Text zuerst", () => {
    expect(sucheImIndex(klein(GLEICHSTAND), ["Kompass"]).map((t) => t.anker)).toEqual([
      "erster",
      "zweiter",
    ]);
    // Andere Reihenfolge im Index: andere Rangfolge (nichts hängt an der Reihenfolge der Eingabe).
    const umgedreht = [...GLEICHSTAND].reverse();
    expect(sucheImIndex(klein(umgedreht), ["Kompass"]).map((t) => t.anker)).toEqual([
      "zweiter",
      "erster",
    ]);
    const kuerzer: TestAbschnitt[] = [
      abschnitt("g.md", "b", "B", "Ein Kompass liegt hier lang."),
      abschnitt("g.md", "a", "A", "Ein Kompass."),
    ];
    expect(sucheImIndex(klein(kuerzer), ["Kompass"]).map((t) => t.anker)).toEqual(["a", "b"]);
  });

  it("Titel vor Text: ein Begriff im Titel zählt 3, im Text 1", () => {
    const treffer = sucheImIndex(klein(VIELE_TREFFER), [VIELES_WORT]);
    expect(treffer[0]?.anker).toBe("teil-1");
  });
});

describe("Bedingungen eines Treffers", () => {
  it("jeder Begriff muss vorkommen", () => {
    expect(sucheImIndex(klein(KLEIN), ["Datenschleuse Namen"]).map((t) => t.anker)).toEqual([
      "schleuse",
    ]);
    expect(sucheImIndex(klein(KLEIN), ["Datenschleuse Telegram"])).toEqual([]);
  });

  it("die Überschriften über einem Abschnitt zählen wie sein Titel", () => {
    const seite: TestAbschnitt[] = [
      abschnitt("s.md", "kopf", "Leuchtfeuer", "Kopf."),
      abschnitt("s.md", "teil", "Teil", "Nichts darin.", ["Leuchtfeuer"]),
      abschnitt("s.md", "anders", "Anders", "Auch nichts.", ["Seite"]),
    ];
    const treffer = sucheImIndex(klein(seite), ["Leuchtfeuer"]);
    // Beide mit „Leuchtfeuer“ im Pfad treffen mit Titel-Punkten; der kürzere Text kommt zuerst.
    expect(treffer.map((t) => t.anker)).toEqual(["kopf", "teil"]);
  });

  it("ab 5 Zeichen trifft ein Begriff auch Wörter, die mit ihm beginnen oder enden; darunter nur ganze Wörter", () => {
    const abschnitte: TestAbschnitt[] = [
      abschnitt("w.md", "a", "A", "Die Einstellungen öffnen."),
      abschnitt("w.md", "b", "B", "Ein Tagesbudgetwert."),
      abschnitt("w.md", "c", "C", "Ein Notfall."),
    ];
    const index = klein(abschnitte);
    expect(sucheImIndex(index, ["stelle"]).map((t) => t.anker)).toEqual(["a"]);
    expect(sucheImIndex(index, ["Tagesbudget"]).map((t) => t.anker)).toEqual(["b"]);
    expect(sucheImIndex(index, ["Not"])).toEqual([]);
  });

  it("gleiche Wörter zählen als ein Begriff", () => {
    // „Tagesbudget“ steht nirgends; es trifft über das gleiche Wort „Tagesgrenze“.
    expect(sucheImIndex(klein(KLEIN), ["Tagesbudget"]).map((t) => t.anker)).toEqual([
      "tagesgrenze",
    ]);
  });

  it("Anfrage ohne Begriff nach dem Normalisieren (nur Stoppwörter, nur Zeichen): kein Treffer", () => {
    for (const frage of [
      "Wie ist das?",
      "Was kann PaiBot?",
      "!!! ??? ...",
      "",
      "\u{200B}\u{202E}",
    ]) {
      expect(woerter(frage), frage).toEqual([]);
      expect(sucheImIndex(echt, [frage]), frage).toEqual([]);
    }
  });
});

describe("Obergrenzen und Ausschnitt", () => {
  it("höchstens 4 Abschnitte", () => {
    expect(sucheImIndex(klein(VIELE_TREFFER), [VIELES_WORT]).length).toBeLessThanOrEqual(4);
  });

  it("Text je Abschnitt höchstens 1 500 Zeichen, gekürzte Ränder mit …", () => {
    const [treffer] = sucheImIndex(klein(LANG), [SPAETES_WORT]);
    expect(treffer?.text.length).toBeLessThanOrEqual(MAX_TEXT_JE_ABSCHNITT);
    expect(treffer?.text.startsWith("…")).toBe(true);
    expect(treffer?.text.endsWith("…")).toBe(true);
  });

  it("Summe aller Texte und Titel höchstens 6 000 Zeichen; was nicht passt, fällt als ganzer Abschnitt weg", () => {
    const lang: TestAbschnitt[] = Array.from({ length: 6 }, (_, i) =>
      abschnitt(
        "l.md",
        `t${i}`,
        `Teil ${i}`,
        `${VIELES_WORT}. ${"Satz ohne Treffer. ".repeat(100)}`,
      ),
    );
    const treffer = sucheImIndex(klein(lang), [VIELES_WORT]);
    const summe = treffer.reduce((s, t) => s + t.titel.length + t.text.length, 0);
    expect(summe).toBeLessThanOrEqual(MAX_ZEICHEN_GESAMT);
    expect(treffer.length).toBe(3);
    for (const t of treffer) expect(t.text.length).toBe(MAX_TEXT_JE_ABSCHNITT);
    const json = sucheImIndex(klein(lang), [VIELES_WORT], 3500);
    expect(JSON.stringify(json).length).toBeLessThanOrEqual(3500);
    expect(json.length).toBe(2);
  });

  // Gegenprobe: Fenster vom Anfang statt um den ersten Treffer → das Treffer-Wort fehlt.
  it("der Ausschnitt eines langen Abschnitts enthält das erste Treffer-Wort und beginnt am Satzanfang", () => {
    const [treffer] = sucheImIndex(klein(LANG), [SPAETES_WORT]);
    expect(treffer?.text).toContain(SPAETES_WORT);
    expect(treffer?.text.startsWith("…Am Ende der Straße")).toBe(true);
  });

  it("höchstens 3 Suchanfragen je Aufruf, je Anfrage zählen höchstens 12 Wörter", () => {
    const index = klein(KLEIN);
    expect(sucheImIndex(index, ["Telegram", "Telegram", "Telegram", "Datenschleuse"])).toEqual([]);
    const zwoelf = Array.from({ length: 12 }, (_, i) => `fuellwort${i}`).join(" ");
    expect(sucheImIndex(index, [`${zwoelf} Datenschleuse`])).toEqual([]);
    expect(sucheImIndex(index, [`Datenschleuse ${zwoelf}`])).toEqual([]);
    const elf = Array.from({ length: 11 }, () => "Datenschleuse").join(" ");
    expect(sucheImIndex(index, [`${elf} Namen`]).map((t) => t.anker)).toEqual(["schleuse"]);
  });
});
