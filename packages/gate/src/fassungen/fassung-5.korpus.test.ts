/**
 * PaiBot – feste Fälle der Tor-Fassung 5 „Zusammenarbeit“ (`fassung-5.korpus.json`). Die
 * Erwartungen stammen aus dem Vertrag der Fassung 5 und entstanden, bevor es die Auswertung der
 * Fassung 5 im Code gab. Die Datei wird nie angepasst: Weicht die Auswertung von einem Fall ab, ist
 * die Auswertung falsch. Geprüft werden der Inhalt und die Auswertung (`fassung-5.ts`); verglichen
 * wird alles außer dem Grund (`reason`).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-27
 */

import type { RuleDefinition } from "@paibot/shared/tor";
import { describe, expect, it } from "vitest";
import { GATE_FORMAT_5 } from "./fassung-5";
import korpus from "./fassung-5.korpus.json";

interface Pruefung {
  name: string;
  result: string;
  value?: unknown;
}

interface Aktion {
  type?: unknown;
  actor?: unknown;
  target?: Record<string, unknown>;
}

interface Fall5 {
  name: string;
  action: Aktion;
  facts: Record<string, unknown>;
  /** Der Name eines Regel-Satzes aus `ruleSets`. */
  rules: string;
  expected: {
    outcome: string;
    stage: string;
    matchedRules: { id: string; version: number }[];
    limits: Pruefung[];
    preconditions: Pruefung[];
    caps?: Pruefung[];
  };
}

interface GrenzenFall5 {
  name: string;
  action: { type: string };
  facts: Record<string, unknown>;
  expected: Pruefung[];
}

const KORPUS_5 = korpus as unknown as {
  format: number;
  ruleSets: Record<string, RuleDefinition[]>;
  cases: Fall5[];
  limitCases: GrenzenFall5[];
};

/** Grenzen der Fassung 5 in ihrer Reihenfolge: die der Fassung 4, danach die dreizehn neuen. */
const GRENZEN_5 = [
  "schleuse_gefordert",
  "anbieter_region",
  "laenge",
  "tagesbudget",
  "not_aus",
  "lauf_schritte",
  "lauf_aufrufe",
  "lauf_token",
  "app_zugriff",
  "werkzeug_bestaetigt",
  "app_ziel",
  "eine_app_je_schritt",
  "bot_bereit",
  "entwurf_umfang",
  "bots_gesamt",
  "entwuerfe_je_tag",
  "auftrag_tiefe",
  "auftrag_anzahl",
  "auftrag_budget",
  "auftrag_zeit",
  "kein_kreis",
  "erwaehnungen_je_nachricht",
  "uebergaben_je_lauf",
  "auftrag_breite",
  "werkzeug_im_auftrag",
  "auftraege_je_mitglied",
  "rueckfragen_je_faden",
  "bitten_je_auftrag",
  "zuschlaege_je_baum",
];
const NEUE_GRENZEN = GRENZEN_5.slice(16);

/** Neue Aktionen der Fassung 5. */
const BOT_AKTIONEN_5 = ["auftrag.uebergeben", "auftrag.melden"];
const BESITZER_AKTIONEN_5 = [
  "auftrag.abbrechen",
  "auftrag.abnehmen",
  "auftrag.zurueckgeben",
  "auftrag.zettel_aendern",
  "auftrag.budget_erhoehen",
];

/** Arten eines Auftrags, in dem ein Lauf steht; `keiner` = Lauf ohne Auftrag. */
const AUFTRAG_ARTEN = [
  "keiner",
  "wurzel",
  "uebergabe",
  "bitte",
  "rueckkehr",
  "faecher",
  "sammeln",
  "rueckmeldung",
  "rueckgabe",
];

const WEG = "uebergabe_weg_erlaubt";
const D02 = "fremd_dann_verboten";

function typ(fall: { action: unknown }): string | undefined {
  const type = (fall.action as Aktion | null)?.type;
  return typeof type === "string" ? type : undefined;
}

function verletzt(liste: readonly Pruefung[]): string[] {
  return liste.filter((check) => check.result === "verletzt").map((check) => check.name);
}

function regelIds(fall: Fall5): string[] {
  return fall.expected.matchedRules.map((rule) => rule.id);
}

