/**
 * PaiBot – Tests: Eintrag des Werkzeugs „In der Doku nachschlagen“ (Kennung, Art, Wirkung, eigener
 * Inhalt, strenge Eingabe, Zeitgrenze), Grenzen der Eingabe und kein Zugriff auf Dateien oder Netz
 * aus der Eingabe. Dazu: Die Auslieferung bietet das Werkzeug in dieser Fassung noch nicht an.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import type { JsonValue } from "@paibot/shared/motor";
import { TOOL_NAME_PATTERN } from "@paibot/shared/objekte";
import type { ToolContext, ToolDefinition } from "@paibot/shared/werkzeug";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { EINGABE_RAENDER, PFAD_FRAGEN } from "../../run/testdaten/drehbuecher-doku";
import { RUN_TUNING } from "../../run/vertrag";
import { builtinTools } from "../eingebaut";
import { createShippedRegistry, MAX_TOOL_DESCRIPTION_CHARS, ToolRegistryError } from "../register";
import { dokuIndexAusText } from "./index-laden";
import type { GeladenerDokuIndex } from "./suche";
import { echterIndexText } from "./testdaten/echter-index";
import {
  DOKU_TOOL_KEY,
  dokuEingabeSchema,
  dokuErgebnisSchema,
  dokuNachschlagen,
  dokuQuellen,
} from "./werkzeug";

// Jeder Zugriff auf `node:fs` und `node:fs/promises` wird gezählt (Attrappe um das echte Modul).
const zugriffe = vi.hoisted(() => ({ n: 0 }));
function zaehlend<T extends object>(modul: T): T {
  const out: Record<string, unknown> = {};
  for (const [name, wert] of Object.entries(modul)) {
    out[name] =
      typeof wert === "function"
        ? (...args: unknown[]) => {
            zugriffe.n += 1;
            return (wert as (...a: unknown[]) => unknown)(...args);
          }
        : wert;
  }
  return out as T;
}
vi.mock("node:fs", async (original) => zaehlend(await original<object>()));
vi.mock("node:fs/promises", async (original) => zaehlend(await original<object>()));

// Die Gegenprobe im Kommentar ist die Änderung, die den Fall rot machen muss.

let index: GeladenerDokuIndex;
beforeAll(async () => {
  index = dokuIndexAusText(await echterIndexText());
});

const widen = (def: unknown) => def as unknown as ToolDefinition<JsonValue, JsonValue>;

/** Ein Aufruf ohne Lauf (nur für die Wirkung des Werkzeugs; im Lauf kommt `ctx` vom Tor). */
const ctx = { signal: new AbortController().signal } as unknown as ToolContext;

describe("Eintrag ins Register", () => {
  // Gegenprobe: `kind: "schreiben"` → Lauf durchs echte Tor endet mit `freigabe_noetig` (Lauf-Test);
  // `foreignContent: true` → `createShippedRegistry` wirft (hier).
  it("Kennung genau eingebaut/doku.nachschlagen, Name doku_nachschlagen, lesen, intern, eigener Inhalt, Quelle eingebaut, Zeitgrenze 2 000 ms höchstens Lauf-Zeit; das Register der Auslieferung nimmt es an", async () => {
    const def = dokuNachschlagen(index);
    expect(def).toMatchObject({
      key: "eingebaut/doku.nachschlagen",
      modelName: "doku_nachschlagen",
      version: 1,
      title: "werkzeug.titel.doku_nachschlagen",
      source: "eingebaut",
      kind: "lesen",
      reach: "intern",
      foreignContent: false,
      gateAction: "werkzeug.aufrufen",
      limits: { timeoutMs: 2000, maxOutputChars: 6000 },
    });
    expect(DOKU_TOOL_KEY).toBe("eingebaut/doku.nachschlagen");
    expect(TOOL_NAME_PATTERN.test(def.modelName)).toBe(true);
    expect(def.limits.timeoutMs).toBeLessThanOrEqual(RUN_TUNING.totalTimeoutMs);
    const registry = await createShippedRegistry([widen(def)]);
    expect(registry.byModelName("doku_nachschlagen")?.definition.key).toBe(DOKU_TOOL_KEY);
    await expect(createShippedRegistry([widen({ ...def, foreignContent: true })])).rejects.toThrow(
      ToolRegistryError,
    );
  });

  // Gegenprobe: `z.object` statt `z.strictObject` → Zusatzfeld gilt als gültig.
  it("die Eingabe ist ein strenges Objekt; das JSON Schema an das Modell nennt additionalProperties false und die Längen", async () => {
    const registry = await createShippedRegistry([widen(dokuNachschlagen(index))]);
    const schema = registry.byModelName("doku_nachschlagen")?.spec.inputSchema as {
      additionalProperties?: unknown;
      required?: unknown;
      properties: {
        frage: { minLength: number; maxLength: number };
        andere_begriffe: { maxItems: number; items: { minLength: number; maxLength: number } };
      };
    };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(["frage"]);
    expect(schema.properties.frage).toMatchObject({ minLength: 3, maxLength: 200 });
    expect(schema.properties.andere_begriffe).toMatchObject({
      maxItems: 2,
      items: { minLength: 1, maxLength: 80 },
    });
  });

  it("die Beschreibung an das Modell ist fester Text im Code und höchstens 1 000 Zeichen lang", () => {
    const def = dokuNachschlagen(index);
    expect(def.description.length).toBeGreaterThan(0);
    expect(def.description.length).toBeLessThanOrEqual(MAX_TOOL_DESCRIPTION_CHARS);
    expect(dokuNachschlagen(index).description).toBe(def.description);
  });
});

