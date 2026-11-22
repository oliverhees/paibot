/**
 * PaiBot – Feste Zeilen in Bot-Antworten (Tests)
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { describe, expect, it } from "vitest";
import type { RaumBot } from "./namen";
import {
  erkenneZeilen,
  MAX_ZETTEL_ZEICHEN,
  type ZeilenEingabe,
  type ZeilenErgebnis,
} from "./zeilen";

const bot = (id: string, name: string, pausiert = false): RaumBot => ({ id, name, pausiert });
const REDAKTION = bot("b0", "Redaktion");
const IDEEN = bot("b1", "Ideen");
const ENTWURF = bot("b2", "Entwurf");
const LEKTORAT = bot("b3", "Lektorat");
const DRTEXT = bot("b4", "Dr. Text");
const TEAM = [REDAKTION, IDEEN, ENTWURF, LEKTORAT, DRTEXT];
const NORMAL = { laufStatus: "succeeded", grund: "stop" } as const;

/** Antwort der Leitung im Faden, auf die Nachricht der Person. */
const leitung = (text: string, teil: Partial<ZeilenEingabe> = {}): ZeilenEingabe => ({
  text,
  geber: { botId: "b0", rolle: "leitung" },
  mitglieder: TEAM,
  leitungId: "b0",
  abschluss: NORMAL,
  auftragArt: "wurzel",
  conversationKind: "faden",
  ...teil,
});
/** Antwort eines Mitglieds, das den Stab von der Leitung hat. */
const mitglied = (text: string, teil: Partial<ZeilenEingabe> = {}): ZeilenEingabe =>
  leitung(text, {
    geber: { botId: "b2", rolle: "mitglied" },
    auftragArt: "uebergabe",
    ...teil,
  });
/** Antwort von Pai im Direkt-Chat. */
const pai = (text: string, teil: Partial<ZeilenEingabe> = {}): ZeilenEingabe => ({
  text,
  geber: { botId: "pai", rolle: "stabschef" },
  mitglieder: [],
  leitungId: null,
  teams: [
    { teamName: "Content", leitung: REDAKTION },
    { teamName: "Recherche", leitung: bot("r0", "Quelle") },
  ],
  abschluss: NORMAL,
  auftragArt: "keiner",
  conversationKind: "direkt",
  ...teil,
});

const arten = (e: ZeilenErgebnis) => e.wuensche.map((w) => w.art);
const keine = (e: ZeilenErgebnis) => expect(e.wuensche).toEqual([]);

