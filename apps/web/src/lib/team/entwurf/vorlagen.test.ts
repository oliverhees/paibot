/**
 * PaiBot – Tests: Team-Vorlagen im Ordner `vorlagen/teams/` sind gültige Entwürfe; die Vorlage
 * „Content-Team“ hat die erwarteten Bots und keine Rechte.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ENTWURF_GRENZEN, leseEntwurf, pruefeEntwurfText, WIE_PAI } from "./format";

const ORDNER = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../..",
  "vorlagen/teams",
);
const DATEIEN = readdirSync(ORDNER).filter((name) => name.endsWith(".json"));

function lies(name: string): string {
  return readFileSync(path.join(ORDNER, name), "utf8");
}

describe("Vorlagen-Ordner", () => {
  it("enthält mindestens eine Vorlage", () => {
    expect(DATEIEN).toContain("content-team.json");
  });

  it.each(DATEIEN)("%s ist ein gültiger Entwurf", async (name) => {
    const ergebnis = await pruefeEntwurfText(lies(name));
    expect(ergebnis.ok).toBe(true);
    if (ergebnis.ok) expect(ergebnis.hinweise).toEqual([]);
  });

  it.each(DATEIEN)("%s liegt unverändert in der vereinheitlichten Form vor", (name) => {
    const gelesen = leseEntwurf(JSON.parse(lies(name)));
    if (!gelesen.ok) throw new Error("ungültig");
    expect(JSON.parse(lies(name))).toEqual(JSON.parse(JSON.stringify(gelesen.entwurf)));
  });

  it.each(DATEIEN)("%s bleibt unter der Größengrenze für Text", (name) => {
    expect(Buffer.byteLength(lies(name), "utf8")).toBeLessThan(ENTWURF_GRENZEN.textBytesMax);
  });
});

describe("Vorlage Content-Team", () => {
  const roh = JSON.parse(lies("content-team.json"));
  const gelesen = leseEntwurf(roh);
  if (!gelesen.ok) throw new Error("Vorlage ungültig");
  const vorlage = gelesen.entwurf;

  it("ist in Fassung 2 geschrieben, nicht überführt", () => {
    expect(roh.format).toBe("pb-teamentwurf/v2");
    expect(gelesen.herkunft).toBe("v2");
  });

  it("hat das Team Content mit der Leitung Redaktion, Zusammenarbeit „Leitung führt“ und Abnahme durch die Leitung", () => {
    expect(vorlage.titel).toBe("Content-Team");
    expect(vorlage.team).toEqual({
      name: "Content",
      leitung: { name: "Redaktion" },
      zusammenarbeit: "leitung_fuehrt",
      abnahme: "leitung",
    });
  });

  it("hat die vier Bots Redaktion, Ideen, Entwurf, Lektorat in dieser Reihenfolge, alle wie Pai", () => {
    expect(vorlage.bots.map((bot) => bot.name)).toEqual([
      "Redaktion",
      "Ideen",
      "Entwurf",
      "Lektorat",
    ]);
    for (const bot of vorlage.bots) {
      expect(bot.modell).toBe(WIE_PAI);
      expect(bot.anweisung.length).toBeGreaterThan(300);
      expect(bot.aufgabe.length).toBeGreaterThan(0);
    }
  });

  it("die Leitung ist einer der Bots und nur sie ist als Leitung beschrieben", () => {
    expect(vorlage.bots.map((bot) => bot.name)).toContain(vorlage.team.leitung.name);
    const leitung = vorlage.bots.find((bot) => bot.name === vorlage.team.leitung.name);
    expect(leitung?.aufgabe.startsWith("Leitung")).toBe(true);
    for (const bot of vorlage.bots.filter((b) => b !== leitung)) {
      expect(bot.aufgabe.startsWith("Leitung")).toBe(false);
      expect(bot.anweisung).toContain("Aufträge bekommst du von der Redaktion");
    }
  });

  it("jeder Bot hat eine eigene Farbe und Form", () => {
    expect(new Set(vorlage.bots.map((bot) => bot.farbe)).size).toBe(4);
    expect(new Set(vorlage.bots.map((bot) => bot.form)).size).toBe(4);
  });

  it("gibt keine Rechte: keine Felder für Rechte, jede Anweisung sagt es ausdrücklich", () => {
    expect(Object.keys(roh).sort()).toEqual(["beschreibung", "bots", "format", "team", "titel"]);
    expect(Object.keys(roh.team).sort()).toEqual(["abnahme", "leitung", "name", "zusammenarbeit"]);
    for (const bot of vorlage.bots) {
      expect(bot.anweisung).toContain("gibt dir keine zusätzlichen Rechte");
    }
  });

  it("enthält nur Text für eine Person: keine Hinweise auf weitere Menschen", () => {
    const alles = JSON.stringify(vorlage).toLowerCase();
    for (const wort of ["mitarbeiter", "kollege", "kolleg", "kunde ", "einladen", "rolle"]) {
      expect(alles).not.toContain(wort);
    }
  });

  it("sagt „abnehmen“ und nie „freigeben“ (Freigabe ist die Antwort der Person auf eine Karte)", () => {
    const alles = JSON.stringify(roh).toLowerCase();
    expect(alles).not.toContain("freigeb");
    expect(alles).not.toContain("freigab");
    expect(vorlage.bots[0]?.anweisung).toContain("abnehmen");
  });

  it("verspricht nichts, was PaiBot nicht kann: kein Internet, keine Werkzeuge, keine Bilder", () => {
    const satz =
      "Du hast kein Internet, keine Werkzeuge und kannst keine Bilder erzeugen oder ansehen. Du antwortest nur mit Text.";
    for (const bot of vorlage.bots) {
      expect(bot.anweisung).toContain(satz);
      const rest = bot.anweisung.replace(satz, "").toLowerCase();
      for (const wort of [
        "internet",
        "werkzeug",
        "bild",
        "recherchier",
        "browser",
        "webseite",
        "suchmaschine",
        "datei",
        "download",
        "herunterlad",
        "per e-mail",
        "veröffentliche ",
        "poste ",
      ]) {
        expect(rest, `${bot.name}: ${wort}`).not.toContain(wort);
      }
    }
  });

  it("jeder Bot erfindet keine Zahlen, Zitate oder Quellen", () => {
    for (const bot of vorlage.bots) expect(bot.anweisung).toContain("Erfinde keine Zahlen, Zitate");
  });
});

// ---------------------------------------------------------------------------------------------
// Die Anweisungen lehren genau die festen Zeilen, die der Server erkennt.
//
// Fester Musterabgleich, unabhängig vom Code, der die Zeilen später erkennt (kein Import). Er
// bildet die Form nach: ASCII-`@` und ASCII-`:` in Spalte 0, Namen von Mitgliedern des Teams,
// `Fertig, wenn:` in derselben Zeile, Zettel höchstens 2 000 Zeichen, `Möglichkeiten:` direkt
// unter `Frage an dich:` mit höchstens drei Möglichkeiten zu je höchstens 120 Zeichen ohne Links.

/** Schreibrichtung, fremde Zeilentrenner und Voll-Breite-Formen von `@` und `:`. */
const VERBOTENE_ZEICHEN: readonly string[] = [
  ...[0x61c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e],
  ...[0x2066, 0x2067, 0x2068, 0x2069],
  ...[0x0d, 0x85, 0x0b, 0x0c, 0x2028, 0x2029, 0xff20, 0xff1a],
].map((code) => String.fromCodePoint(code));