describe("Grenzen der Eingabe", () => {
  // Gegenprobe: `.max(200)` entfernen → 201 Zeichen gültig.
  it("Frage mit 2 oder 201 Zeichen, 3 andere Begriffe, Begriff mit 81 Zeichen, Zusatzfeld, Zahl statt Text: ungültig", () => {
    const { frage2, frage201, dreiBegriffe, begriff81, zusatzfeld, zahl } = EINGABE_RAENDER;
    for (const eingabe of [frage2, frage201, dreiBegriffe, begriff81, zusatzfeld, zahl]) {
      expect(dokuEingabeSchema.safeParse(eingabe).success, JSON.stringify(eingabe)).toBe(false);
    }
  });

  it("Frage mit 3 und 200 Zeichen, 2 andere Begriffe zu je 80 Zeichen: gültig", () => {
    expect(dokuEingabeSchema.safeParse(EINGABE_RAENDER.gueltigKurz).success).toBe(true);
    expect(dokuEingabeSchema.safeParse(EINGABE_RAENDER.gueltigGrenzen).success).toBe(true);
  });
});

describe("Ergebnis", () => {
  it("Treffer: Stand in Kurzform, Abschnitte mit Seite, Anker, Titel; Quellen aus genau diesen Abschnitten", async () => {
    const outcome = await dokuNachschlagen(index).run({ frage: "Tagesbudget einstellen" }, ctx);
    expect(outcome.status).toBe("ok");
    const ergebnis = dokuErgebnisSchema.parse(outcome.status === "ok" ? outcome.output : null);
    expect(ergebnis.stand).toBe(index.stand);
    expect(ergebnis.status).toBe("gefunden");
    if (ergebnis.status !== "gefunden") return;
    expect(ergebnis.abschnitte.some((a) => a.seite === "funktion-einstellungen.md")).toBe(true);
    expect(JSON.stringify(ergebnis).length).toBeLessThanOrEqual(6000);
    expect(dokuQuellen(ergebnis)).toEqual(
      ergebnis.abschnitte.map((a) => ({ seite: a.seite, anker: a.anker, titel: a.titel })),
    );
  });

  it("nichts gefunden: nur Status und Stand, keine Quellen", async () => {
    const outcome = await dokuNachschlagen(index).run({ frage: "Wie verbinde ich Telegram?" }, ctx);
    expect(outcome).toEqual({
      status: "ok",
      output: {
        status: "nichts_gefunden",
        stand: index.stand,
        quelle: "Doku von PaiBot",
        gefunden: 0,
      },
    });
    expect(
      dokuQuellen({
        status: "nichts_gefunden",
        stand: index.stand,
        quelle: "Doku von PaiBot",
        gefunden: 0,
      }),
    ).toEqual([]);
  });
});

describe("Keine Pfade, kein Netz", () => {
  // Gegenprobe: das Werkzeug liest bei einer Frage, die wie ein Pfad aussieht, die Datei → Zähler
  // der Attrappe von `fs` größer 0.
  it("../../.env, /etc/passwd, file:///etc/passwd und https://example.org als Frage: nur Suche im Index, kein Zugriff auf Dateien oder Netz", async () => {
    const netz = vi.spyOn(globalThis, "fetch");
    const def = dokuNachschlagen(index);
    const ids = new Set(index.abschnitte.map((a) => a.id));
    const vorher = zugriffe.n;
    for (const frage of PFAD_FRAGEN) {
      const outcome = await def.run({ frage }, ctx);
      expect(outcome.status, frage).toBe("ok");
      const ergebnis = dokuErgebnisSchema.parse(outcome.status === "ok" ? outcome.output : null);
      // Was kommt, stammt aus dem Index (z. B. Abschnitte, die `.env` erklären), nie aus der Datei.
      const gefunden = ergebnis.status === "gefunden" ? ergebnis.abschnitte : [];
      for (const a of gefunden) expect(ids.has(a.id), a.id).toBe(true);
      expect(JSON.stringify(ergebnis)).not.toContain("root:");
    }
    expect(zugriffe.n - vorher).toBe(0);
    expect(netz).not.toHaveBeenCalled();
    netz.mockRestore();
  });
});

describe("Auslieferung", () => {
  it("in dieser Fassung bietet die Auslieferung noch kein eingebautes Werkzeug an, auch mit Doku-Index", () => {
    expect(builtinTools()).toEqual([]);
    expect(builtinTools({ dokuIndex: index })).toEqual([]);
  });
});
