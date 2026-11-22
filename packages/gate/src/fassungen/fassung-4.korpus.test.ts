/**
 * PaiBot – feste Fälle der Tor-Fassung 4 (`fassung-4.korpus.json`). Die Erwartungen stehen im
 * Vertrag der Fassung 4 und wurden je Fall von Hand festgelegt, nicht aus der Auswertung
 * berechnet. Die Datei wird nie angepasst: Weicht die Auswertung von einem Fall ab, ist die
 * Auswertung falsch. Verglichen wird alles außer dem Grund (`reason`); Texte gehören nicht zum
 * Inhalt einer Fassung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import type { RuleDefinition } from "@paibot/shared/tor";
import { TEAM_ACTION_TYPES } from "@paibot/shared/tor-fassung-4";
import { describe, expect, it } from "vitest";
import { GATE_FORMAT_4 } from "./fassung-4";
import korpus from "./fassung-4.korpus.json";

interface Pruefung {
  name: string;
  result: string;
  value?: unknown;
}

interface Fall4 {
  name: string;
  action: unknown;
  facts: unknown;
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

interface GrenzenFall4 {
  name: string;
  action: { type: string };
  facts: unknown;
  expected: Pruefung[];
}

const KORPUS_4 = korpus as unknown as {
  format: number;
  ruleSets: Record<string, RuleDefinition[]>;
  cases: Fall4[];
  limitCases: GrenzenFall4[];
};

function regeln4(fall: Fall4): RuleDefinition[] {
  const satz = KORPUS_4.ruleSets[fall.rules];
  if (satz === undefined) throw new Error(`Regel-Satz ${fall.rules} fehlt.`);
  return satz;
}

/** Grenzen der Fassung 4 in ihrer Reihenfolge: die der Fassung 3, danach die vier neuen. */
const GRENZEN_4 = [
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
];
const NEUE_GRENZEN = GRENZEN_4.slice(12);

function typ(fall: { action: unknown }): string | undefined {
  const type = (fall.action as { type?: unknown } | null)?.type;
  return typeof type === "string" ? type : undefined;
}

function verletzt(liste: readonly Pruefung[]): string[] {
  return liste.filter((check) => check.result === "verletzt").map((check) => check.name);
}

function fall(name: string): Fall4 {
  const gefunden = KORPUS_4.cases.find((entry) => entry.name === name);
  if (gefunden === undefined) throw new Error(`Fall fehlt: ${name}`);
  return gefunden;
}

