/**
 * PaiBot – Tests des Vertrags der Tor-Fassung 5 „Zusammenarbeit“: die festen Zusagen, ohne
 * Auswertung (die steht in `packages/gate/src/fassungen/`).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-27
 */

import { describe, expect, it } from "vitest";
import { ACTION_TYPES, STORED_ACTION_TYPES } from "./actions";
import { OWN_RULE_PRIORITY, priorityFitsSource } from "./gate";
import {
  AUFTRAG_ACTION_SHAPES,
  AUFTRAG_ACTION_TYPES,
  AUFTRAG_LIMITS_5,
  anfrageStimmig,
  BAUM_FACTS,
  CAPS_5,
  ENTWURF_ERSTELLEN_HERKUNFT_5,
  ERROR_CODES_5,
  FUELLWERTE_5,
  LIMITS_BY_ID_5,
  MAX_BAUM_ZUSCHLAG_TOKENS,
  MAX_ZUSCHLAEGE,
  meldungPasstZurRolle,
  NEW_FACTS_5,
  PRECONDITIONS_5,
  R009_PRIORITY,
  STANDARD_RULES_5,
  UEBERGABE_WEGE,
  ZIEL_ROLLEN,
} from "./tor-fassung-5";

function regel(id: string) {
  const gefunden = STANDARD_RULES_5.find((rule) => rule.id === id);
  if (gefunden === undefined) throw new Error(id);
  return gefunden;
}

function bedingung(id: string, fact: string): unknown {
  return (regel(id).conditions as readonly { fact: string; value: unknown }[]).find(
    (condition) => condition.fact === fact,
  )?.value;
}