/** Ungültige Eingabe: abgelehnt, keine Regel, alle Grenzen entfallen. */
function ungueltig(fall: Fall5): boolean {
  return (
    fall.expected.outcome === "deny" &&
    fall.expected.matchedRules.length === 0 &&
    fall.expected.limits.every((check) => check.result === "entfaellt") &&
    fall.expected.preconditions.every((check) => check.result === "entfaellt")
  );
}

function fall(name: string): Fall5 {
  const gefunden = KORPUS_5.cases.find((entry) => entry.name === name);
  if (gefunden === undefined) throw new Error(`Fall fehlt: ${name}`);
  return gefunden;
}

function faelle(type: string): Fall5[] {
  return KORPUS_5.cases.filter((entry) => typ(entry) === type);
}

function standardRegel(id: string): RuleDefinition {
  const regel = KORPUS_5.ruleSets.standard?.find((rule) => rule.id === id);
  if (regel === undefined) throw new Error(`Regel fehlt: ${id}`);
  return regel;
}

describe("Korpus der Fassung 5: Aufbau", () => {
  it("Fassung 5, eindeutige Namen, kein Grund in den Erwartungen, Regel-Sätze vorhanden", () => {
    expect(KORPUS_5.format).toBe(5);
    expect(Object.keys(KORPUS_5.ruleSets).sort()).toEqual([
      "alles-erlaubt",
      "bot-erlaubt",
      "eigene-alle-bots",
      "eigene-uebergabe",
      "eigene-uebergabe-verboten",
      "leer",
      "standard",
    ]);
    const names = [...KORPUS_5.cases, ...KORPUS_5.limitCases].map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
    for (const entry of KORPUS_5.cases) {
      expect(Object.hasOwn(entry.expected, "reason"), entry.name).toBe(false);
      expect(KORPUS_5.ruleSets[entry.rules], entry.name).toBeInstanceOf(Array);
    }
  });

  it("die Standard-Regeln sind die der Fassung 4 und dazu R-009, R-015 bis R-019", () => {
    expect(KORPUS_5.ruleSets.standard?.map((rule) => rule.id)).toEqual([
      "R-001",
      "R-002",
      "R-003",
      "R-004",
      "R-005",
      "R-006",
      "R-999",
      "R-007",
      "R-008",
      "R-010",
      "R-014",
      "R-009",
      "R-015",
      "R-016",
      "R-017",
      "R-018",
      "R-019",
    ]);
    for (const satz of [
      "bot-erlaubt",
      "alles-erlaubt",
      "eigene-alle-bots",
      "eigene-uebergabe",
      "eigene-uebergabe-verboten",
    ]) {
      const standard = KORPUS_5.ruleSets[satz]?.filter((rule) => rule.source === "standard");
      expect(standard, satz).toEqual(KORPUS_5.ruleSets.standard);
    }
    expect(KORPUS_5.ruleSets.leer).toEqual([]);
  });

  it("R-009 fragt nach R-015/R-017/R-019, nur für Bots, im Band der Standard-Regeln vor jeder eigenen Regel", () => {
    const r009 = standardRegel("R-009");
    expect(r009.action).toBe("auftrag.uebergeben");
    expect(r009.effect).toBe("ask");
    expect(r009.conditions).toEqual([{ fact: "akteur", op: "eq", value: "bot" }]);
    expect(r009.priority).toBe(900);
    for (const id of ["R-015", "R-017", "R-019"]) {
      expect(standardRegel(id).priority, id).toBeLessThan(r009.priority);
    }
    // Eigene Regeln beginnen bei 1000: keine erreicht eine Übergabe eines Bots.
    expect(r009.priority).toBeLessThan(1000);
  });

  it("eigene Regeln (ab 1000) lockern und verschärfen auftrag.uebergeben für Bots nicht", () => {
    for (const satz of ["eigene-uebergabe", "eigene-alle-bots", "eigene-uebergabe-verboten"]) {
      const eigene = KORPUS_5.ruleSets[satz]?.filter((r) => r.source !== "standard") ?? [];
      expect(eigene.length, satz).toBe(1);
      expect(eigene[0]?.priority, satz).toBe(1000);
    }
    const faelle = KORPUS_5.cases.filter((entry) => entry.rules.startsWith("eigene-"));
    expect(faelle.length).toBeGreaterThanOrEqual(9);
    for (const entry of faelle) {
      expect(regelIds(entry)[0], entry.name).toMatch(/^R-0(09|15|17)$/);
    }
    for (const name of [
      "Schalter aus + eigene Regel für auftrag.uebergeben: Leitung an Mitglied fragt (R-009)",
      "Schalter aus + eigene Regel für auftrag.uebergeben: Pai an eine Leitung fragt (R-009)",
      "Schalter aus + eigene Regel für alles von Bots: Leitung an Mitglied fragt (R-009)",
      "Schalter aus + eigene Regel für alles von Bots: Pai an eine Leitung fragt (R-009)",
    ]) {
      expect(fall(name).expected.outcome, name).toBe("ask");
    }
  });

  it("R-017: Pai nur aus deinem Direkt-Chat, nur ohne Auftrag, nur in Läufen auf deine Nachricht", () => {
    const bedingungen = standardRegel("R-017").conditions;
    for (const bedingung of [
      { fact: "geberRolle", op: "eq", value: "stabschef" },
      { fact: "zielRolle", op: "eq", value: "leitung" },
      { fact: "conversationKind", op: "eq", value: "direkt" },
      { fact: "auftragArt", op: "eq", value: "keiner" },
      { fact: "trigger", op: "eq", value: "chat" },
      { fact: "stabschefErlaubt", op: "eq", value: true },
      { fact: "untrustedInput", op: "eq", value: false },
    ]) {
      expect(bedingungen, bedingung.fact).toContainEqual(bedingung);
    }
  });

  it("R-015 nur für die Leitung, R-019 nur für ein Mitglied mit Auftrag der Leitung, R-016 nur mit Auftrag", () => {
    expect(standardRegel("R-015").conditions).toContainEqual({
      fact: "geberRolle",
      op: "eq",
      value: "leitung",
    });
    expect(standardRegel("R-019").conditions).toContainEqual({
      fact: "auftragArt",
      op: "eq",
      value: "uebergabe",
    });
    expect(standardRegel("R-016").action).toBe("modell.anfragen");
    expect(standardRegel("R-016").conditions).toContainEqual({
      fact: "botHatAuftrag",
      op: "eq",
      value: true,
    });
    expect(standardRegel("R-018").action).toBe("auftrag.melden");
  });

  it("jede Entscheidung nennt alle Grenzen der Fassung 5 in fester Reihenfolge", () => {
    for (const entry of KORPUS_5.cases) {
      expect(
        entry.expected.limits.map((check) => check.name),
        entry.name,
      ).toEqual(GRENZEN_5);
    }
    for (const entry of KORPUS_5.limitCases) {
      expect(
        entry.expected.map((check) => check.name),
        entry.name,
      ).toEqual(GRENZEN_5);
    }
  });

  it("jede neue Grenze kommt ok, verletzt und entfallend vor; jede neue Vorbedingung verletzt", () => {
    const alle = [
      ...KORPUS_5.cases.map((entry) => entry.expected.limits),
      ...KORPUS_5.limitCases.map((entry) => entry.expected),
    ].flat();
    for (const name of [...NEUE_GRENZEN, "bot_bereit"]) {
      const ergebnisse = new Set(alle.filter((c) => c.name === name).map((c) => c.result));
      expect([...ergebnisse].sort(), name).toEqual(["entfaellt", "ok", "verletzt"]);
    }
    const vorbedingungen = new Set(
      KORPUS_5.cases.flatMap((entry) => verletzt(entry.expected.preconditions)),
    );
    for (const name of ["auftrag_offen", WEG, "budget_ausgeschoepft"]) {
      expect(vorbedingungen.has(name), name).toBe(true);
    }
  });
});

