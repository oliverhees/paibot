/**
 * PaiBot – Tests der Tor-Fassung 4: setzt genau den Vertrag um, ist eine Obermenge von
 * Fassung 3 (Korpus 3 und 2 unter Fassung 4 mit gleichem Ergebnis, nur mit den Füllwerten und den
 * neuen Einträgen), und ist in Kraft: Das Tor entscheidet mit ihr, ihre Aktionen sind gespeichert.
 *
 * Fassung 4 ist eingefroren (`unveraendert.test.ts`). Korpus 1 läuft unter Fassung 4 in
 * `obermenge.test.ts`, mit der von Fassung 3 geerbten Ausnahme (Quelle `mcp`).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { STORED_ACTION_TYPES, UNSTORED_ACTION_TYPES } from "@paibot/shared/aktionen";
import { ACTIVE_STANDARD_RULES, GATE_FORMAT, type RuleDefinition } from "@paibot/shared/tor";
import {
  BOT_PAUSED_FACTS,
  ERROR_CODES_4,
  LIMITS_BY_ID_4,
  PRECONDITIONS_4,
  TEAM_ACTION_SHAPES,
  TEAM_ACTION_TYPES,
} from "@paibot/shared/tor-fassung-4";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { GATE_FORMAT_2 } from "./fassung-2";
import korpus2 from "./fassung-2.korpus.json";
import { GATE_FORMAT_3 } from "./fassung-3";
import korpus3 from "./fassung-3.korpus.json";
import { GATE_FORMAT_4 } from "./fassung-4";
import korpus4 from "./fassung-4.korpus.json";
import { GATE_FORMATS, KNOWN_GATE_FORMAT } from "./index";

interface Pruefung {
  name: string;
  result: string;
  value?: unknown;
}

interface Fall {
  name: string;
  action: { type?: string } | null;
  facts: Record<string, unknown> | null;
  rules: RuleDefinition[] | string;
  stand?: number;
  expected: Record<string, unknown> & { limits: Pruefung[] };
}

interface GrenzenFall {
  name: string;
  action: { type: string };
  facts: unknown;
  expected: Pruefung[];
}

type Korpus = {
  ruleSets: Record<string, RuleDefinition[]>;
  cases: Fall[];
  limitCases: GrenzenFall[];
};
const K2 = korpus2 as unknown as Korpus;
const K3 = korpus3 as unknown as Korpus;
const K4 = korpus4 as unknown as Korpus;

function regeln(korpus: Korpus, fall: Fall): RuleDefinition[] {
  if (typeof fall.rules !== "string") return fall.rules;
  const satz = korpus.ruleSets[fall.rules];
  if (satz === undefined) throw new Error(`Regel-Satz ${fall.rules} fehlt.`);
  return satz;
}

/** JSON-Schema eines Zod-Schemas; nicht darstellbare Teile (Prüf-Funktionen) als „beliebig“. */
function json(schema: unknown): unknown {
  return z.toJSONSchema(schema as z.ZodType, { unrepresentable: "any" });
}

const BOT_BEREIT_AKTIONEN = ["modell.anfragen", "nachricht.senden", "werkzeug.aufrufen"];
const NEUE_GRENZEN_4 = Object.values(LIMITS_BY_ID_4) as string[];

/** Füllwert für den neuen Pflicht-Fakt `botPaused`: `false`. */
function fuellen(type: string | undefined, facts: Record<string, unknown> | null): unknown {
  if (facts === null || type === undefined || !BOT_BEREIT_AKTIONEN.includes(type)) return facts;
  return { ...facts, botPaused: false };
}

/** Die vier neuen Grenzen hinter den alten: G-15 nur bei gültiger Eingabe an den drei Aktionen. */
function neueEintraege(type: string | undefined, gueltig: boolean): Pruefung[] {
  const bereit =
    gueltig && type !== undefined && BOT_BEREIT_AKTIONEN.includes(type)
      ? { name: "bot_bereit", result: "ok", value: false }
      : { name: "bot_bereit", result: "entfaellt" };
  return [bereit, ...NEUE_GRENZEN_4.slice(1).map((name) => ({ name, result: "entfaellt" }))];
}

const ENTFALLEN_3 = ["app_zugriff", "werkzeug_bestaetigt", "app_ziel", "eine_app_je_schritt"].map(
  (name) => ({ name, result: "entfaellt" }),
);

