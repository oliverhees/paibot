/**
 * PaiBot – Wer antwortet im Teamchat und was kommt als Nächstes (Tests)
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
  bestimmeAntworter,
  ermittleNaechstenSchritt,
  type NaechsterSchritt,
  type RaumLage,
  type RundenEintrag,
  type RundenStand,
} from "./regeln";

const bot = (id: string, name: string, pausiert = false): RaumBot => ({ id, name, pausiert });
const IDEEN = bot("b1", "Ideen");
const ENTWURF = bot("b2", "Entwurf");
const LEKTORAT = bot("b3", "Lektorat");
const LAGE: RaumLage = { mitglieder: [IDEEN, ENTWURF, LEKTORAT], ansprechpartnerId: "b2" };
const ids = (autor: string, text: string, lage: RaumLage = LAGE) =>
  bestimmeAntworter(autor, text, lage).antworter.map((b) => b.id);

describe("Wer antwortet im Teamchat", () => {
  describe("Tabelle der Antwort-Regeln", () => {
    it("1: Besitzer mit Erwähnungen → genau die Erwähnten, nacheinander in der Reihenfolge", () => {
      const plan = bestimmeAntworter("besitzer", "@Lektorat @Ideen schreibt", LAGE);
      expect(plan.art).toBe("erwaehnt");
      expect(plan.antworter.map((b) => b.id)).toEqual(["b3", "b1"]);
      expect(plan.abgelehnt).toBe(false);
    });

    it("2: Besitzer ohne Erwähnung → der Ansprechpartner", () => {
      const plan = bestimmeAntworter("besitzer", "Wie geht es?", LAGE);
      expect(plan.art).toBe("ansprechpartner");
      expect(plan.antworter.map((b) => b.id)).toEqual(["b2"]);
    });

    it("2b: ohne Ansprechpartner antwortet niemand, mit Hinweis", () => {
      const plan = bestimmeAntworter("besitzer", "Hallo", { ...LAGE, ansprechpartnerId: null });
      expect(plan.antworter).toEqual([]);
      expect(plan.hinweise).toEqual([{ grund: "kein_ansprechpartner" }]);
    });

    it("2c: Ansprechpartner pausiert oder kein Mitglied (mehr) → niemand, mit Hinweis", () => {
      const pausiert = { ...LAGE, mitglieder: [IDEEN, bot("b2", "Entwurf", true), LEKTORAT] };
      expect(bestimmeAntworter("besitzer", "Hallo", pausiert).hinweise).toEqual([
        { grund: "ansprechpartner_pausiert", botId: "b2" },
      ]);
      expect(ids("besitzer", "Hallo", pausiert)).toEqual([]);
      const fremd = { ...LAGE, ansprechpartnerId: "gelöscht" };
      expect(ids("besitzer", "Hallo", fremd)).toEqual([]);
      expect(bestimmeAntworter("besitzer", "Hallo", fremd).hinweise).toEqual([
        { grund: "kein_ansprechpartner" },
      ]);
    });

    it("3: Nachricht eines Bots → niemand, auch mit gültiger Erwähnung", () => {
      const plan = bestimmeAntworter("bot", "@Lektorat bitte prüfen", LAGE);
      expect(plan.art).toBe("niemand");
      expect(plan.antworter).toEqual([]);
      expect(plan.hinweise).toEqual([]);
      expect(plan.abgelehnt).toBe(false);
    });

    it("3b: jeder andere Absender wird wie ein Bot behandelt", () => {
      for (const autor of ["system", "Besitzer", "besitzer ", "", "owner", "bot:b1"]) {
        expect(ids(autor, "@Lektorat bitte")).toEqual([]);
      }
    });

    it("4: pausierter Bot oder Bot außerhalb des Teams → dieser Bot nicht, mit Hinweis", () => {
      const lage: RaumLage = {
        mitglieder: [bot("b1", "Ideen", true), ENTWURF],
        ansprechpartnerId: "b2",
        andereBots: [bot("f1", "Steuer")],
      };
      const plan = bestimmeAntworter("besitzer", "@Ideen @Steuer @Entwurf", lage);
      expect(plan.antworter.map((b) => b.id)).toEqual(["b2"]);
      expect(plan.hinweise.map((h) => h.grund)).toEqual(["pausiert", "nicht_im_team"]);
    });

    it("4b: nur ungültige Erwähnungen → niemand, der Ansprechpartner springt nicht ein", () => {
      const lage: RaumLage = { ...LAGE, mitglieder: [bot("b1", "Ideen", true), ENTWURF] };
      const plan = bestimmeAntworter("besitzer", "@Ideen mach das", lage);
      expect(plan.art).toBe("niemand");
      expect(plan.antworter).toEqual([]);
      expect(plan.hinweise.map((h) => h.grund)).toEqual(["pausiert"]);
    });

    it("5: ein @ im Text eines Bots löst nichts aus (Name, Code, Zitat)", () => {
      for (const text of ["@Ideen", "Frag doch @Lektorat", "```\n@Ideen\n```", "> @Ideen"]) {
        expect(bestimmeAntworter("bot", text, LAGE).antworter).toEqual([]);
      }
    });
  });

  it("zu viele Erwähnungen: Nachricht abgelehnt, niemand antwortet", () => {
    const sieben = Array.from({ length: 7 }, (_, i) => bot(`m${i}`, `Bot${i}`));
    const text = sieben.map((b) => `@${b.name}`).join(" ");
    const plan = bestimmeAntworter("besitzer", text, {
      mitglieder: sieben,
      ansprechpartnerId: null,
    });
    expect(plan.abgelehnt).toBe(true);
    expect(plan.antworter).toEqual([]);
    expect(plan.hinweise).toContainEqual({ grund: "zu_viele_erwaehnungen" });
    const eng = bestimmeAntworter("besitzer", "@Ideen @Entwurf", {
      ...LAGE,
      hoechstensErwaehnungen: 1,
    });
    expect(eng.abgelehnt).toBe(true);
  });

  it("Randfälle: leerer Text, leeres Team, sehr langer Text", () => {
    expect(ids("besitzer", "")).toEqual(["b2"]); // ohne Erwähnung der Ansprechpartner
    expect(ids("besitzer", "@Ideen", { mitglieder: [], ansprechpartnerId: null })).toEqual([]);
    expect(ids("besitzer", `${"wort ".repeat(100_000)}@Ideen`)).toEqual(["b2"]);
    const lang = bestimmeAntworter("besitzer", `${"wort ".repeat(100_000)}@Ideen`, LAGE);
    expect(lang.hinweise).toContainEqual({ grund: "text_gekuerzt" });
  });

  it("ähnlich aussehender Name ruft niemanden und lässt auch den Ansprechpartner nicht antworten", () => {
    const plan = bestimmeAntworter("besitzer", "@Idеen", LAGE); // kyrillisches е
    expect(plan.antworter).toEqual([]);
    expect(plan.hinweise.map((h) => h.grund)).toEqual(["aehnlicher_name"]);
  });
});

const eintrag = (botId: string, status: RundenEintrag["status"]): RundenEintrag => ({
  botId,
  status,
});
const stand = (eintraege: RundenEintrag[], teil: Partial<RundenStand> = {}): RundenStand => ({
  eintraege,
  notAus: false,
  mitglieder: [IDEEN, ENTWURF, LEKTORAT],
  ...teil,
});

describe("Runde nacheinander (Vorschlag für den nächsten Schritt)", () => {
  it("startet den ersten wartenden Bot, wenn niemand läuft", () => {
    expect(
      ermittleNaechstenSchritt(stand([eintrag("b1", "wartend"), eintrag("b2", "wartend")])),
    ).toEqual({
      aktion: "starten",
      botId: "b1",
    });
  });

  it("startet nie einen Lauf, solange einer aktiv ist (auch wenn der aktive weiter hinten steht)", () => {
    const warten: NaechsterSchritt = { aktion: "warten", grund: "lauf_aktiv" };
    expect(
      ermittleNaechstenSchritt(stand([eintrag("b1", "aktiv"), eintrag("b2", "wartend")])),
    ).toEqual(warten);
    expect(
      ermittleNaechstenSchritt(stand([eintrag("b1", "wartend"), eintrag("b2", "aktiv")])),
    ).toEqual(warten);
    expect(
      ermittleNaechstenSchritt(stand([eintrag("b1", "aktiv"), eintrag("b2", "aktiv")])),
    ).toEqual(warten);
  });

  it("der nächste Bot kommt erst nach dem fertigen vorigen, in der Reihenfolge der Erwähnung", () => {
    const stufen: [RundenEintrag["status"][], NaechsterSchritt][] = [
      [["wartend", "wartend", "wartend"], { aktion: "starten", botId: "b3" }],
      [["fertig", "wartend", "wartend"], { aktion: "starten", botId: "b1" }],
      [["fertig", "fertig", "wartend"], { aktion: "starten", botId: "b2" }],
      [["fertig", "fertig", "fertig"], { aktion: "ende", grund: "fertig" }],
    ];
    // Reihenfolge der Erwähnung: b3, b1, b2
    const reihe = ["b3", "b1", "b2"];
    const erwartet = [
      { aktion: "starten", botId: "b3" },
      { aktion: "starten", botId: "b1" },
      { aktion: "starten", botId: "b2" },
      { aktion: "ende", grund: "fertig" },
    ];
    stufen.forEach(([status], i) => {
      const e = reihe.map((id, n) => eintrag(id, status[n] as RundenEintrag["status"]));
      expect(ermittleNaechstenSchritt(stand(e))).toEqual(erwartet[i]);
    });
  });

  it("Ablauf mit drei Bots: nie zwei aktive Läufe, Reihenfolge stimmt", () => {
    const reihe = ["b3", "b1", "b2"];
    let eintraege = reihe.map((id) => eintrag(id, "wartend"));
    const gestartet: string[] = [];
    for (let runde = 0; runde < 10; runde++) {
      const schritt = ermittleNaechstenSchritt(stand(eintraege));
      if (schritt.aktion === "ende") break;
      expect(schritt.aktion).toBe("starten");
      if (schritt.aktion !== "starten") break;
      gestartet.push(schritt.botId);
      eintraege = eintraege.map((e) => (e.botId === schritt.botId ? eintrag(e.botId, "aktiv") : e));
      expect(eintraege.filter((e) => e.status === "aktiv")).toHaveLength(1);
      expect(ermittleNaechstenSchritt(stand(eintraege))).toEqual({
        aktion: "warten",
        grund: "lauf_aktiv",
      });
      eintraege = eintraege.map((e) => (e.status === "aktiv" ? eintrag(e.botId, "fertig") : e));
    }
    expect(gestartet).toEqual(reihe);
  });

  it("Not-Aus: nichts startet, auch nicht neben einem laufenden Lauf", () => {
    expect(ermittleNaechstenSchritt(stand([eintrag("b1", "wartend")], { notAus: true }))).toEqual({
      aktion: "ende",
      grund: "not_aus",
    });
    expect(
      ermittleNaechstenSchritt(
        stand([eintrag("b1", "aktiv"), eintrag("b2", "wartend")], { notAus: true }),
      ),
    ).toEqual({
      aktion: "ende",
      grund: "not_aus",
    });
  });

  it("Not-Aus während Bot 2 von 3: Bot 3 startet nie, auch nicht nach dem Aufheben", () => {
    // der Wächter bricht Lauf 2 ab; die Runde steht dann so
    const nachAbbruch = [
      eintrag("b1", "fertig"),
      eintrag("b2", "abgebrochen"),
      eintrag("b3", "wartend"),
    ];
    expect(ermittleNaechstenSchritt(stand(nachAbbruch, { notAus: true }))).toEqual({
      aktion: "ende",
      grund: "not_aus",
    });
    expect(ermittleNaechstenSchritt(stand(nachAbbruch, { notAus: false }))).toEqual({
      aktion: "ende",
      grund: "vorheriger_lauf_abgebrochen",
    });
  });

  it("ein fehlgeschlagener Lauf beendet die Runde", () => {
    const e = [eintrag("b1", "fehlgeschlagen"), eintrag("b2", "wartend")];
    expect(ermittleNaechstenSchritt(stand(e))).toEqual({
      aktion: "ende",
      grund: "vorheriger_lauf_fehlgeschlagen",
    });
  });

  it("ein jetzt pausierter oder entfernter Bot wird übersprungen, nicht gestartet", () => {
    const pausiert = stand([eintrag("b1", "wartend")], {
      mitglieder: [bot("b1", "Ideen", true), ENTWURF],
    });
    expect(ermittleNaechstenSchritt(pausiert)).toEqual({
      aktion: "ueberspringen",
      botId: "b1",
      grund: "pausiert",
    });
    const weg = stand([eintrag("b9", "wartend")]);
    expect(ermittleNaechstenSchritt(weg)).toEqual({
      aktion: "ueberspringen",
      botId: "b9",
      grund: "kein_mitglied",
    });
    const danach = stand([eintrag("b1", "uebersprungen"), eintrag("b2", "wartend")]);
    expect(ermittleNaechstenSchritt(danach)).toEqual({ aktion: "starten", botId: "b2" });
  });

  it("leere Runde ist fertig", () => {
    expect(ermittleNaechstenSchritt(stand([]))).toEqual({ aktion: "ende", grund: "fertig" });
  });
});