describe("Korpus der Fassung 5: neue Aktionen", () => {
  it("jede neue Aktion des Besitzers ist mit Sitzung und den Standard-Regeln erlaubt (R-001)", () => {
    for (const type of BESITZER_AKTIONEN_5) {
      const entry = fall(`aktion ${type}`);
      expect(entry.expected.outcome, type).toBe("allow");
      expect(regelIds(entry), type).toEqual(["R-001"]);
      expect(entry.action.actor, type).toBe("besitzer");
    }
  });

  it("keine neue Aktion des Besitzers mit Akteur Bot, auch nicht mit Regel für alles", () => {
    for (const type of BESITZER_AKTIONEN_5) {
      for (const name of [
        `${type} Akteur Bot: abgelehnt`,
        `${type} Akteur Bot trotz Regel für alle Bots`,
        `${type} Akteur Bot trotz Regel alles erlaubt`,
      ]) {
        const entry = fall(name);
        expect(entry.action.actor, name).toMatch(/^bot:/);
        expect(ungueltig(entry), name).toBe(true);
      }
    }
  });

  it("Übergaben und Meldungen gibt es nur vom Bot", () => {
    for (const type of BOT_AKTIONEN_5) {
      for (const name of [
        `${type} Akteur Besitzer ist ungültig`,
        `${type} Akteur Besitzer ist ungültig trotz Regel alles erlaubt`,
      ]) {
        expect(ungueltig(fall(name)), name).toBe(true);
      }
    }
  });

  it("keine Aktion zum Abhaken einzelner Ziel-Punkte; unbekannte Aktionen sind ungültig", () => {
    for (const type of [
      "auftrag.ziel_abhaken",
      "auftrag.punkt_abhaken",
      "auftrag.weiterreichen",
      "team.entwurf_vorschlagen",
      "werkzeug.freigeben",
      "werkzeug.ausfuehren",
    ]) {
      for (const name of [
        `aktion ${type} unbekannt`,
        `aktion ${type} unbekannt trotz Regel alles erlaubt`,
      ]) {
        const entry = fall(name);
        expect(ungueltig(entry), name).toBe(true);
        expect(entry.expected.preconditions, name).toEqual([]);
      }
    }
    const typen = new Set(KORPUS_5.cases.filter((entry) => !ungueltig(entry)).map(typ));
    expect([...typen].filter((type) => type?.includes("abhaken"))).toEqual([]);
  });

  it("Entwurfs-Herkunft Pai ist neu, andere Herkünfte gibt es nicht", () => {
    expect(fall("team.entwurf_erstellen: Herkunft Pai (R-001)").expected.outcome).toBe("allow");
    for (const herkunft of ["datei", "assistent"]) {
      expect(
        ungueltig(fall(`team.entwurf_erstellen: Herkunft ${herkunft} gibt es in Fassung 5 nicht`)),
      ).toBe(true);
    }
  });
});