function ohneGrund(decision: unknown): Record<string, unknown> {
  const { reason: _reason, ...rest } = decision as Record<string, unknown>;
  return rest;
}

function rechne4(korpus: Korpus, fall: Fall, facts: unknown): Record<string, unknown> {
  const action = fall.action as never;
  const liste = regeln(korpus, fall);
  const decision =
    fall.stand === undefined
      ? GATE_FORMAT_4.evaluate(action, facts as never, liste)
      : GATE_FORMAT_4.evaluate(action, facts as never, {
          stand: fall.stand,
          rules: liste as never,
        });
  return ohneGrund(decision);
}

function gueltig3(fall: { action: unknown; facts: unknown }): boolean {
  const type = (fall.action as { type?: string } | null)?.type;
  if (!GATE_FORMAT_3.request.safeParse(fall.action).success) return false;
  if (type === undefined) return false;
  const schema = GATE_FORMAT_3.facts[type];
  return schema?.safeParse(fall.facts).success === true;
}

describe("Fassung 4 setzt genau den Vertrag um", () => {
  it("Aktionen: die der Fassung 3 und die dreizehn des Besitzers, kein Bot darf eine auslösen", () => {
    expect([...GATE_FORMAT_4.actions]).toEqual([...GATE_FORMAT_3.actions, ...TEAM_ACTION_TYPES]);
    for (const type of TEAM_ACTION_TYPES) {
      expect(GATE_FORMAT_4.actor[type], type).toBe("besitzer");
      expect(TEAM_ACTION_SHAPES[type].actorKind, type).toBe("besitzer");
    }
    expect(TEAM_ACTION_TYPES).not.toContain("team.entwurf_vorschlagen");
    for (const nicht of ["team.entwurf_vorschlagen", "auftrag.uebergeben", "auftrag.melden"]) {
      expect([...GATE_FORMAT_4.actions]).not.toContain(nicht);
    }
  });

  it("Aktionen der Fassung 3: Ziel und Akteur unverändert; Fakten unverändert außer botPaused", () => {
    for (const type of GATE_FORMAT_3.actions) {
      expect(json(GATE_FORMAT_4.target[type]), type).toEqual(json(GATE_FORMAT_3.target[type]));
      expect(GATE_FORMAT_4.actor[type], type).toBe(GATE_FORMAT_3.actor[type]);
      if (BOT_BEREIT_AKTIONEN.includes(type)) continue;
      expect(json(GATE_FORMAT_4.facts[type]), type).toEqual(json(GATE_FORMAT_3.facts[type]));
    }
  });

  it("modell.anfragen und nachricht.senden: Fakten der Fassung 3 und dazu der Pflicht-Fakt botPaused", () => {
    const neu = Object.fromEntries(
      Object.entries(BOT_PAUSED_FACTS).map(([name, schema]) => {
        const { $schema: _s, ...rest } = json(schema) as Record<string, unknown>;
        return [name, rest];
      }),
    );
    for (const type of BOT_BEREIT_AKTIONEN) {
      const f3 = json(GATE_FORMAT_3.facts[type]) as {
        properties: Record<string, unknown>;
        required: string[];
      };
      const f4 = json(GATE_FORMAT_4.facts[type]) as typeof f3;
      expect(f4.properties, type).toEqual({ ...f3.properties, ...neu });
      expect(f4.required, type).toEqual([...f3.required, "botPaused"]);
    }
  });

  it("neue Aktionen: Ziel und Fakten wie im gemeinsamen Vertrag", () => {
    for (const type of TEAM_ACTION_TYPES) {
      const shape = TEAM_ACTION_SHAPES[type];
      expect(json(GATE_FORMAT_4.target[type]), type).toEqual(json(z.strictObject(shape.target)));
      expect(json(GATE_FORMAT_4.facts[type]), type).toEqual(json(z.strictObject(shape.facts)));
    }
  });

  it("Grenzen, Vorbedingungen, Deckel und Fehlercodes: Fassung 3 und das Neue dahinter", () => {
    expect([...GATE_FORMAT_4.limitOrder]).toEqual([...GATE_FORMAT_3.limitOrder, ...NEUE_GRENZEN_4]);
    expect(Object.keys(LIMITS_BY_ID_4)).toEqual(["G-15", "G-32", "G-33", "G-34"]);
    expect(GATE_FORMAT_4.preconditions).toEqual({
      ...GATE_FORMAT_3.preconditions,
      ...JSON.parse(JSON.stringify(PRECONDITIONS_4)),
    });
    expect(Object.keys(PRECONDITIONS_4)).toEqual([
      "V-25",
      "V-27",
      "V-28",
      "V-29",
      "V-30",
      "V-31",
      "V-37",
      "V-42",
      "V-43",
      "V-44",
    ]);
    expect(GATE_FORMAT_4.caps).toEqual(GATE_FORMAT_3.caps);
    expect(GATE_FORMAT_4.capOrder).toEqual(GATE_FORMAT_3.capOrder);
    expect([...GATE_FORMAT_4.errorCodes]).toEqual([...GATE_FORMAT_3.errorCodes, ...ERROR_CODES_4]);
  });

  it("jede neue Vorbedingung hängt nur an neuen Aktionen, jede alte bleibt, wie sie war", () => {
    for (const id of Object.keys(PRECONDITIONS_4)) {
      const { actions } = GATE_FORMAT_4.preconditions[id] as { actions: readonly string[] };
      for (const type of actions)
        expect(TEAM_ACTION_TYPES as readonly string[], id).toContain(type);
    }
    for (const [id, vorbedingung] of Object.entries(GATE_FORMAT_3.preconditions)) {
      expect(GATE_FORMAT_4.preconditions[id], id).toEqual(vorbedingung);
    }
  });

  it("Felder im Beleg: Fassung 4, neue Namen und Codes nur hier", () => {
    const decision = {
      gateFormat: 4,
      outcome: "deny",
      stage: "execute",
      rules: [{ id: "R-002", version: 1 }],
      limits: [{ name: "bot_bereit", result: "verletzt", value: true }],
      preconditions: [{ name: "team_vorhanden", result: "ok" }],
      reason: "Grund.",
    };
    const fuer = GATE_FORMAT_4.decisionFor?.("bot.loeschen");
    expect(fuer?.safeParse(decision).success).toBe(true);
    expect(fuer?.safeParse({ ...decision, gateFormat: 3 }).success).toBe(false);
    expect(GATE_FORMAT_3.decisionFor?.("bot.loeschen")?.safeParse(decision).success).toBe(false);
    for (const code of ERROR_CODES_4) {
      expect(GATE_FORMAT_4.result.safeParse({ status: "denied", code }).success, code).toBe(true);
      expect(GATE_FORMAT_3.result.safeParse({ status: "denied", code }).success, code).toBe(false);
    }
  });

  it("Fehlercode je Ablehnung: G-15, G-32, G-33, G-34, V-25 bis V-44 (die von Fassung 4) und der Not-Aus", () => {
    const code = (name: string) => {
      const fall = K4.cases.find((entry) => entry.name === name);
      if (fall === undefined) throw new Error(name);
      const decision = GATE_FORMAT_4.evaluate(
        fall.action as never,
        fall.facts as never,
        regeln(K4, fall),
      );
      return GATE_FORMAT_4.denialCode?.(decision);
    };
    expect(code("modell.anfragen: Bot pausiert, G-15 lehnt ab")).toBe("bot_pausiert");
    expect(code("nachricht.senden: Bot pausiert, G-15 lehnt ab")).toBe("bot_pausiert");
    expect(code("team.entwurf_anlegen: sieben Bots im Entwurf verletzen G-32")).toBe(
      "entwurf_zu_gross",
    );
    expect(code("bot.anlegen: eine mehr als die Höchstzahl verletzt G-33")).toBe("limit_erreicht");
    expect(code("team.entwurf_erstellen: fünf offene Entwürfe verletzen G-34")).toBe(
      "limit_erreicht",
    );
    expect(code("faden.anlegen: Zettel eine Zeichen zu lang verletzt G-03")).toBe("abgelehnt");
    expect(code("team.aendern verletzt team_vorhanden")).toBe("nicht_gefunden");
    expect(code("team.entwurf_verwerfen verletzt entwurf_offen")).toBe("nicht_gefunden");
    expect(code("team.entwurf_anlegen verletzt entwurf_fassung_passt")).toBe("entwurf_veraltet");
    expect(code("team.entwurf_anlegen verletzt entwurf_namen_frei")).toBe("entwurf_name_vergeben");
    expect(code("team.entwurf_anlegen verletzt entwurf_modelle_vorhanden")).toBe(
      "entwurf_modell_fehlt",
    );
    expect(code("team.entwurf_anlegen verletzt entwurf_ansprechpartner")).toBe(
      "entwurf_ansprechpartner_fehlt",
    );
    expect(code("team.aendern: Leitung aus einem anderen Team: V-44 lehnt ab")).toBe(
      "leitung_nicht_im_team",
    );
    expect(code("werkzeug.aufrufen: Doku-Werkzeug, Bot pausiert, G-15 lehnt ab")).toBe(
      "bot_pausiert",
    );
    expect(code("bot.loeschen verletzt standard_bot_bleibt")).toBe("standard_bot_bleibt");
    expect(code("bot.loeschen verletzt kein_lauf_des_bots")).toBe("lauf_aktiv");
    expect(code("team.entwurf_zuruecknehmen verletzt entwurf_unbenutzt")).toBe("entwurf_benutzt");
    expect(code("team.entwurf_anlegen: Not-Aus an")).toBe("angehalten");
    expect(code("team.entwurf_anlegen verletzt alle Vorbedingungen")).toBe("nicht_gefunden");
  });

  it("G-34 nennt im Beleg die Ursache: offene Entwürfe vor heutigen, sonst die Zahl von heute", () => {
    const facts = (offen: number, heute: number) => ({
      offeneEntwuerfe: offen,
      maxOffeneEntwuerfe: 5,
      entwuerfeHeute: heute,
      maxEntwuerfeProTag: 20,
    });
    const wert = (offen: number, heute: number) =>
      GATE_FORMAT_4.checkLimits({ type: "team.entwurf_erstellen" }, facts(offen, heute)).find(
        (check) => (check.name as string) === "entwuerfe_je_tag",
      );
    expect(wert(5, 3)).toEqual({
      name: "entwuerfe_je_tag",
      result: "verletzt",
      value: "offeneEntwuerfe=5",
    });
    expect(wert(1, 20)).toEqual({
      name: "entwuerfe_je_tag",
      result: "verletzt",
      value: "entwuerfeHeute=20",
    });
    expect(wert(6, 21)).toMatchObject({ value: "offeneEntwuerfe=6" });
    expect(wert(1, 3)).toEqual({ name: "entwuerfe_je_tag", result: "ok", value: 3 });
  });

  it("die Begründung nennt die Nummer und den Namen der verletzten Grenze und Vorbedingung", () => {
    const grund = (name: string) => {
      const fall = K4.cases.find((entry) => entry.name === name);
      if (fall === undefined) throw new Error(name);
      return GATE_FORMAT_4.evaluate(fall.action as never, fall.facts as never, regeln(K4, fall))
        .reason;
    };
    expect(grund("modell.anfragen: Bot pausiert, G-15 lehnt ab")).toContain(
      "G-15 „Bot nicht pausiert“",
    );
    expect(grund("team.entwurf_anlegen: sieben Bots im Entwurf verletzen G-32")).toContain(
      "G-32 „Umfang des Entwurfs“",
    );
    expect(grund("bot.anlegen: eine mehr als die Höchstzahl verletzt G-33")).toContain(
      "G-33 „Bots insgesamt“",
    );
    expect(grund("team.entwurf_erstellen: fünf offene Entwürfe verletzen G-34")).toContain(
      "G-34 „Offene Entwürfe und Entwürfe je Tag“",
    );
    expect(grund("team.entwurf_anlegen verletzt entwurf_fassung_passt")).toContain(
      "V-28 „Entwurf unverändert seit der Vorschau“",
    );
    expect(grund("team.aendern: Leitung aus einem anderen Team: V-44 lehnt ab")).toContain(
      "V-44 „Leitung gehört zum Team“",
    );
    expect(grund("bot.loeschen verletzt standard_bot_bleibt")).toContain(
      "V-37 „Standard-Bot bleibt“",
    );
    expect(grund("bot.loeschen verletzt kein_lauf_des_bots")).toContain(
      "V-42 „Kein Lauf des Bots aktiv“",
    );
  });
});

