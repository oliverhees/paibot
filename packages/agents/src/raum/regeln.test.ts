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
  bewerteBesitzerNachricht,
  ermittleNaechstenSchritt,
  ermittleSammelAusloeser,
  type NaechsterSchritt,
  type RaumLage,
  type StabBeendet,
  type StabStand,
} from "./regeln";

const bot = (id: string, name: string, pausiert = false): RaumBot => ({ id, name, pausiert });
const IDEEN = bot("b1", "Ideen");
const ENTWURF = bot("b2", "Entwurf");
const LEKTORAT = bot("b3", "Lektorat");
const LAGE: RaumLage = { mitglieder: [IDEEN, ENTWURF, LEKTORAT], leitungId: "b2" };
const ids = (autor: string, text: string, lage: RaumLage = LAGE) =>
  bestimmeAntworter(autor, text, lage).antworter.map((b) => b.id);

describe("Wer antwortet im Teamchat", () => {
  describe("Tabelle der Antwort-Regeln", () => {
    it("1: Besitzer mit Erwähnungen → genau die Erwähnten, nacheinander in der Reihenfolge", () => {
      const vorschlag = bestimmeAntworter("besitzer", "@Lektorat @Ideen schreibt", LAGE);
      expect(vorschlag.art).toBe("erwaehnt");
      expect(vorschlag.antworter.map((b) => b.id)).toEqual(["b3", "b1"]);
      expect(vorschlag.abgelehnt).toBe(false);
    });

    it("2: Besitzer ohne Erwähnung → die Leitung", () => {
      const vorschlag = bestimmeAntworter("besitzer", "Wie geht es?", LAGE);
      expect(vorschlag.art).toBe("leitung");
      expect(vorschlag.antworter.map((b) => b.id)).toEqual(["b2"]);
    });

    it("2b: ohne Leitung antwortet niemand, mit Hinweis", () => {
      const vorschlag = bestimmeAntworter("besitzer", "Hallo", {
        ...LAGE,
        leitungId: null,
      });
      expect(vorschlag.antworter).toEqual([]);
      expect(vorschlag.hinweise).toEqual([{ grund: "keine_leitung" }]);
    });

    it("2c: Leitung pausiert oder kein Mitglied (mehr) → niemand, mit Hinweis", () => {
      const pausiert = { ...LAGE, mitglieder: [IDEEN, bot("b2", "Entwurf", true), LEKTORAT] };
      expect(bestimmeAntworter("besitzer", "Hallo", pausiert).hinweise).toEqual([
        { grund: "leitung_pausiert", botId: "b2" },
      ]);
      expect(ids("besitzer", "Hallo", pausiert)).toEqual([]);
      const fremd = { ...LAGE, leitungId: "gelöscht" };
      expect(ids("besitzer", "Hallo", fremd)).toEqual([]);
      expect(bestimmeAntworter("besitzer", "Hallo", fremd).hinweise).toEqual([
        { grund: "keine_leitung" },
      ]);
    });

    it("3: Nachricht eines Bots → niemand, auch mit gültiger Erwähnung", () => {
      const vorschlag = bestimmeAntworter("bot", "@Lektorat bitte prüfen", LAGE);
      expect(vorschlag.art).toBe("niemand");
      expect(vorschlag.antworter).toEqual([]);
      expect(vorschlag.hinweise).toEqual([]);
      expect(vorschlag.abgelehnt).toBe(false);
    });

    it("3b: jeder andere Absender wird wie ein Bot behandelt", () => {
      for (const autor of ["system", "Besitzer", "besitzer ", "", "owner", "bot:b1"]) {
        expect(ids(autor, "@Lektorat bitte")).toEqual([]);
      }
    });

    it("4: pausierter Bot oder Bot außerhalb des Teams → dieser Bot nicht, mit Hinweis", () => {
      const lage: RaumLage = {
        mitglieder: [bot("b1", "Ideen", true), ENTWURF],
        leitungId: "b2",
        andereBots: [bot("f1", "Steuer")],
      };
      const vorschlag = bestimmeAntworter("besitzer", "@Ideen @Steuer @Entwurf", lage);
      expect(vorschlag.antworter.map((b) => b.id)).toEqual(["b2"]);
      expect(vorschlag.hinweise.map((h) => h.grund)).toEqual(["pausiert", "nicht_im_team"]);
    });

    it("4b: nur ungültige Erwähnungen → niemand, die Leitung springt nicht ein", () => {
      const lage: RaumLage = { ...LAGE, mitglieder: [bot("b1", "Ideen", true), ENTWURF] };
      const vorschlag = bestimmeAntworter("besitzer", "@Ideen mach das", lage);
      expect(vorschlag.art).toBe("niemand");
      expect(vorschlag.antworter).toEqual([]);
      expect(vorschlag.hinweise.map((h) => h.grund)).toEqual(["pausiert"]);
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
    const vorschlag = bestimmeAntworter("besitzer", text, {
      mitglieder: sieben,
      leitungId: null,
    });
    expect(vorschlag.abgelehnt).toBe(true);
    expect(vorschlag.antworter).toEqual([]);
    expect(vorschlag.hinweise).toContainEqual({ grund: "zu_viele_erwaehnungen" });
    const eng = bestimmeAntworter("besitzer", "@Ideen @Entwurf", {
      ...LAGE,
      hoechstensErwaehnungen: 1,
    });
    expect(eng.abgelehnt).toBe(true);
  });

  it("Randfälle: leerer Text, leeres Team, sehr langer Text", () => {
    expect(ids("besitzer", "")).toEqual(["b2"]); // ohne Erwähnung die Leitung
    expect(ids("besitzer", "@Ideen", { mitglieder: [], leitungId: null })).toEqual([]);
    expect(ids("besitzer", `${"wort ".repeat(100_000)}@Ideen`)).toEqual(["b2"]);
    const lang = bestimmeAntworter("besitzer", `${"wort ".repeat(100_000)}@Ideen`, LAGE);
    expect(lang.hinweise).toContainEqual({ grund: "text_gekuerzt" });
  });

  it("ähnlich aussehender Name ruft niemanden und lässt auch den Leitung nicht antworten", () => {
    const vorschlag = bestimmeAntworter("besitzer", "@Idеen", LAGE); // kyrillisches е
    expect(vorschlag.antworter).toEqual([]);
    expect(vorschlag.hinweise.map((h) => h.grund)).toEqual(["aehnlicher_name"]);
  });
});

const REDAKTION = bot("b0", "Redaktion");
const MITGLIEDER = [REDAKTION, IDEEN, ENTWURF, LEKTORAT];

describe("Leitung und Erwähnungen (Zusatz)", () => {
  it("ohne Erwähnung ist immer die Leitung dran, egal wer sonst im Team ist", () => {
    const lage: RaumLage = { mitglieder: MITGLIEDER, leitungId: "b0" };
    for (const text of ["Hallo", "", "Schreibt einen Artikel", "Mail an a@b.de"]) {
      const v = bestimmeAntworter("besitzer", text, lage);
      expect(v.art).toBe("leitung");
      expect(v.antworter.map((b) => b.id)).toEqual(["b0"]);
    }
  });

  it("mit Erwähnung: die Genannten nacheinander, danach geht der Stab an die Leitung", () => {
    const lage: RaumLage = { mitglieder: MITGLIEDER, leitungId: "b0" };
    const v = bestimmeAntworter("besitzer", "@Lektorat @Ideen los", lage);
    expect(v.art).toBe("erwaehnt");
    expect(v.antworter.map((b) => b.id)).toEqual(["b3", "b1"]);
    expect(v.danachLeitungId).toBe("b0");
    const ohne = bestimmeAntworter("besitzer", "@Ideen los", { ...lage, leitungId: null });
    expect(ohne.antworter.map((b) => b.id)).toEqual(["b1"]);
    expect(ohne.danachLeitungId).toBeNull();
  });

  it("die Leitung selbst zu erwähnen ruft sie genau einmal", () => {
    const lage: RaumLage = { mitglieder: MITGLIEDER, leitungId: "b0" };
    expect(ids("besitzer", "@Redaktion bitte", lage)).toEqual(["b0"]);
  });
});

const beendet = (teil: Partial<StabBeendet> = {}): StabBeendet => ({
  botId: "b1",
  rolle: "mitglied",
  geberBotId: "b0",
  auftragArt: "uebergabe",
  ergebnis: "normal",
  zeile: "keine",
  ...teil,
});
const stand = (b: Partial<StabBeendet> = {}, teil: Partial<StabStand> = {}): StabStand => ({
  notAus: false,
  wurzelAbgebrochen: false,
  laeuft: false,
  beendet: beendet(b),
  wartendeFaecher: [],
  mitglieder: MITGLIEDER,
  ...teil,
});
const schritt = (b: Partial<StabBeendet> = {}, teil: Partial<StabStand> = {}): NaechsterSchritt =>
  ermittleNaechstenSchritt(stand(b, teil));

describe("Staffelstab im Auftragsbaum", () => {
  it("nach einem Mitglied geht der Stab an den Geber zurück", () => {
    expect(schritt()).toEqual({
      aktion: "stab_an_bot",
      botId: "b0",
      grund: "rueckkehr_zum_geber",
    });
  });

  it("nach einem Zulieferer geht der Stab an den Bittenden, nicht an die Leitung", () => {
    expect(schritt({ botId: "b1", auftragArt: "bitte", geberBotId: "b2" })).toEqual({
      aktion: "stab_an_bot",
      botId: "b2",
      grund: "rueckkehr_zum_geber",
    });
  });

  it("ein Mitglied mit `Fertig:` gibt den Stab ebenfalls zurück", () => {
    expect(schritt({ zeile: "fertig" })).toMatchObject({ aktion: "stab_an_bot", botId: "b0" });
  });

  it("Leitung an der Wurzel ohne gültige Zeile: der Stab geht an den Besitzer, nie an die Leitung", () => {
    const s = schritt({ botId: "b0", rolle: "leitung", geberBotId: null, auftragArt: "wurzel" });
    expect(s).toEqual({ aktion: "stab_an_besitzer", grund: "leitung_ohne_zeile" });
    // auch im Lauf nach einer Rückkehr, den der Server selbst angelegt hat
    expect(
      schritt({ botId: "b0", rolle: "leitung", geberBotId: null, auftragArt: "rueckkehr" }),
    ).toEqual(s);
  });

  it("Leitung mit `Fertig:` beendet den Faden; mit Abnahme „ohne“ auch ohne Zeile", () => {
    const l: Partial<StabBeendet> = { botId: "b0", rolle: "leitung", geberBotId: null };
    expect(schritt({ ...l, zeile: "fertig" })).toEqual({ aktion: "ende", grund: "fertig" });
    expect(schritt(l, { abnahme: "ohne" })).toEqual({ aktion: "ende", grund: "fertig" });
    expect(schritt(l, { abnahme: "besitzer" })).toEqual({
      aktion: "stab_an_besitzer",
      grund: "leitung_ohne_zeile",
    });
  });

  it("`Frage an dich:` gibt den Stab an den Besitzer, bei jedem Bot", () => {
    for (const rolle of ["mitglied", "leitung", "stabschef"] as const) {
      expect(schritt({ rolle, zeile: "frage" })).toEqual({
        aktion: "stab_an_besitzer",
        grund: "rueckfrage",
      });
    }
  });

  it("eine zugelassene Weitergabe lässt den Stab beim Empfänger", () => {
    expect(schritt({ zeile: "weitergegeben" })).toEqual({ aktion: "beim_empfaenger" });
    expect(schritt({ rolle: "leitung", botId: "b0", zeile: "weitergegeben" })).toEqual({
      aktion: "beim_empfaenger",
    });
  });

  it("Pai ohne Weitergabe: nichts zu tun", () => {
    expect(schritt({ rolle: "stabschef", botId: "pai", geberBotId: null })).toEqual({
      aktion: "ende",
      grund: "ohne_weitergabe",
    });
  });

  it("Fächer: erst das nächste Mitglied, dann zurück an die Leitung", () => {
    expect(schritt({}, { wartendeFaecher: ["b2", "b3"] })).toEqual({
      aktion: "stab_an_bot",
      botId: "b2",
      grund: "naechstes_im_faecher",
    });
    expect(schritt({}, { wartendeFaecher: [] })).toMatchObject({ botId: "b0" });
    // ein Zulieferer ignoriert den Fächer der Leitung
    expect(
      schritt({ auftragArt: "bitte", geberBotId: "b2" }, { wartendeFaecher: ["b3"] }),
    ).toMatchObject({
      botId: "b2",
    });
  });

  it("Fächer: ein pausiertes oder gelöschtes Mitglied wird übersprungen, nicht gestartet", () => {
    const pausiert = [REDAKTION, IDEEN, bot("b2", "Entwurf", true), LEKTORAT];
    expect(schritt({}, { wartendeFaecher: ["b2"], mitglieder: pausiert })).toEqual({
      aktion: "ueberspringen",
      botId: "b2",
      grund: "pausiert",
    });
    expect(schritt({}, { wartendeFaecher: ["weg"] })).toEqual({
      aktion: "ueberspringen",
      botId: "weg",
      grund: "kein_mitglied",
    });
  });

  it("Geber unbekannt, pausiert oder kein Mitglied mehr: der Stab geht an den Besitzer", () => {
    expect(schritt({ geberBotId: null })).toEqual({
      aktion: "stab_an_besitzer",
      grund: "geber_unbekannt",
    });
    expect(schritt({ geberBotId: "weg" })).toEqual({
      aktion: "stab_an_besitzer",
      grund: "geber_nicht_bereit",
    });
    const pausiert = [bot("b0", "Redaktion", true), IDEEN];
    expect(schritt({}, { mitglieder: pausiert })).toEqual({
      aktion: "stab_an_besitzer",
      grund: "geber_nicht_bereit",
    });
  });

  it("startet nie einen Lauf, solange einer läuft", () => {
    expect(schritt({}, { laeuft: true })).toEqual({ aktion: "warten", grund: "lauf_aktiv" });
    expect(schritt({ zeile: "frage" }, { laeuft: true })).toEqual({
      aktion: "warten",
      grund: "lauf_aktiv",
    });
  });

  it("Not-Aus: nichts startet, auch neben einem laufenden Lauf", () => {
    expect(schritt({}, { notAus: true })).toEqual({ aktion: "ende", grund: "not_aus" });
    expect(schritt({}, { notAus: true, laeuft: true })).toEqual({
      aktion: "ende",
      grund: "not_aus",
    });
  });

  it("abgebrochene Wurzel: nichts startet", () => {
    expect(schritt({}, { wurzelAbgebrochen: true })).toEqual({
      aktion: "ende",
      grund: "wurzel_abgebrochen",
    });
  });

  it("nach einem gescheiterten oder abgebrochenen Lauf startet nichts mehr", () => {
    expect(schritt({ ergebnis: "fehlgeschlagen" })).toEqual({
      aktion: "ende",
      grund: "vorheriger_lauf_fehlgeschlagen",
    });
    expect(schritt({ ergebnis: "abgebrochen" }, { wartendeFaecher: ["b3"] })).toEqual({
      aktion: "ende",
      grund: "vorheriger_lauf_abgebrochen",
    });
  });

  it("Leitung, die immer ohne Zeile endet, läuft genau einmal (kein Leerlauf)", () => {
    // Simulation: nach jedem Schritt wird „der Stab hat Bot X“ ausgewertet; es darf nie wieder die Leitung sein.
    let laeufe = 0;
    let dran: string | null = "b0";
    while (dran !== null && laeufe < 25) {
      laeufe += 1;
      const s = schritt({ botId: dran, rolle: "leitung", geberBotId: null, auftragArt: "wurzel" });
      dran = s.aktion === "stab_an_bot" ? s.botId : null;
    }
    expect(laeufe).toBe(1);
  });
});

describe("Nachricht der Person im Faden (neue Wurzel)", () => {
  it("beantwortet sie eine offene Frage, läuft der alte Baum weiter", () => {
    expect(bewerteBesitzerNachricht({ offeneFrageImFaden: true, baumOffen: true })).toEqual({
      neueWurzel: false,
      alterBaum: "bleibt",
      grund: "antwort_auf_frage",
      wartendeSchritteFallenWeg: false,
    });
  });

  it("sonst übernimmt die Person: neue Wurzel, alter Baum endet, wartende Schritte fallen weg", () => {
    expect(bewerteBesitzerNachricht({ offeneFrageImFaden: false, baumOffen: true })).toEqual({
      neueWurzel: true,
      alterBaum: "endet_abgebrochen",
      grund: "du_hast_uebernommen",
      wartendeSchritteFallenWeg: true,
    });
  });

  it("erste Nachricht ohne offenen Baum: neue Wurzel, nichts zu beenden", () => {
    expect(bewerteBesitzerNachricht({ offeneFrageImFaden: false, baumOffen: false })).toMatchObject(
      {
        neueWurzel: true,
        alterBaum: "keiner",
        grund: "erste_nachricht",
      },
    );
  });
});

describe("Sammeln nach festen Auslösern", () => {
  const u = (id: string, status: string) => ({ id, status });
  const stand0 = { notAus: false, elternGestoppt: false, fristAbgelaufen: false };

  it("nicht nach der ersten Antwort: erst wenn alle einen Endzustand haben", () => {
    expect(
      ermittleSammelAusloeser({
        ...stand0,
        unterAuftraege: [u("1", "fertig"), u("2", "arbeitet"), u("3", "gefragt")],
      }),
    ).toEqual({ aktion: "warten", offen: 2 });
    expect(
      ermittleSammelAusloeser({ ...stand0, unterAuftraege: [u("1", "fertig"), u("2", "fertig")] }),
    ).toEqual({ aktion: "sammeln", grund: "alle_endzustand", offeneAbbrechen: [] });
  });

  it("Scheitern, Ablehnen und Stoppen eines Unter-Fadens zählen als Endzustand", () => {
    expect(
      ermittleSammelAusloeser({
        ...stand0,
        unterAuftraege: [
          u("1", "gescheitert"),
          u("2", "abgelehnt"),
          u("3", "abgebrochen"),
          u("4", "fertig"),
        ],
      }),
    ).toMatchObject({ aktion: "sammeln", grund: "alle_endzustand" });
    // das Scheitern eines Mitglieds hält die anderen nicht an
    expect(
      ermittleSammelAusloeser({
        ...stand0,
        unterAuftraege: [u("1", "gescheitert"), u("2", "arbeitet")],
      }),
    ).toEqual({ aktion: "warten", offen: 1 });
  });

  it("Frist: sammelt, was da ist; die offenen enden mit Zeit", () => {
    expect(
      ermittleSammelAusloeser({
        ...stand0,
        fristAbgelaufen: true,
        unterAuftraege: [u("1", "fertig"), u("2", "arbeitet"), u("3", "gefragt")],
      }),
    ).toEqual({ aktion: "sammeln", grund: "frist", offeneAbbrechen: ["2", "3"] });
  });

  it("ein unbekannter Status gilt als offen", () => {
    expect(ermittleSammelAusloeser({ ...stand0, unterAuftraege: [u("1", "irgendwas")] })).toEqual({
      aktion: "warten",
      offen: 1,
    });
  });

  it("nie nach Not-Aus, nie nach Stopp des Eltern-Fadens (auch nicht mit abgelaufener Frist)", () => {
    const alleFertig = [u("1", "fertig")];
    expect(
      ermittleSammelAusloeser({
        ...stand0,
        notAus: true,
        fristAbgelaufen: true,
        unterAuftraege: alleFertig,
      }),
    ).toEqual({ aktion: "nie", grund: "not_aus" });
    expect(
      ermittleSammelAusloeser({ ...stand0, elternGestoppt: true, unterAuftraege: alleFertig }),
    ).toEqual({ aktion: "nie", grund: "eltern_gestoppt" });
  });

  it("ohne Unter-Aufträge gibt es nichts zu sammeln", () => {
    expect(ermittleSammelAusloeser({ ...stand0, unterAuftraege: [] })).toEqual({
      aktion: "nie",
      grund: "keine_unterauftraege",
    });
  });
});
