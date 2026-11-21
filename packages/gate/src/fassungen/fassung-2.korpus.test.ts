/**
 * PaiBot – feste Fälle der Tor-Fassung 2 (`fassung-2.korpus.json`). Die Erwartungen stammen aus
 * dem Vertrag der Fassung 2 und entstanden, bevor es die Auswertung der Fassung 2 im Code gab. Die
 * Datei wird nie angepasst: Weicht die Auswertung von einem Fall ab, ist die Auswertung falsch.
 * Verglichen wird alles außer dem Grund (`reason`); Texte gehören nicht zum Inhalt einer Fassung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { RuleDefinition } from "@paibot/shared/tor";
import { describe, expect, it } from "vitest";
import korpus from "./fassung-2.korpus.json";
import { gateFormatSpec } from "./index";

interface Pruefung {
  name: string;
  result: string;
  value?: unknown;
}

interface Fall {
  name: string;
  action: unknown;
  facts: unknown;
  /** Regeln des Falls oder der Name eines Regel-Satzes aus `ruleSets`. */
  rules: RuleDefinition[] | string;
  stand?: number;
  expected: {
    outcome: string;
    stage: string;
    matchedRules: { id: string; version: number; hash?: string }[];
    limits: Pruefung[];
    preconditions: Pruefung[];
    caps?: Pruefung[];
    ruleStand?: number;
  };
}

interface GrenzenFall {
  name: string;
  action: { type: string };
  facts: unknown;
  expected: Pruefung[];
}

const KORPUS = korpus as unknown as {
  format: number;
  ruleSets: Record<string, RuleDefinition[]>;
  cases: Fall[];
  limitCases: GrenzenFall[];
};

/** Regeln eines Falls (ein Regel-Satz wird über seinen Namen aufgelöst). */
function regeln(fall: Fall): RuleDefinition[] {
  if (typeof fall.rules !== "string") return fall.rules;
  const satz = KORPUS.ruleSets[fall.rules];
  if (satz === undefined) throw new Error(`Regel-Satz ${fall.rules} fehlt.`);
  return satz;
}

/** Aktionen der Fassung 2 (ohne `werkzeug.freigeben` und `werkzeug.ausfuehren`). */
const AKTIONEN_2 = [
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
];

/** Grenzen der Fassung 2 in ihrer Reihenfolge (G-01 bis G-05, G-16 bis G-18). */
const GRENZEN_2 = [
  "schleuse_gefordert",
  "anbieter_region",
  "laenge",
  "tagesbudget",
  "not_aus",
  "lauf_schritte",
  "lauf_aufrufe",
  "lauf_token",
];

/** Vorbedingungen der Fassung 2 (V-01 bis V-14). */
const VORBEDINGUNGEN_2 = [
  "unterhaltung_vorhanden",
  "kein_lauf_aktiv",
  "lauf_aktiv",
  "schleuse_eingerichtet",
  "lauf_laeuft",
  "passwort_bestaetigt",
  "einrichtung_offen",
  "freigabe_wartet",
  "freigabe_passt",
  "notaus_aufheben_bestaetigt",
  "antwort_ist_letzte",
  "werkzeug_angeboten",
  "eingabe_gueltig",
  "aufrufe_je_schritt",
];

/**
 * V-08 und V-09 gelten nur für `werkzeug.freigeben`; die Aktion kennt Fassung 2 nicht, eine
 * Anfrage dafür ist ungültig. Beide Vorbedingungen lassen sich deshalb in Fassung 2 nie verletzen.
 */
const NICHT_ERREICHBAR = ["freigabe_wartet", "freigabe_passt"];

const OPERATOREN = ["eq", "ne", "lt", "lte", "gt", "gte", "in"];

function typ(fall: { action: unknown }): string | undefined {
  const type = (fall.action as { type?: unknown } | null)?.type;
  return typeof type === "string" ? type : undefined;
}

function verletzt(liste: readonly Pruefung[]): string[] {
  return liste.filter((check) => check.result === "verletzt").map((check) => check.name);
}

