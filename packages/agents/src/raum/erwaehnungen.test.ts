/**
 * PaiBot – Erwähnungen im Teamchat erkennen (Tests)
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { describe, expect, it } from "vitest";
import { erkenneErwaehnungen, MAX_SUCH_ZEICHEN, ohneCodeUndZitate } from "./erwaehnungen";
import type { RaumBot } from "./namen";

const bot = (id: string, name: string, pausiert = false): RaumBot => ({ id, name, pausiert });
const TEAM = [bot("b1", "Ideen"), bot("b2", "Entwurf"), bot("b3", "Lektorat")];
const ids = (text: string, mitglieder = TEAM, optionen = {}) =>
  erkenneErwaehnungen(text, mitglieder, optionen).gueltig.map((b) => b.id);

describe("Erwähnungen erkennen", () => {
  it("findet mehrere Namen in der Reihenfolge des Textes, nicht der Mitgliederliste", () => {
    expect(ids("@Lektorat @Ideen @Entwurf schreibt einen Artikel")).toEqual(["b3", "b1", "b2"]);
  });

  it("ruft jeden Bot höchstens einmal, an der Stelle des ersten Auftretens", () => {
    expect(ids("@Ideen und @Entwurf und nochmal @Ideen")).toEqual(["b1", "b2"]);
  });

  it("ignoriert Groß- und Kleinschreibung und die Unicode-Form", () => {
    const team = [bot("a", "Ärger-Bot")];
    expect(ids("@ÄRGER-BOT los", team)).toEqual(["a"]);
    expect(ids("@ärger-bot los", team)).toEqual(["a"]); // zerlegtes Ä
    expect(ids("@IDEEN", TEAM)).toEqual(["b1"]);
  });

  it("liest Namen mit Leerzeichen und nimmt den längsten passenden Namen", () => {
    const team = [bot("k", "Content"), bot("kl", "Content Lektorat")];
    expect(ids("@Content Lektorat bitte prüfen", team)).toEqual(["kl"]);
    expect(ids("@Content bitte", team)).toEqual(["k"]);
  });

  it("verlangt eine Wortgrenze hinter dem Namen", () => {
    expect(ids("@Ideenreich und @Ideen2")).toEqual([]);
    expect(ids("@Ideen, @Entwurf. @Lektorat!")).toEqual(["b1", "b2", "b3"]);
  });

  it("zählt nur ein ASCII-@ am Wortanfang", () => {
    expect(ids("mail an a@Ideen.de")).toEqual([]);
    expect(ids("＠Ideen bitte")).toEqual([]); // @ in voller Breite
    expect(ids("@@Ideen")).toEqual([]);
    expect(ids("(@Ideen)")).toEqual(["b1"]);
    expect(ids("Hallo\n@Ideen")).toEqual(["b1"]);
  });

  it("leere Eingaben liefern nichts und werfen nicht", () => {
    expect(erkenneErwaehnungen("", TEAM)).toEqual({
      gueltig: [],
      hinweise: [],
      zuViele: false,
      textGekuerzt: false,
    });
    expect(ids("@Ideen", [])).toEqual([]);
    expect(ids("@", TEAM)).toEqual([]);
    expect(ids("@ Ideen", TEAM)).toEqual([]);
    expect(ids("@Ideen", [bot("x", "")])).toEqual([]);
  });
});

describe("Code und Zitate", () => {
  it("löst im Code-Stück nichts aus", () => {
    expect(ids("`@Ideen` bitte nicht")).toEqual([]);
    expect(ids("``a `@Ideen` b`` @Entwurf")).toEqual(["b2"]);
  });

  it("löst im Codeblock nichts aus, auch ohne Ende", () => {
    expect(ids("```\n@Ideen\n```\n@Entwurf")).toEqual(["b2"]);
    expect(ids("~~~\n@Ideen\n~~~")).toEqual([]);
    expect(ids("```\n@Ideen\n@Entwurf")).toEqual([]);
    expect(ids("````\n```\n@Ideen\n````\n@Lektorat")).toEqual(["b3"]);
  });

  it("löst im Zitat nichts aus", () => {
    expect(ids("> @Ideen hat gesagt\n@Entwurf bitte")).toEqual(["b2"]);
    expect(ids("   > @Ideen")).toEqual([]);
  });

  it("ein einzelner offener Backtick bleibt Text", () => {
    expect(ids("das ` ist komisch @Ideen")).toEqual(["b1"]);
  });

  it("ein Code-Stück endet an einer Leerzeile", () => {
    expect(ids("`offen\n\n@Ideen`")).toEqual(["b1"]);
  });

  it("ohneCodeUndZitate lässt normalen Text stehen", () => {
    expect(ohneCodeUndZitate("a\nb")).toBe("a\nb");
    expect(ohneCodeUndZitate("")).toBe("");
  });
});

describe("Hinweise statt Aufruf", () => {
  it("pausierte Bots werden nicht gerufen, die anderen schon", () => {
    const team = [bot("b1", "Ideen", true), bot("b2", "Entwurf")];
    const r = erkenneErwaehnungen("@Ideen @Entwurf", team);
    expect(r.gueltig.map((b) => b.id)).toEqual(["b2"]);
    expect(r.hinweise).toEqual([{ grund: "pausiert", geschrieben: "ideen", botId: "b1" }]);
  });

  it("Bots außerhalb des Teams werden nicht gerufen", () => {
    const fremd = [bot("f1", "Steuer")];
    const r = erkenneErwaehnungen("@Steuer @Ideen", TEAM, { andereBots: fremd });
    expect(r.gueltig.map((b) => b.id)).toEqual(["b1"]);
    expect(r.hinweise).toEqual([{ grund: "nicht_im_team", geschrieben: "steuer", botId: "f1" }]);
  });

  it("unbekannte Namen stehen als Hinweis, einmal je Name", () => {
    const r = erkenneErwaehnungen("@Nora @nora @Ideen", TEAM);
    expect(r.hinweise).toEqual([{ grund: "unbekannt", geschrieben: "nora" }]);
    expect(r.gueltig.map((b) => b.id)).toEqual(["b1"]);
  });

  it("ein ähnlich aussehender Name (kyrillisches е) ruft niemanden", () => {
    const r = erkenneErwaehnungen("@Lеktorat bitte", TEAM); // е = U+0435
    expect(r.gueltig).toEqual([]);
    expect(r.hinweise).toEqual([
      { grund: "aehnlicher_name", geschrieben: "lеktorat", botId: "b3" },
    ]);
  });

  it("zwei Bots mit gleichem Vergleichsnamen sind mehrdeutig und werden nie geraten", () => {
    const team = [bot("x1", "Lektor"), bot("x2", "LEKTOR")];
    const r = erkenneErwaehnungen("@lektor", team);
    expect(r.gueltig).toEqual([]);
    expect(r.hinweise[0]?.grund).toBe("mehrdeutig");
  });

  it("ein Mitglied und ein fremder Bot mit gleichem Namen sind mehrdeutig", () => {
    const r = erkenneErwaehnungen("@Ideen", TEAM, { andereBots: [bot("f", "IDEEN")] });
    expect(r.gueltig).toEqual([]);
    expect(r.hinweise[0]?.grund).toBe("mehrdeutig");
  });
});

describe("Höchstzahl und Länge", () => {
  const sieben = Array.from({ length: 7 }, (_, i) => bot(`m${i}`, `Bot${i}`));
  const alle = sieben.map((b) => `@${b.name}`).join(" ");

  it("sechs gültige sind erlaubt, sieben nicht", () => {
    expect(
      erkenneErwaehnungen(
        sieben
          .slice(0, 6)
          .map((b) => `@${b.name}`)
          .join(" "),
        sieben,
      ).zuViele,
    ).toBe(false);
    expect(erkenneErwaehnungen(alle, sieben).zuViele).toBe(true);
  });

  it("die Höchstzahl ist einstellbar von 1 bis 12 und sonst ein Fehler", () => {
    expect(erkenneErwaehnungen("@Bot0 @Bot1", sieben, { hoechstens: 1 }).zuViele).toBe(true);
    expect(erkenneErwaehnungen(alle, sieben, { hoechstens: 7 }).zuViele).toBe(false);
    for (const falsch of [0, 13, 1.5, Number.NaN, -1]) {
      expect(() => erkenneErwaehnungen("@Bot0", sieben, { hoechstens: falsch })).toThrow(
        RangeError,
      );
    }
  });

  it("zählt weder Doppelte noch ungültige Erwähnungen", () => {
    const text = `${alle.slice(0, alle.indexOf("@Bot6") - 1)} @Bot0 @Bot0 @Unbekannt`;
    expect(erkenneErwaehnungen(text, sieben).zuViele).toBe(false);
  });

  it("liest bei sehr langem Text nur den Anfang und meldet das", () => {
    const lang = `${"x ".repeat(MAX_SUCH_ZEICHEN)}@Ideen`;
    const r = erkenneErwaehnungen(lang, TEAM);
    expect(r.gueltig).toEqual([]);
    expect(r.textGekuerzt).toBe(true);
    expect(
      erkenneErwaehnungen(`@Ideen ${"x ".repeat(MAX_SUCH_ZEICHEN)}`, TEAM).gueltig,
    ).toHaveLength(1);
  });

  it("bleibt bei vielen @ schnell", () => {
    const start = Date.now();
    const r = erkenneErwaehnungen(" @I".repeat(MAX_SUCH_ZEICHEN / 3), TEAM);
    expect(Date.now() - start).toBeLessThan(2_000);
    expect(r.gueltig).toEqual([]);
  });

  it("verträgt viele Mitglieder mit langen Namen", () => {
    const viele = Array.from({ length: 50 }, (_, i) => bot(`v${i}`, `${"Name".repeat(15)}${i}`));
    const r = erkenneErwaehnungen("@Name1 und @".repeat(500), viele);
    expect(r.gueltig).toEqual([]);
  });
});