describe("erkenneZeilen: eine gültige Zeile", () => {
  it("Leitung gibt an ein Mitglied: Zettel, Fertig-wenn, Weg, Zeilennummer", () => {
    const e = erkenneZeilen(
      leitung("Ich verteile.\n\n@Ideen: Sammle fünf Blickwinkel. Fertig, wenn: fünf Stück\n"),
    );
    expect(e.grund).toBeNull();
    expect(e.unklar).toBe(false);
    expect(e.wuensche).toHaveLength(1);
    const w = e.wuensche[0];
    expect(w?.art).toBe("uebergabe");
    expect(w?.zeile).toBe(3);
    expect(w?.ziel).toEqual({ botId: "b1", name: "Ideen", pausiert: false });
    expect(w?.zettel).toBe("Sammle fünf Blickwinkel. Fertig, wenn: fünf Stück");
    expect(w?.zettelLaenge).toBe(w?.zettel.length);
    expect(w?.fertigWenn).toBe("fünf Stück");
    expect(w?.weg?.code).toBe("leitung_an_mitglied");
    expect(e.breite).toBe(1);
  });

  it("ein Mitglied, das dran ist, schreibt eine Bitte an einen Kollegen", () => {
    const e = erkenneZeilen(mitglied("@Ideen: Gib mir drei Zitate."));
    expect(arten(e)).toEqual(["bitte"]);
    expect(e.wuensche[0]?.weg).toMatchObject({
      code: "mitglied_bittet_kollegen",
      geberRolle: "mitglied",
      zielRolle: "mitglied",
      art: "bitte",
      sameTeam: true,
    });
  });

  it("Name mit Leerzeichen, Groß/Klein und Unicode-Form egal", () => {
    expect(erkenneZeilen(leitung("@Dr. Text: prüfe das")).wuensche[0]?.ziel?.botId).toBe("b4");
    expect(erkenneZeilen(leitung("@dr.  text: prüfe das")).wuensche[0]?.ziel?.botId).toBe("b4");
    expect(erkenneZeilen(leitung("@IDEEN: los")).wuensche[0]?.ziel?.botId).toBe("b1");
    expect(erkenneZeilen(leitung("@ideen: los")).wuensche[0]?.ziel?.botId).toBe("b1");
    expect(erkenneZeilen(leitung("@Ideen:los")).wuensche[0]?.zettel).toBe("los");
  });

  it("Zettel reicht bis zur nächsten festen Zeile oder Leerzeile und wird nicht weiter gelesen", () => {
    const e = erkenneZeilen(
      leitung("@Ideen: Erste Zeile\nzweite Zeile\n\ndritte Zeile gehört nicht dazu"),
    );
    expect(e.wuensche[0]?.zettel).toBe("Erste Zeile\nzweite Zeile");
    const f = erkenneZeilen(mitglied("@Ideen: Bitte\nmehr dazu\nFrage an dich: ob das stimmt"));
    expect(arten(f)).toEqual([]); // Bitte und Frage zusammen widersprechen sich
    expect(f.grund).toBe("widerspruch");
  });

  it("Zettel wird bereinigt: Steuer- und unsichtbare Zeichen raus", () => {
    const e = erkenneZeilen(leitung("@Ideen: A​b\u0007c\td"));
    expect(e.wuensche[0]?.zettel).toBe("Abc d");
  });

  it("Zeile im letzten Absatz ohne abschließenden Zeilenumbruch zählt", () => {
    expect(arten(erkenneZeilen(leitung("Text\n\n@Ideen: los")))).toEqual(["uebergabe"]);
    expect(arten(erkenneZeilen(leitung("@Ideen: los")))).toEqual(["uebergabe"]);
  });
});

