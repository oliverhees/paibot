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

import { BOUNDED_JSON_LIMITS, boundedJsonSchema } from "@paibot/shared/belege";
import type { JsonValue } from "@paibot/shared/motor";
import { errorText, t } from "@paibot/shared/texte";
import type { Decision } from "@paibot/shared/tor";
import { toolEnvelopeSchema } from "@paibot/shared/werkzeug";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { cleanJson, setOwn } from "./bereinigen";
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

describe("Eigene Schlüssel constructor und prototype", () => {
  /** Alle Objekte im Wert, auch verschachtelt. */
  function objekte(wert: unknown, out: object[] = []): object[] {
    if (Array.isArray(wert)) for (const w of wert) objekte(w, out);
    else if (wert !== null && typeof wert === "object") {
      out.push(wert);
      for (const w of Object.values(wert)) objekte(w, out);
    }
    return out;
  }

  // Gegenprobe: in `cleanJson` oder `fitBounds` Prototypen ändern (z. B. `Object.setPrototypeOf(out, value[key])`) → rot.
  it("laufen durch Bereinigen, Kürzen und Hülle: jedes erzeugte Objekt behält Object.prototype, Object.prototype bleibt unverändert", () => {
    const vorher = Object.getOwnPropertyNames(Object.prototype).sort();
    const roh = JSON.parse(
      `{"constructor":{"prototype":{"x":"${"a".repeat(100)}"}},"prototype":{"constructor":"c"},"liste":[{"constructor":1,"prototype":2},"y"]}`,
    ) as JsonValue;
    const sauber = cleanJson(roh);
    const gekuerzt = truncateContent(sauber, 120);
    expect(gekuerzt?.gekuerzt).toBe(true);
    const huelle = dataEnvelope(
      "eingebaut/test_lesen" as never,
      gekuerzt?.inhalt as JsonValue,
      true,
    );
    for (const wert of [sauber, gekuerzt?.inhalt, huelle]) {
      const alle = objekte(wert);
      expect(alle.length).toBeGreaterThan(3);
      for (const o of alle) {
        const proto = Object.getPrototypeOf(o);
        expect(proto === Object.prototype || proto === Array.prototype || proto === null).toBe(
          true,
        );
      }
    }
    // Die Schlüssel sind eigene Eigenschaften und bleiben es.
    expect(Object.hasOwn(sauber as object, "constructor")).toBe(true);
    expect(Object.hasOwn(sauber as object, "prototype")).toBe(true);
    expect(Object.getPrototypeOf(sauber)).toBe(Object.prototype);
    expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(vorher);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
    expect(({} as Record<string, unknown>).prototype).toBeUndefined();
    expect(Object.hasOwn(Object.prototype, "x")).toBe(false);
  });
});

/**
 * Bezugs-Fassung des Kürzens vor der Umstellung auf lineare Laufzeit: Runde für Runde, in
 * jeder Runde wird der ganze Wert neu gelesen. Nur für den Vergleich in den Tests; für kleine Werte
 * muss das neue Kürzen genau dasselbe liefern.
 */
