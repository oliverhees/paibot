/**
 * PaiBot – feste Fälle der Tor-Fassung 3 (`fassung-3.korpus.json`). Die Erwartungen stammen aus
 * dem Vertrag der Fassung 3 und entstanden, bevor es die Auswertung der Fassung 3 im Code gab. Die
 * Datei wird nie angepasst: Weicht die Auswertung von einem Fall ab, ist die Auswertung falsch.
 * Verglichen wird alles außer dem Grund (`reason`); Texte gehören nicht zum Inhalt einer Fassung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import type { RuleDefinition } from "@paibot/shared/tor";
import { R014_V1 } from "@paibot/shared/tor-fassung-3";
import { describe, expect, it } from "vitest";
import korpus from "./fassung-3.korpus.json";

interface Pruefung {
  name: string;
  result: string;
  value?: unknown;
}

interface Fall3 {
  name: string;
  action: unknown;
  facts: unknown;
  /** Regeln des Falls oder der Name eines Regel-Satzes aus `ruleSets`. */
  rules: RuleDefinition[] | string;
  expected: {
    outcome: string;
    stage: string;
    matchedRules: { id: string; version: number }[];
    limits: Pruefung[];
    preconditions: Pruefung[];
    caps?: Pruefung[];
  };
}

interface GrenzenFall3 {
  name: string;
  action: { type: string };
  facts: unknown;
  expected: Pruefung[];
}

const KORPUS_3 = korpus as unknown as {
  format: number;
  ruleSets: Record<string, RuleDefinition[]>;
  cases: Fall3[];
  limitCases: GrenzenFall3[];
};

/** Regeln eines Falls (ein Regel-Satz wird über seinen Namen aufgelöst). */
function regeln3(fall: Fall3): RuleDefinition[] {
  if (typeof fall.rules !== "string") return fall.rules;
  const satz = KORPUS_3.ruleSets[fall.rules];
  if (satz === undefined) throw new Error(`Regel-Satz ${fall.rules} fehlt.`);
  return satz;
}

/** Aktionen der Fassung 3: die 25 der Fassung 2 und die vier für Apps. */
const AKTIONEN_3 = [
  "einrichtung.abschliessen",
  "zugang.anmelden",
  "zugang.abmelden",
  "zugang.alle_abmelden",
  "zugang.passwort_aendern",
  "anbieter.speichern",
  "anbieter.loeschen",
  "modell.waehlen",
  "bot.aendern",
  "schleuse.umschalten",
  "einstellung.aendern",
  "unterhaltung.anlegen",
  "unterhaltung.umbenennen",
  "unterhaltung.loeschen",
  "nachricht.senden",
  "modell.anfragen",
  "lauf.abbrechen",
  "belege.exportieren",
  "werkzeug.aufrufen",
  "geraet.hinzufuegen",
  "geraet.entfernen",
  "geraet.bestaetigen",
  "notaus.umschalten",
  "unterhaltung.exportieren",
  "antwort.neu_erzeugen",
  "app.verbinden",
  "app.werkzeuge_bestaetigen",
  "app.zugriff_setzen",
  "app.trennen",
];

/** Grenzen der Fassung 3 in ihrer Reihenfolge: die der Fassung 2, danach G-06 bis G-08 und G-40. */
const GRENZEN_3 = [
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
];
const NEUE_GRENZEN = GRENZEN_3.slice(8);

function typ(fall: { action: unknown }): string | undefined {
  const type = (fall.action as { type?: unknown } | null)?.type;
  return typeof type === "string" ? type : undefined;
}

function verletzt(liste: readonly Pruefung[]): string[] {
  return liste.filter((check) => check.result === "verletzt").map((check) => check.name);
}

function fall(name: string): Fall3 {
  const gefunden = KORPUS_3.cases.find((entry) => entry.name === name);
  if (gefunden === undefined) throw new Error(`Fall fehlt: ${name}`);
  return gefunden;
}