describe("Obermenge: Korpus der Fassung 3 unter Fassung 4", () => {
  it("Zahl der Fälle; die Liste der Ausnahmen ist leer", () => {
    expect(K3.cases).toHaveLength(178);
    expect(K3.limitCases).toHaveLength(20);
  });

  for (const fall of K3.cases) {
    it(fall.name, () => {
      const type = fall.action?.type;
      const facts = fuellen(type, fall.facts);
      const ok = gueltig3({ action: fall.action, facts: fall.facts });
      expect(rechne4(K3, fall, facts)).toStrictEqual({
        ...fall.expected,
        limits: [...fall.expected.limits, ...neueEintraege(type, ok)],
      });
    });
  }

  for (const fall of K3.limitCases) {
    it(`grenzen: ${fall.name}`, () => {
      const facts = fuellen(fall.action.type, fall.facts as Record<string, unknown>);
      const erwartet = BOT_BEREIT_AKTIONEN.includes(fall.action.type)
        ? neueEintraege(fall.action.type, true)
        : neueEintraege(fall.action.type, false);
      expect(GATE_FORMAT_4.checkLimits(fall.action, facts)).toStrictEqual([
        ...fall.expected,
        ...erwartet,
      ]);
    });
  }

  it("Gegenprobe: Grenze G-07 und die Vorbedingungen der Fassung 3 stehen in Fassung 4", () => {
    const abdruck = K3.cases.find((fall) => fall.name === "G-07 abdruck weicht ab");
    expect(abdruck).toBeDefined();
    const decision = rechne4(
      K3,
      abdruck as Fall,
      fuellen("werkzeug.aufrufen", abdruck?.facts ?? null),
    );
    expect(decision.outcome).toBe("deny");
    expect(
      (decision.limits as Pruefung[]).find((check) => check.name === "werkzeug_bestaetigt")?.result,
    ).toBe("verletzt");
  });
});