const ZETTEL_MAX = 2000;
const MOEGLICHKEITEN_MAX = 3;
const MOEGLICHKEIT_MAX = 120;
const LINK = /(?:[a-z][a-z0-9+.-]*:\/\/|\bwww\.|\bmailto:|\]\(|<|>)/iu;

type Zeile =
  | { art: "uebergabe" | "rueckgabe"; name: string; zettel: string }
  | { art: "fertig" | "frage"; zettel: string }
  | { art: "moeglichkeiten"; rest: string };

/** Beginnt die Zeile wie eine feste Zeile (nach Entfernen von Leerraum, Listen- und Zitat-Zeichen)? */
function siehtAusWieFesteZeile(zeile: string): boolean {
  return /^[\s>*+-]*(?:@|Zurück an @|Fertig:|Frage an dich:|Möglichkeiten:)/u.test(zeile);
}

function parseFesteZeile(zeile: string): Zeile | null {
  let m = /^Zurück an @([^:\s][^:]{0,119}): (\S.*)$/u.exec(zeile);
  if (m) return { art: "rueckgabe", name: m[1] as string, zettel: m[2] as string };
  m = /^@([^:\s][^:]{0,119}): (\S.*)$/u.exec(zeile);
  if (m) return { art: "uebergabe", name: m[1] as string, zettel: m[2] as string };
  m = /^Fertig: (\S.*)$/u.exec(zeile);
  if (m) return { art: "fertig", zettel: m[1] as string };
  m = /^Frage an dich: (\S.*)$/u.exec(zeile);
  if (m) return { art: "frage", zettel: m[1] as string };
  m = /^Möglichkeiten: (\S.*)$/u.exec(zeile);
  if (m) return { art: "moeglichkeiten", rest: m[1] as string };
  return null;
}