function bezugKuerzen(
  value: JsonValue,
  maxChars: number,
): { inhalt: JsonValue; gekuerzt: boolean; chars: number } | undefined {
  type Path = (string | number)[];
  const passend = (v: JsonValue): JsonValue => {
    if (typeof v === "string") {
      const chars = Array.from(v);
      return chars.length <= BOUNDED_JSON_LIMITS.text
        ? v
        : chars.slice(0, BOUNDED_JSON_LIMITS.text).join("");
    }
    if (Array.isArray(v)) return v.slice(0, BOUNDED_JSON_LIMITS.items).map(passend);
    if (v !== null && typeof v === "object") {
      const out: { [key: string]: JsonValue } = {};
      for (const [key, child] of Object.entries(v)) setOwn(out, key, passend(child));
      return out;
    }
    return v;
  };
  const kuerzeString = (v: JsonValue, excess: number) => {
    let best: { path: Path; length: number } | undefined;
    const visit = (node: JsonValue, path: Path) => {
      if (typeof node === "string") {
        if (node.length > 0 && (best === undefined || node.length >= best.length)) {
          best = { path, length: node.length };
        }
      } else if (Array.isArray(node)) {
        for (const [i, child] of node.entries()) visit(child, [...path, i]);
      } else if (node !== null && typeof node === "object") {
        for (const [key, child] of Object.entries(node)) visit(child, [...path, key]);
      }
    };
    visit(v, []);
    if (best === undefined) return { value: v, done: false };
    const target = best as { path: Path; length: number };
    const replace = (node: JsonValue, depth: number): JsonValue => {
      if (depth === target.path.length) {
        const text = node as string;
        return Array.from(text)
          .slice(0, Math.max(0, Array.from(text).length - excess))
          .join("");
      }
      const step = target.path[depth] as string | number;
      if (Array.isArray(node))
        return node.map((child, i) => (i === step ? replace(child, depth + 1) : child));
      const copy: { [key: string]: JsonValue } = {};
      for (const [key, child] of Object.entries(node as { [key: string]: JsonValue })) {
        setOwn(copy, key, key === step ? replace(child, depth + 1) : child);
      }
      return copy;
    };
    return { value: replace(v, 0), done: true };
  };
  const dropLast = (v: JsonValue): { value: JsonValue; done: boolean } => {
    if (Array.isArray(v)) {
      for (let i = v.length - 1; i >= 0; i--) {
        const inner = dropLast(v[i] as JsonValue);
        if (inner.done)
          return { value: v.map((child, j) => (j === i ? inner.value : child)), done: true };
      }
      return v.length === 0 ? { value: v, done: false } : { value: v.slice(0, -1), done: true };
    }
    if (v !== null && typeof v === "object") {
      const entries = Object.entries(v);
      for (let i = entries.length - 1; i >= 0; i--) {
        const [key, child] = entries[i] as [string, JsonValue];
        const inner = dropLast(child);
        if (inner.done) {
          const copy: { [key: string]: JsonValue } = {};
          for (const [k, c] of entries) setOwn(copy, k, k === key ? inner.value : c);
          return { value: copy, done: true };
        }
      }
    }
    return { value: v, done: false };
  };
  const chars = JSON.stringify(value).length;
  let current = passend(value);
  let length = JSON.stringify(current).length;
  for (let round = 0; length > maxChars && round < 10_000; round++) {
    const excess = length - maxChars;
    let next = kuerzeString(current, excess);
    if (!next.done || JSON.stringify(next.value).length >= length) next = dropLast(current);
    if (!next.done) return undefined;
    current = next.value;
    length = JSON.stringify(current).length;
  }
  if (length > maxChars) return undefined;
  if (!boundedJsonSchema.safeParse(current).success) return undefined;
  return { inhalt: current, gekuerzt: length < chars, chars };
}