/**
 * Fälle der Fassung 2 mit Quelle `mcp`, die Fassung 3 und damit Fassung 4 ausdrücklich nicht mehr
 * annehmen (siehe Fassung 3). Sonst ändert sich kein Fall.
 */
const AUSNAHMEN_2 = ["R-010 quelle mcp", "gueltig werkzeug kennung mcp zwei ebenen"];

describe("Obermenge: Korpus der Fassung 2 unter Fassung 4", () => {
  const faelle = K2.cases.filter((fall) => !AUSNAHMEN_2.includes(fall.name));

  it("Zahl der Fälle und die von Fassung 3 geerbten Ausnahmen", () => {
    expect(K2.cases).toHaveLength(279);
    expect(faelle).toHaveLength(277);
  });

  for (const fall of faelle) {
    it(fall.name, () => {
      const type = fall.action?.type;
      const facts = fuellen(type, fall.facts);
      const ok =
        GATE_FORMAT_2.request.safeParse(fall.action).success &&
        type !== undefined &&
        GATE_FORMAT_2.facts[type]?.safeParse(fall.facts).success === true;
      expect(rechne4(K2, fall, facts)).toStrictEqual({
        ...fall.expected,
        limits: [...fall.expected.limits, ...ENTFALLEN_3, ...neueEintraege(type, ok)],
      });
    });
  }

  for (const fall of K2.limitCases) {
    it(`grenzen: ${fall.name}`, () => {
      const facts = fuellen(fall.action.type, fall.facts as Record<string, unknown>);
      const erwartet = neueEintraege(
        fall.action.type,
        BOT_BEREIT_AKTIONEN.includes(fall.action.type),
      );
      expect(GATE_FORMAT_4.checkLimits(fall.action, facts)).toStrictEqual([
        ...fall.expected,
        ...ENTFALLEN_3,
        ...erwartet,
      ]);
    });
  }
});