describe("erkenneZeilen: was keine Zeile ist (Spalte 0, ASCII, nicht in Code, Zitat, Liste)", () => {
  const faelle: [string, string][] = [
    ["mitten im Satz", "Das sagte @Ideen: gestern"],
    ["ein Leerzeichen davor", " @Ideen: los"],
    ["vier Leerzeichen eingerückt nach Leerzeile", "Text\n\n    @Ideen: los"],
    ["Tabulator eingerückt nach Leerzeile", "Text\n\n\t@Ideen: los"],
    ["Absatz-Fortsetzung eingerückt", "Text\n    @Ideen: los"],
    ["Aufzählung mit Strich", "- @Ideen: los"],
    ["Aufzählung mit Stern", "* @Ideen: los"],
    ["nummerierte Liste", "1. @Ideen: los"],
    ["Zitat", "> @Ideen: los"],
    ["Zitat ohne Leerzeichen", ">@Ideen: los"],
    ["Fortsetzung eines Zitats", "> Zitat\n@Ideen: los"],
    ["Fortsetzung eines Listenpunkts", "- Punkt\n@Ideen: los"],
    ["Code-Zaun", "```\n@Ideen: los\n```"],
    ["Code-Zaun mit Tilden", "~~~\n@Ideen: los\n~~~"],
    ["Code-Zaun mit Sprache", "```text\n@Ideen: los\n```"],
    ["nicht geschlossener Code-Zaun", "```\n@Ideen: los"],
    ["Tabellenrand", "| @Ideen: los |"],
    ["Nullbreite-Zeichen vor dem @", "​@Ideen: los"],
    ["Voll breites ＠", "＠Ideen: los"],
    ["Voll breiter Doppelpunkt", "@Ideen： los"],
    ["Doppelpunkt fehlt", "@Ideen los"],
    ["Leerzeichen nach dem @", "@ Ideen: los"],
    ["kleingeschriebenes Schlüsselwort", "fertig: alles"],
    ["Schlüsselwort mitten im Satz", "Wir sind Fertig: ja"],
  ];
  it.each(faelle)("%s → kein Wunsch", (_name, text) => {
    const e = erkenneZeilen(leitung(text));
    keine(e);
    expect(e.grund).toBeNull();
    expect(e.unklar).toBe(false);
  });

  it("nach einer Leerzeile ist die Zeile nach Zitat und Liste wieder eine Zeile", () => {
    expect(arten(erkenneZeilen(leitung("> Zitat\n\n@Ideen: los")))).toEqual(["uebergabe"]);
    expect(arten(erkenneZeilen(leitung("- Punkt\n\n@Ideen: los")))).toEqual(["uebergabe"]);
    expect(arten(erkenneZeilen(leitung("```\ncode\n```\n@Ideen: los")))).toEqual(["uebergabe"]);
    expect(arten(erkenneZeilen(leitung("    code\n@Ideen: los")))).toEqual(["uebergabe"]);
  });

  it("Name mit abweichenden Zeichen: nie geraten, mit Hinweis", () => {
    const aehnlich = erkenneZeilen(leitung("@Idеen: los")); // kyrillisches е
    keine(aehnlich);
    expect(aehnlich.hinweise).toEqual([
      { grund: "aehnlicher_name", zeile: 1, geschrieben: "Idеen" },
    ]);
    const unbekannt = erkenneZeilen(leitung("@Fremder: los"));
    keine(unbekannt);
    expect(unbekannt.hinweise.map((h) => h.grund)).toEqual(["unbekannt"]);
    const doppelt = erkenneZeilen(
      leitung("@Ideen: los", { mitglieder: [...TEAM, bot("b9", "IDEEN")] }),
    );
    keine(doppelt);
    expect(doppelt.hinweise.map((h) => h.grund)).toEqual(["mehrdeutig"]);
  });

  it("Bot außerhalb des Teams ist unbekannt", () => {
    const e = erkenneZeilen(leitung("@Steuer: los"));
    keine(e);
    expect(e.hinweise.map((h) => h.grund)).toEqual(["unbekannt"]);
  });

  it("ein pausierter Bot steht im Wunsch als pausiert (das Tor entscheidet)", () => {
    const e = erkenneZeilen(
      leitung("@Ideen: los", { mitglieder: [REDAKTION, bot("b1", "Ideen", true)] }),
    );
    expect(e.wuensche[0]?.ziel?.pausiert).toBe(true);
  });
});