describe("Korpus der Fassung 2: Inhalt", () => {
  it("Fassung 2, eindeutige Namen, kein Grund in den Erwartungen, Regel-Sätze vorhanden", () => {
    expect(KORPUS.format).toBe(2);
    expect(Object.keys(KORPUS.ruleSets).sort()).toEqual(["datenbank", "standard"]);
    expect(KORPUS.ruleSets.standard?.map((rule) => rule.id)).toEqual([
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
    ]);
    expect(KORPUS.ruleSets.datenbank?.map((rule) => rule.id)).toEqual([
      "R-001",
      "R-002",
      "R-003",
      "R-004",
      "R-005",
      "R-006",
      "R-999",
    ]);
    for (const fall of KORPUS.cases) expect(regeln(fall), fall.name).toBeInstanceOf(Array);
    const names = [...KORPUS.cases, ...KORPUS.limitCases].map((fall) => fall.name);
    expect(new Set(names).size).toBe(names.length);
    for (const fall of KORPUS.cases) {
      expect(Object.hasOwn(fall.expected, "reason"), fall.name).toBe(false);
    }
  });

  it("jede Aktion der Fassung 2 erlaubt, die zwei Freigabe-Aktionen ungültig", () => {
    for (const type of AKTIONEN_2) {
      const fall = KORPUS.cases.find((f) => f.name === `aktion ${type}`);
      expect(fall?.expected.outcome, type).toBe("allow");
      expect(typ(fall ?? { action: null }), type).toBe(type);
    }
    for (const type of ["werkzeug.freigeben", "werkzeug.ausfuehren"]) {
      const fall = KORPUS.cases.find((f) => f.name === `aktion ${type} unbekannt`);
      expect(fall?.expected.outcome, type).toBe("deny");
      expect(fall?.expected.preconditions, type).toEqual([]);
      expect(
        fall?.expected.limits.every((l) => l.result === "entfaellt"),
        type,
      ).toBe(true);
    }
  });

  it("deckt jedes Ergebnis, jede Grenze, jede erreichbare Vorbedingung und jeden Operator ab", () => {
    const outcomes = new Set(KORPUS.cases.map((fall) => fall.expected.outcome));
    expect([...outcomes].sort()).toEqual(["allow", "ask", "deny", "prepare"]);
    for (const fall of KORPUS.cases) {
      expect(
        fall.expected.limits.map((l) => l.name),
        fall.name,
      ).toEqual(GRENZEN_2);
    }
    const grenzen = new Set(KORPUS.cases.flatMap((fall) => verletzt(fall.expected.limits)));
    expect([...grenzen].sort()).toEqual([...GRENZEN_2].sort());
    const vorbedingungen = new Set(
      KORPUS.cases.flatMap((fall) => verletzt(fall.expected.preconditions)),
    );
    expect([...vorbedingungen].sort()).toEqual(
      VORBEDINGUNGEN_2.filter((name) => !NICHT_ERREICHBAR.includes(name)).sort(),
    );
    const ops = new Set(
      KORPUS.cases.flatMap((fall) =>
        regeln(fall).flatMap((rule) => rule.conditions.map((condition) => condition.op)),
      ),
    );
    expect([...ops].sort()).toEqual([...OPERATOREN].sort());
  });

  it("G-16 bis G-18 mit fehlendem oder nicht ganzzahligem Fakt: verletzt, nie entfällt", () => {
    for (const fall of KORPUS.limitCases) {
      expect(
        fall.expected.map((l) => l.name),
        fall.name,
      ).toEqual(GRENZEN_2);
    }
    const fehlend = KORPUS.limitCases.filter((fall) =>
      /^G-1[678] (ohne|.*gleitkomma|.*als )/.test(fall.name),
    );
    expect(fehlend.length).toBeGreaterThanOrEqual(12);
    for (const fall of fehlend) {
      const id = fall.name.slice(0, 4);
      const name = { "G-16": "lauf_schritte", "G-17": "lauf_aufrufe", "G-18": "lauf_token" }[id];
      expect(fall.expected.find((l) => l.name === name)?.result, fall.name).toBe("verletzt");
    }
  });

  it("Deckel: genau bei werkzeug.aufrufen, alle 2×2×2 Fälle mit Regel erlauben, ablehnen, fragen und ohne Regel", () => {
    for (const fall of KORPUS.cases) {
      expect(Object.hasOwn(fall.expected, "caps"), fall.name).toBe(
        typ(fall) === "werkzeug.aufrufen",
      );
    }
    const ergebnisse = new Set(
      KORPUS.cases.flatMap((fall) => (fall.expected.caps ?? []).map((cap) => cap.result)),
    );
    expect([...ergebnisse].sort()).toEqual(["entfaellt", "gedeckelt", "nicht_noetig"]);
    for (const herkunft of ["eigen", "fremd"]) {
      for (const art of ["lesen", "schreiben"]) {
        for (const reichweite of ["intern", "nach_aussen"]) {
          for (const regel of ["allow-regel", "deny-regel", "ask-regel", "ohne regel"]) {
            const name = `D-01 ${herkunft} ${art} ${reichweite} ${regel}`;
            const fall = KORPUS.cases.find((f) => f.name === name);
            expect(fall, name).toBeDefined();
            const greift =
              herkunft === "fremd" && (art === "schreiben" || reichweite === "nach_aussen");
            const erwartet = !greift
              ? "entfaellt"
              : regel === "allow-regel"
                ? "gedeckelt"
                : "nicht_noetig";
            expect(fall?.expected.caps, name).toEqual([
              { name: "fremd_dann_fragen", result: erwartet },
            ]);
          }
        }
      }
    }
  });
});

// Bis Fassung 2 im Code steht, kann nichts verglichen werden; der Vergleich ist dann übersprungen.
const SPEC = gateFormatSpec(2);

function rechne(fall: Fall): Record<string, unknown> {
  if (SPEC === undefined) throw new Error("Fassung 2 fehlt.");
  const action = fall.action as never;
  const facts = fall.facts as never;
  const decision =
    fall.stand === undefined
      ? SPEC.evaluate(action, facts, regeln(fall))
      : SPEC.evaluate(action, facts, { stand: fall.stand, rules: regeln(fall) as never });
  const { reason: _reason, ...rest } = decision as unknown as Record<string, unknown>;
  return rest;
}

describe.skipIf(SPEC === undefined)("Korpus der Fassung 2: Auswertung", () => {
  for (const fall of KORPUS.cases) {
    it(fall.name, () => {
      expect(rechne(fall)).toStrictEqual(fall.expected);
    });
  }
  for (const fall of KORPUS.limitCases) {
    it(`grenzen: ${fall.name}`, () => {
      expect(SPEC?.checkLimits(fall.action, fall.facts)).toStrictEqual(fall.expected);
    });
  }
});
