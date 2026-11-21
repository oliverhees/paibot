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

import { readFileSync } from "node:fs";
import { AVATAR_SHAPES, BOT_COLORS } from "@paibot/shared/objekte";
import { describe, expect, it } from "vitest";
import {
  ENTWURF_GRENZEN,
  entwurfAbdruck,
  leseEntwurf,
  ordneModelleZu,
  pruefeEntwurf,
  pruefeEntwurfText,
  WIE_PAI,
} from "./format";

function bot(name: string, extra: Record<string, unknown> = {}) {
  return { name, aufgabe: "Beispiel-Aufgabe", anweisung: "Beispiel-Anweisung.", ...extra };
}

function entwurf(extra: Record<string, unknown> = {}) {
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
    [
      "Feld im Team",
      entwurf({ team: { name: "X", ansprechpartner: { art: "pai" }, admin: true } }),
      "team.admin",
    ],
    ["Feld am Bot", entwurf({ bots: [bot("Eins", { darf: "alles" })] }), "bots[0].darf"],
    [
      "Feld im Modell",
      entwurf({ bots: [bot("Eins", { modell: { slug: "a", preis: 1 } })] }),
      "bots[0].modell",
    ],
    [
      "Feld am Ansprechpartner",
      entwurf({ team: { name: "X", ansprechpartner: { art: "pai", rolle: "chef" } } }),
      "team.ansprechpartner",
    ],
    [
      "Schlüssel __proto__",
      JSON.parse(`{"__proto__":{"admin":true},"format":"pb-teamentwurf/v1"}`),
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
    expect(fehlerVon(entwurf({ format: "pb-teamentwurf/v2" }))[0]).toEqual({
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
    expect(
      fehlerVon(entwurf({ team: { name: "x".repeat(61), ansprechpartner: { art: "pai" } } }))[0]
        ?.pfad,
    ).toBe("team.name");
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

describe("Namen und Ansprechpartner", () => {
  it("doppelte Namen, auch in anderer Schreibweise, werden abgelehnt", () => {
    expect(fehlerVon(entwurf({ bots: [bot("Ideen"), bot("ideen")] }))).toContainEqual({
      pfad: "bots[1].name",
      code: "name_doppelt",
    });
    expect(fehlerVon(entwurf({ bots: [bot("Ideen"), bot("Ideen")] }))[0]?.code).toBe(
      "name_doppelt",
    );
  });

  it("Ansprechpartner muss ein Bot des Entwurfs sein", () => {
    const team = (name: string) => ({ name: "T", ansprechpartner: { art: "bot", name } });
    expect(fehlerVon(entwurf({ team: team("Fremd") }))).toContainEqual({
      pfad: "team.ansprechpartner.name",
      code: "ansprechpartner_unbekannt",
    });
    const ergebnis = leseEntwurf(entwurf({ team: team("zwei") }));
    expect(ergebnis.ok && ergebnis.entwurf.team.ansprechpartner).toEqual({
      art: "bot",
      name: "Zwei",
    });
  });

  it("Pai als Ansprechpartner", () => {
    const ergebnis = leseEntwurf(entwurf());
    expect(ergebnis.ok && ergebnis.entwurf.team.ansprechpartner).toEqual({ art: "pai" });
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
    format: "pb-teamentwurf/v1",
    titel: "Mini-Team",
    team: { name: "Mini", ansprechpartner: { art: "pai" } },
    bots: [{ name: "Ideen", aufgabe: "Themen sammeln", anweisung: "Sammle Themen." }],
  };

  async function abdruckVon(roh: unknown) {
    const ergebnis = await pruefeEntwurf(roh);
    if (!ergebnis.ok) throw new Error("ungültig");
    return ergebnis.abdruck;
  }

  it("hat die festgelegte Form (Bekannter Wert, unabhängig mit sha256sum berechnet)", async () => {
    expect(await abdruckVon(klein)).toBe(
      "sha256:9c49b4b41911485411ba90eaef5551edcb47b4ccd4d5709fadb70fd451271e6f",
    );
  });

  it("hängt nicht von der Reihenfolge der Felder ab", async () => {
    const umgedreht = {
      bots: [{ anweisung: "Sammle Themen.", aufgabe: "Themen sammeln", name: "Ideen" }],
      team: { ansprechpartner: { art: "pai" }, name: "Mini" },
      titel: "Mini-Team",
      format: "pb-teamentwurf/v1",
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
      { ...klein, team: { ...klein.team, ansprechpartner: { art: "bot", name: "Ideen" } } },
      { ...klein, bots: [{ ...klein.bots[0], name: "Ideen2" }] },
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
    const a = { ...klein, bots: [{ ...klein.bots[0], name: "Café" }] };
    const b = { ...klein, bots: [{ ...klein.bots[0], name: "  Café " }] };
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
    for (const text of ["", "Hallo", "{", "{'a':1}", "format: pb-teamentwurf/v1"]) {
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

describe("Fassung 1 kennt keine Übergaben zwischen Bots", () => {
  const teile = [
    "uebergaben",
    "uebergabe",
    "zusammenarbeit",
    "handoff",
    "delegation",
    "uebergabeWege",
  ];

  it("kein Übergabe-Teil am Entwurf, am Team oder am Bot: unbekannte Felder werden abgelehnt", () => {
    for (const name of teile) {
      expect(fehlerVon(entwurf({ [name]: true }))).toContainEqual({
        pfad: name,
        code: "unbekanntes_feld",
      });
      expect(
        fehlerVon(
          entwurf({
            team: { name: "T", ansprechpartner: { art: "pai" }, [name]: { erlaubt: true } },
          }),
        ),
      ).toContainEqual({ pfad: `team.${name}`, code: "unbekanntes_feld" });
      expect(fehlerVon(entwurf({ bots: [bot("A", { [name]: ["B"] })] }))).toContainEqual({
        pfad: `bots[0].${name}`,
        code: "unbekanntes_feld",
      });
    }
  });

  it("ein Entwurf ohne Übergabe-Teil legt nichts fest: das geprüfte Ergebnis hat keinen", () => {
    const ergebnis = leseEntwurf(entwurf());
    if (!ergebnis.ok) throw new Error("ungültig");
    expect(Object.keys(ergebnis.entwurf).sort()).toEqual(["bots", "format", "team", "titel"]);
    expect(Object.keys(ergebnis.entwurf.team).sort()).toEqual(["ansprechpartner", "name"]);
  });

  it("ein späterer Übergabe-Teil kann nur mit neuer Fassung kommen: eine andere Fassung wird abgelehnt", () => {
    expect(
      fehlerVon(entwurf({ format: "pb-teamentwurf/v2", zusammenarbeit: { uebergaben: false } })),
    ).toContainEqual({
      pfad: "format",
      code: "ungueltiger_wert",
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