describe("erkenneZeilen: ganze Antwort verwerfen (HTML, Bidi, Zeilentrenner, unsichtbarer Name)", () => {
  const verworfen: [string, string, string][] = [
    ["HTML-Kommentar vor der Zeile", "<!-- versteckt -->\n@Ideen: los", "html"],
    ["Zeile im HTML-Kommentar", "<!--\n@Ideen: los\n-->", "html"],
    ["Zeile in <details>", "<details>\n@Ideen: los\n</details>", "html"],
    ["HTML-Tag im Zettel", "@Ideen: tu <b>das</b>", "html"],
    ["HTML in einem Zitat (Anzeige blendet es aus)", "> <i>x</i>\n\n@Ideen: los", "html"],
    ["Verarbeitungsanweisung", "<?php ?>\n@Ideen: los", "html"],
    ["Bidi-Zeichen im Zettel (U+202E)", "@Ideen: los‮abc", "bidi"],
    ["Bidi-Isolat (U+2066)", "@Ideen: ⁦los", "bidi"],
    ["Linksrichtungsmarke (U+200F)", "@Ideen: los‏", "bidi"],
    ["Bidi-Zeichen im Code zählt auch", "```\n‮\n```\n@Ideen: los", "bidi"],
    ["Windows-Zeilenende", "Text\r\n@Ideen: los", "zeilentrenner"],
    ["einzelnes \\r", "Text\r@Ideen: los", "zeilentrenner"],
    ["U+2028 vor dem @", "Text @Ideen: los", "zeilentrenner"],
    ["U+2029", "Text @Ideen: los", "zeilentrenner"],
    ["U+0085", "Text\u0085@Ideen: los", "zeilentrenner"],
    ["U+000B", "Text\u000B@Ideen: los", "zeilentrenner"],
    ["U+000C", "Text\u000C@Ideen: los", "zeilentrenner"],
    ["Nullbreite-Zeichen mitten im Namen", "@Ide​en: los", "unsichtbar_im_namen"],
    ["Nullbreite-Zeichen am Ende des Namens", "@Ideen​: los", "unsichtbar_im_namen"],
    ["Steuerzeichen im Namen", "@Ide\u0007en: los", "unsichtbar_im_namen"],
    ["Nullbreite-Zeichen im Namen nach Zurück an", "Zurück an @Ide​en: los", "unsichtbar_im_namen"],
  ];
  it.each(verworfen)("%s → keine Wünsche, Grund %s", (_name, text, grund) => {
    const e = erkenneZeilen(leitung(text));
    keine(e);
    expect(e.grund).toBe(grund);
    expect(e.unklar).toBe(true);
  });

  it("HTML in Code ist kein HTML; ein einzelnes < ist keines", () => {
    expect(arten(erkenneZeilen(leitung("```html\n<b>x</b>\n```\n@Ideen: los")))).toEqual([
      "uebergabe",
    ]);
    expect(arten(erkenneZeilen(leitung("Nimm `<div>` und\n\n@Ideen: los")))).toEqual(["uebergabe"]);
    expect(arten(erkenneZeilen(leitung("    <b>\n\n@Ideen: los")))).toEqual(["uebergabe"]);
    expect(arten(erkenneZeilen(leitung("a < b und 3 <5\n@Ideen: los")))).toEqual(["uebergabe"]);
  });

  it("Zeilentrenner und Bidi gelten auch ohne feste Zeile (die ganze Antwort ist unklar)", () => {
    expect(erkenneZeilen(leitung("nur Text\r\nmehr")).grund).toBe("zeilentrenner");
    expect(erkenneZeilen(leitung("nur Text‮")).grund).toBe("bidi");
  });
});

describe("erkenneZeilen: nur normal beendete Antworten an erlaubten Orten", () => {
  it("Abbruch durch Länge, Fehler, Stopp, Werkzeug-Wunsch, fehlende Angabe → keine Wünsche", () => {
    for (const abschluss of [
      { laufStatus: "succeeded", grund: "length" },
      { laufStatus: "succeeded", grund: "tool-calls" },
      { laufStatus: "succeeded", grund: "" },
      { laufStatus: "failed", grund: "stop" },
      { laufStatus: "cancelled", grund: "stop" },
      { laufStatus: "", grund: "" },
      undefined as unknown as { laufStatus: string; grund: string },
    ]) {
      const e = erkenneZeilen(leitung("@Ideen: los", { abschluss }));
      keine(e);
      expect(e.grund).toBe("nicht_normal_beendet");
    }
  });

  it("Direkt-Chats anderer Bots werten nichts aus; Pais Direkt-Chat schon", () => {
    const direkt = erkenneZeilen(leitung("@Ideen: los", { conversationKind: "direkt" }));
    keine(direkt);
    expect(direkt.grund).toBe("kein_ort");
    expect(erkenneZeilen(leitung("@Ideen: los", { conversationKind: "sonstwas" })).grund).toBe(
      "kein_ort",
    );
    expect(arten(erkenneZeilen(pai("@Team Content: Artikel")))).toEqual(["team"]);
  });

  it("leere Antwort", () => {
    for (const text of ["", "   \n\n  "]) {
      const e = erkenneZeilen(leitung(text));
      keine(e);
      expect(e.grund).toBe("leer");
      expect(e.unklar).toBe(false);
    }
  });

  it("sehr lange Antwort: nie teilweise gelesen", () => {
    const lang = `${"wort ".repeat(50_000)}\n\n@Ideen: los`;
    const e = erkenneZeilen(leitung(lang));
    keine(e);
    expect(e.grund).toBe("antwort_zu_lang");
    expect(e.antwortLaenge).toBe(lang.length);
    // knapp unter der Grenze wird ganz gelesen, auch eine Zeile ganz am Ende
    const ok = `${"x".repeat(150_000)}\n\n@Ideen: los`;
    expect(arten(erkenneZeilen(leitung(ok)))).toEqual(["uebergabe"]);
    expect(erkenneZeilen(leitung("@Ideen: los", { maxAntwortZeichen: 5 })).grund).toBe(
      "antwort_zu_lang",
    );
  });

  it("wirft nie, auch bei Unsinn in der Eingabe", () => {
    const schlecht = [
      leitung(undefined as unknown as string),
      leitung(42 as unknown as string),
      { ...leitung("@Ideen: x"), geber: undefined as unknown as ZeilenEingabe["geber"] },
      leitung("@\u0000: x"),
      leitung("@:"),
      leitung(":"),
      leitung("@".repeat(5000)),
    ];
    for (const eingabe of schlecht) expect(() => erkenneZeilen(eingabe)).not.toThrow();
  });
});