/** Prüft die Möglichkeiten einer Zeile; `null` = in Ordnung, sonst der Grund. */
function pruefeMoeglichkeiten(rest: string): string | null {
  const teile = rest.split("|").map((t) => t.trim());
  if (teile.some((t) => t === "")) return "leer";
  if (teile.length > MOEGLICHKEITEN_MAX) return "zu_viele";
  if (teile.some((t) => [...t].length > MOEGLICHKEIT_MAX)) return "zu_lang";
  if (teile.some((t) => LINK.test(t))) return "link";
  return null;
}

interface Gefunden {
  zeilen: { nr: number; zeile: Zeile }[];
  /** Zeilen, die wie feste Zeilen aussehen, aber nicht in Spalte 0 stehen oder nicht passen. */
  fehler: string[];
}

function ziehe(anweisung: string): Gefunden {
  const zeilen = anweisung.split("\n");
  const gefunden: Gefunden = { zeilen: [], fehler: [] };
  zeilen.forEach((text, i) => {
    if (!siehtAusWieFesteZeile(text)) return;
    const fest = parseFesteZeile(text);
    if (fest === null) gefunden.fehler.push(`Zeile ${i + 1} passt nicht zur Form: ${text}`);
    else gefunden.zeilen.push({ nr: i, zeile: fest });
  });
  // Jede Zeile `Möglichkeiten:` steht direkt unter einer Frage.
  for (const { nr, zeile } of gefunden.zeilen) {
    if (zeile.art !== "moeglichkeiten") continue;
    const davor = gefunden.zeilen.find((z) => z.nr === nr - 1);
    if (davor?.zeile.art !== "frage") {
      gefunden.fehler.push(`Zeile ${nr + 1}: Möglichkeiten nicht direkt unter einer Frage`);
    }
    const grund = pruefeMoeglichkeiten(zeile.rest);
    if (grund !== null) gefunden.fehler.push(`Zeile ${nr + 1}: Möglichkeiten ${grund}`);
  }
  for (const { nr, zeile } of gefunden.zeilen) {
    if (zeile.art === "moeglichkeiten") continue;
    if ([...zeile.zettel].length > ZETTEL_MAX) gefunden.fehler.push(`Zeile ${nr + 1}: zu lang`);
    if (zeile.art === "uebergabe" || zeile.art === "rueckgabe") {
      if (/Fertig, wenn:\s*$/u.test(zeile.zettel)) {
        gefunden.fehler.push(`Zeile ${nr + 1}: "Fertig, wenn:" ohne Inhalt`);
      }
    }
  }
  return gefunden;
}

describe("Prüfung der Zeilen-Form (Gegenprobe: das Muster lehnt Falsches ab)", () => {
  it.each([
    ["Doppelpunkt fehlt", "@Ideen Sammle Themen."],
    ["Voll-Breite @", "＠Ideen: Sammle Themen."],
    ["Voll-Breite Doppelpunkt", "@Ideen： Sammle Themen."],
    ["kein Leerzeichen nach dem Doppelpunkt", "@Ideen:Sammle Themen."],
    ["leerer Zettel", "@Ideen: "],
    ["eingerückt", "  @Ideen: Sammle Themen."],
    ["Aufzählung", "- @Ideen: Sammle Themen."],
    ["Zitat", "> Fertig: erledigt"],
    ["ohne Umlaut", "Zurueck an @Ideen: Grund"],
    ["Zurück ohne @", "Zurück an Ideen: Grund"],
    ["Fertig mit Bindestrich", "Fertig - erledigt"],
    ["Frage ohne an dich", "Frage: Was?"],
    ["Doppelpunkt fehlt bei Fertig", "Fertig erledigt"],
  ])("%s wird nicht als gültige Zeile gewertet", (_n, text) => {
    const g = ziehe(text);
    const gueltig = g.zeilen.length === 1 && g.fehler.length === 0 && siehtAusWieFesteZeile(text);
    // Entweder erkennt das Muster die Zeile nicht, oder es meldet einen Fehler.
    expect(gueltig).toBe(false);
  });

  it("Möglichkeiten nur direkt unter einer Frage, höchstens drei, kurz, ohne Links", () => {
    const frage = "Frage an dich: Welche?";
    expect(ziehe(`${frage}\nMöglichkeiten: a | b | c`).fehler).toEqual([]);
    expect(ziehe("Möglichkeiten: a | b").fehler.length).toBeGreaterThan(0);
    expect(ziehe(`${frage}\n\nMöglichkeiten: a | b`).fehler.length).toBeGreaterThan(0);
    expect(ziehe(`${frage}\nMöglichkeiten: a | b | c | d`).fehler.length).toBeGreaterThan(0);
    expect(ziehe(`${frage}\nMöglichkeiten: a | ${"x".repeat(121)}`).fehler.length).toBeGreaterThan(
      0,
    );
    expect(ziehe(`${frage}\nMöglichkeiten: a | https://example.org`).fehler.length).toBeGreaterThan(
      0,
    );
    expect(ziehe(`${frage}\nMöglichkeiten: a || b`).fehler.length).toBeGreaterThan(0);
  });
});