describe("Vertrag der Fassung 5", () => {
  it("sieben neue Aktionen: zwei für Bots, fünf für den Besitzer; in den lebenden Verträgen", () => {
    expect(AUFTRAG_ACTION_TYPES).toHaveLength(7);
    const bots = AUFTRAG_ACTION_TYPES.filter(
      (type) => AUFTRAG_ACTION_SHAPES[type].actorKind === "bot",
    );
    expect(bots).toEqual(["auftrag.uebergeben", "auftrag.melden"]);
    for (const type of AUFTRAG_ACTION_TYPES) {
      expect(ACTION_TYPES as readonly string[], type).toContain(type);
      expect(STORED_ACTION_TYPES as readonly string[], type).toContain(type);
    }
  });

  it("keine Besitzer-Aktion zum Abhaken einzelner Ziel-Punkte", () => {
    for (const type of AUFTRAG_ACTION_TYPES) {
      expect(type).not.toMatch(/ziel|punkt|abhaken/);
    }
  });

  it("D-02 nennt auftrag.uebergeben ausdrücklich und lehnt nach fremden Inhalten ab", () => {
    const d02 = CAPS_5.find((cap) => cap.id === "D-02");
    expect(d02?.actions).toEqual(["auftrag.uebergeben"]);
    expect(d02?.then).toBe("deny");
    expect(d02?.when).toEqual([{ fact: "untrustedInput", op: "eq", value: true }]);
    // Endform ohne Wirkungs-Bedingung: keine weitere Bedingung.
    expect(d02?.anyOf).toEqual([]);
  });

  it("Entwürfe von Pai: Herkunft pai und Zweck team_entwurf gehören zu Fassung 5", () => {
    expect(ENTWURF_ERSTELLEN_HERKUNFT_5.options).toEqual(["vorlage", "pai"]);
    expect(NEW_FACTS_5["modell.anfragen"].zweck.options).toEqual(["chat", "team_entwurf"]);
    expect(FUELLWERTE_5["modell.anfragen"].zweck).toBe("chat");
  });

  it("Füllwerte: Direkt-Chat, kein Auftrag, Zweck Chat; jeder neue Pflicht-Fakt hat einen", () => {
    expect(FUELLWERTE_5).toEqual({
      "modell.anfragen": {
        conversationKind: "direkt",
        botHatAuftrag: false,
        auftragArt: "keiner",
        zweck: "chat",
      },
      "werkzeug.aufrufen": { auftragArt: "keiner" },
      "nachricht.senden": { conversationKind: "direkt" },
    });
    for (const [type, facts] of Object.entries(NEW_FACTS_5)) {
      const fuell = FUELLWERTE_5[type as keyof typeof FUELLWERTE_5] as Record<string, unknown>;
      for (const [name, schema] of Object.entries(facts)) {
        const pflicht = !schema.safeParse(undefined).success;
        expect(Object.hasOwn(fuell, name), `${type}.${name}`).toBe(pflicht);
        if (pflicht) expect(schema.safeParse(fuell[name]).success, `${type}.${name}`).toBe(true);
      }
    }
  });

  it("V-40: kein Weg führt zu Pai, zu sich selbst oder zu einem Bot ohne Team; nur Pai gibt an eine Leitung", () => {
    const wege = Object.entries(UEBERGABE_WEGE);
    expect(wege.map(([name]) => name)).toEqual([
      "pai_an_leitung",
      "leitung_an_mitglied",
      "leitung_gibt_zurueck",
      "mitglied_bittet_kollegen",
    ]);
    for (const [name, bedingungen] of wege) {
      const ziel = bedingungen.find((b) => b.fact === "zielRolle")?.value;
      expect(["leitung", "mitglied"], name).toContain(ziel);
      expect(ZIEL_ROLLEN).toContain(ziel);
      if (ziel === "leitung") {
        expect(bedingungen.find((b) => b.fact === "geberRolle")?.value, name).toBe("stabschef");
      } else {
        expect(bedingungen, name).toContainEqual({ fact: "sameTeam", op: "eq", value: true });
        expect(bedingungen, name).toContainEqual({
          fact: "conversationKind",
          op: "eq",
          value: "faden",
        });
      }
    }
    expect(PRECONDITIONS_5["V-40"].requireAnyOf).toEqual(Object.values(UEBERGABE_WEGE));
    expect(PRECONDITIONS_5["V-40"].errorCode).toBe("weg_nicht_erlaubt");
  });

  it("Pai gibt nur aus deinem Direkt-Chat, nur in Läufen auf deine Nachricht und nie mit Auftrag", () => {
    expect(UEBERGABE_WEGE.pai_an_leitung).toEqual(
      expect.arrayContaining([
        { fact: "conversationKind", op: "eq", value: "direkt" },
        { fact: "auftragArt", op: "eq", value: "keiner" },
        { fact: "trigger", op: "eq", value: "chat" },
      ]),
    );
    expect(bedingung("R-017", "auftragArt")).toBe("keiner");
    expect(bedingung("R-017", "trigger")).toBe("chat");
    expect(bedingung("R-017", "stabschefErlaubt")).toBe(true);
  });

  it("R-015, R-017 und R-019 erlauben nur mit Schalter und ohne fremde Inhalte; R-009 fragt danach", () => {
    for (const id of ["R-015", "R-019"]) {
      expect(bedingung(id, "zusammenarbeit"), id).toBe("leitung_fuehrt");
    }
    for (const id of ["R-015", "R-017", "R-019"]) {
      expect(regel(id).effect, id).toBe("allow");
      expect(regel(id).action, id).toBe("auftrag.uebergeben");
      expect(bedingung(id, "untrustedInput"), id).toBe(false);
      expect(bedingung(id, "akteur"), id).toBe("bot");
    }
    const r009 = regel("R-009");
    expect(r009.effect).toBe("ask");
    expect(r009.conditions).toEqual([{ fact: "akteur", op: "eq", value: "bot" }]);
    expect(r009.priority).toBe(R009_PRIORITY);
    expect(R009_PRIORITY).toBeGreaterThan(regel("R-015").priority);
    expect(priorityFitsSource("standard", R009_PRIORITY)).toBe(true);
    // Vor jeder eigenen Regel: keine eigene Regel erreicht eine Übergabe eines Bots.
    expect(R009_PRIORITY).toBeLessThan(OWN_RULE_PRIORITY.min);
  });

  it("R-016 nur für Antworten eines Bots mit Auftrag, R-018 nur für Meldungen im Faden", () => {
    expect(regel("R-016").action).toBe("modell.anfragen");
    expect(bedingung("R-016", "botHatAuftrag")).toBe(true);
    expect(regel("R-018").action).toBe("auftrag.melden");
    expect(bedingung("R-018", "conversationKind")).toBe("faden");
    expect(bedingung("R-018", "meldungPasstZurRolle")).toBe(true);
  });

  it("Meldung passt zur Rolle: fertig nur die Leitung, Frage Leitung oder Mitglied", () => {
    const tabelle: [string, string, boolean][] = [
      ["fertig", "leitung", true],
      ["fertig", "mitglied", false],
      ["fertig", "stabschef", false],
      ["fertig", "keine", false],
      ["frage", "leitung", true],
      ["frage", "mitglied", true],
      ["frage", "stabschef", false],
      ["frage", "keine", false],
    ];
    for (const [meldung, rolle, passt] of tabelle) {
      expect(meldungPasstZurRolle(meldung, rolle), `${meldung}/${rolle}`).toBe(passt);
    }
  });

  it("V-39 nicht an auftrag.zurueckgeben (geht auch auf eine fertige Wurzel); V-41 nur am Zuschlag", () => {
    expect(PRECONDITIONS_5["V-39"].actions).not.toContain("auftrag.zurueckgeben");
    expect(PRECONDITIONS_5["V-41"].actions).toEqual(["auftrag.budget_erhoehen"]);
    expect(PRECONDITIONS_5["V-41"].requireAtLeastSum).toEqual({
      fact: "baumTokens",
      sumOf: ["maxBaumTokens", "baumZuschlagTokens"],
    });
  });

  it("Grenzen: G-14 nicht in Fassung 5; jede Auftrags-Grenze hat den Code auftrag_grenze", () => {
    expect(Object.keys(LIMITS_BY_ID_5)).not.toContain("G-14");
    const namen = Object.values(LIMITS_BY_ID_5) as string[];
    for (const name of AUFTRAG_LIMITS_5) expect(namen, name).toContain(name);
    expect(AUFTRAG_LIMITS_5).not.toContain("werkzeug_im_auftrag");
    expect(AUFTRAG_LIMITS_5).not.toContain("erwaehnungen_je_nachricht");
    expect(ERROR_CODES_5).toContain("auftrag_grenze");
  });

  it("modell.anfragen: ein gültiger Auftrag hat immer eine Art; ohne Auftrag darf eine Art stehen", () => {
    expect(anfrageStimmig({ botHatAuftrag: true, auftragArt: "keiner" })).toBe(false);
    expect(anfrageStimmig({ botHatAuftrag: true, auftragArt: "uebergabe" })).toBe(true);
    expect(anfrageStimmig({ botHatAuftrag: false, auftragArt: "rueckmeldung" })).toBe(true);
    expect(anfrageStimmig({ botHatAuftrag: false, auftragArt: "keiner" })).toBe(true);
    // Im Faden gehört jeder Lauf zum Baum, und es gibt keinen Bot der Unterhaltung.
    expect(anfrageStimmig({ conversationKind: "faden", auftragArt: "keiner" })).toBe(false);
    expect(anfrageStimmig({ conversationKind: "faden", botOfConversation: true })).toBe(false);
    expect(
      anfrageStimmig({
        conversationKind: "faden",
        auftragArt: "uebergabe",
        botOfConversation: false,
      }),
    ).toBe(true);
    expect(
      anfrageStimmig({ conversationKind: "direkt", auftragArt: "keiner", botOfConversation: true }),
    ).toBe(true);
  });

  it("V-39 an der Übergabe: Empfänger mit Auftrag nur bei Rückgabe, Geber offen nur mit Auftrag", () => {
    const v39 = PRECONDITIONS_5["V-39"];
    expect(v39.require).toEqual([]);
    expect(v39.requireOneOfFor["auftrag.uebergeben"]).toEqual([
      [
        { fact: "auftragArt", op: "eq", value: "keiner" },
        { fact: "auftragOffen", op: "eq", value: true },
      ],
      [
        { fact: "art", op: "ne", value: "rueckgabe" },
        { fact: "zielHatAuftrag", op: "eq", value: true },
      ],
    ]);
    for (const type of v39.actions.filter((entry) => entry !== "auftrag.uebergeben")) {
      expect(v39.requireFor[type as keyof typeof v39.requireFor], type).toContainEqual({
        fact: "auftragOffen",
        op: "eq",
        value: true,
      });
    }
  });

  it("Summe der Zuschläge höchstens 5 × 10 000, an modell.anfragen und am Zuschlag", () => {
    expect(MAX_BAUM_ZUSCHLAG_TOKENS).toBe(50000);
    const amZuschlag = AUFTRAG_ACTION_SHAPES["auftrag.budget_erhoehen"].facts.baumZuschlagTokens;
    expect(amZuschlag.safeParse(50000).success).toBe(true);
    expect(amZuschlag.safeParse(50001).success).toBe(false);
    expect(BAUM_FACTS.baumZuschlagTokens.safeParse(50001).success).toBe(false);
  });

  it("Code zusammenarbeit_aus für „Weg erlaubt, Schalter aus“", () => {
    expect(ERROR_CODES_5).toContain("zusammenarbeit_aus");
  });

  it("Zuschläge: fester Schritt 10 000 und fest höchstens 5 je Baum", () => {
    const facts = AUFTRAG_ACTION_SHAPES["auftrag.budget_erhoehen"].facts;
    expect(MAX_ZUSCHLAEGE).toBe(5);
    expect(facts.maxZuschlaege.safeParse(5).success).toBe(true);
    expect(facts.maxZuschlaege.safeParse(6).success).toBe(false);
    expect(facts.zuschlagTokens.safeParse(20000).success).toBe(false);
  });

  it("Fakten: kein Zettel und kein Text, nur Abdruck und Länge", () => {
    for (const type of AUFTRAG_ACTION_TYPES) {
      const { facts, target } = AUFTRAG_ACTION_SHAPES[type];
      for (const name of [...Object.keys(facts), ...Object.keys(target)]) {
        expect(name, `${type}.${name}`).not.toMatch(/^(zettel|text|ziel|name|inhalt)$/i);
      }
      if ("zettelDigest" in target) expect(Object.keys(facts), type).toContain("zettelChars");
    }
    expect(AUFTRAG_ACTION_SHAPES["auftrag.budget_erhoehen"].facts.zuschlagTokens.value).toBe(10000);
  });
});