describe("erkenneZeilen: Auftragszettel und seine Länge", () => {
  it("genau 2 000 Zeichen gehen, 2 001 nicht: nicht gekürzt, als Fakt gemeldet", () => {
    const genau = erkenneZeilen(leitung(`@Ideen: ${"a".repeat(MAX_ZETTEL_ZEICHEN)}`));
    expect(genau.wuensche).toHaveLength(1);
    expect(genau.wuensche[0]?.zettelLaenge).toBe(2000);
    const zuLang = erkenneZeilen(leitung(`@Ideen: ${"a".repeat(MAX_ZETTEL_ZEICHEN + 1)}`));
    keine(zuLang);
    expect(zuLang.grund).toBeNull();
    expect(zuLang.verworfen).toHaveLength(1);
    expect(zuLang.verworfen[0]).toMatchObject({
      grund: "zettel_zu_lang",
      art: "uebergabe",
      zeile: 1,
      zettelLaenge: 2001,
    });
    expect(zuLang.verworfen[0]?.zettelAnfang.length).toBe(200);
  });

  it("gezählt werden Zeichen, nicht UTF-16-Einheiten", () => {
    const emojis = "😀".repeat(MAX_ZETTEL_ZEICHEN);
    expect(erkenneZeilen(leitung(`@Ideen: ${emojis}`)).wuensche).toHaveLength(1);
  });

  it("ein zu langer Zettel zählt trotzdem als Zeile (zwei Zeilen der Leitung bleiben zwei)", () => {
    const e = erkenneZeilen(leitung(`@Ideen: ${"a".repeat(2001)}\n@Entwurf: kurz`));
    keine(e);
    expect(e.grund).toBe("zwei_zeilen_leitung");
  });

  it("Zettel bei Fertig und Frage: gleiche Länge-Regel", () => {
    const e = erkenneZeilen(leitung(`Fertig: ${"b".repeat(2001)}`));
    keine(e);
    expect(e.verworfen[0]).toMatchObject({ grund: "zettel_zu_lang", art: "fertig" });
  });
});

