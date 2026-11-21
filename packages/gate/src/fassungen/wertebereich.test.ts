/**
 * PaiBot – die heutigen Verträge und die aktuelle Fassung des Tors haben denselben Wertebereich:
 * Fakten, Ziele und Anfragen je Aktion, Felder von Entscheidung und Ergebnis im Beleg,
 * Fehlercodes, Grenzen, Vorbedingungen, Deckel und Aktionen. Sonst würde das Tor gültige Eingaben
 * ablehnen oder Belege schreiben, die der eigene Prüfer verwirft.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { ACTIONS, actionRequestSchema, STORED_ACTION_TYPES } from "@paibot/shared/aktionen";
import { receiptDecisionSchema, receiptResultSchema } from "@paibot/shared/belege";
import { ERROR_CODES } from "@paibot/shared/fehler";
import { CAPS, LIMIT_NAMES, PRECONDITIONS } from "@paibot/shared/tor";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { currentGateFormat } from "./index";

const SPEC = currentGateFormat();

/** JSON-Schema eines Zod-Schemas; nicht darstellbare Teile (Prüf-Funktionen) als „beliebig“. */
function json(schema: unknown): unknown {
  return z.toJSONSchema(schema as z.ZodType, { unrepresentable: "any" });
}

/** Die Varianten einer Anfrage (ein Eintrag je Aktion), nach Aktion. */
function variants(schema: unknown): Record<string, unknown> {
  const root = json(schema) as { anyOf?: unknown[]; oneOf?: unknown[] };
  const list = root.anyOf ?? root.oneOf ?? [];
  const byType: Record<string, unknown> = {};
  for (const variant of list) {
    const type = (variant as { properties?: { type?: { const?: string } } }).properties?.type
      ?.const;
    if (typeof type === "string") byType[type] = variant;
  }
  return byType;
}

describe("Wertebereich: heutige Verträge = aktuelle Fassung", () => {
  it("Aktionen: genau die gespeicherten", () => {
    expect([...SPEC.actions]).toEqual([...STORED_ACTION_TYPES]);
  });

  it.each(STORED_ACTION_TYPES)("%s: Fakten, Ziel und Akteur gleich", (type) => {
    expect(json(SPEC.facts[type])).toEqual(json(ACTIONS[type].facts));
    expect(json(SPEC.target[type])).toEqual(json(ACTIONS[type].target));
    expect(SPEC.actor[type]).toBe(ACTIONS[type].actor);
  });

  it("Anfrage: je Aktion der Fassung dieselbe Variante", () => {
    const lebend = variants(actionRequestSchema);
    const fassung = variants(SPEC.request);
    expect(Object.keys(fassung).sort()).toEqual([...STORED_ACTION_TYPES].sort());
    for (const type of STORED_ACTION_TYPES) {
      expect(fassung[type], type).toEqual(lebend[type]);
    }
  });

  it("Entscheidung und Ergebnis im Beleg: Schreib-Form gleich der Fassung", () => {
    expect(json(SPEC.decision)).toEqual(json(receiptDecisionSchema));
    expect(json(SPEC.result)).toEqual(json(receiptResultSchema));
  });

  it("Fehlercodes, Grenzen, Vorbedingungen und Deckel gleich", () => {
    expect([...SPEC.errorCodes]).toEqual([...ERROR_CODES]);
    expect([...SPEC.limitOrder]).toEqual([...LIMIT_NAMES]);
    expect(Object.keys(SPEC.preconditions)).toEqual(Object.keys(PRECONDITIONS));
    for (const [id, lebend] of Object.entries(PRECONDITIONS)) {
      const fassung = SPEC.preconditions[id];
      expect(fassung, id).toEqual({
        name: lebend.name,
        actions: [...lebend.actions],
        ...("when" in lebend ? { when: lebend.when } : {}),
        require: lebend.require,
        errorCode: lebend.errorCode,
      });
    }
    expect(SPEC.caps).toEqual(
      Object.entries(CAPS).map(([id, cap]) => ({
        id,
        name: cap.name,
        actions: [...cap.actions],
        // biome-ignore lint/suspicious/noThenProperty: Feld des Vertrags (ein Text, keine Funktion)
        then: cap.then,
        when: cap.when,
        anyOf: cap.anyOf,
      })),
    );
    expect(SPEC.capOrder).toEqual(Object.values(CAPS).map((cap) => cap.name));
  });
});