describe("Vorlage Content-Team: die Anweisungen lehren die festen Zeilen", () => {
  const roh = JSON.parse(lies("content-team.json"));
  const gelesen = leseEntwurf(roh);
  if (!gelesen.ok) throw new Error("Vorlage ungültig");
  const { bots, team } = gelesen.entwurf;
  const leitung = bots.find((b) => b.name === team.leitung.name);
  const mitglieder = bots.filter((b) => b !== leitung);
  const namenDerMitglieder = mitglieder.map((b) => b.name);
  if (!leitung) throw new Error("Leitung fehlt");

  it("keine Anweisung enthält etwas, das die Erkennung ausschließen würde (HTML, Schreibrichtung, fremde Zeilentrenner, Voll-Breite-Zeichen)", () => {
    for (const bot of bots) {
      expect(bot.anweisung, bot.name).not.toMatch(/<[A-Za-z/!?]/u);
      for (const zeichen of VERBOTENE_ZEICHEN) {
        expect(
          bot.anweisung.includes(zeichen),
          `${bot.name}: U+${zeichen.codePointAt(0)?.toString(16)}`,
        ).toBe(false);
      }
    }
  });

  it("Zeilen stehen nur dort, wo sie hingehören, und passen zur Form (alle Bots)", () => {
    for (const bot of bots) {
      const g = ziehe(bot.anweisung);
      expect(g.fehler, bot.name).toEqual([]);
    }
  });

  it("die Leitung lehrt alle drei Formen: weitergeben, zurückgeben, abnehmen", () => {
    const g = ziehe(leitung.anweisung);
    const arten = g.zeilen.map((z) => z.zeile.art);
    expect(arten.filter((a) => a === "uebergabe").length).toBeGreaterThanOrEqual(1);
    expect(arten.filter((a) => a === "rueckgabe").length).toBeGreaterThanOrEqual(1);
    expect(arten.filter((a) => a === "fertig").length).toBeGreaterThanOrEqual(1);
    expect(arten).not.toContain("frage");
    expect(arten).not.toContain("moeglichkeiten");
  });

  it("Beispiel-Zeilen der Leitung nennen nur Mitglieder des Teams, nie die Leitung selbst, nie „Team …“", () => {
    for (const { zeile } of ziehe(leitung.anweisung).zeilen) {
      if (zeile.art !== "uebergabe" && zeile.art !== "rueckgabe") continue;
      expect(namenDerMitglieder, zeile.name).toContain(zeile.name);
      expect(zeile.name).not.toBe(team.leitung.name);
      expect(zeile.name.startsWith("Team ")).toBe(false);
    }
  });

  it("das Weitergeben der Leitung enthält „Fertig, wenn:“ mit Inhalt in derselben Zeile", () => {
    const uebergaben = ziehe(leitung.anweisung).zeilen.filter((z) => z.zeile.art === "uebergabe");
    expect(uebergaben.length).toBeGreaterThan(0);
    for (const { zeile } of uebergaben) {
      expect(zeile.art === "uebergabe" && /Fertig, wenn: \S/u.test(zeile.zettel)).toBe(true);
    }
  });

  it("die Leitung sagt, dass pro Antwort nur eine Zeile gilt und Zeilen nicht in dieselbe Antwort gehören wie „Fertig:“", () => {
    expect(leitung.anweisung).toContain(
      "Mehr als eine solche Zeile in einer Antwort ist nicht erlaubt",
    );
    expect(leitung.anweisung).toContain("gehören nie in dieselbe Antwort");
  });

  it("jedes Mitglied lehrt nur die Frage an die Person (mit freiwilligen Möglichkeiten darunter)", () => {
    for (const bot of mitglieder) {
      const g = ziehe(bot.anweisung);
      const arten = g.zeilen.map((z) => z.zeile.art);
      expect(arten, bot.name).toEqual(["frage", "moeglichkeiten"]);
      expect(g.zeilen[1]?.nr).toBe((g.zeilen[0]?.nr ?? -5) + 1);
    }
  });

  it("jedes Mitglied verbietet sich selbst die Zeilen der Leitung", () => {
    for (const bot of mitglieder) {
      expect(bot.anweisung).toContain(
        'Beginne selbst keine Zeile mit "@", "Fertig:" oder "Zurück an"',
      );
    }
  });

  it("die Leitung schreibt die Zeile ans Ende der Antwort und nichts danach", () => {
    expect(leitung.anweisung).toContain("Schreibe die Zeile am Ende deiner Antwort");
  });

  it("keine Anweisung nennt die Form „@Team …:“ (die ist Pai vorbehalten)", () => {
    for (const bot of bots) expect(bot.anweisung).not.toMatch(/@Team\b/u);
  });
});