describe("erkenneZeilen: mehrere Zeilen und Widersprüche", () => {
  it("zwei @-Zeilen eines Mitglieds → keine Bitte (nicht „erste gewinnt“)", () => {
    const e = erkenneZeilen(mitglied("@Ideen: eins\n@Lektorat: zwei"));
    keine(e);
    expect(e.grund).toBe("zwei_zeilen_mitglied");
    expect(e.unklar).toBe(true);
  });

  it("zwei @-Zeilen der Leitung → keine Übergabe, solange keine Fächer erlaubt sind", () => {
    const text = "@Ideen: eins\n@Lektorat: zwei";
    const e = erkenneZeilen(leitung(text));
    keine(e);
    expect(e.grund).toBe("zwei_zeilen_leitung");
    const f = erkenneZeilen(leitung(text, { faecher: true }));
    expect(f.wuensche.map((w) => w.ziel?.botId)).toEqual(["b1", "b3"]);
    expect(f.breite).toBe(2);
    expect(f.grund).toBeNull();
  });

  it("Pai darf mehrere Teams in einer Antwort anschreiben", () => {
    const e = erkenneZeilen(pai("@Team Content: A\n@Team Recherche: B"));
    expect(e.wuensche.map((w) => w.ziel?.botId)).toEqual(["b0", "r0"]);
    expect(e.breite).toBe(2);
  });

  it("Fertig und @Name zusammen → keine Zeile gilt", () => {
    const e = erkenneZeilen(leitung("Fertig: alles\n@Ideen: noch was"));
    keine(e);
    expect(e.grund).toBe("widerspruch");
    expect(erkenneZeilen(leitung("@Ideen: noch was\nFertig: alles")).grund).toBe("widerspruch");
  });

  it("andere Mischungen widersprechen sich ebenso", () => {
    for (const text of [
      "Fertig: a\nFrage an dich: b",
      "Zurück an @Ideen: a\n@Entwurf: b",
      "Zurück an @Ideen: a\nFertig: b",
      "Frage an dich: a\n@Ideen: b",
    ]) {
      const e = erkenneZeilen(leitung(text));
      keine(e);
      expect(e.grund).toBe("widerspruch");
    }
  });

  it("zweimal dieselbe Art (Fertig, Frage, Zurück an) → keine Zeile gilt", () => {
    for (const text of [
      "Fertig: a\n\nFertig: b",
      "Frage an dich: a\n\nFrage an dich: b",
      "Zurück an @Ideen: a\n\nZurück an @Entwurf: b",
    ]) {
      const e = erkenneZeilen(leitung(text));
      keine(e);
      expect(e.grund).toBe("mehrfach");
    }
  });

  it("eine unbekannte @-Zeile neben einer gültigen verändert die gültige nicht", () => {
    const e = erkenneZeilen(leitung("@Fremder: x\n@Ideen: los"));
    expect(arten(e)).toEqual(["uebergabe"]);
    expect(e.hinweise).toHaveLength(1);
  });
});

describe("erkenneZeilen: Fertig, Zurück an, Frage und Möglichkeiten", () => {
  it("Fertig mit Kurzfassung", () => {
    const e = erkenneZeilen(leitung("Fertig: Artikel steht, 600 Wörter."));
    expect(e.wuensche[0]).toMatchObject({
      art: "fertig",
      ziel: null,
      weg: null,
      zettel: "Artikel steht, 600 Wörter.",
    });
    expect(e.breite).toBe(0);
  });

  it("Zurück an @Name von der Leitung", () => {
    const e = erkenneZeilen(leitung("Zurück an @Entwurf: Zu kurz.", { botIdsMitAuftrag: ["b2"] }));
    expect(e.wuensche[0]).toMatchObject({ art: "rueckgabe", ziel: { botId: "b2" } });
    expect(e.wuensche[0]?.weg).toMatchObject({
      code: "leitung_gibt_zurueck",
      zielHatAuftrag: true,
    });
    const ohne = erkenneZeilen(
      leitung("Zurück an @Entwurf: Zu kurz.", { botIdsMitAuftrag: ["b1"] }),
    );
    expect(ohne.wuensche[0]?.weg?.zielHatAuftrag).toBe(false);
    expect(
      erkenneZeilen(leitung("Zurück an @Entwurf: x")).wuensche[0]?.weg?.zielHatAuftrag,
    ).toBeNull();
  });

  it("Frage an dich mit Möglichkeiten direkt darunter", () => {
    const e = erkenneZeilen(
      mitglied("Frage an dich: Welche Länge?\nMöglichkeiten: kurz | mittel | lang"),
    );
    expect(e.wuensche).toHaveLength(1);
    expect(e.wuensche[0]).toMatchObject({
      art: "frage",
      zettel: "Welche Länge?",
      moeglichkeiten: ["kurz", "mittel", "lang"],
      moeglichkeitenGrund: null,
    });
    expect(e.verworfen).toEqual([]);
  });

  it("Frage ohne Möglichkeiten", () => {
    const e = erkenneZeilen(mitglied("Frage an dich: Welche Länge?"));
    expect(e.wuensche[0]).toMatchObject({ moeglichkeiten: [], moeglichkeitenGrund: null });
  });

  const schlechte: [string, string, string][] = [
    ["vier Möglichkeiten", "a | b | c | d", "zu_viele"],
    ["eine zu lange Möglichkeit", `a | ${"x".repeat(121)}`, "zu_lang"],
    ["Link mit Schema", "a | https://beispiel.de", "link"],
    ["Link ohne Schema", "a | www.beispiel.de", "link"],
    ["Markdown-Link", "a | [hier](x)", "link"],
    ["E-Mail-Link", "a | mailto:x@y.de", "link"],
    ["spitze Klammer", "a | x>y", "link"],
    ["leere Möglichkeit", "a | | b", "leer"],
    ["nichts", "", "leer"],
  ];
  it.each(schlechte)("%s → keine Möglichkeiten", (_n, rest, grund) => {
    const e = erkenneZeilen(mitglied(`Frage an dich: Wie?\nMöglichkeiten: ${rest}`));
    expect(e.wuensche[0]?.moeglichkeiten).toEqual([]);
    expect(e.wuensche[0]?.moeglichkeitenGrund).toBe(grund);
  });

  it("120 Zeichen gehen, drei gehen", () => {
    const e = erkenneZeilen(
      mitglied(`Frage an dich: Wie?\nMöglichkeiten: ${"x".repeat(120)} | b | c`),
    );
    expect(e.wuensche[0]?.moeglichkeiten).toHaveLength(3);
  });

  it("Möglichkeiten nicht direkt unter der Frage (Leerzeile) oder ohne Frage: ohne Wirkung", () => {
    const getrennt = erkenneZeilen(mitglied("Frage an dich: Wie?\n\nMöglichkeiten: a | b"));
    expect(getrennt.wuensche[0]?.moeglichkeiten).toEqual([]);
    expect(getrennt.verworfen[0]).toMatchObject({ grund: "moeglichkeiten_ohne_frage", zeile: 3 });
    const allein = erkenneZeilen(mitglied("Möglichkeiten: a | b"));
    keine(allein);
    expect(allein.verworfen).toHaveLength(1);
    expect(allein.grund).toBeNull();
    const nachAnderem = erkenneZeilen(leitung("Fertig: ok\nMöglichkeiten: a | b"));
    expect(nachAnderem.verworfen[0]?.grund).toBe("moeglichkeiten_ohne_frage");
  });
});