describe("Korpus der Fassung 4: Inhalt", () => {
  it("Fassung 4, eindeutige Namen, kein Grund in den Erwartungen, Regel-Sätze vorhanden", () => {
    expect(KORPUS_4.format).toBe(4);
    expect(Object.keys(KORPUS_4.ruleSets).sort()).toEqual([
      "alles-erlaubt",
      "bot-erlaubt",
      "leer",
      "standard",
    ]);
    // Die Standard-Regeln sind die der Fassung 3: Fassung 4 bringt keine neue Standard-Regel.
    expect(KORPUS_4.ruleSets.standard?.map((rule) => rule.id)).toEqual([
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
    ]);
    const names = [...KORPUS_4.cases, ...KORPUS_4.limitCases].map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
    for (const entry of KORPUS_4.cases) {
      expect(Object.hasOwn(entry.expected, "reason"), entry.name).toBe(false);
      expect(regeln4(entry), entry.name).toBeInstanceOf(Array);
    }
  });

  it("jede neue Aktion ist mit Sitzung des Besitzers und den Standard-Regeln erlaubt (R-001)", () => {
    expect(TEAM_ACTION_TYPES).toHaveLength(13);
    for (const type of TEAM_ACTION_TYPES) {
      const entry = fall(`aktion ${type}`);
      expect(entry.expected.outcome, type).toBe("allow");
      expect(entry.expected.matchedRules, type).toEqual([{ id: "R-001", version: 1 }]);
      expect(typ(entry), type).toBe(type);
      expect((entry.action as { actor: string }).actor, type).toBe("besitzer");
    }
  });

  it("jede neue Aktion mit Akteur Bot ist ungültig: abgelehnt, keine Regel gilt, auch mit Regel für alle Bots", () => {
    for (const type of TEAM_ACTION_TYPES) {
      for (const name of [
        `${type} Akteur Bot: abgelehnt`,
        `${type} Akteur Bot trotz Regel für alle Bots`,
        `${type} Akteur Bot trotz Regel alles erlaubt`,
      ]) {
        const entry = fall(name);
        expect((entry.action as { actor: string }).actor, name).toMatch(/^bot:/);
        expect(entry.expected.outcome, name).toBe("deny");
        expect(entry.expected.matchedRules, name).toEqual([]);
        expect(
          entry.expected.limits.every((check) => check.result === "entfaellt"),
          name,
        ).toBe(true);
      }
      expect(fall(`${type} Akteur Bot trotz Regel für alle Bots`).rules).toBe("bot-erlaubt");
    }
  });

  it("jede neue Aktion mit Passwort statt Sitzung: R-006 lehnt ab", () => {
    for (const type of TEAM_ACTION_TYPES) {
      const entry = fall(`${type} mit Passwort statt Sitzung: R-006 lehnt ab`);
      expect(entry.expected.outcome, type).toBe("deny");
      expect(entry.expected.matchedRules, type).toEqual([{ id: "R-006", version: 1 }]);
    }
  });

  it("jede entscheidende Grenze und Vorbedingung kommt ok und verletzt vor", () => {
    const alle = [
      ...KORPUS_4.cases.map((entry) => entry.expected.limits),
      ...KORPUS_4.limitCases.map((entry) => entry.expected),
    ];
    for (const name of NEUE_GRENZEN) {
      const ergebnisse = new Set(
        alle
          .flat()
          .filter((c) => c.name === name)
          .map((c) => c.result),
      );
      expect([...ergebnisse].sort(), name).toEqual(["entfaellt", "ok", "verletzt"]);
    }
    const vorbedingungen = new Set(
      KORPUS_4.cases.flatMap((entry) => verletzt(entry.expected.preconditions)),
    );
    for (const name of [
      "team_vorhanden",
      "entwurf_offen",
      "entwurf_fassung_passt",
      "entwurf_namen_frei",
      "entwurf_modelle_vorhanden",
      "entwurf_ansprechpartner",
      "standard_bot_bleibt",
      "kein_lauf_des_bots",
      "entwurf_unbenutzt",
      "leitung_im_team",
    ]) {
      expect(vorbedingungen.has(name), name).toBe(true);
    }
  });

  it("jede Entscheidung nennt alle Grenzen der Fassung 4 in fester Reihenfolge", () => {
    for (const entry of KORPUS_4.cases) {
      expect(
        entry.expected.limits.map((check) => check.name),
        entry.name,
      ).toEqual(GRENZEN_4);
    }
    for (const entry of KORPUS_4.limitCases) {
      expect(
        entry.expected.map((check) => check.name),
        entry.name,
      ).toEqual(GRENZEN_4);
    }
  });

  it("Aktionen, die es in Fassung 4 nicht gibt, sind ungültig, auch mit Regel für alles", () => {
    for (const type of [
      "team.entwurf_vorschlagen",
      "auftrag.uebergeben",
      "auftrag.melden",
      "auftrag.abbrechen",
      "auftrag.abnehmen",
      "auftrag.zurueckgeben",
      "auftrag.zettel_aendern",
      "auftrag.budget_erhoehen",
      "werkzeug.freigeben",
      "werkzeug.ausfuehren",
    ]) {
      for (const name of [
        `aktion ${type} unbekannt`,
        `aktion ${type} unbekannt trotz Regel alles erlaubt`,
      ]) {
        const entry = fall(name);
        expect(entry.expected.outcome, name).toBe("deny");
        expect(entry.expected.matchedRules, name).toEqual([]);
        expect(entry.expected.preconditions, name).toEqual([]);
      }
    }
  });

  it("Herkunft eines Entwurfs: nur die Vorlage; Zettel, Namen und Texte nie in Fakten", () => {
    for (const herkunft of ["datei", "assistent", "pai"]) {
      expect(
        fall(`team.entwurf_erstellen: Herkunft ${herkunft} gibt es in Fassung 4 nicht`).expected
          .outcome,
      ).toBe("deny");
    }
    expect(
      fall("faden.anlegen: der Zettel selbst steht nie in den Fakten").expected.matchedRules,
    ).toEqual([]);
    for (const extra of [
      "zugriffe",
      "regelVorschlaege",
      "automationen",
      "merkzettel",
      "schreibZugriffe",
    ]) {
      expect(
        fall(`team.entwurf_anlegen: Fakt ${extra} gehört nicht zu Fassung 4`).expected.matchedRules,
      ).toEqual([]);
    }
  });

  it("ein pausierter Bot antwortet nicht, auch wenn eine Regel alles erlaubt", () => {
    for (const name of [
      "modell.anfragen: Bot pausiert, G-15 lehnt ab",
      "modell.anfragen: Bot pausiert, auch wenn eine Regel alles erlaubt",
      "modell.anfragen: Bot pausiert, auch wenn eine Regel alle Bots erlaubt",
      "nachricht.senden: Bot pausiert, G-15 lehnt ab",
      "nachricht.senden: Bot pausiert, auch wenn eine Regel alles erlaubt",
    ]) {
      expect(fall(name).expected.outcome, name).toBe("deny");
      expect(verletzt(fall(name).expected.limits), name).toEqual(["bot_bereit"]);
    }
    for (const name of [
      "werkzeug.aufrufen: Doku-Werkzeug, Bot pausiert, G-15 lehnt ab",
      "werkzeug.aufrufen: Doku-Werkzeug, Bot pausiert, auch wenn eine Regel alles erlaubt",
      "werkzeug.aufrufen: Doku-Werkzeug, Bot pausiert, auch wenn eine Regel alle Bots erlaubt",
      "werkzeug.aufrufen: App-Werkzeug (R-014), Bot pausiert, G-15 lehnt ab",
      "werkzeug.aufrufen: App-Werkzeug (R-014), Bot pausiert, auch wenn eine Regel alles erlaubt",
    ]) {
      expect(fall(name).expected.outcome, name).toBe("deny");
      expect(verletzt(fall(name).expected.limits), name).toEqual(["bot_bereit"]);
    }
    expect(
      fall("werkzeug.aufrufen: Doku-Werkzeug, Bot nicht pausiert, erlaubt").expected.outcome,
    ).toBe("allow");
    expect(fall("modell.anfragen: Bot nicht pausiert, erlaubt").expected.outcome).toBe("allow");
    expect(fall("nachricht.senden: Bot nicht pausiert, erlaubt").expected.outcome).toBe("allow");
  });

  it("Querfälle: kein Antworten und keine Werkzeuge für einen Bot, der nicht Bot der Unterhaltung ist", () => {
    for (const name of [
      "Querfall: Team-Bot ist nicht Bot der Unterhaltung, modell.anfragen: fragt, antwortet nicht",
      "Querfall: Team-Bot liest in einer App, aber nicht Bot der Unterhaltung: fragt, erlaubt nichts",
      "Querfall: Team-Bot fragt die Doku, aber nicht Bot der Unterhaltung: fragt, erlaubt nichts",
    ]) {
      expect(fall(name).expected.outcome, name).toBe("ask");
      expect(fall(name).expected.matchedRules, name).toEqual([{ id: "R-999", version: 1 }]);
    }
  });
});

function rechne(entry: Fall4): Record<string, unknown> {
  const decision = GATE_FORMAT_4.evaluate(
    entry.action as never,
    entry.facts as never,
    regeln4(entry),
  );
  const { reason: _reason, ...rest } = decision as unknown as Record<string, unknown>;
  return rest;
}

describe("Korpus der Fassung 4: Auswertung", () => {
  for (const entry of KORPUS_4.cases) {
    it(entry.name, () => {
      expect(rechne(entry)).toStrictEqual(entry.expected);
    });
  }
  for (const entry of KORPUS_4.limitCases) {
    it(`grenzen: ${entry.name}`, () => {
      expect(GATE_FORMAT_4.checkLimits(entry.action, entry.facts)).toStrictEqual(entry.expected);
    });
  }
});
