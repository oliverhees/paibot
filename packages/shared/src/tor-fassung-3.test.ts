/**
 * PaiBot – Tests für den Vertrag der Tor-Fassung 3: Nummern liegen genau auf den dafür
 * vorgesehenen Plätzen, nichts davon ist in den heutigen Listen in Kraft, Bindung und Ziel-Abdruck
 * einer App hängen an der vollen https-Adresse.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { describe, expect, it } from "vitest";
import { ACTION_TYPES, ACTIONS } from "./actions";
import {
  APP_TARGET_DIGEST_PREFIX,
  appTargetDigestInput,
  appTokenBinding,
  normalizedAppUrl,
  secretAad,
} from "./bindung";
import { ERROR_CODES, errorCodeSchema } from "./errors";
import {
  ACTIVE_STANDARD_RULES,
  CAPS,
  GATE_FORMAT,
  LIMITS_BY_ID,
  PRECONDITIONS,
  ruleDefinitionSchema,
  STANDARD_RULE_VERSIONS,
  UNSTORED_STANDARD_RULE_VERSIONS,
} from "./gate";
import { type AppId, ID_PREFIX, idSchema } from "./id";
import {
  APP_ACTION_SHAPES,
  APP_ACTION_TYPES,
  appOriginSchema,
  ERROR_CODES_3,
  FORMAT_3,
  LIMITS_BY_ID_3,
  MCP_TOOL_CALL_FACTS,
  PRECONDITIONS_3,
  R014_V1,
  STANDARD_RULE_VERSIONS_3,
} from "./tor-fassung-3";

const APP = "app_01m7zempyqasb34830zmcrxq8e" as AppId;

describe("Vertrag der Fassung 3: Nummern", () => {
  it("genau die vorgesehenen Nummern: G-06, G-07, G-08, G-40, V-19, V-38, R-014", () => {
    expect(FORMAT_3).toBe(3);
    expect(Object.keys(LIMITS_BY_ID_3)).toEqual(["G-06", "G-07", "G-08", "G-40"]);
    expect(Object.values(LIMITS_BY_ID_3)).toEqual([
      "app_zugriff",
      "werkzeug_bestaetigt",
      "app_ziel",
      "eine_app_je_schritt",
    ]);
    expect(Object.keys(PRECONDITIONS_3)).toEqual(["V-19", "V-38"]);
    expect(PRECONDITIONS_3["V-19"].name).toBe("app_adresse_erlaubt");
    expect(PRECONDITIONS_3["V-38"].name).toBe("abdruck_gesehen");
    expect(STANDARD_RULE_VERSIONS_3.map((rule) => rule.id)).toEqual(["R-014"]);
  });

  it("keine Nummer der Fassung 3 kollidiert mit einer heutigen", () => {
    const heute = [
      ...Object.keys(LIMITS_BY_ID),
      ...Object.keys(PRECONDITIONS),
      ...Object.keys(CAPS),
      ...STANDARD_RULE_VERSIONS.map((rule) => rule.id),
      ...UNSTORED_STANDARD_RULE_VERSIONS.map((rule) => rule.id),
    ];
    for (const id of [
      ...Object.keys(LIMITS_BY_ID_3),
      ...Object.keys(PRECONDITIONS_3),
      ...STANDARD_RULE_VERSIONS_3.map((rule) => rule.id),
    ]) {
      expect(heute, id).not.toContain(id);
    }
    for (const code of ERROR_CODES_3) expect(ERROR_CODES, code).not.toContain(code);
    for (const type of APP_ACTION_TYPES) expect(ACTION_TYPES, type).not.toContain(type);
  });
});

describe("Vertrag der Fassung 3: noch nicht in Kraft", () => {
  it("das Tor entscheidet weiter mit Fassung 2; die heutigen Listen kennen nichts von Fassung 3", () => {
    expect(GATE_FORMAT).toBe(2);
    expect(Object.keys(ACTIONS)).not.toContain("app.verbinden");
    expect(ACTIVE_STANDARD_RULES.map((rule) => rule.id)).not.toContain("R-014");
    expect(UNSTORED_STANDARD_RULE_VERSIONS.map((rule) => rule.id)).not.toContain("R-014");
    expect(errorCodeSchema.safeParse("werkzeug_zweite_app").success).toBe(false);
    const fakten = ACTIONS["werkzeug.aufrufen"].facts as unknown as {
      def?: { schema?: { shape?: object } };
      shape?: object;
    };
    const namen = Object.keys(fakten.shape ?? fakten.def?.schema?.shape ?? {});
    for (const name of Object.keys(MCP_TOOL_CALL_FACTS)) {
      if (name === "targetDigest") continue;
      expect(namen, name).not.toContain(name);
    }
  });
});

describe("Vertrag der Fassung 3: R-014", () => {
  it("ist eine gültige Standard-Regel vor R-005, nur für den Bot der Unterhaltung", () => {
    expect(ruleDefinitionSchema.safeParse(R014_V1).success).toBe(true);
    const r005 = ACTIVE_STANDARD_RULES.find((rule) => rule.id === "R-005");
    expect(R014_V1.priority).toBeLessThan(r005?.priority ?? 0);
    expect(R014_V1.conditions).toContainEqual({
      fact: "botOfConversation",
      op: "eq",
      value: true,
    });
    expect(R014_V1.conditions).toContainEqual({ fact: "trigger", op: "eq", value: "chat" });
    expect(R014_V1.conditions).toContainEqual({ fact: "toolSource", op: "eq", value: "mcp" });
    expect(R014_V1.conditions).toContainEqual({ fact: "appAccess", op: "eq", value: "lesen" });
    expect(R014_V1.conditions).toContainEqual({ fact: "toolKind", op: "eq", value: "lesen" });
    expect(R014_V1.conditions).toContainEqual({
      fact: "toolStatus",
      op: "eq",
      value: "bestaetigt",
    });
  });
});

describe("Vertrag der Fassung 3: Aktionen und Kennungen", () => {
  it("alle neuen Aktionen gehören dem Besitzer; es gibt keinen Zugriff „schreiben“", () => {
    for (const type of APP_ACTION_TYPES) expect(APP_ACTION_SHAPES[type].actorKind).toBe("besitzer");
    expect(APP_ACTION_SHAPES["app.zugriff_setzen"].facts.access.options).toEqual([
      "keiner",
      "lesen",
    ]);
  });

  it("neue Kennungen für Apps und ihre Werkzeuge", () => {
    expect(ID_PREFIX.app).toBe("app");
    expect(ID_PREFIX.tool).toBe("wzg");
    expect(idSchema("app").safeParse(APP).success).toBe(true);
    expect(idSchema("tool").safeParse(APP).success).toBe(false);
  });

  it("am Aufruf steht die Kennung des Werkzeugs der App (`wzg_…`), keine andere Art", () => {
    const werkzeug = "wzg_01m7zempyqasb34830zmcrxq8c";
    expect(MCP_TOOL_CALL_FACTS.appToolId.safeParse(werkzeug).success).toBe(true);
    expect(MCP_TOOL_CALL_FACTS.appToolId.safeParse(APP).success).toBe(false);
    expect(Object.keys(MCP_TOOL_CALL_FACTS).slice(0, 2)).toEqual(["appId", "appToolId"]);
  });

  it("Origin einer App nur mit https", () => {
    expect(appOriginSchema.safeParse("https://mcp.beispiel.invalid").success).toBe(true);
    for (const bad of [
      "http://mcp.beispiel.invalid",
      "https://mcp.beispiel.invalid/mcp",
      "https://name@mcp.beispiel.invalid",
      "https://mcp.beispiel.invalid?x=1",
    ]) {
      expect(appOriginSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe("Vertrag der Fassung 3: Bindung und Ziel-Abdruck einer App", () => {
  it("Token gebunden an App und volle Adresse; anderer Pfad, andere Bindung", () => {
    const binding = appTokenBinding(APP, "https://MCP.Beispiel.invalid:443/mcp/");
    expect(binding).toEqual({
      table: "apps",
      id: APP,
      purpose: "token",
      extra: "https://mcp.beispiel.invalid/mcp",
    });
    expect(secretAad(binding)).toBe(
      `pb-geheimnis/v2\napps\n${APP}\ntoken\nhttps://mcp.beispiel.invalid/mcp`,
    );
    expect(secretAad(appTokenBinding(APP, "https://mcp.beispiel.invalid/mcp/readonly"))).not.toBe(
      secretAad(binding),
    );
  });

  it("nur https, ohne Zugangsdaten, Anfrage-Teil und Anker", () => {
    for (const bad of [
      "http://mcp.beispiel.invalid/mcp",
      "https://name:geheim@mcp.beispiel.invalid/mcp",
      "https://mcp.beispiel.invalid/mcp?token=geheim",
      "https://mcp.beispiel.invalid/mcp#x",
      "mcp.beispiel.invalid",
    ]) {
      expect(() => normalizedAppUrl(bad), bad).toThrow(TypeError);
    }
  });

  it("Ziel-Abdruck über App-Kennung und volle Adresse", () => {
    expect(appTargetDigestInput(APP, "https://mcp.beispiel.invalid/mcp/")).toBe(
      `${APP_TARGET_DIGEST_PREFIX}{"appId":"${APP}","url":"https://mcp.beispiel.invalid/mcp"}`,
    );
  });
});
