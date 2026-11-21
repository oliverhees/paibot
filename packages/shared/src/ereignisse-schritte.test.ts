/**
 * PaiBot – Tests: Daten der Ereignisse für Läufe mit mehreren Schritten stehen fest, gehören aber
 * noch nicht zu den Arten, die die Datenbank annimmt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { describe, expect, it } from "vitest";
import { CONVERSATION_EVENT_TYPES, STEP_EVENT_DATA, toolRequestedDataV2 } from "./events";
import { newId } from "./id";

const runId = newId("run");

describe("Ereignisse für Schritte", () => {
  it("stehen fest, aber nicht in der Liste der gespeicherten Arten", () => {
    expect(Object.keys(STEP_EVENT_DATA).sort()).toEqual(
      ["draft.delta", "step.finished", "tool.started"].sort(),
    );
    for (const type of Object.keys(STEP_EVENT_DATA)) {
      expect(CONVERSATION_EVENT_TYPES as readonly string[]).not.toContain(type);
    }
  });

  it("haben strenge Daten", () => {
    const done = { runId, step: 0, ending: "antwort", modelReported: "m-1" };
    expect(STEP_EVENT_DATA["step.finished"].parse(done)).toEqual(done);
    expect(STEP_EVENT_DATA["step.finished"].safeParse({ ...done, ending: "anders" }).success).toBe(
      false,
    );
    expect(STEP_EVENT_DATA["draft.delta"].safeParse({ runId, step: 1, text: "" }).success).toBe(
      false,
    );
    expect(
      STEP_EVENT_DATA["tool.started"].safeParse({ runId, actionId: newId("action"), x: 1 }).success,
    ).toBe(false);
  });

  it("tool.requested in der Form für Schritte trägt Kennung und Schritt", () => {
    const data = {
      runId,
      actionId: newId("action"),
      messageId: newId("message"),
      name: "doku_nachschlagen",
      source: "eingebaut",
      kind: "lesen",
      key: "eingebaut/doku.nachschlagen",
      step: 0,
    };
    expect(toolRequestedDataV2.parse(data)).toEqual(data);
    const { key: _key, ...ohne } = data;
    expect(toolRequestedDataV2.safeParse(ohne).success).toBe(false);
  });
});
