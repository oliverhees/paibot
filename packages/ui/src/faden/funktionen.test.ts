/**
 * PaiBot – Tests der reinen Funktionen der Fäden, mit Gegenproben.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { describe, expect, it } from "vitest";
import {
  budgetProzent,
  ergebnisZeile,
  filtereGespraech,
  gueltigeMoeglichkeiten,
  kopfForm,
  markiereDran,
  naechsterReiter,
  nenne,
  sichtbareMitglieder,
  stapelRest,
  teamGruppen,
  vorschlagText,
  zaehleAnMich,
  zuschlagMoeglich,
} from "./funktionen";
import type { FadenBot, Frage, GespraechsEintrag } from "./typen";

describe("kopfForm: Schwellen", () => {
  const faelle: [number, number, boolean][] = [
    [4, 5, false],
    [5, 5, true],
    [4, 6, true],
    [1, 1, false],
    [9, 8, true],
    [0, 0, false],
  ];
  for (const [ziele, beteiligte, gross] of faelle) {
    it(`${ziele} Ziele, ${beteiligte} Beteiligte → ${gross ? "groß" : "klein"}`, () => {
      const f = kopfForm({ ziele, beteiligte });
      expect(f.gross).toBe(gross);
      expect(f.kopfZu).toBe(gross);
      expect(f.leisteOffen).toBe(gross);
    });
  }
  it("die Wahl des Besitzers geht vor", () => {
    expect(kopfForm({ ziele: 9, beteiligte: 8, kopfZu: false }).kopfZu).toBe(false);
    expect(kopfForm({ ziele: 2, beteiligte: 3, kopfZu: true }).kopfZu).toBe(true);
    expect(kopfForm({ ziele: 9, beteiligte: 8, leisteOffen: false }).leisteOffen).toBe(false);
    expect(kopfForm({ ziele: 9, beteiligte: 8, kopfZu: null }).kopfZu).toBe(true);
  });
});

describe("nenne und stapelRest", () => {
  it("setzt „und“ vor den letzten Namen", () => {
    expect(nenne([])).toBe("");
    expect(nenne(["A"])).toBe("A");
    expect(nenne(["A", "B"])).toBe("A und B");
    expect(nenne(["A", "B", "C"])).toBe("A, B und C");
  });
  it("teilt Stapel und Rest", () => {
    expect(stapelRest([1, 2, 3, 4, 5], 3)).toEqual({ sichtbar: [1, 2, 3], rest: 2 });
    expect(stapelRest([1], 3)).toEqual({ sichtbar: [1], rest: 0 });
  });
});

describe("ergebnisZeile (fest, ohne KI)", () => {
  it("keine Zulieferung: nur der Kopf, kein „Ergebnis“", () => {
    expect(ergebnisZeile({ beitraege: 4, autoren: ["Ben", "Ida"], lieferungen: [] })).toEqual({
      kopf: "4 Beiträge von Ben und Ida",
      ergebnis: "",
      belastet: false,
    });
  });
  it("eine Zulieferung", () => {
    const z = ergebnisZeile({
      beitraege: 1,
      autoren: ["Juri"],
      lieferungen: [{ text: "Titel und Texte\nzweite Zeile bleibt draußen" }],
    });
    expect(z.kopf).toBe("1 Beitrag von Juri");
    expect(z.ergebnis).toBe("Titel und Texte");
  });
  it("drei Zulieferungen, Namen ohne Doppelte", () => {
    const z = ergebnisZeile({
      beitraege: 9,
      autoren: ["Sam", "Eli", "Noa", "Sam"],
      lieferungen: [{ text: "Termine als Text" }, { text: "Fotoauswahl" }, { text: "Szenenliste" }],
    });
    expect(z.kopf).toBe("9 Beiträge von Sam, Eli und Noa");
    expect(z.ergebnis).toBe("Termine als Text, Fotoauswahl, Szenenliste");
  });
  it("belastete Zulieferung bekommt das Kennzeichen", () => {
    const z = ergebnisZeile({
      beitraege: 2,
      autoren: ["Ida"],
      lieferungen: [{ text: "Etwas", untrusted: true }, { text: "Anderes" }],
    });
    expect(z.belastet).toBe(true);
    // Gegenprobe: ohne belastete Lieferung kein Kennzeichen
    expect(
      ergebnisZeile({ beitraege: 2, autoren: ["Ida"], lieferungen: [{ text: "Etwas" }] }).belastet,
    ).toBe(false);
  });
  it("sehr lange erste Zeile wird auf 80 Zeichen gekürzt", () => {
    const z = ergebnisZeile({
      beitraege: 1,
      autoren: ["Ida"],
      lieferungen: [{ text: "x".repeat(500) }],
    });
    expect(Array.from(z.ergebnis).length).toBe(80);
    expect(z.ergebnis.endsWith("…")).toBe(true);
  });
  it("Richtungs- und Steuerzeichen und HTML-Zeichen: Text bleibt Text, Zeichen der Richtung fallen weg", () => {
    const z = ergebnisZeile({
      beitraege: 1,
      autoren: ["Ida\u202e"],
      lieferungen: [{ text: "\u202eEvil <script>alert(1)</script>" }],
    });
    expect(z.kopf).toBe("1 Beitrag von Ida");
    expect(z.ergebnis).toBe("Evil <script>alert(1)</script>");
    expect(z.ergebnis).not.toContain("\u202e");
  });
  it("kein Modelltext der Leitung im festen Teil: die Funktion nimmt keinen entgegen", () => {
    // Die Signatur kennt nur Beiträge, Autoren und Zulieferungen (Gegenprobe über Schlüssel).
    const z = ergebnisZeile({
      beitraege: 3,
      autoren: ["Ida"],
      lieferungen: [],
      zusatz: "Alles super",
    } as never);
    expect(JSON.stringify(z)).not.toContain("Alles super");
  });
});

describe("Antwort-Vorschläge", () => {
  it("eine Möglichkeit setzt nur einen festen Text, nie den Wortlaut des Bots", () => {
    const m = gueltigeMoeglichkeiten(["Leise Musik", "Nur Geräusch"]);
    expect(m.map(vorschlagText)).toEqual(["Möglichkeit 1", "Möglichkeit 2"]);
    expect(m.map(vorschlagText).join()).not.toContain("Musik");
  });
  it("feste Antworten kommen wörtlich", () => {
    expect(vorschlagText({ art: "fest", text: "Ja" })).toBe("Ja");
  });
  it("Möglichkeit mit Link oder über 120 Zeichen → keine Vorschläge", () => {
    expect(gueltigeMoeglichkeiten(["Gut", "Siehe https://beispiel.invalid/x"])).toEqual([]);
    expect(gueltigeMoeglichkeiten(["Gut", "www.beispiel.invalid"])).toEqual([]);
    expect(gueltigeMoeglichkeiten(["Gut", "a".repeat(121)])).toEqual([]);
    // Gegenprobe: genau 120 Zeichen sind in Ordnung
    expect(gueltigeMoeglichkeiten(["a".repeat(120)])).toHaveLength(1);
  });
  it("höchstens drei", () => {
    expect(gueltigeMoeglichkeiten(["a", "b", "c", "d"])).toHaveLength(3);
  });
});

const bot = (id: string, zustand: FadenBot["zustand"] = "ruhig"): FadenBot => ({
  id,
  name: id,
  rolle: "x",
  farbe: "blau",
  zustand,
  stand: "",
});

describe("Gespräch filtern", () => {
  const eintraege: GespraechsEintrag[] = [
    { art: "trenner", id: "t", text: "Faden" },
    { art: "beitrag", id: "1", von: "ida", zeit: "1", text: "a", filter: "detail" },
    { art: "beitrag", id: "2", von: "mila", zeit: "2", text: "b", filter: "ergebnis" },
    { art: "beitrag", id: "3", von: "eli", zeit: "3", text: "c", filter: "frage", fragt: true },
    {
      art: "gruppe",
      id: "g",
      autoren: [],
      kopf: "9 Beiträge von X",
      ergebnis: "y",
      filter: "detail",
      inhalt: [],
    },
  ];
  it("Alles zeigt alles", () => {
    expect(filtereGespraech(eintraege, "alles")).toHaveLength(5);
  });
  it("Nur Ergebnisse blendet Einzelheiten aus", () => {
    expect(filtereGespraech(eintraege, "ergebnisse").map((e) => e.id)).toEqual(["t", "2", "3"]);
  });
  it("Nur an mich zeigt nur Fragen", () => {
    expect(filtereGespraech(eintraege, "an_mich").map((e) => e.id)).toEqual(["3"]);
    expect(zaehleAnMich(eintraege)).toBe(1);
  });
});

describe("Team und Seitenleiste", () => {
  it("sortiert nach führt, wartet auf dich, dran, als Nächstes, ruhig", () => {
    const fragen: Frage[] = [{ id: "f", botId: "eli", text: "?", vorschlaege: [] }];
    const g = teamGruppen([bot("mila"), bot("ida"), bot("eli"), bot("ben"), bot("lou")], {
      fuehrt: "mila",
      dran: ["ida", "eli"],
      naechste: ["ben"],
      fragen,
    });
    expect(g.fuehrt.map((b) => b.id)).toEqual(["mila"]);
    expect(g.dran.map((b) => b.id)).toEqual(["ida"]);
    expect(g.wartetAufDich.map((b) => b.id)).toEqual(["eli"]);
    expect(g.naechste.map((b) => b.id)).toEqual(["ben"]);
    expect(g.ruhig.map((b) => b.id)).toEqual(["lou"]);
  });
  it("bis sechs Mitglieder alle, ab sieben „+N ruhig“", () => {
    const sechs = ["a", "b", "c", "d", "e", "f"].map((i) => bot(i));
    expect(sichtbareMitglieder(sechs).ruhig).toHaveLength(0);
    const sieben = [...sechs, bot("g"), bot("h", "schreibt")];
    const s = sichtbareMitglieder(sieben);
    expect(s.sichtbar.map((b) => b.id)).toEqual(["h"]);
    expect(s.ruhig).toHaveLength(7);
  });
  it("zwei gleichzeitig dran: beide Marken, nur Anzeige", () => {
    const p = markiereDran(
      [
        { id: "ben", name: "Ben", wort: "" },
        { id: "ida", name: "Ida", wort: "" },
        { id: "du", name: "Du", wort: "" },
      ],
      ["ben", "ida"],
    );
    expect(p.map((x) => x.dran)).toEqual([true, true, false]);
  });
});

describe("Kleinteile", () => {
  it("Pfeiltasten wandern durch die Reiter", () => {
    expect(naechsterReiter(5, 4, "ArrowRight")).toBe(0);
    expect(naechsterReiter(5, 0, "ArrowLeft")).toBe(4);
    expect(naechsterReiter(5, 2, "Home")).toBe(0);
    expect(naechsterReiter(5, 2, "End")).toBe(4);
    expect(naechsterReiter(5, 2, "a")).toBeNull();
  });
  it("Zuschläge: der sechste ist nicht möglich", () => {
    expect(zuschlagMoeglich({ benutzt: 4, max: 5 })).toBe(true);
    expect(zuschlagMoeglich({ benutzt: 5, max: 5 })).toBe(false);
  });
  it("Budget bleibt zwischen 0 und 100", () => {
    expect(budgetProzent(-4)).toBe(0);
    expect(budgetProzent(146)).toBe(100);
    expect(budgetProzent(Number.NaN)).toBe(0);
    expect(budgetProzent(45.6)).toBe(46);
  });
});