describe("Fassung 4 ist in Kraft", () => {
  it("das Tor entscheidet mit Fassung 4, der höchsten bekannten; sie steht in der Liste", () => {
    expect(GATE_FORMAT).toBe(4);
    expect(KNOWN_GATE_FORMAT).toBe(4);
    expect(Object.keys(GATE_FORMATS)).toEqual(["1", "2", "3", "4"]);
    expect(GATE_FORMATS[4]).toBe(GATE_FORMAT_4);
  });

  it("die neuen Aktionen sind gespeichert (Regeln und Belege kennen sie), nicht mehr unter den ungespeicherten", () => {
    for (const type of TEAM_ACTION_TYPES) {
      expect(UNSTORED_ACTION_TYPES as readonly string[], type).not.toContain(type);
      expect(STORED_ACTION_TYPES as readonly string[], type).toContain(type);
    }
  });

  it("die Standard-Regeln sind die der Fassung 3: keine neue, auch keine für Bots", () => {
    const ids = ACTIVE_STANDARD_RULES.map((rule) => rule.id).sort();
    const erwartet = (K4.ruleSets.standard ?? [])
      .map((rule) => rule.id)
      .filter((id) => id !== "R-007" && id !== "R-008")
      .sort();
    expect(ids).toEqual(erwartet);
  });
});
