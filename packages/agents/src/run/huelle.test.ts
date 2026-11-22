/**
 * PaiBot – Tests der festen Hülle eines Werkzeug-Ergebnisses: Texte nur aus Text-Schlüsseln,
 * deterministisches Kürzen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import type { JsonValue } from "@paibot/shared/motor";
import { errorText, t } from "@paibot/shared/texte";
import type { Decision } from "@paibot/shared/tor";
import { toolEnvelopeSchema } from "@paibot/shared/werkzeug";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  codeEnvelope,
  contentChars,
  dataEnvelope,
  deniedText,
  ENVELOPE_TEXT_MAX,
  errorEnvelopeText,
  invalidInputText,
  resultStatus,
  truncateContent,
  unknownToolText,
} from "./huelle";

const decision = (change: Partial<Decision>): Decision => ({
  outcome: "deny",
  stage: "ask",
  matchedRules: [],
  limits: [],
  preconditions: [],
  ruleStand: 1,
  reason: "Grund des Tors mit GEHEIM",
  ...change,
});

describe("Hülle", () => {
  // Gegenprobe: Text aus decision.reason bzw. Meldung → rot.
  it("unbekannt: werkzeug_unbekannt mit den Namen der angebotenen Werkzeuge, ≤ 500 Zeichen", () => {
    expect(unknownToolText(["a", "b"])).toBe(t("werkzeug.huelle.unbekannt", { namen: "a, b" }));
    expect(unknownToolText([])).toBe(
      t("werkzeug.huelle.unbekannt", { namen: t("werkzeug.huelle.keine") }),
    );
    const many = Array.from({ length: 100 }, (_, i) => `werkzeug_${i}`);
    expect(unknownToolText(many).length).toBeLessThanOrEqual(ENVELOPE_TEXT_MAX);
    expect(unknownToolText(many)).toContain("…");
  });

  it("Eingabe ungültig: Feld nur aus Schlüsseln des Schemas, Art fester Text je Zod-Fehlerart, nie Werte", () => {
    const schema = z.strictObject({ a: z.number().max(3) });
    const tooBig = schema.safeParse({ a: 5000 }).error?.issues[0];
    expect(invalidInputText(tooBig, ["a"])).toBe(
      t("werkzeug.huelle.eingabe", { feld: "a", art: t("werkzeug.huelle.art.zu_gross") }),
    );
    const extra = schema.safeParse({ a: 1, geheim: "x" }).error?.issues[0];
    expect(invalidInputText(extra, ["a"])).toBe(
      t("werkzeug.huelle.eingabe", {
        feld: t("werkzeug.huelle.feld"),
        art: t("werkzeug.huelle.art.unbekannt"),
      }),
    );
    expect(invalidInputText(tooBig, [])).not.toContain("5000");
    expect(invalidInputText(undefined, [])).toBe(
      t("werkzeug.huelle.eingabe", {
        feld: t("werkzeug.huelle.feld"),
        art: t("werkzeug.huelle.art.ungueltig"),
      }),
    );
  });

  it("andere Ablehnung: Titel der ersten verletzten Vorbedingung, sonst Grenze, sonst Regel, sonst Fehlertext – nie der Grund des Tors", () => {
    expect(
      deniedText(
        decision({ preconditions: [{ name: "aufrufe_je_schritt", result: "verletzt" }] }),
        "limit_erreicht",
      ),
    ).toBe(t("werkzeug.huelle.abgelehnt", { titel: t("regel.V-14") }));
    expect(
      deniedText(
        decision({ limits: [{ name: "lauf_aufrufe", result: "verletzt", value: 16 }] }),
        "limit_erreicht",
      ),
    ).toBe(t("werkzeug.huelle.abgelehnt", { titel: t("regel.G-17") }));
    expect(
      deniedText(
        decision({
          matchedRules: [{ id: "R-005", version: 1, hash: `sha256:${"0".repeat(64)}` }] as never,
        }),
        "abgelehnt",
      ),
    ).toBe(t("werkzeug.huelle.abgelehnt", { titel: t("regel.R-005") }));
    const plain = deniedText(decision({}), "abgelehnt");
    expect(plain).toBe(
      t("werkzeug.huelle.abgelehnt", { titel: errorText("abgelehnt").replace(/\.$/, "") }),
    );
    expect(plain).not.toContain("GEHEIM");
  });

  it("Zeitgrenze und Fehler: feste Texte; Abbruch: unterbrochen bzw. ausgang_unbekannt", () => {
    expect(errorEnvelopeText("werkzeug_zeitgrenze")).toBe(t("werkzeug.huelle.zeitgrenze"));
    expect(errorEnvelopeText("werkzeug_fehler")).toBe(t("werkzeug.huelle.fehler"));
    expect(errorEnvelopeText("ausgang_unbekannt")).toBe(errorText("ausgang_unbekannt"));
  });

  it("jede Hülle besteht toolEnvelopeSchema; Rückweg ok → ok, fehler → error, abgelehnt → denied", () => {
    const ok = dataEnvelope("eingebaut/test_lesen", { a: 1 }, false);
    const fehler = codeEnvelope("eingebaut/test_lesen", "fehler", "werkzeug_fehler", "x");
    const abgelehnt = codeEnvelope(
      "eingebaut/test_lesen",
      "abgelehnt",
      "abgelehnt",
      "y".repeat(600),
    );
    for (const envelope of [ok, fehler, abgelehnt])
      expect(toolEnvelopeSchema.safeParse(envelope).success).toBe(true);
    expect([ok, fehler, abgelehnt].map(resultStatus)).toEqual(["ok", "error", "denied"]);
    expect((abgelehnt as { text: string }).text.length).toBeLessThanOrEqual(ENVELOPE_TEXT_MAX);
  });
});

describe("Kürzen", () => {
  // Gegenprobe: Kürzen aus → zu groß, rot.
  it("misst in JSON.stringify-Zeichen und kürzt bis zur Grenze; gekuerzt und Länge vorher", () => {
    const value = { text: "x".repeat(3000) };
    const cut = truncateContent(value, 1000);
    expect(cut?.gekuerzt).toBe(true);
    expect(cut?.chars).toBe(contentChars(value));
    expect(contentChars(cut?.inhalt as JsonValue)).toBeLessThanOrEqual(1000);
    expect(truncateContent({ a: 1 }, 1000)).toEqual({
      inhalt: { a: 1 },
      gekuerzt: false,
      chars: 7,
    });
  });

  it("deterministisch: erst Zeichenketten vom Ende, dann Listen vom Ende", () => {
    const value = { liste: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], text: "abcdefghij" };
    const a = truncateContent(value, 30);
    const b = truncateContent(value, 30);
    expect(a).toEqual(b);
    expect(contentChars(a?.inhalt as JsonValue)).toBeLessThanOrEqual(30);
    const strings = truncateContent({ s: "abcdefghij" }, 10);
    expect(strings?.inhalt).toEqual({ s: "ab" });
    const lists = truncateContent({ l: [1, 2, 3, 4, 5] }, 10);
    expect(lists?.inhalt).toEqual({ l: [1] });
  });

  it("feste Grenzen der Hülle: Zeichenketten höchstens 4 000, Listen höchstens 256 Einträge", () => {
    const cut = truncateContent(
      { t: "x".repeat(5000), l: Array.from({ length: 300 }, () => 1) },
      100_000,
    );
    expect((cut?.inhalt as { t: string } | undefined)?.t).toHaveLength(4000);
    expect((cut?.inhalt as { l: number[] } | undefined)?.l).toHaveLength(256);
    expect(cut?.gekuerzt).toBe(true);
  });

  it("passt es auch gekürzt nicht: undefined (Hülle fehler/werkzeug_fehler)", () => {
    expect(truncateContent({ a: 1, b: 2 }, 3)).toBeUndefined();
    let deep: JsonValue = 1;
    for (let i = 0; i < 12; i++) deep = [deep];
    expect(truncateContent(deep, 1000)).toBeUndefined();
  });
});

describe("Kürzen ohne Wirkung auf den Prototyp", () => {
  const lang = "a".repeat(100);

  // Gegenprobe: in `fitBounds` wieder `out[key] = …` schreiben → rot.
  it("fitBounds: __proto__ bleibt eigene Eigenschaft", () => {
    const wert = JSON.parse(`{"__proto__":{"x":"${lang}"},"y":"b"}`) as JsonValue;
    const ergebnis = truncateContent(wert, 10_000);
    const inhalt = ergebnis?.inhalt as Record<string, unknown>;
    expect(Object.hasOwn(inhalt, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(inhalt)).toBe(Object.prototype);
    expect(inhalt.x).toBeUndefined();
    expect(JSON.stringify(inhalt)).toContain('"__proto__":{"x":"');
  });

  // Gegenprobe: im Kürzen der längsten Zeichenkette wieder `copy[key] = …` schreiben → rot.
  it("Kürzen der längsten Zeichenkette: __proto__ bleibt eigene Eigenschaft, die Kürzung greift", () => {
    const wert = JSON.parse(`{"__proto__":{"x":"${lang}"},"y":"b"}`) as JsonValue;
    const ergebnis = truncateContent(wert, 60);
    const inhalt = ergebnis?.inhalt as Record<string, { x: string }>;
    expect(ergebnis?.gekuerzt).toBe(true);
    expect(Object.hasOwn(inhalt, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(inhalt)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(inhalt, "__proto__")?.value.x.length).toBeLessThan(100);
  });

  it("Kürzen der letzten Liste: ein Objekt mit __proto__ behält die eigene Eigenschaft", () => {
    const wert = JSON.parse('{"__proto__":{"a":1},"liste":[1,2,3,4,5,6,7,8,9,10]}') as JsonValue;
    const ergebnis = truncateContent(wert, 40);
    const inhalt = ergebnis?.inhalt as Record<string, unknown>;
    expect(ergebnis?.gekuerzt).toBe(true);
    expect(Object.hasOwn(inhalt, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(inhalt)).toBe(Object.prototype);
  });
});
