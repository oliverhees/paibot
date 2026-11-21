/**
 * PaiBot – Tests der Abdrücke für Werkzeuge: fester Text mit Vorsatz, jedes Feld zählt, feste
 * Beispielwerte.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import {
  TOOL_ARGS_DIGEST_PREFIX,
  TOOL_CALL_DIGEST_PREFIX,
  TOOL_DEFINITION_DIGEST_PREFIX,
  TOOL_RESULT_DIGEST_PREFIX,
} from "@paibot/shared/bindung";
import type { ToolEnvelope } from "@paibot/shared/werkzeug";
import { describe, expect, it } from "vitest";
import {
  type ToolCallDigestInput,
  type ToolDefinitionDigestInput,
  toolCallDigestText,
  toolDefinitionDigest,
  toolDefinitionDigestText,
  toolResultDigestText,
} from "./abdruck";

const AUFRUF: ToolCallDigestInput = {
  actionId: "akt_01m7zempyyny7jq52fpsx7ceeb" as ToolCallDigestInput["actionId"],
  args: { frage: "Grenzen", seiten: [1, 2] },
  chainRootRunId: "lau_01m7zempyqkqfhqyxdd34y0bhe" as ToolCallDigestInput["chainRootRunId"],
  conversationId: "unt_01m7zempyqasb34830zmcrxq8e" as ToolCallDigestInput["conversationId"],
  toolDigest: `sha256:${"d0".repeat(32)}`,
  toolKey: "eingebaut/doku.nachschlagen",
};

const BESCHREIBUNG: ToolDefinitionDigestInput = {
  description: "Schlägt in der Doku dieser PaiBot-Fassung nach.",
  foreignContent: false,
  inputSchema: { type: "object", properties: { frage: { type: "string", maxLength: 200 } } },
  key: "eingebaut/doku.nachschlagen",
  kind: "lesen",
  modelName: "doku_nachschlagen",
  reach: "intern",
  source: "eingebaut",
  version: 1,
};

const HUELLE: ToolEnvelope = {
  paibot: "werkzeug-ergebnis",
  werkzeug: "eingebaut/doku.nachschlagen",
  art: "daten",
  status: "ok",
  inhalt: { treffer: 2 },
};

describe("Abdruck eines Werkzeug-Aufrufs (Fassung 2)", () => {
  it("fester Text: Vorsatz v2 und kanonisches JSON, Schlüssel sortiert", () => {
    expect(TOOL_CALL_DIGEST_PREFIX).toBe("pb-werkzeug/v2\n");
    expect(TOOL_ARGS_DIGEST_PREFIX).toBe("pb-werkzeug/v1\n");
    expect(toolCallDigestText(AUFRUF)).toBe(
      'pb-werkzeug/v2\n{"actionId":"akt_01m7zempyyny7jq52fpsx7ceeb","args":{"frage":"Grenzen","seiten":[1,2]},"chainRootRunId":"lau_01m7zempyqkqfhqyxdd34y0bhe","conversationId":"unt_01m7zempyqasb34830zmcrxq8e","toolDigest":"sha256:d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0","toolKey":"eingebaut/doku.nachschlagen"}',
    );
  });

  it.each([
    ["actionId", "akt_01m7zempyyny7jq52fpsx7ceec"],
    ["args", { frage: "Grenze", seiten: [1, 2] }],
    ["chainRootRunId", "lau_01m7zempyqkqfhqyxdd34y0bhf"],
    ["conversationId", "unt_01m7zempyqasb34830zmcrxq8f"],
    ["toolDigest", `sha256:${"d1".repeat(32)}`],
    ["toolKey", "eingebaut/doku.suchen"],
  ] as const)("ändert sich mit %s", (name, value) => {
    expect(toolCallDigestText({ ...AUFRUF, [name]: value })).not.toBe(toolCallDigestText(AUFRUF));
  });

  it("Gleitkommazahlen in den Argumenten werfen", () => {
    expect(() => toolCallDigestText({ ...AUFRUF, args: { wert: 1.5 } })).toThrow(TypeError);
  });
});

describe("Abdruck einer Werkzeug-Beschreibung", () => {
  it("fester Beispielwert", async () => {
    expect(TOOL_DEFINITION_DIGEST_PREFIX).toBe("pb-werkzeugdef/v1\n");
    expect(toolDefinitionDigestText(BESCHREIBUNG)).toBe(
      'pb-werkzeugdef/v1\n{"description":"Schlägt in der Doku dieser PaiBot-Fassung nach.","foreignContent":false,"inputSchema":{"properties":{"frage":{"maxLength":200,"type":"string"}},"type":"object"},"key":"eingebaut/doku.nachschlagen","kind":"lesen","modelName":"doku_nachschlagen","reach":"intern","source":"eingebaut","version":1}',
    );
    expect(await toolDefinitionDigest(BESCHREIBUNG)).toBe(
      "sha256:9e1dfc7322f355b2e161681a2e306f5ef07190598a4666cf6959468973eedbd0",
    );
  });

  it.each([
    ["description", "Anders."],
    ["foreignContent", true],
    ["inputSchema", { type: "object" }],
    ["key", "eingebaut/doku.suchen"],
    ["kind", "schreiben"],
    ["modelName", "doku_suchen"],
    ["reach", "nach_aussen"],
    ["source", "mcp"],
    ["version", 2],
  ] as const)("ändert sich mit %s", async (name, value) => {
    expect(await toolDefinitionDigest({ ...BESCHREIBUNG, [name]: value })).not.toBe(
      await toolDefinitionDigest(BESCHREIBUNG),
    );
  });
});

describe("Abdruck eines Werkzeug-Ergebnisses", () => {
  it("Vorsatz und kanonisches JSON genau der Hülle", () => {
    expect(TOOL_RESULT_DIGEST_PREFIX).toBe("pb-werkzeugergebnis/v1\n");
    expect(toolResultDigestText(HUELLE)).toBe(
      'pb-werkzeugergebnis/v1\n{"art":"daten","inhalt":{"treffer":2},"paibot":"werkzeug-ergebnis","status":"ok","werkzeug":"eingebaut/doku.nachschlagen"}',
    );
    expect(toolResultDigestText({ ...HUELLE, gekuerzt: true })).not.toBe(
      toolResultDigestText(HUELLE),
    );
  });
});
