/**
 * PaiBot – Tests: Format des Team-Entwurfs (unbekannte Felder, Grenzen, Texte, Namen, Modelle,
 * Abdruck, Text-Eingabe) mit Beispiel-Daten.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { AVATAR_SHAPES, BOT_COLORS } from "@paibot/shared/objekte";
import { describe, expect, it } from "vitest";
import {
  ENTWURF_GRENZEN,
  entwurfAbdruck,
  entwurfAbdruckV1,
  leseEntwurf,
  leseEntwurfV1,
  ordneModelleZu,
  pruefeEntwurf,
  pruefeEntwurfText,
  WIE_PAI,
} from "./format";

function bot(name: string, extra: Record<string, unknown> = {}) {
  return { name, aufgabe: "Beispiel-Aufgabe", anweisung: "Beispiel-Anweisung.", ...extra };
}

const TEAM = {
  name: "Beispiel",
  leitung: { name: "Eins" },
  zusammenarbeit: "aus",
  abnahme: "besitzer",
};

/** Beispiel-Entwurf in Fassung 2; die Leitung ist, wenn nichts anderes gesagt wird, der erste Bot. */
function entwurf(extra: Record<string, unknown> = {}) {
  const bots = "bots" in extra ? extra.bots : [bot("Eins"), bot("Zwei")];
  const erster = Array.isArray(bots) ? (bots[0] as { name?: string } | undefined)?.name : undefined;
  return {
    format: "pb-teamentwurf/v2",
    titel: "Beispiel-Team",
    team: { ...TEAM, leitung: { name: erster ?? "Eins" } },
    bots,
    ...extra,
  };
}

/** Beispiel-Entwurf in Fassung 1. */
function entwurfV1(extra: Record<string, unknown> = {}) {
  return {
    format: "pb-teamentwurf/v1",
    titel: "Beispiel-Team",
    team: { name: "Beispiel", ansprechpartner: { art: "pai" } },
    bots: [bot("Eins"), bot("Zwei")],
    ...extra,
  };
}

function fehlerVon(roh: unknown) {
  const ergebnis = leseEntwurf(roh);
  if (ergebnis.ok) throw new Error("Entwurf wurde angenommen");
  return ergebnis.fehler;
}

describe("gültiger Entwurf", () => {
  it("wird vereinheitlicht: Modell, Länge, Form und Farbe der Reihe nach", () => {
    const ergebnis = leseEntwurf(entwurf());
    expect(ergebnis.ok).toBe(true);
    if (!ergebnis.ok) return;
    const [eins, zwei] = ergebnis.entwurf.bots;
    expect(eins).toMatchObject({
      modell: WIE_PAI,
      antwortLaenge: 4096,
      form: AVATAR_SHAPES[0],
      farbe: BOT_COLORS[0],
    });
    expect(zwei).toMatchObject({ form: AVATAR_SHAPES[1], farbe: BOT_COLORS[1] });
  });

  it("behält ausdrücklich genannte Form, Farbe und Länge", () => {
    const ergebnis = leseEntwurf(
      entwurf({ bots: [bot("Eins", { form: "wabe", farbe: "pink", antwortLaenge: 900 })] }),
    );
    expect(ergebnis.ok && ergebnis.entwurf.bots[0]).toMatchObject({
      form: "wabe",
      farbe: "pink",
      antwortLaenge: 900,
    });
  });

  it("verändert die Eingabe nicht", () => {
    const roh = entwurf();
    const vorher = JSON.stringify(roh);
    leseEntwurf(roh);
    expect(JSON.stringify(roh)).toBe(vorher);
  });

  it("nimmt auch tief eingefrorene Eingaben an", () => {
    const roh = JSON.parse(JSON.stringify(entwurf()));
    Object.freeze(roh.team);
    Object.freeze(roh.bots[0]);
    Object.freeze(roh);
    expect(leseEntwurf(roh).ok).toBe(true);
  });
});