describe("Korpus der Fassung 5: Wege der Übergabe (V-40, R-009)", () => {
  const uebergaben = faelle("auftrag.uebergeben");

  it("jeder verbotene Weg ergibt deny über V-40, auch mit Schalter aus und mit Regel für alles", () => {
    const verboten = uebergaben.filter((entry) => entry.name.startsWith("V-40 verboten:"));
    expect(verboten.length).toBeGreaterThanOrEqual(90);
    for (const entry of verboten) {
      expect(entry.expected.outcome, entry.name).toBe("deny");
      expect(verletzt(entry.expected.preconditions), entry.name).toContain(WEG);
    }
    expect(verboten.some((entry) => entry.rules === "alles-erlaubt")).toBe(true);
    expect(verboten.some((entry) => entry.facts.zusammenarbeit === "aus")).toBe(true);
    expect(verboten.some((entry) => entry.facts.stabschefErlaubt === false)).toBe(true);
  });

  it("eine Übergabe wird nie gefragt, wenn der Weg verboten ist; gefragt wird nur R-009 oder ohne Regel", () => {
    for (const entry of uebergaben) {
      if (verletzt(entry.expected.preconditions).includes(WEG)) {
        expect(entry.expected.outcome, entry.name).toBe("deny");
      }
      if (entry.expected.outcome === "ask") {
        expect(verletzt(entry.expected.preconditions), entry.name).toEqual([]);
        expect(["R-009", undefined], entry.name).toContain(regelIds(entry)[0]);
      }
    }
  });

  it("erlaubter Weg mit Schalter aus: R-009 fragt", () => {
    for (const name of [
      "R-009: Leitung gibt weiter, Zusammenarbeit aus: fragt",
      "R-009: Rückgabe, Zusammenarbeit aus: fragt",
      "R-009: Bitte, Zusammenarbeit aus: fragt",
      "R-009: Pai an eine Leitung, Schalter Stabschef aus: fragt",
    ]) {
      expect(fall(name).expected.outcome, name).toBe("ask");
      expect(regelIds(fall(name)), name).toEqual(["R-009"]);
    }
  });

  it("die vier erlaubten Wege mit Schalter an: R-015, R-019, R-017", () => {
    for (const [name, regel] of [
      ["aktion auftrag.uebergeben: Leitung gibt einem Mitglied Arbeit (R-015)", "R-015"],
      ["aktion auftrag.uebergeben: Leitung gibt an ein Mitglied zurück (R-015, Rückgabe)", "R-015"],
      ["aktion auftrag.uebergeben: Mitglied bittet einen Kollegen (R-019)", "R-019"],
      [
        "aktion auftrag.uebergeben: Pai gibt der Leitung eines Teams einen Auftrag (R-017)",
        "R-017",
      ],
    ] as const) {
      expect(fall(name).expected.outcome, name).toBe("allow");
      expect(regelIds(fall(name)), name).toEqual([regel]);
    }
  });

  it("Pai beauftragt kein Team aus Rückmeldung, Sammeln, Faden oder Automation", () => {
    for (const name of [
      "V-40 verboten: Pai aus seinem Rückmeldungs-Lauf",
      "V-40 verboten: Pai aus einem Sammel-Lauf",
      "V-40 verboten: Pai aus einem Lauf mit Auftrag (wurzel)",
      "V-40 verboten: Pai aus einem Faden",
      "V-40 verboten: Pai aus einem Lauf einer Automation",
      "V-40 verboten: Pai an ein Mitglied eines Teams",
    ]) {
      expect(fall(name).expected.outcome, name).toBe("deny");
      expect(verletzt(fall(name).expected.preconditions), name).toEqual([WEG]);
    }
  });

  it("Zulieferer reicht nicht weiter, zweite Bitte über G-45, Rückgabe nur durch die Leitung", () => {
    for (const name of [
      "V-40 verboten: Zulieferer reicht weiter (Bitte aus einer Zulieferung)",
      "V-40 verboten: Bitte an die Leitung",
      "V-40 verboten: Bitte an sich selbst",
      "V-40 verboten: Zurück an durch ein Mitglied (Rückgabe ohne Leitung)",
    ]) {
      expect(verletzt(fall(name).expected.preconditions), name).toEqual([WEG]);
    }
    const zweite = fall("auftrag.uebergeben G-45: zweite Bitte im selben Auftrag");
    expect(zweite.expected.outcome).toBe("deny");
    expect(verletzt(zweite.expected.limits)).toEqual(["bitten_je_auftrag"]);
    expect(verletzt(zweite.expected.preconditions)).toEqual([]);
  });
});