describe("erkenneZeilen: Weg (nur Fakt mit Code, nie eine Entscheidung)", () => {
  const code = (e: ZeilenEingabe) => erkenneZeilen(e).wuensche[0]?.weg?.code;

  it("die vier erlaubten Wege", () => {
    expect(code(pai("@Team Content: Artikel"))).toBe("pai_an_leitung");
    expect(code(leitung("@Ideen: los"))).toBe("leitung_an_mitglied");
    expect(code(leitung("Zurück an @Ideen: nochmal"))).toBe("leitung_gibt_zurueck");
    expect(code(mitglied("@Ideen: bitte"))).toBe("mitglied_bittet_kollegen");
    for (const art of ["wurzel", "uebergabe", "rueckkehr", "sammeln"]) {
      expect(code(leitung("@Ideen: los", { auftragArt: art }))).toBe("leitung_an_mitglied");
    }
    expect(erkenneZeilen(pai("@Team Content: A")).wuensche[0]?.weg?.inTabelle).toBe(true);
  });

  const verboten: [string, ZeilenEingabe, string][] = [
    [
      "Zulieferer reicht weiter",
      mitglied("@Lektorat: weiter", { auftragArt: "bitte" }),
      "verboten_zulieferer",
    ],
    ["Bitte an die Leitung", mitglied("@Redaktion: hilf"), "verboten_bitte_an_leitung"],
    ["Bitte an sich selbst", mitglied("@Entwurf: ich"), "verboten_an_sich_selbst"],
    ["Leitung an sich selbst", leitung("@Redaktion: ich"), "verboten_an_sich_selbst"],
    [
      "Bitte nach Rückkehr (Auftragsart rueckkehr)",
      mitglied("@Ideen: x", { auftragArt: "rueckkehr" }),
      "verboten_bitte_auftragsart",
    ],
    ["Mitglied schreibt @Team", mitglied("@Team Content: x"), "verboten_team_von_nicht_pai"],
    ["Leitung schreibt @Team", leitung("@Team Content: x"), "verboten_team_von_nicht_pai"],
    [
      "Mitglied gibt zurück",
      mitglied("Zurück an @Ideen: nochmal"),
      "verboten_rueckgabe_von_nicht_leitung",
    ],
    [
      "Pai an ein Mitglied",
      pai("@Ideen: los", { mitglieder: [IDEEN] }),
      "verboten_pai_an_mitglied",
    ],
    ["Pai an die Leitung ohne Team-Wort", pai("@Redaktion: los"), "verboten_pai_an_mitglied"],
    [
      "Pai im Lauf auf eine Rückmeldung",
      pai("@Team Content: x", { auftragArt: "rueckmeldung" }),
      "verboten_pai_nicht_auf_nachricht",
    ],
    [
      "Pai im Sammel-Lauf",
      pai("@Team Content: x", { auftragArt: "sammeln" }),
      "verboten_pai_nicht_auf_nachricht",
    ],
    [
      "Pai im Faden",
      pai("@Team Content: x", { conversationKind: "faden" }),
      "verboten_pai_nicht_im_direkt_chat",
    ],
    [
      "Leitung in einer Auftragsart ohne Übergabe",
      leitung("@Ideen: x", { auftragArt: "bitte" }),
      "verboten_leitung_auftragsart",
    ],
    [
      "Leitung im Lauf ohne Auftrag",
      leitung("@Ideen: x", { auftragArt: "keiner" }),
      "verboten_leitung_auftragsart",
    ],
    [
      "Leitung gibt in einer Auftragsart ohne Übergabe zurück",
      leitung("Zurück an @Ideen: nochmal", { auftragArt: "bitte" }),
      "verboten_leitung_auftragsart",
    ],
  ];
  it.each(verboten)("%s → eigener Code, trotzdem als Wunsch geliefert", (_n, eingabe, erwartet) => {
    const e = erkenneZeilen(eingabe);
    expect(e.wuensche).toHaveLength(1);
    expect(e.wuensche[0]?.weg?.code).toBe(erwartet);
    expect(e.wuensche[0]?.weg?.inTabelle).toBe(false);
  });

  it("Leitung außerhalb eines Fadens: gar keine Wünsche (der Ort wird vor dem Weg geprüft)", () => {
    for (const text of ["@Ideen: x", "Zurück an @Ideen: x"]) {
      const e = erkenneZeilen(leitung(text, { conversationKind: "direkt" }));
      expect(e.wuensche).toEqual([]);
      expect(e.grund).toBe("kein_ort");
    }
  });

  it("Zurück an von einem Mitglied wird nie als Bitte gelesen", () => {
    const w = erkenneZeilen(mitglied("Zurück an @Ideen: nochmal")).wuensche[0];
    expect(w?.art).toBe("rueckgabe");
    expect(w?.weg?.art).toBe("rueckgabe");
  });

  it("Pai erreicht über @Team nur die Leitung; unbekannte Teams sind ein Hinweis", () => {
    const e = erkenneZeilen(pai("@Team Content: Artikel\n"));
    expect(e.wuensche[0]?.ziel).toEqual({
      botId: "b0",
      name: "Redaktion",
      pausiert: false,
      teamName: "Content",
    });
    expect(e.wuensche[0]?.weg).toMatchObject({
      zielRolle: "leitung",
      art: "team",
      sameTeam: false,
    });
    const unbekannt = erkenneZeilen(pai("@Team Nirgends: x"));
    keine(unbekannt);
    expect(unbekannt.hinweise.map((h) => h.grund)).toEqual(["unbekannt"]);
    expect(arten(erkenneZeilen(pai("@team recherche: x")))).toEqual(["team"]);
  });

  it("Ziel-Rolle und gleiches Team stehen im Fakt", () => {
    expect(erkenneZeilen(leitung("@Ideen: x")).wuensche[0]?.weg).toMatchObject({
      geberRolle: "leitung",
      zielRolle: "mitglied",
      sameTeam: true,
      auftragArt: "wurzel",
      conversationKind: "faden",
    });
  });
});