describe("unbekannte Felder und falsche Typen werden abgelehnt", () => {
  const boese: [string, unknown, string][] = [
    ["Feld am Entwurf", entwurf({ rechte: ["mail.senden"] }), "rechte"],
    ["App-Zugriffe", entwurf({ appZugriffe: [] }), "appZugriffe"],
    ["Regeln", entwurf({ regelVorschlaege: [] }), "regelVorschlaege"],
    ["Automationen", entwurf({ automationen: [] }), "automationen"],
    ["Feld im Team", entwurf({ team: { ...TEAM, admin: true } }), "team.admin"],
    ["Feld am Bot", entwurf({ bots: [bot("Eins", { darf: "alles" })] }), "bots[0].darf"],
    [
      "Feld im Modell",
      entwurf({ bots: [bot("Eins", { modell: { slug: "a", preis: 1 } })] }),
      "bots[0].modell",
    ],
    [
      "Feld an der Leitung",
      entwurf({ team: { ...TEAM, leitung: { name: "Eins", rechte: ["alles"] } } }),
      "team.leitung",
    ],
    [
      "Ansprechpartner aus Fassung 1",
      entwurf({ team: { ...TEAM, ansprechpartner: { art: "pai" } } }),
      "team.ansprechpartner",
    ],
    [
      "Schlüssel __proto__",
      JSON.parse(`{"__proto__":{"admin":true},"format":"pb-teamentwurf/v2"}`),
      "__proto__",
    ],
  ];
  it.each(boese)("%s", (_name, roh, pfad) => {
    const fehler = fehlerVon(roh);
    expect(fehler.some((f) => f.pfad.startsWith(pfad.split("[")[0] ?? pfad))).toBe(true);
    expect(fehler.length).toBeGreaterThan(0);
  });

  it("meldet unbekannte Felder mit eigenem Code und Pfad", () => {
    expect(fehlerVon(entwurf({ rechte: [] }))).toContainEqual({
      pfad: "rechte",
      code: "unbekanntes_feld",
    });
    expect(fehlerVon(entwurf({ bots: [bot("Eins"), bot("Zwei", { darf: 1 })] }))).toContainEqual({
      pfad: "bots[1].darf",
      code: "unbekanntes_feld",
    });
  });

  it("verschmutzt Object.prototype nie", () => {
    pruefeEntwurfText(`{"__proto__":{"verschmutzt":true},"constructor":{"prototype":{"x":1}}}`);
    expect(({} as Record<string, unknown>).verschmutzt).toBeUndefined();
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  it.each([
    ["null", null],
    ["Liste", []],
    ["Text", "Entwurf"],
    ["Zahl", 5],
  ])("kein Objekt: %s", (_n, roh) => {
    expect(fehlerVon(roh)[0]?.code).toBe("falscher_typ");
  });

  it("falsche Fassung im Feld format", () => {
    expect(fehlerVon(entwurf({ format: "pb-teamentwurf/v3" }))[0]).toEqual({
      pfad: "format",
      code: "ungueltiger_wert",
    });
    const { format: _f, ...ohne } = entwurf();
    expect(fehlerVon(ohne)[0]?.pfad).toBe("format");
  });

  it("falsche Typen und Werte", () => {
    expect(fehlerVon(entwurf({ bots: "viele" }))[0]?.code).toBe("falscher_typ");
    expect(fehlerVon(entwurf({ bots: [bot("A", { antwortLaenge: "9" })] }))[0]?.code).toBe(
      "falscher_typ",
    );
    expect(fehlerVon(entwurf({ bots: [bot("A", { antwortLaenge: 1.5 })] }))[0]?.pfad).toBe(
      "bots[0].antwortLaenge",
    );
    expect(fehlerVon(entwurf({ bots: [bot("A", { antwortLaenge: 0 })] }))[0]?.pfad).toBe(
      "bots[0].antwortLaenge",
    );
    expect(
      fehlerVon(
        entwurf({ bots: [bot("A", { antwortLaenge: ENTWURF_GRENZEN.antwortLaengeMax + 1 })] }),
      )[0]?.pfad,
    ).toBe("bots[0].antwortLaenge");
    expect(fehlerVon(entwurf({ bots: [bot("A", { farbe: "neon" })] }))[0]?.pfad).toBe(
      "bots[0].farbe",
    );
    expect(fehlerVon(entwurf({ bots: [bot("A", { form: "stern" })] }))[0]?.pfad).toBe(
      "bots[0].form",
    );
    expect(fehlerVon(entwurf({ bots: [bot("A", { modell: "anderes" })] }))[0]?.pfad).toBe(
      "bots[0].modell",
    );
  });
});

describe("Grenzen", () => {
  it("Name: 60 Zeichen gehen, 61 nicht, leer nicht", () => {
    expect(leseEntwurf(entwurf({ bots: [bot("a".repeat(60))] })).ok).toBe(true);
    expect(fehlerVon(entwurf({ bots: [bot("a".repeat(61))] }))).toContainEqual({
      pfad: "bots[0].name",
      code: "zu_lang",
    });
    expect(fehlerVon(entwurf({ bots: [bot("   ")] }))).toContainEqual({
      pfad: "bots[0].name",
      code: "leer",
    });
  });

  it("Anweisung: 8 000 Zeichen gehen, 8 001 nicht, nichts wird gekürzt", () => {
    const genau = leseEntwurf(entwurf({ bots: [bot("A", { anweisung: "x".repeat(8000) })] }));
    expect(genau.ok && genau.entwurf.bots[0]?.anweisung.length).toBe(8000);
    expect(
      fehlerVon(entwurf({ bots: [bot("A", { anweisung: "x".repeat(8001) })] })),
    ).toContainEqual({
      pfad: "bots[0].anweisung",
      code: "zu_lang",
    });
  });

  it("zählt Zeichen wie die Datenbank (Codepoints, nicht UTF-16-Einheiten)", () => {
    // 8 000 Emoji sind 16 000 UTF-16-Einheiten, aber 8 000 Zeichen für `char_length`.
    const emoji = "😀".repeat(8000);
    expect(leseEntwurf(entwurf({ bots: [bot("A", { anweisung: emoji })] })).ok).toBe(true);
    expect(leseEntwurf(entwurf({ bots: [bot("😀".repeat(60))] })).ok).toBe(true);
    expect(leseEntwurf(entwurf({ bots: [bot("😀".repeat(61))] })).ok).toBe(false);
    expect(leseEntwurf(entwurf({ bots: [bot("A", { anweisung: `${emoji}😀` })] })).ok).toBe(false);
  });

  it("Aufgabe, Titel, Team-Name, Beschreibung, Modell-Kennung haben Grenzen", () => {
    expect(fehlerVon(entwurf({ bots: [bot("A", { aufgabe: "x".repeat(201) })] }))[0]?.pfad).toBe(
      "bots[0].aufgabe",
    );
    expect(fehlerVon(entwurf({ titel: "x".repeat(101) }))[0]?.pfad).toBe("titel");
    expect(fehlerVon(entwurf({ team: { ...TEAM, name: "x".repeat(61) } }))[0]?.pfad).toBe(
      "team.name",
    );
    expect(fehlerVon(entwurf({ beschreibung: "x".repeat(301) }))[0]?.pfad).toBe("beschreibung");
    expect(
      fehlerVon(entwurf({ bots: [bot("A", { modell: { slug: "x".repeat(201) } })] }))[0]?.pfad,
    ).toBe("bots[0].modell.slug");
  });

  it("Anzahl Bots: 1 bis 6", () => {
    const namen = ["A", "B", "C", "D", "E", "F", "G"];
    expect(leseEntwurf(entwurf({ bots: namen.slice(0, 6).map((n) => bot(n)) })).ok).toBe(true);
    expect(leseEntwurf(entwurf({ bots: [bot("A")] })).ok).toBe(true);
    expect(fehlerVon(entwurf({ bots: namen.map((n) => bot(n)) }))).toContainEqual({
      pfad: "bots",
      code: "zu_viele",
    });
    expect(fehlerVon(entwurf({ bots: [] }))).toContainEqual({ pfad: "bots", code: "zu_wenige" });
  });

  it("sehr viele Bots werden schnell und mit begrenzter Fehlerzahl abgelehnt", () => {
    const viele = Array.from({ length: 5000 }, (_, i) => bot(`Bot ${i}`, { farbe: "neon" }));
    const fehler = fehlerVon(entwurf({ bots: viele }));
    expect(fehler.length).toBeLessThanOrEqual(ENTWURF_GRENZEN.fehlerMax);
  });
});

describe("Texte", () => {
  it("Namen: Leerraum an den Enden weg, NFC", () => {
    const ergebnis = leseEntwurf(entwurf({ bots: [bot("  Café  ")] }));
    expect(ergebnis.ok && ergebnis.entwurf.bots[0]?.name).toBe("Café");
  });

  it("Anweisung bleibt im Wortlaut: Zeilenumbrüche, Tabulator, Einrückung; nur NFC und CRLF", () => {
    const text = "  Zeile 1\r\n\tZeile 2\n\n  Ende  ";
    const ergebnis = leseEntwurf(entwurf({ bots: [bot("A", { anweisung: text })] }));
    expect(ergebnis.ok && ergebnis.entwurf.bots[0]?.anweisung).toBe(
      "  Zeile 1\n\tZeile 2\n\n  Ende  ",
    );
  });

  const unzulaessigName = [
    ["Steuerzeichen", "A\u0007B"],
    ["NUL", "A\u0000B"],
    ["Umbruch", "A\nB"],
    ["Schreibrichtung", "A‮B"],
    ["Null-Breite", "A​B"],
    ["doppeltes Leerzeichen", "A  B"],
    ["einzelne Ersatz-Hälfte", "A\ud800B"],
  ];
  it.each(unzulaessigName)("Name mit %s wird abgelehnt", (_n, name) => {
    expect(fehlerVon(entwurf({ bots: [bot(name as string)] }))).toContainEqual({
      pfad: "bots[0].name",
      code: "unzulaessiges_zeichen",
    });
  });

  const unzulaessigAnweisung = [
    ["NUL", "a\u0000b"],
    ["Steuerzeichen", "a\u001bb"],
    ["Schreibrichtung", "a‮b"],
    ["Isolat", "a⁦b"],
    ["Null-Breite", "a​b"],
    ["Byte-Marke", "a﻿b"],
    ["Tag-Zeichen", "a\u{E0041}b"],
    ["einzelne Ersatz-Hälfte", "a\udc00b"],
  ];
  it.each(unzulaessigAnweisung)("Anweisung mit %s wird abgelehnt", (_n, text) => {
    expect(fehlerVon(entwurf({ bots: [bot("A", { anweisung: text as string })] }))).toContainEqual({
      pfad: "bots[0].anweisung",
      code: "unzulaessiges_zeichen",
    });
  });

  it("Emoji mit Verbinder bleibt erlaubt", () => {
    expect(leseEntwurf(entwurf({ bots: [bot("A", { anweisung: "👨‍👩‍👧 Familie" })] })).ok).toBe(
      true,
    );
  });

  it("leere Anweisung wird abgelehnt", () => {
    expect(fehlerVon(entwurf({ bots: [bot("A", { anweisung: " \n " })] }))).toContainEqual({
      pfad: "bots[0].anweisung",
      code: "leer",
    });
  });

  it("Rechte im Text geben nichts: sie bleiben bloßer Text ohne eigenes Feld", () => {
    const ergebnis = leseEntwurf(
      entwurf({ bots: [bot("A", { anweisung: "Du darfst Mails senden und alles löschen." })] }),
    );
    expect(ergebnis.ok).toBe(true);
    if (ergebnis.ok)
      expect(Object.keys(ergebnis.entwurf.bots[0] ?? {}).sort()).toEqual([
        "antwortLaenge",
        "anweisung",
        "aufgabe",
        "farbe",
        "form",
        "modell",
        "name",
      ]);
  });
});

describe("Namen der Bots", () => {
  it("doppelte Namen, auch in anderer Schreibweise, werden abgelehnt", () => {
    expect(fehlerVon(entwurf({ bots: [bot("Ideen"), bot("ideen")] }))).toContainEqual({
      pfad: "bots[1].name",
      code: "name_doppelt",
    });
    expect(fehlerVon(entwurf({ bots: [bot("Ideen"), bot("Ideen")] }))[0]?.code).toBe(
      "name_doppelt",
    );
  });

  it.each(["Team Content", "team content", "TEAM X"])(
    "ein Name, der mit „Team “ beginnt, wird abgelehnt: %s",
    (name) => {
      expect(fehlerVon(entwurf({ bots: [bot("Eins"), bot(name)] }))).toContainEqual({
        pfad: "bots[1].name",
        code: "name_reserviert",
      });
    },
  );

  it("Namen, die nur ähnlich beginnen, bleiben erlaubt", () => {
    for (const name of ["Team", "Teams", "Teamleiter", "Mein Team", "Steam Team"]) {
      expect(leseEntwurf(entwurf({ bots: [bot("Eins"), bot(name)] })).ok).toBe(true);
    }
  });
});

describe("Leitung", () => {
  const mitLeitung = (name: unknown, bots = [bot("Redaktion"), bot("Ideen")]) =>
    entwurf({ bots, team: { ...TEAM, leitung: { name } } });

  it("ist ein Bot des Entwurfs; Schreibweise und Leerraum werden zur Schreibweise des Bots", () => {
    const ergebnis = leseEntwurf(mitLeitung("  redaktion "));
    expect(ergebnis.ok && ergebnis.entwurf.team.leitung).toEqual({ name: "Redaktion" });
  });

  it("jeder Bot kann Leitung sein, auch der letzte", () => {
    const ergebnis = leseEntwurf(mitLeitung("Ideen"));
    expect(ergebnis.ok && ergebnis.entwurf.team.leitung).toEqual({ name: "Ideen" });
  });

  it("ein Name, der kein Bot des Entwurfs ist, wird abgelehnt (Gegenprobe: Pai, fremder Name)", () => {
    for (const name of ["Pai", "Fremd", "Redaktio"]) {
      expect(fehlerVon(mitLeitung(name))).toContainEqual({
        pfad: "team.leitung.name",
        code: "leitung_unbekannt",
      });
    }
  });

  it("fehlt die Leitung oder hat sie die falsche Form, wird der Entwurf abgelehnt", () => {
    const ohne = entwurf();
    const { leitung: _l, ...teamOhne } = ohne.team;
    expect(fehlerVon({ ...ohne, team: teamOhne })).toContainEqual({
      pfad: "team.leitung",
      code: "falscher_typ",
    });
    expect(fehlerVon(mitLeitung(5))[0]?.pfad).toBe("team.leitung.name");
    expect(fehlerVon(entwurf({ team: { ...TEAM, leitung: "Eins" } }))[0]?.pfad).toBe(
      "team.leitung",
    );
    expect(
      fehlerVon(entwurf({ team: { ...TEAM, leitung: { art: "pai" } } })).every((f) =>
        f.pfad.startsWith("team.leitung"),
      ),
    ).toBe(true);
  });

  it("genau ein Mitglied ist Leitung: eine Liste von Leitungen wird abgelehnt", () => {
    expect(
      fehlerVon(entwurf({ team: { ...TEAM, leitung: [{ name: "Eins" }, { name: "Zwei" }] } }))[0]
        ?.pfad,
    ).toBe("team.leitung");
    expect(
      fehlerVon(entwurf({ team: { ...TEAM, leitung: { name: "Eins" }, leitungen: ["Zwei"] } })),
    ).toContainEqual({ pfad: "team.leitungen", code: "unbekanntes_feld" });
  });

  it("die Leitung ist ein Bot des Teams und nicht Pai: ein Entwurf ohne Bot hat keine Leitung", () => {
    expect(fehlerVon(entwurf({ bots: [] }))).toContainEqual({ pfad: "bots", code: "zu_wenige" });
  });
});

describe("Zusammenarbeit und Abnahme", () => {
  const mit = (team: Record<string, unknown>) => entwurf({ team: { ...TEAM, ...team } });

  it.each(["aus", "leitung_fuehrt"])("Zusammenarbeit „%s“ wird gelesen", (wert) => {
    const ergebnis = leseEntwurf(mit({ zusammenarbeit: wert }));
    expect(ergebnis.ok && ergebnis.entwurf.team.zusammenarbeit).toBe(wert);
  });

  it.each(["leitung", "besitzer", "ohne"])("Abnahme „%s“ wird gelesen", (wert) => {
    const ergebnis = leseEntwurf(mit({ abnahme: wert }));
    expect(ergebnis.ok && ergebnis.entwurf.team.abnahme).toBe(wert);
  });

  it("fehlt die Zusammenarbeit oder die Abnahme, ist der Entwurf ungültig (kein stiller Standard)", () => {
    const { zusammenarbeit: _z, ...ohneZ } = TEAM;
    const { abnahme: _a, ...ohneA } = TEAM;
    expect(fehlerVon(entwurf({ team: { ...ohneZ, leitung: { name: "Eins" } } }))).toContainEqual({
      pfad: "team.zusammenarbeit",
      code: "ungueltiger_wert",
    });
    expect(fehlerVon(entwurf({ team: { ...ohneA, leitung: { name: "Eins" } } }))).toContainEqual({
      pfad: "team.abnahme",
      code: "ungueltiger_wert",
    });
  });

  it.each([
    ["Zusammenarbeit", "alle_frei"],
    ["Zusammenarbeit", "Leitung_fuehrt"],
    ["Zusammenarbeit", "leitung führt"],
    ["Zusammenarbeit", ""],
    ["Zusammenarbeit", true],
    ["Zusammenarbeit", null],
    ["Abnahme", "freigeben"],
    ["Abnahme", "Leitung"],
    ["Abnahme", "pai"],
    ["Abnahme", 1],
  ])("unbekannter Wert wird abgelehnt: %s = %j", (feld, wert) => {
    const schluessel = feld === "Abnahme" ? "abnahme" : "zusammenarbeit";
    const fehler = fehlerVon(mit({ [schluessel]: wert }));
    expect(fehler.some((f) => f.pfad === `team.${schluessel}`)).toBe(true);
  });

  it("ein Wert wird nie gekürzt oder bereinigt: Leerraum macht ihn ungültig", () => {
    expect(fehlerVon(mit({ zusammenarbeit: " aus" }))[0]?.pfad).toBe("team.zusammenarbeit");
  });

  it("keine Variante C: weitere Felder der Zusammenarbeit werden abgelehnt", () => {
    expect(fehlerVon(mit({ zusammenarbeit: { art: "frei" } }))[0]?.pfad).toBe(
      "team.zusammenarbeit",
    );
    expect(fehlerVon(mit({ uebergaben: ["Eins"] }))).toContainEqual({
      pfad: "team.uebergaben",
      code: "unbekanntes_feld",
    });
  });
});

describe("Modelle nur aus der eigenen Liste", () => {
  const roh = entwurf({
    bots: [
      bot("Eins", { modell: { slug: "modell-a" } }),
      bot("Zwei", { modell: { slug: "modell-aus" } }),
      bot("Drei", { modell: { slug: "modell-doppelt" } }),
      bot("Vier", { modell: { slug: "gibt-es-nicht" } }),
      bot("Fuenf", { modell: WIE_PAI }),
    ],
  });
  const liste = [
    { slug: "modell-a", eingeschaltet: true },
    { slug: "modell-aus", eingeschaltet: false },
    { slug: "modell-doppelt", eingeschaltet: true },
    { slug: "modell-doppelt", eingeschaltet: true },
  ];

  it("behält ein vorhandenes, eingeschaltetes Modell, sonst „wie Pai“ mit Hinweis", () => {
    const gelesen = leseEntwurf(roh);
    if (!gelesen.ok) throw new Error("ungültig");
    const { entwurf: fertig, hinweise } = ordneModelleZu(gelesen.entwurf, liste);
    expect(fertig.bots.map((b) => b.modell)).toEqual([
      { slug: "modell-a" },
      WIE_PAI,
      WIE_PAI,
      WIE_PAI,
      WIE_PAI,
    ]);
    expect(hinweise).toEqual([
      { code: "modell_ausgeschaltet", bot: "Zwei", slug: "modell-aus" },
      { code: "modell_mehrdeutig", bot: "Drei", slug: "modell-doppelt" },
      { code: "modell_unbekannt", bot: "Vier", slug: "gibt-es-nicht" },
    ]);
  });

  it("leere Liste: jede Kennung ist unbekannt; es entsteht nie ein Modell", async () => {
    const ergebnis = await pruefeEntwurf(roh, { modelle: [] });
    expect(ergebnis.ok && ergebnis.entwurf.bots.every((b) => b.modell === WIE_PAI)).toBe(true);
    expect(ergebnis.ok && ergebnis.hinweise).toHaveLength(4);
  });

  it("ohne Liste bleibt die Kennung stehen", async () => {
    const ergebnis = await pruefeEntwurf(roh);
    expect(ergebnis.ok && ergebnis.entwurf.bots[0]?.modell).toEqual({ slug: "modell-a" });
  });

  it("der Abdruck gilt für den Entwurf nach der Zuordnung", async () => {
    const mit = await pruefeEntwurf(roh, { modelle: liste });
    const ohne = await pruefeEntwurf(roh);
    expect(mit.ok && ohne.ok && mit.abdruck !== ohne.abdruck).toBe(true);
  });
});

describe("Abdruck", () => {
  const klein = {
    format: "pb-teamentwurf/v2",
    titel: "Mini-Team",
    team: {
      name: "Mini",
      leitung: { name: "Ideen" },
      zusammenarbeit: "aus",
      abnahme: "besitzer",
    },
    bots: [{ name: "Ideen", aufgabe: "Themen sammeln", anweisung: "Sammle Themen." }],
  };

  async function abdruckVon(roh: unknown) {
    const ergebnis = await pruefeEntwurf(roh);
    if (!ergebnis.ok) throw new Error("ungültig");
    return ergebnis.abdruck;
  }

  it("hat die festgelegte Form (Bekannter Wert, unabhängig mit sha256sum berechnet)", async () => {
    expect(await abdruckVon(klein)).toBe(
      "sha256:be4ab78bb3a2cbd96082e4d9aaa65380c780e1b55a4bac76f1994c79c4509087",
    );
  });

  it("hängt nicht von der Reihenfolge der Felder ab", async () => {
    const umgedreht = {
      bots: [{ anweisung: "Sammle Themen.", aufgabe: "Themen sammeln", name: "Ideen" }],
      team: {
        abnahme: "besitzer",
        zusammenarbeit: "aus",
        leitung: { name: "Ideen" },
        name: "Mini",
      },
      titel: "Mini-Team",
      format: "pb-teamentwurf/v2",
    };
    expect(await abdruckVon(umgedreht)).toBe(await abdruckVon(klein));
  });

  it("ändert sich bei jeder Änderung am Inhalt", async () => {
    const basis = await abdruckVon(klein);
    const zweiBots = {
      ...klein,
      bots: [...klein.bots, { name: "Zwei", aufgabe: "a", anweisung: "b" }],
    };
    const aenderungen: unknown[] = [
      { ...klein, titel: "Mini-Team." },
      { ...klein, beschreibung: "Eine Beschreibung" },
      { ...klein, team: { ...klein.team, name: "Mini2" } },
      { ...klein, team: { ...klein.team, zusammenarbeit: "leitung_fuehrt" } },
      { ...klein, team: { ...klein.team, abnahme: "leitung" } },
      { ...klein, team: { ...klein.team, abnahme: "ohne" } },
      {
        ...klein,
        team: { ...klein.team, leitung: { name: "Zwei" } },
        bots: [...klein.bots, { name: "Zwei", aufgabe: "a", anweisung: "b" }],
      },
      {
        ...klein,
        team: { ...klein.team, leitung: { name: "Ideen2" } },
        bots: [{ ...klein.bots[0], name: "Ideen2" }],
      },
      { ...klein, bots: [{ ...klein.bots[0], aufgabe: "Themen sammeln." }] },
      { ...klein, bots: [{ ...klein.bots[0], anweisung: "Sammle Themen. " }] },
      { ...klein, bots: [{ ...klein.bots[0], modell: { slug: "m" } }] },
      { ...klein, bots: [{ ...klein.bots[0], form: "wabe" }] },
      { ...klein, bots: [{ ...klein.bots[0], farbe: "pink" }] },
      { ...klein, bots: [{ ...klein.bots[0], antwortLaenge: 4095 }] },
      zweiBots,
      { ...zweiBots, bots: [...zweiBots.bots].reverse() },
    ];
    const alle = new Set([basis]);
    for (const aenderung of aenderungen) alle.add(await abdruckVon(aenderung));
    expect(alle.size).toBe(aenderungen.length + 1);
  });

  it("gleicher Inhalt in anderer Schreibweise (NFC, Leerraum) ergibt denselben Abdruck", async () => {
    const a = {
      ...klein,
      team: { ...klein.team, leitung: { name: "Café" } },
      bots: [{ ...klein.bots[0], name: "Café" }],
    };
    const b = {
      ...klein,
      team: { ...klein.team, leitung: { name: "   Café " } },
      bots: [{ ...klein.bots[0], name: "    Café  " }],
    };
    expect(await abdruckVon(a)).toBe(await abdruckVon(b));
  });

  it("ein Entwurf mit einem unbekannten Wert wirft, statt etwas Falsches zu hashen", async () => {
    const gelesen = leseEntwurf(klein);
    if (!gelesen.ok) throw new Error("ungültig");
    const kaputt = { ...gelesen.entwurf, titel: 5 as unknown as string };
    await expect(entwurfAbdruck(kaputt)).resolves.toMatch(/^sha256:[0-9a-f]{64}$/);
    const unendlich = {
      ...gelesen.entwurf,
      bots: [{ ...gelesen.entwurf.bots[0], antwortLaenge: 1.5 }],
    } as never;
    await expect(entwurfAbdruck(unendlich)).rejects.toThrow(TypeError);
  });
});

describe("Text-Eingabe", () => {
  const gueltig = JSON.stringify(entwurf());

  it("liest gültigen Text", async () => {
    expect((await pruefeEntwurfText(gueltig)).ok).toBe(true);
  });

  it("kein JSON", async () => {
    for (const text of ["", "Hallo", "{", "{'a':1}", "format: pb-teamentwurf/v2"]) {
      expect(await pruefeEntwurfText(text)).toEqual({
        ok: false,
        fehler: [{ pfad: "", code: "kein_json" }],
      });
    }
  });

  it("zu großer Text wird abgewiesen, ohne ihn zu lesen", async () => {
    const riesig = JSON.stringify(
      entwurf({ beschreibung: "x".repeat(ENTWURF_GRENZEN.textBytesMax) }),
    );
    expect(await pruefeEntwurfText(riesig)).toEqual({
      ok: false,
      fehler: [{ pfad: "", code: "zu_gross" }],
    });
    // Wenige Zeichen, aber mehr Bytes als erlaubt (4 Byte je Zeichen).
    const breit = "😀".repeat(ENTWURF_GRENZEN.textBytesMax / 4 + 1);
    expect((await pruefeEntwurfText(breit)).ok).toBe(false);
    expect(await pruefeEntwurfText(breit)).toEqual({
      ok: false,
      fehler: [{ pfad: "", code: "zu_gross" }],
    });
  });

  it("sehr tief verschachtelter Text wirft nicht", async () => {
    const tief = "[".repeat(100_000) + "]".repeat(100_000);
    const ergebnis = await pruefeEntwurfText(tief);
    expect(ergebnis.ok).toBe(false);
  });

  it("bösartiger Text mit Rechten wird abgelehnt", async () => {
    const text = JSON.stringify(
      entwurf({ bots: [bot("A", { rechte: ["alles"], apps: ["mail"] })] }),
    );
    const ergebnis = await pruefeEntwurfText(text);
    expect(ergebnis.ok).toBe(false);
  });
});

describe("Fassung 2 kennt keine Übergabe-Regeln, Rechte und App-Zugriffe", () => {
  const teile = [
    "uebergaben",
    "uebergabe",
    "handoff",
    "delegation",
    "uebergabeWege",
    "rechte",
    "appZugriffe",
    "regeln",
  ];

  it("kein solcher Teil am Entwurf, am Team oder am Bot: unbekannte Felder werden abgelehnt", () => {
    for (const name of teile) {
      expect(fehlerVon(entwurf({ [name]: true }))).toContainEqual({
        pfad: name,
        code: "unbekanntes_feld",
      });
      expect(fehlerVon(entwurf({ team: { ...TEAM, [name]: { erlaubt: true } } }))).toContainEqual({
        pfad: `team.${name}`,
        code: "unbekanntes_feld",
      });
      expect(fehlerVon(entwurf({ bots: [bot("A", { [name]: ["B"] })] }))).toContainEqual({
        pfad: `bots[0].${name}`,
        code: "unbekanntes_feld",
      });
    }
  });

  it("das geprüfte Ergebnis hat genau die Felder der Fassung", () => {
    const ergebnis = leseEntwurf(entwurf());
    if (!ergebnis.ok) throw new Error("ungültig");
    expect(Object.keys(ergebnis.entwurf).sort()).toEqual(["bots", "format", "team", "titel"]);
    expect(Object.keys(ergebnis.entwurf.team).sort()).toEqual([
      "abnahme",
      "leitung",
      "name",
      "zusammenarbeit",
    ]);
  });

  it("eine spätere Fassung wird nicht geraten: eine andere Fassung wird abgelehnt", () => {
    expect(
      fehlerVon(entwurf({ format: "pb-teamentwurf/v3", zusammenarbeit: { uebergaben: false } })),
    ).toContainEqual({ pfad: "format", code: "ungueltiger_wert" });
  });
});

describe("Fassung 1 wird weiter gelesen und in Fassung 2 überführt", () => {
  const alt = (extra: Record<string, unknown> = {}) => entwurfV1(extra);
  const mitBot = (name: string) => ({ name: "Beispiel", ansprechpartner: { art: "bot", name } });

  it("Ansprechpartner Bot wird die Leitung; Zusammenarbeit „aus“, Abnahme „besitzer“", () => {
    const ergebnis = leseEntwurf(alt({ team: mitBot("zwei") }));
    if (!ergebnis.ok) throw new Error("ungültig");
    expect(ergebnis.herkunft).toBe("v1");
    expect(ergebnis.entwurf.format).toBe("pb-teamentwurf/v2");
    expect(ergebnis.entwurf.team).toEqual({
      name: "Beispiel",
      leitung: { name: "Zwei" },
      zusammenarbeit: "aus",
      abnahme: "besitzer",
    });
  });

  it("verliert nichts: Titel, Beschreibung, Teamname und alle Felder aller Bots bleiben gleich", () => {
    const roh = alt({
      beschreibung: "Eine Beschreibung",
      team: mitBot("Eins"),
      bots: [
        bot("Eins", { modell: { slug: "m-1" }, form: "wabe", farbe: "pink", antwortLaenge: 900 }),
        bot("Zwei", { anweisung: "  Zeile 1\n\tZeile 2\n" }),
      ],
    });
    const alt1 = leseEntwurfV1(roh);
    const neu = leseEntwurf(roh);
    if (!alt1.ok || !neu.ok) throw new Error("ungültig");
    expect(neu.entwurf.bots).toEqual(alt1.entwurf.bots);
    expect(neu.entwurf.titel).toBe(alt1.entwurf.titel);
    expect(neu.entwurf.beschreibung).toBe("Eine Beschreibung");
    expect(neu.entwurf.team.name).toBe(alt1.entwurf.team.name);
  });

  it("Ansprechpartner Pai: ohne Angabe der Leitung wird nichts erraten", () => {
    expect(fehlerVon(alt())).toEqual([{ pfad: "team.leitung", code: "leitung_fehlt" }]);
  });

  it("Ansprechpartner Pai: mit ausdrücklich genannter Leitung geht es", () => {
    const ergebnis = leseEntwurf(alt(), { leitungFuerV1: "zwei" });
    expect(ergebnis.ok && ergebnis.entwurf.team.leitung).toEqual({ name: "Zwei" });
    const falsch = leseEntwurf(alt(), { leitungFuerV1: "Fremd" });
    expect(falsch.ok).toBe(false);
  });

  it("hat der Entwurf einen Bot als Ansprechpartner, gilt dieser und nicht die Angabe", () => {
    const ergebnis = leseEntwurf(alt({ team: mitBot("Eins") }), { leitungFuerV1: "Zwei" });
    expect(ergebnis.ok && ergebnis.entwurf.team.leitung).toEqual({ name: "Eins" });
  });

  it("die Prüfungen von Fassung 2 gelten auch für überführte Entwürfe (Name „Team …“)", () => {
    const roh = alt({ team: mitBot("Eins"), bots: [bot("Eins"), bot("Team Zwei")] });
    expect(leseEntwurfV1(roh).ok).toBe(true);
    expect(fehlerVon(roh)).toContainEqual({ pfad: "bots[1].name", code: "name_reserviert" });
  });

  it("Fassung 1 gilt weiter streng: unbekannte Felder und ein unbekannter Ansprechpartner", () => {
    expect(fehlerVon(alt({ rechte: [] }))).toContainEqual({
      pfad: "rechte",
      code: "unbekanntes_feld",
    });
    expect(fehlerVon(alt({ team: mitBot("Fremd") }))).toContainEqual({
      pfad: "team.ansprechpartner.name",
      code: "ansprechpartner_unbekannt",
    });
    expect(fehlerVon(alt({ team: { ...mitBot("Eins"), zusammenarbeit: "aus" } }))).toContainEqual({
      pfad: "team.zusammenarbeit",
      code: "unbekanntes_feld",
    });
  });

  it("Fassung 2 mit einem Feld aus Fassung 1 (Ansprechpartner) wird abgelehnt, nicht überführt", () => {
    const roh = entwurf({ team: { ...TEAM, ansprechpartner: { art: "pai" } } });
    expect(fehlerVon(roh)).toContainEqual({
      pfad: "team.ansprechpartner",
      code: "unbekanntes_feld",
    });
  });

  it("pruefeEntwurf liest Fassung 1, überführt und bildet den Abdruck der Fassung 2", async () => {
    const ergebnis = await pruefeEntwurf(alt({ team: mitBot("Eins") }));
    if (!ergebnis.ok) throw new Error("ungültig");
    expect(ergebnis.herkunft).toBe("v1");
    expect(ergebnis.abdruck).toBe(await entwurfAbdruck(ergebnis.entwurf));
  });
});

describe("Der Abdruck bindet die Fassung", () => {
  it("derselbe Entwurf in Fassung 1 und in Fassung 2 hat verschiedene Abdrücke", async () => {
    const roh = entwurfV1({
      team: { name: "Beispiel", ansprechpartner: { art: "bot", name: "Eins" } },
    });
    const alt = leseEntwurfV1(roh);
    const neu = leseEntwurf(roh);
    if (!alt.ok || !neu.ok) throw new Error("ungültig");
    const abdruckAlt = await entwurfAbdruckV1(alt.entwurf);
    const abdruckNeu = await entwurfAbdruck(neu.entwurf);
    expect(abdruckAlt).not.toBe(abdruckNeu);
    expect(abdruckAlt).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("derselbe Inhalt mit dem Vorsatz der anderen Fassung ergibt einen anderen Abdruck", async () => {
    const neu = leseEntwurf(entwurf());
    if (!neu.ok) throw new Error("ungültig");
    const text = JSON.stringify(neu.entwurf);
    expect(text.length).toBeGreaterThan(0);
    // Unabhängig berechnet: Vorsatz v2 ergibt den Abdruck der Funktion, Vorsatz v1 nicht.
    const sha = async (vorsatz: string) => {
      const kanon = (w: unknown): string =>
        Array.isArray(w)
          ? `[${w.map(kanon).join(",")}]`
          : typeof w === "object" && w !== null
            ? `{${Object.keys(w)
                .sort()
                .map((k) => `${JSON.stringify(k)}:${kanon((w as Record<string, unknown>)[k])}`)
                .join(",")}}`
            : JSON.stringify(w);
      const summe = createHash("sha256")
        .update(`${vorsatz}${kanon(neu.entwurf)}`)
        .digest("hex");
      return `sha256:${summe}`;
    };
    expect(await entwurfAbdruck(neu.entwurf)).toBe(await sha("pb-teamentwurf/v2\n"));
    expect(await entwurfAbdruck(neu.entwurf)).not.toBe(await sha("pb-teamentwurf/v1\n"));
  });

  it("Zusammenarbeit und Abnahme gehören zum Abdruck", async () => {
    const abdruck = async (team: Record<string, unknown>) => {
      const e = await pruefeEntwurf(entwurf({ team: { ...TEAM, ...team } }));
      if (!e.ok) throw new Error("ungültig");
      return e.abdruck;
    };
    const basis = await abdruck({});
    expect(await abdruck({ zusammenarbeit: "leitung_fuehrt" })).not.toBe(basis);
    expect(await abdruck({ abnahme: "leitung" })).not.toBe(basis);
  });
});

describe("Entwürfe, die ein Modell schreibt, haben keine Zusammenarbeit", () => {
  const fuehrt = entwurf({ team: { ...TEAM, zusammenarbeit: "leitung_fuehrt" } });

  it("„Leitung führt“ wird „aus“, mit Hinweis; der Abdruck gilt für den geänderten Entwurf", async () => {
    const ergebnis = await pruefeEntwurf(fuehrt, { quelle: "assistent" });
    if (!ergebnis.ok) throw new Error("ungültig");
    expect(ergebnis.entwurf.team.zusammenarbeit).toBe("aus");
    expect(ergebnis.hinweise).toContainEqual({ code: "zusammenarbeit_auf_aus" });
    expect(ergebnis.abdruck).toBe(await entwurfAbdruck(ergebnis.entwurf));
  });

  it("steht schon „aus“ da, gibt es keinen Hinweis", async () => {
    const ergebnis = await pruefeEntwurf(entwurf(), { quelle: "assistent" });
    expect(ergebnis.ok && ergebnis.hinweise).toEqual([]);
  });

  it("eine Vorlage oder Datei behält ihren Wert (die Vorschau zeigt ihn)", async () => {
    const ergebnis = await pruefeEntwurf(fuehrt);
    expect(ergebnis.ok && ergebnis.entwurf.team.zusammenarbeit).toBe("leitung_fuehrt");
  });

  it("die Leitung und die Abnahme bleiben, wie sie sind", async () => {
    const roh = entwurf({
      team: { ...TEAM, zusammenarbeit: "leitung_fuehrt", abnahme: "leitung" },
    });
    const ergebnis = await pruefeEntwurf(roh, { quelle: "assistent" });
    expect(ergebnis.ok && ergebnis.entwurf.team).toMatchObject({
      leitung: { name: "Eins" },
      abnahme: "leitung",
    });
  });
});

describe("Reinheit", () => {
  it("die Quelle braucht weder Datenbank noch Netz noch Dateien", () => {
    const quelle = readFileSync(new URL("./format.ts", import.meta.url), "utf8");
    const importe = [...quelle.matchAll(/^import[^;]*from "([^"]+)";/gm)].map((m) => m[1]);
    expect(importe.sort()).toEqual(
      [
        "@paibot/shared/anzeigetext",
        "@paibot/shared/grundtypen",
        "@paibot/shared/konstanten",
        "@paibot/shared/objekte",
        "zod",
      ].sort(),
    );
    expect(quelle).not.toMatch(/\bfetch\s*\(/);
  });
});