describe("Korpus der Fassung 5: Deckel D-02 und Grenzen", () => {
  const uebergaben = faelle("auftrag.uebergeben");

  it("D-02 steht an jeder Übergabe; nach fremden Inhalten wird jede Übergabe abgelehnt", () => {
    for (const entry of uebergaben) {
      expect(
        entry.expected.caps?.map((cap) => cap.name),
        entry.name,
      ).toEqual([D02]);
      if (!ungueltig(entry) && entry.facts.untrustedInput === true) {
        expect(entry.expected.outcome, entry.name).toBe("deny");
        expect(entry.expected.caps?.[0]?.result, entry.name).not.toBe("entfaellt");
      }
    }
    expect(
      fall(
        "D-02: Leitung gibt weiter nach fremden Inhalten, Zusammenarbeit aus: abgelehnt statt gefragt",
      ).expected.caps,
    ).toEqual([{ name: D02, result: "gedeckelt" }]);
  });

  it("Meldungen haben keinen Deckel", () => {
    for (const entry of faelle("auftrag.melden")) {
      expect(entry.expected.caps, entry.name).toBeUndefined();
    }
  });

  it("G-42: Werkzeuge nur ohne Auftrag, für jede Art eines Auftrags", () => {
    for (const entry of faelle("werkzeug.aufrufen")) {
      if (ungueltig(entry)) continue;
      const art = entry.facts.auftragArt;
      const g42 = entry.expected.limits.find((check) => check.name === "werkzeug_im_auftrag");
      expect(g42?.result, entry.name).toBe(art === "keiner" ? "ok" : "verletzt");
      if (art !== "keiner") expect(entry.expected.outcome, entry.name).toBe("deny");
    }
    for (const art of AUFTRAG_ARTEN.slice(1)) {
      expect(fall(`G-42: Doku im Auftrag der Art ${art}: abgelehnt`).expected.outcome).toBe("deny");
    }
    expect(
      fall("G-42: Pais Rückmeldungs-Lauf liest in einer App (R-014 passt): abgelehnt").expected
        .outcome,
    ).toBe("deny");
  });

  it("pausierter Empfänger: deny über G-15", () => {
    const entry = fall("auftrag.uebergeben G-15: Empfänger pausiert");
    expect(entry.expected.outcome).toBe("deny");
    expect(verletzt(entry.expected.limits)).toEqual(["bot_bereit"]);
  });

  it("Budget-Zuschlag nur durch den Besitzer, nur bei ausgeschöpftem Budget, höchstens 5 je Baum", () => {
    const v41 = fall("auftrag.budget_erhoehen: V-41: Budget des Baums noch nicht erreicht");
    expect(verletzt(v41.expected.preconditions)).toEqual(["budget_ausgeschoepft"]);
    const g46 = fall("auftrag.budget_erhoehen: G-46: sechster Zuschlag");
    expect(verletzt(g46.expected.limits)).toEqual(["zuschlaege_je_baum"]);
    expect(fall("auftrag.budget_erhoehen: fünfter Zuschlag geht").expected.outcome).toBe("allow");
    for (const name of [
      "auftrag.budget_erhoehen: Schritt 5000 statt 10 000 ist ungültig",
      "auftrag.budget_erhoehen: Schritt 20000 statt 10 000 ist ungültig",
    ]) {
      expect(ungueltig(fall(name)), name).toBe(true);
    }
    const g04 = fall("G-04 bleibt: Tagesbudget erreicht, Zuschlag des Baums hilft nicht");
    expect(verletzt(g04.expected.limits)).toEqual(["tagesbudget"]);
  });

  it("Auftrag aus einem anderen Faden zählt nicht: kein Antworten", () => {
    const entry = fall(
      "modell.anfragen: Auftrag aus Faden X, Lauf in Unterhaltung Y: kein gültiger Auftrag (R-999)",
    );
    expect(entry.facts.botHatAuftrag).toBe(false);
    expect(entry.expected.outcome).toBe("ask");
    expect(regelIds(entry)).toEqual(["R-999"]);
  });

  it("Füllwerte: Direkt-Chat ohne Auftrag entscheidet wie Fassung 4", () => {
    const entry = fall("modell.anfragen: Direkt-Chat mit den Füllwerten wie Fassung 4 (R-002)");
    expect(entry.facts).toMatchObject({
      conversationKind: "direkt",
      botHatAuftrag: false,
      auftragArt: "keiner",
      zweck: "chat",
    });
    expect(regelIds(entry)).toEqual(["R-002"]);
    for (const check of entry.expected.limits.filter((c) => NEUE_GRENZEN.includes(c.name))) {
      expect(check.result, check.name).toBe("entfaellt");
    }
    expect(fall("modell.anfragen: Zweck Team entwerfen (R-002)").facts.zweck).toBe("team_entwurf");
  });

  it("Fakten sind flach: kein Text eines Zettels, keine Namen, keine Listen", () => {
    for (const entry of KORPUS_5.cases) {
      if (ungueltig(entry)) continue;
      for (const [name, value] of Object.entries(entry.facts)) {
        expect(typeof value === "object" && value !== null, `${entry.name}: ${name}`).toBe(false);
      }
      expect(Object.keys(entry.facts), entry.name).not.toContain("zettel");
      expect(Object.keys(entry.action.target ?? {}), entry.name).not.toContain("zettel");
    }
    for (const extra of ["zettel", "botName", "vorfahren", "rueckmeldung", "frageText"]) {
      expect(
        ungueltig(fall(`auftrag.uebergeben: Fakt ${extra} gehört nicht zu Fassung 5`)),
        extra,
      ).toBe(true);
    }
  });
});

function regeln5(entry: Fall5): RuleDefinition[] {
  const satz = KORPUS_5.ruleSets[entry.rules];
  if (satz === undefined) throw new Error(`Regel-Satz ${entry.rules} fehlt.`);
  return satz;
}

function rechne(entry: Fall5): Record<string, unknown> {
  const decision = GATE_FORMAT_5.evaluate(
    entry.action as never,
    entry.facts as never,
    regeln5(entry),
  );
  const { reason: _reason, ...rest } = decision as unknown as Record<string, unknown>;
  return rest;
}

describe("Korpus der Fassung 5: Auswertung", () => {
  for (const entry of KORPUS_5.cases) {
    it(entry.name, () => {
      expect(rechne(entry)).toStrictEqual(entry.expected);
    });
  }
  for (const entry of KORPUS_5.limitCases) {
    it(`grenzen: ${entry.name}`, () => {
      expect(GATE_FORMAT_5.checkLimits(entry.action, entry.facts)).toStrictEqual(entry.expected);
    });
  }
});