/** Kleiner, fester Zufallsgenerator, damit die Vergleichsläufe wiederholbar sind. */
function zufall(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function zufallsWert(next: () => number, tiefe: number): JsonValue {
  const art = Math.floor(next() * (tiefe >= 3 ? 4 : 7));
  const texte = [
    "",
    "a",
    "abc",
    "x".repeat(20),
    'a"b\\c',
    "äö😀",
    "\u0001\u001f",
    "long".repeat(10),
  ];
  switch (art) {
    case 0:
      return Math.floor(next() * 1000);
    case 1:
      return next() < 0.5;
    case 2:
      return null;
    case 3:
      return texte[Math.floor(next() * texte.length)] as string;
    case 4:
    case 5:
      return Array.from({ length: Math.floor(next() * 6) }, () => zufallsWert(next, tiefe + 1));
    default: {
      const out: { [key: string]: JsonValue } = {};
      const n = Math.floor(next() * 5);
      for (let i = 0; i < n; i++) setOwn(out, `k${i}`, zufallsWert(next, tiefe + 1));
      return out;
    }
  }
}

// Gegenprobe: Das alte Kürzen rechnet in jeder Runde den ganzen Wert neu; für die breite
// Form unten brauchte es 107 s. Dieser Test wird rot, sobald das Kürzen wieder quadratisch wird.
describe("Kürzen bleibt linear", () => {
  /** 256 Objekte mit je 64 Schlüsseln, jeder mit einer Liste aus Ein-Zeichen-Texten. */
  function breit(listenLaenge: number, objekte = 256): JsonValue {
    return Array.from({ length: objekte }, () => {
      const o: { [key: string]: JsonValue } = {};
      for (let k = 0; k < 64; k++)
        setOwn(
          o,
          `k${k}`,
          Array.from({ length: listenLaenge }, () => "x"),
        );
      return o;
    });
  }

  it("breite Form mit vielen kurzen Texten: Ergebnis passt oder undefined, unter einer Sekunde", () => {
    const wert = breit(1, 256);
    const start = performance.now();
    const cut = truncateContent(wert, 20_000);
    const dauer = performance.now() - start;
    expect(dauer).toBeLessThan(1000);
    if (cut !== undefined) expect(contentChars(cut.inhalt)).toBeLessThanOrEqual(20_000);
  });

  it("lange Listen aus kurzen Einträgen: unter einer Sekunde, Ergebnis höchstens so lang wie erlaubt", () => {
    const wert: JsonValue = {
      l: Array.from({ length: 256 }, () => Array.from({ length: 64 }, () => "xy")),
    };
    const start = performance.now();
    const cut = truncateContent(wert, 3000);
    const dauer = performance.now() - start;
    expect(dauer).toBeLessThan(1000);
    expect(cut).toBeDefined();
    expect(contentChars((cut as { inhalt: JsonValue }).inhalt)).toBeLessThanOrEqual(3000);
  });

  it("liefert für zufällige kleine Werte genau das, was das runde-für-runde Kürzen lieferte", () => {
    const next = zufall(20261122);
    let gekuerzt = 0;
    let verworfen = 0;
    for (let i = 0; i < 400; i++) {
      const wert = zufallsWert(next, 0);
      const maxChars = Math.floor(next() * 120);
      const neu = truncateContent(wert, maxChars);
      const alt = bezugKuerzen(wert, maxChars);
      expect(neu, JSON.stringify({ wert, maxChars })).toEqual(alt);
      if (neu?.gekuerzt) gekuerzt += 1;
      if (neu === undefined) verworfen += 1;
    }
    // Der Vergleich muss alle Zweige wirklich durchlaufen haben.
    expect(gekuerzt).toBeGreaterThan(40);
    expect(verworfen).toBeGreaterThan(5);
  });
});

// Gegenprobe: In `fitBounds` wieder auf 4 000 Zeichen (Code-Punkte) statt 4 000 UTF-16-Einheiten
// kürzen → die Fälle mit Emoji werden rot. Die Hülle erlaubt höchstens 4 000 UTF-16-Einheiten je
// Zeichenkette (`String.length`), ein Emoji zählt dort doppelt.
describe("Kürzen auf UTF-16-Einheiten", () => {
  const MAX = BOUNDED_JSON_LIMITS.text;
  const ohneEinzelnesErsatzzeichen = (text: string) =>
    !/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(text);

  it("4 000 Emoji im großzügigen Limit: gekürzt auf höchstens 4 000 Einheiten, ohne zerrissenes Paar", () => {
    const cut = truncateContent({ t: "😀".repeat(4000) }, 20_000);
    expect(cut).toBeDefined();
    const t = (cut?.inhalt as { t: string } | undefined)?.t ?? "";
    expect(t.length).toBeLessThanOrEqual(MAX);
    expect(t.length).toBe(MAX);
    expect(ohneEinzelnesErsatzzeichen(t)).toBe(true);
    expect(cut?.gekuerzt).toBe(true);
    expect(boundedJsonSchema.safeParse(cut?.inhalt).success).toBe(true);
  });

  it("ein Paar genau an der Grenze wird nicht zerrissen: 3 999 Zeichen und ein Emoji", () => {
    const cut = truncateContent({ t: `${"a".repeat(3999)}😀` }, 20_000);
    expect(cut).toBeDefined();
    const t = (cut?.inhalt as { t: string } | undefined)?.t ?? "";
    expect(t).toBe("a".repeat(3999));
    expect(cut?.gekuerzt).toBe(true);
  });

  it("genau 2 000 Emoji (4 000 Einheiten) bleiben unverändert", () => {
    const wert = { t: "😀".repeat(2000) };
    const cut = truncateContent(wert, 20_000);
    expect(cut?.inhalt).toEqual(wert);
    expect(cut?.gekuerzt).toBe(false);
  });

  it("Text ohne Emoji verhält sich wie vorher: 5 000 Zeichen werden 4 000", () => {
    const cut = truncateContent({ t: "x".repeat(5000) }, 20_000);
    expect((cut?.inhalt as { t: string } | undefined)?.t).toHaveLength(MAX);
  });

  it("zu lange Texte mit Emoji sind nie ok mit zu langer Zeichenkette in der Hülle", () => {
    for (const laenge of [2001, 2500, 4000, 6000]) {
      const cut = truncateContent({ l: ["😀".repeat(laenge)] }, 100_000);
      expect(cut, `Länge ${laenge}`).toBeDefined();
      expect(boundedJsonSchema.safeParse(cut?.inhalt).success).toBe(true);
    }
  });
});