describe("Korpus der Fassung 3: Inhalt", () => {
  it("Fassung 3, eindeutige Namen, kein Grund in den Erwartungen, Regel-Sätze vorhanden", () => {
    expect(KORPUS_3.format).toBe(3);
    expect(Object.keys(KORPUS_3.ruleSets).sort()).toEqual(["fassung2", "standard"]);
    expect(KORPUS_3.ruleSets.standard?.map((rule) => rule.id)).toEqual([
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
    expect(KORPUS_3.ruleSets.standard?.at(-1)).toEqual(R014_V1);
    expect(KORPUS_3.ruleSets.fassung2?.map((rule) => rule.id)).not.toContain("R-014");
    for (const entry of KORPUS_3.cases) expect(regeln3(entry), entry.name).toBeInstanceOf(Array);
    const names = [...KORPUS_3.cases, ...KORPUS_3.limitCases].map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
    for (const entry of KORPUS_3.cases) {
      expect(Object.hasOwn(entry.expected, "reason"), entry.name).toBe(false);
    }
  });

  it("jede Aktion der Fassung 3 erlaubt; Freigabe-Aktionen und spätere App-Aktionen unbekannt", () => {
    for (const type of AKTIONEN_3) {
      const entry = fall(`aktion ${type}`);
      expect(entry.expected.outcome, type).toBe("allow");
      expect(typ(entry), type).toBe(type);
    }
    for (const type of [
      "werkzeug.freigeben",
      "werkzeug.ausfuehren",
      "app.aendern",
      "app.oauth_starten",
      "app.oauth_abschliessen",
      "regel.anlegen",
    ]) {
      const entry = fall(`aktion ${type} unbekannt`);
      expect(entry.expected.outcome, type).toBe("deny");
      expect(entry.expected.preconditions, type).toEqual([]);
      expect(
        entry.expected.limits.every((check) => check.result === "entfaellt"),
        type,
      ).toBe(true);
    }
  });

  it("jede Entscheidung nennt alle Grenzen der Fassung 3 in fester Reihenfolge", () => {
    for (const entry of KORPUS_3.cases) {
      expect(
        entry.expected.limits.map((check) => check.name),
        entry.name,
      ).toEqual(GRENZEN_3);
    }
    for (const entry of KORPUS_3.limitCases) {
      expect(
        entry.expected.map((check) => check.name),
        entry.name,
      ).toEqual(GRENZEN_3);
    }
  });

  it("jede neue Grenze und Vorbedingung kommt ok und verletzt vor", () => {
    const alle = [
      ...KORPUS_3.cases.map((entry) => entry.expected.limits),
      ...KORPUS_3.limitCases.map((entry) => entry.expected),
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
      KORPUS_3.cases.flatMap((entry) => verletzt(entry.expected.preconditions)),
    );
    for (const name of ["app_adresse_erlaubt", "abdruck_gesehen"]) {
      expect(vorbedingungen.has(name), name).toBe(true);
    }
  });

  it("eingebaute Werkzeuge und andere Aktionen: die neuen Grenzen entfallen immer", () => {
    for (const entry of KORPUS_3.cases) {
      const facts = entry.facts as { toolSource?: unknown; appId?: unknown } | null;
      const mcp = typ(entry) === "werkzeug.aufrufen" && facts?.toolSource === "mcp";
      if (mcp) continue;
      const neu = entry.expected.limits.filter((check) => NEUE_GRENZEN.includes(check.name));
      expect(
        neu.every((check) => check.result === "entfaellt"),
        entry.name,
      ).toBe(true);
    }
  });

  it("R-014: erlaubt nur mit allen Bedingungen; nur im Chat mit dem Bot selbst", () => {
    expect(fall("R-014 passt").expected.outcome).toBe("allow");
    expect(fall("R-014 passt").expected.matchedRules).toEqual([{ id: "R-014", version: 1 }]);
    const direkt = fall("R-014 nur im direkt-chat").expected;
    expect(direkt.outcome).not.toBe("allow");
    expect(direkt.matchedRules).toEqual([{ id: "R-999", version: 1 }]);
    for (const name of [
      "R-014 nicht im regelsatz der fassung 2",
      "R-014 abgeschaltet",
      "R-014 art schreiben",
      "R-014 kein zugriff",
      "R-014 stand neu",
      "R-014 stand geaendert",
      "R-014 stand entfernt",
      "R-014 stand gesperrt",
    ]) {
      expect(fall(name).expected.outcome, name).not.toBe("allow");
      expect(fall(name).expected.matchedRules, name).not.toEqual([{ id: "R-014", version: 1 }]);
    }
  });

  it("G-40: Schritt mit Aufrufen an A, A, B ergibt erlaubt, erlaubt, abgelehnt", () => {
    expect(
      ["erster", "zweiter", "dritter"].map(
        (n) => fall(`G-40 schritt A A B: ${n} aufruf`).expected.outcome,
      ),
    ).toEqual(["allow", "allow", "deny"]);
    expect(verletzt(fall("G-40 schritt A A B: dritter aufruf").expected.limits)).toEqual([
      "eine_app_je_schritt",
    ]);
  });

  it("D-01 deckelt auch Lese-Aufrufe an Apps nach fremden Inhalten", () => {
    expect(fall("D-01 app-werkzeug nach fremden inhalten").expected).toMatchObject({
      outcome: "ask",
      caps: [{ name: "fremd_dann_fragen", result: "gedeckelt" }],
    });
    expect(fall("D-01 app-werkzeug fremd und zweite app").expected).toMatchObject({
      outcome: "deny",
      caps: [{ name: "fremd_dann_fragen", result: "nicht_noetig" }],
    });
  });
});
