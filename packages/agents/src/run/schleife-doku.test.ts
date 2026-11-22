/**
 * PaiBot – Tests: Läufe mit dem Werkzeug „In der Doku nachschlagen“ über das echte Tor mit allen
 * Standard-Regeln (erlaubt nur über R-010), den Test-Anbieter mit Drehbuch und eine echte
 * Datenbank: Ergebnis nur als Werkzeug-Ergebnis, ehrliche Quellen, Abdruck und Belege,
 * Bereinigung, der Lauf geht bei „nichts gefunden“ weiter, Anweisung,
 * eingeschleuste Aufforderung, Chat ohne Wunsch.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { contextDigest } from "@paibot/crypto";
import { repo, settings as settingsTable } from "@paibot/db";
import { createTestDb } from "@paibot/db/testing";
import { createFakeProvider, type FakeProvider, type FakeScript } from "@paibot/fake-provider";
import { evaluate, toolResultDigestText } from "@paibot/gate";
import { createReceiptWriter, verifyChain } from "@paibot/receipts";
import type { ActionRequest, Facts } from "@paibot/shared/aktionen";
import type { ReceiptEntry } from "@paibot/shared/belege";
import type { RunId } from "@paibot/shared/ids";
import type { JsonValue } from "@paibot/shared/motor";
import { ACTIVE_STANDARD_RULES, type RuleDefinition } from "@paibot/shared/tor";
import type { ToolDefinition, ToolEnvelope } from "@paibot/shared/werkzeug";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAiSdkMotor } from "../motor-aisdk";
import { SATZ_DOKU, SATZ_OHNE_WERKZEUGE } from "../prompt";
import { type RunSetup, setupRun } from "../testing/lauf-umgebung";
import { createTestTools } from "../testing/werkzeuge";
import { dokuIndexAusText } from "../werkzeuge/doku/index-laden";
import { bereiteIndexVor, type GeladenerDokuIndex } from "../werkzeuge/doku/suche";
import { echterIndexText } from "../werkzeuge/doku/testdaten/echter-index";
import {
  EINSCHLEUSUNG,
  UNSICHTBAR,
  UNSICHTBAR_BEREINIGT,
  UNSICHTBARE_ZEICHEN,
} from "../werkzeuge/doku/testdaten/indizes";
import { DOKU_TOOL_KEY, dokuErgebnisSchema, dokuNachschlagen } from "../werkzeuge/doku/werkzeug";
import { createToolRegistry } from "../werkzeuge/register";
import { executeRun } from "./ausfuehren";
import {
  ANTWORT_MIT_SEITE,
  ANTWORT_OHNE_WUNSCH,
  DOKU_SCRIPTS,
  EINGABE_RAENDER,
  ENTWURF,
  FRAGE_FALLE,
  PFAD_FRAGEN,
  ZWEITER_SCHRITT,
} from "./testdaten/drehbuecher-doku";

// Drehbücher: `testdaten/drehbuecher-doku.ts`, Test-Indizes: `../werkzeuge/doku/testdaten`.
// Erlaubt wird das Nachschlagen nur durch das echte Tor mit dem vollen Satz der Standard-Regeln
// (R-010); kein Test setzt eine eigene Regel, die „erlaubt“ erzwingt. Reine Entscheidungstests
// nutzen `evaluate` mit einer Regel-Liste. Die Gegenprobe im Kommentar ist die Änderung, die den
// Fall rot machen muss.

const PROVIDER_KEY = `sk-test-${"p".repeat(24)}`;
const QUESTION = "Wie stelle ich das Tagesbudget ein?";

const RECEIPT_TOOLS = {
  createWriter: createReceiptWriter,
  verify: (entries: Parameters<typeof verifyChain>[0], options: object) =>
    verifyChain(entries, options as Parameters<typeof verifyChain>[1]),
};

let provider: FakeProvider;
let providerUrl: string;
let echt: GeladenerDokuIndex;

beforeAll(async () => {
  provider = createFakeProvider({ apiKey: PROVIDER_KEY, reply: "unbenutzt" });
  ({ baseUrl: providerUrl } = await provider.start({ port: 0 }));
  echt = dokuIndexAusText(await echterIndexText());
});

afterAll(async () => {
  await provider.stop();
});

const never = () => new AbortController().signal;

const widen = (def: unknown) => def as ToolDefinition<JsonValue, JsonValue>;

/** Ein Doku-Werkzeug, das mitzählt, wie oft es lief. */
function gezaehlt(
  index: GeladenerDokuIndex,
  aendern: Partial<ToolDefinition<JsonValue, JsonValue>> = {},
) {
  const def = widen(dokuNachschlagen(index));
  const zaehler = { n: 0 };
  const tool: ToolDefinition<JsonValue, JsonValue> = {
    ...def,
    ...aendern,
    async run(input, ctx) {
      zaehler.n += 1;
      return (aendern.run ?? def.run)(input, ctx);
    },
  };
  return { tool, zaehler };
}

interface Env extends RunSetup {
  zaehler: { n: number };
  ask(text?: string): Promise<{ runId: RunId; outcome: Awaited<ReturnType<typeof executeRun>> }>;
}

/** Installation mit dem echten Doku-Werkzeug (und wahlweise weiteren Werkzeugen) im Register. */
async function setup(
  script: FakeScript,
  options: {
    index?: GeladenerDokuIndex;
    aendern?: Partial<ToolDefinition<JsonValue, JsonValue>>;
    weitere?: ToolDefinition<JsonValue, JsonValue>[];
  } = {},
): Promise<Env> {
  const { db } = await createTestDb();
  const env = await setupRun(db, RECEIPT_TOOLS, {
    providerBaseUrl: providerUrl,
    providerKey: PROVIDER_KEY,
    motor: createAiSdkMotor(),
  });
  const { tool, zaehler } = gezaehlt(options.index ?? echt, options.aendern);
  env.deps.tools = await createToolRegistry([tool, ...(options.weitere ?? [])]);
  provider.reset();
  provider.configure({ reply: "unbenutzt", script });
  return {
    ...env,
    zaehler,
    async ask(text = QUESTION) {
      const { runId } = await env.queueMessage(text);
      const outcome = await executeRun(runId, env.deps, never());
      return { runId, outcome };
    },
  };
}

function chats() {
  return provider.requests.filter((r) => r.path.endsWith("/chat/completions"));
}

type Body = { messages: { role: string; content: unknown }[] };
const body = (i: number) => chats()[i]?.body as Body;

function bodies(entries: readonly ReceiptEntry[]) {
  return entries.map((entry) => entry.body);
}

function decisions(entries: readonly ReceiptEntry[], type: string) {
  return bodies(entries).filter(
    (b): b is Extract<ReceiptEntry["body"], { type: "decision" }> =>
      b.type === "decision" && b.action.type === type,
  );
}

function results(entries: readonly ReceiptEntry[], type: string) {
  return bodies(entries).filter(
    (b): b is Extract<ReceiptEntry["body"], { type: "result" }> =>
      b.type === "result" && b.action.type === type,
  );
}

/** Belege der Aktionen eines Laufs in Reihenfolge, ohne Start-Belege: „Art Aktion“. */
function ablauf(entries: readonly ReceiptEntry[]) {
  return bodies(entries)
    .filter(
      (b): b is Extract<ReceiptEntry["body"], { type: "decision" | "result" }> =>
        (b.type === "decision" || b.type === "result") &&
        (b.action.type === "modell.anfragen" || b.action.type === "werkzeug.aufrufen"),
    )
    .map((b) => `${b.type} ${b.action.type}`);
}

/** Hülle aus der Nachricht `role: "tool"` beim Test-Anbieter. */
function gesendeteHuellen(i: number): ToolEnvelope[] {
  return body(i)
    .messages.filter((m) => m.role === "tool")
    .map((m) => JSON.parse(String(m.content)) as ToolEnvelope);
}

describe("Erlaubt nur über R-010", () => {
  // Gegenprobe: Entscheidungstest mit `evaluate` und einer Kopie von R-010 ohne die Bedingung
  // `toolKey` → ein anderes lesendes Werkzeug wird erlaubt (unten im Test als Gegenstück).
  it("Lauf mit Doku-Aufruf: Entscheidung allow, Regel R-010 im Beleg, das Werkzeug läuft einmal", async () => {
    const env = await setup(DOKU_SCRIPTS.treffer);
    const { runId, outcome } = await env.ask();
    expect(outcome).toMatchObject({ status: "succeeded" });
    expect(env.zaehler.n).toBe(1);
    const [entscheidung] = decisions(await env.receipts(), "werkzeug.aufrufen");
    expect(entscheidung?.decision.outcome).toBe("allow");
    expect(entscheidung?.decision.rules.map((r) => r.id)).toEqual(["R-010"]);
    expect(entscheidung?.facts).toMatchObject({ toolKey: DOKU_TOOL_KEY, toolKind: "lesen" });
    expect(await repo.toolCalls.listForRun(env.db, runId)).toMatchObject([
      { status: "succeeded", toolKey: DOKU_TOOL_KEY },
    ]);
  });

  it("Entscheidung mit evaluate: R-010 erlaubt nur genau diese Kennung; ein anderes lesendes Werkzeug fragt (R-005)", async () => {
    const env = await setup(DOKU_SCRIPTS.treffer);
    await env.ask();
    const [b] = decisions(await env.receipts(), "werkzeug.aufrufen");
    if (b === undefined) throw new Error("kein Beleg");
    const action = b.action as unknown as ActionRequest<"werkzeug.aufrufen">;
    const facts = b.facts as unknown as Facts<"werkzeug.aufrufen">;
    const regeln: readonly RuleDefinition[] = ACTIVE_STANDARD_RULES;
    const erlaubt = evaluate(action, facts, regeln);
    expect([erlaubt.outcome, erlaubt.matchedRules.map((r) => r.id)]).toEqual(["allow", ["R-010"]]);
    const anderes = { ...facts, toolKey: "eingebaut/test_lesen" } as Facts<"werkzeug.aufrufen">;
    const gefragt = evaluate(action, anderes, regeln);
    expect([gefragt.outcome, gefragt.matchedRules.map((r) => r.id)]).toEqual(["ask", ["R-005"]]);
    // Gegenstück: Ohne die Bedingung zur Kennung würde R-010 auch das andere Werkzeug erlauben.
    const ohneKennung = regeln.map((r) =>
      r.id === "R-010" ? { ...r, conditions: r.conditions.filter((c) => c.fact !== "toolKey") } : r,
    );
    expect(evaluate(action, anderes, ohneKennung).outcome).toBe("allow");
  });

  it("als schreibendes Werkzeug eingetragen: abgelehnt freigabe_noetig, das Werkzeug läuft nicht", async () => {
    const env = await setup(DOKU_SCRIPTS.treffer, { aendern: { kind: "schreiben" } });
    const { runId, outcome } = await env.ask();
    expect(outcome).toMatchObject({ status: "succeeded" });
    expect(env.zaehler.n).toBe(0);
    expect(await repo.toolCalls.listForRun(env.db, runId)).toMatchObject([
      { status: "denied", errorCode: "freigabe_noetig" },
    ]);
    const [entscheidung] = decisions(await env.receipts(), "werkzeug.aufrufen");
    expect(entscheidung?.decision.rules.map((r) => r.id)).toEqual(["R-005"]);
  });
});

describe("Eingabe im Lauf", () => {
  it("ungültige Eingaben an den Rändern: je werkzeug_eingabe_ungueltig mit Beleg-Paar, das Werkzeug läuft nur für die gültigen", async () => {
    const env = await setup(DOKU_SCRIPTS.eingabeRaender);
    const { runId } = await env.ask();
    const zeilen = await repo.toolCalls.listForRun(env.db, runId);
    const ungueltig = ["frage2", "frage201", "dreiBegriffe", "begriff81", "zusatzfeld", "zahl"];
    const erwartet = Object.keys(EINGABE_RAENDER).map((name) =>
      ungueltig.includes(name)
        ? { status: "denied", errorCode: "werkzeug_eingabe_ungueltig" }
        : { status: "succeeded" },
    );
    expect(zeilen).toMatchObject(erwartet);
    expect(env.zaehler.n).toBe(2);
    expect(decisions(await env.receipts(), "werkzeug.aufrufen")).toHaveLength(zeilen.length);
    expect(results(await env.receipts(), "werkzeug.aufrufen")).toHaveLength(zeilen.length);
  });

  it("Pfade und Adressen als Frage: nur Suche im Index, die Ergebnisse stammen aus dem Index", async () => {
    const env = await setup(DOKU_SCRIPTS.pfade);
    const { runId } = await env.ask();
    const zeilen = await repo.toolCalls.listForRun(env.db, runId);
    expect(zeilen).toHaveLength(PFAD_FRAGEN.length);
    const ids = new Set(echt.abschnitte.map((a) => a.id));
    for (const zeile of zeilen) {
      expect(zeile.status).toBe("succeeded");
      const ergebnis = dokuErgebnisSchema.parse((zeile.output as { inhalt: unknown }).inhalt);
      for (const a of ergebnis.status === "gefunden" ? ergebnis.abschnitte : []) {
        expect(ids.has(a.id)).toBe(true);
      }
    }
  });
});

describe("Ergebnis, Quellen, Abdruck, Belege", () => {
  // Gegenprobe: Ergebnis als system- oder user-Nachricht → rot.
  it("beim Test-Anbieter kommt das Ergebnis nur als role tool mit der Hülle werkzeug-ergebnis an, nie in system oder user", async () => {
    const env = await setup(DOKU_SCRIPTS.treffer);
    await env.ask();
    expect(chats()).toHaveLength(2);
    const mitHuelle = body(1).messages.filter((m) =>
      JSON.stringify(m.content ?? "").includes("werkzeug-ergebnis"),
    );
    expect(mitHuelle.map((m) => m.role)).toEqual(["tool"]);
    const [huelle] = gesendeteHuellen(1);
    expect(huelle).toMatchObject({
      paibot: "werkzeug-ergebnis",
      werkzeug: DOKU_TOOL_KEY,
      art: "daten",
      status: "ok",
      inhalt: { status: "gefunden" },
    });
    const abschnitt = (huelle as unknown as { inhalt: { abschnitte: { text: string }[] } }).inhalt
      .abschnitte[0]?.text;
    for (const m of body(1).messages.filter((x) => x.role !== "tool")) {
      expect(String(m.content ?? "")).not.toContain(String(abschnitt).slice(0, 80));
    }
  });

  // Gegenprobe: `found` bzw. Quellen aus dem Ergebnis vor dem Kürzen. Hinweis: Das Kürzen der
  // Hülle kürzt erst Texte und entfernt Listen-Einträge nur, wenn alle Texte leer sind; bei den
  // Grenzen der Einstellungen (ab 1 000 Zeichen) bleibt die Zahl der Abschnitte deshalb gleich.
  it("Quellen und Zahl der Fundstellen entsprechen genau den Abschnitten in tool_calls.output und beim Test-Anbieter, auch wenn die Hülle gekürzt wurde", async () => {
    const env = await setup(DOKU_SCRIPTS.treffer);
    await env.db.update(settingsTable).set({ toolResultMaxChars: 1000 });
    const { runId } = await env.ask();
    const [zeile] = await repo.toolCalls.listForRun(env.db, runId);
    const gespeichert = zeile?.output as ToolEnvelope & { gekuerzt?: boolean };
    expect(gespeichert).toMatchObject({ status: "ok", gekuerzt: true });
    const ergebnis = dokuErgebnisSchema.parse((gespeichert as { inhalt: unknown }).inhalt);
    if (ergebnis.status !== "gefunden") throw new Error("nichts gefunden");
    const [gesendet] = gesendeteHuellen(1);
    expect(gesendet).toEqual(gespeichert);
    const [beleg] = results(await env.receipts(), "werkzeug.aufrufen");
    expect(beleg?.result.found).toBe(ergebnis.abschnitte.length);
    expect(JSON.stringify((gesendet as { inhalt: unknown }).inhalt).length).toBeLessThanOrEqual(
      1000,
    );
    const quellen = dokuNachschlagen(echt).sources?.(ergebnis) ?? [];
    expect(quellen).toEqual(
      ergebnis.abschnitte.map((a) => ({ seite: a.seite, anker: a.anker, titel: a.titel })),
    );
  });

  it("Abdruck des Ergebnisses = HMAC mit Vorsatz pb-werkzeugergebnis/v1 über genau die gesendete Hülle; Doku-Stand höchstens 80 Zeichen", async () => {
    const env = await setup(DOKU_SCRIPTS.treffer);
    const { runId } = await env.ask();
    const [zeile] = await repo.toolCalls.listForRun(env.db, runId);
    const [gesendet] = gesendeteHuellen(1);
    if (gesendet === undefined || zeile === undefined) throw new Error("keine Hülle");
    expect(gesendet).toEqual(zeile.output);
    const text = toolResultDigestText(gesendet);
    expect(text.startsWith("pb-werkzeugergebnis/v1\n")).toBe(true);
    const [beleg] = results(await env.receipts(), "werkzeug.aufrufen");
    expect(beleg?.result.digest).toBe(contextDigest(env.deps.keys.context, text));
    expect(beleg?.result.docStand).toBe(echt.stand);
    expect(String(beleg?.result.docStand).length).toBeLessThanOrEqual(80);
    // Ein Abschnitt, nachträglich in der Zeile geändert, passt nicht mehr zum Abdruck.
    const geaendert = JSON.parse(JSON.stringify(gesendet)) as unknown as {
      inhalt: { abschnitte: { text: string }[] };
    };
    const erster = geaendert.inhalt.abschnitte[0];
    if (erster !== undefined) erster.text = `${erster.text} geändert`;
    expect(
      contextDigest(
        env.deps.keys.context,
        toolResultDigestText(geaendert as unknown as ToolEnvelope),
      ),
    ).not.toBe(beleg?.result.digest);
  });

  // Gegenprobe: die Beleg-Felder weglassen → `found` fehlt.
  it("Belege mit Treffer: modell.anfragen, werkzeug.aufrufen (R-010) mit Doku-Stand und Fundstellen, modell.anfragen; Kette vertrauenswürdig", async () => {
    const env = await setup(DOKU_SCRIPTS.treffer);
    const { runId } = await env.ask();
    const entries = await env.receipts();
    expect(ablauf(entries)).toEqual([
      "decision modell.anfragen",
      "result modell.anfragen",
      "decision werkzeug.aufrufen",
      "result werkzeug.aufrufen",
      "decision modell.anfragen",
      "result modell.anfragen",
    ]);
    const [zeile] = await repo.toolCalls.listForRun(env.db, runId);
    const ergebnis = dokuErgebnisSchema.parse(
      (zeile?.output as { inhalt?: unknown } | undefined)?.inhalt,
    );
    const zahl = ergebnis.status === "gefunden" ? ergebnis.abschnitte.length : 0;
    expect(zahl).toBeGreaterThanOrEqual(1);
    expect(results(entries, "werkzeug.aufrufen")).toMatchObject([
      { result: { status: "ok", docStand: echt.stand, found: zahl } },
    ]);
    expect(await env.verify()).toMatchObject({ ok: true });
    const antwort = (
      await repo.messages.listForConversation(env.db, env.conversationId, {
        nurAntworten: true,
      })
    ).find((m) => m.role === "assistant");
    expect(antwort?.content).toBe(ANTWORT_MIT_SEITE);
  });

  // Gegenprobe: die Bereinigung der Ausgabe in `aufruf.ts` überspringen → ein Zeichen kommt an.
  it("unsichtbare Zeichen im Index (Tag, Variantenwähler, Bidi, Nullbreite) kommen beim Test-Anbieter nicht an", async () => {
    // Der geprüfte Lader lehnt diesen Index ab; deshalb an ihm vorbei vorbereitet.
    const index = bereiteIndexVor(
      { version: "9.9.9-test", pruefsumme: `sha256:${"0".repeat(64)}` },
      UNSICHTBAR,
    );
    const script: FakeScript = {
      steps: [
        { toolCalls: [{ name: "doku_nachschlagen", arguments: { frage: "Kompass" } }] },
        { text: "Fertig." },
      ],
    };
    const env = await setup(script, { index });
    const { runId } = await env.ask();
    const [zeile] = await repo.toolCalls.listForRun(env.db, runId);
    expect(zeile?.status).toBe("succeeded");
    const gesendet = JSON.stringify(gesendeteHuellen(1));
    expect(gesendet).toContain(UNSICHTBAR_BEREINIGT);
    const rohe = JSON.stringify(chats()[1]?.body);
    for (const zeichen of UNSICHTBARE_ZEICHEN) {
      expect(gesendet.includes(zeichen)).toBe(false);
      expect(rohe.includes(zeichen)).toBe(false);
      expect(JSON.stringify(zeile?.output).includes(zeichen)).toBe(false);
    }
  });
});

/** Nachrichten des Bots in einem Lauf. */
async function botNachrichten(env: RunSetup, runId: RunId) {
  const alle = await repo.messages.listForConversation(env.db, env.conversationId, { limit: 200 });
  return alle.filter((m) => m.role === "assistant" && m.runId === runId);
}

describe("Nachschlagen ohne Fundstelle: der Lauf geht weiter", () => {
  // Gegenprobe: in `schleife.ts` die Bedingung `if (last)` nach den Aufrufen durch `if (true)` ersetzen
  // → nur eine Anfrage, die End-Antwort ist der Satz „Die Antwort ist zu lang geworden …“.
  it("„Wie verbinde ich Telegram?“: zweite Anfrage an den Anbieter, ihre Antwort ist die End-Antwort (origin modell), das Modell sieht Quelle, Stand und gefunden 0", async () => {
    const env = await setup(DOKU_SCRIPTS.nichtsGefunden);
    const { runId, outcome } = await env.ask(FRAGE_FALLE);
    expect(outcome).toMatchObject({ status: "succeeded" });
    expect(chats()).toHaveLength(2);
    expect((await repo.runs.get(env.db, runId))?.status).toBe("succeeded");
    const nachrichten = await botNachrichten(env, runId);
    expect(nachrichten.map((m) => [m.step, m.origin, m.content])).toEqual([
      [0, "modell", ENTWURF],
      [undefined, "modell", ZWEITER_SCHRITT],
    ]);
    expect(gesendeteHuellen(1)).toMatchObject([
      {
        status: "ok",
        werkzeug: DOKU_TOOL_KEY,
        inhalt: {
          status: "nichts_gefunden",
          quelle: "Doku von PaiBot",
          stand: echt.stand,
          gefunden: 0,
        },
      },
    ]);
  });

  it("Belege ohne Treffer: modell.anfragen, werkzeug.aufrufen (R-010) mit Fundstellen 0 und Doku-Stand, dann die zweite modell.anfragen", async () => {
    const env = await setup(DOKU_SCRIPTS.nichtsGefunden);
    await env.ask(FRAGE_FALLE);
    const entries = await env.receipts();
    expect(ablauf(entries)).toEqual([
      "decision modell.anfragen",
      "result modell.anfragen",
      "decision werkzeug.aufrufen",
      "result werkzeug.aufrufen",
      "decision modell.anfragen",
      "result modell.anfragen",
    ]);
    expect(decisions(entries, "werkzeug.aufrufen")[0]?.decision.rules.map((r) => r.id)).toEqual([
      "R-010",
    ]);
    expect(results(entries, "werkzeug.aufrufen")).toMatchObject([
      { result: { status: "ok", found: 0, docStand: echt.stand } },
    ]);
    expect(await env.verify()).toMatchObject({ ok: true });
  });

  it("zwei Fragen ohne Treffer im selben Schritt: beide Ergebnisse gehen an das Modell, der Lauf geht weiter", async () => {
    const env = await setup(DOKU_SCRIPTS.zweimalNichts);
    const { runId } = await env.ask(FRAGE_FALLE);
    expect(chats()).toHaveLength(2);
    expect(env.zaehler.n).toBe(2);
    expect(gesendeteHuellen(1)).toMatchObject([
      { status: "ok", inhalt: { status: "nichts_gefunden", gefunden: 0 } },
      { status: "ok", inhalt: { status: "nichts_gefunden", gefunden: 0 } },
    ]);
    expect((await botNachrichten(env, runId)).at(-1)).toMatchObject({
      origin: "modell",
      content: ZWEITER_SCHRITT,
    });
  });

  it("Fehler des Werkzeugs beim Nachschlagen: keine Fehlanzeige, der Lauf geht zum nächsten Modell-Schritt", async () => {
    const env = await setup(DOKU_SCRIPTS.nichtsGefunden, {
      aendern: {
        async run() {
          throw new Error("Index nicht lesbar");
        },
      },
    });
    const { runId, outcome } = await env.ask(FRAGE_FALLE);
    expect(outcome).toMatchObject({ status: "succeeded" });
    expect(env.zaehler.n).toBe(1);
    expect(chats()).toHaveLength(2);
    expect(gesendeteHuellen(1)).toMatchObject([{ status: "fehler", code: "werkzeug_fehler" }]);
    const nachrichten = await botNachrichten(env, runId);
    expect(nachrichten.at(-1)).toMatchObject({ origin: "modell", content: ZWEITER_SCHRITT });
    expect(nachrichten.some((m) => m.origin === "fest")).toBe(false);
  });

  it("eine Frage ohne Treffer und ein Fehler im selben Schritt: der Lauf geht weiter", async () => {
    const echtesWerkzeug = widen(dokuNachschlagen(echt));
    let aufrufe = 0;
    const env = await setup(DOKU_SCRIPTS.nichtsUndFehler, {
      aendern: {
        async run(input, ctx) {
          aufrufe += 1;
          if (aufrufe === 2) throw new Error("Index nicht lesbar");
          return echtesWerkzeug.run(input, ctx);
        },
      },
    });
    const { runId } = await env.ask(FRAGE_FALLE);
    expect(env.zaehler.n).toBe(2);
    expect(chats()).toHaveLength(2);
    expect(gesendeteHuellen(1)).toMatchObject([
      { status: "ok", werkzeug: DOKU_TOOL_KEY },
      { status: "fehler", code: "werkzeug_fehler" },
    ]);
    const nachrichten = await botNachrichten(env, runId);
    expect(nachrichten.at(-1)).toMatchObject({
      origin: "modell",
      content: ANTWORT_OHNE_WUNSCH,
    });
    expect(nachrichten.some((m) => m.origin === "fest")).toBe(false);
  });

  it("Zeitgrenze beim Nachschlagen: keine Fehlanzeige, der Lauf geht zum nächsten Modell-Schritt", async () => {
    const env = await setup(DOKU_SCRIPTS.nichtsGefunden, {
      aendern: {
        limits: { timeoutMs: 30, maxOutputChars: 6_000 },
        run: (_input, ctx) =>
          new Promise((_ok, fehler) => {
            ctx.signal.addEventListener("abort", () => fehler(new Error("abgebrochen")), {
              once: true,
            });
          }),
      },
    });
    const { runId, outcome } = await env.ask(FRAGE_FALLE);
    expect(outcome).toMatchObject({ status: "succeeded" });
    expect(chats()).toHaveLength(2);
    expect(gesendeteHuellen(1)).toMatchObject([{ status: "fehler", code: "werkzeug_zeitgrenze" }]);
    const nachrichten = await botNachrichten(env, runId);
    expect(nachrichten.at(-1)).toMatchObject({ origin: "modell", content: ZWEITER_SCHRITT });
    expect(nachrichten.some((m) => m.origin === "fest")).toBe(false);
  });

  // Bleibt im Schritt kaum Platz, kürzt das Kürzen der Hülle auch den Doku-Stand. Eine solche Hülle
  // zählt nicht als Ergebnis des Nachschlagens: kein Doku-Stand und keine Fundstellen im Beleg.
  // Gegenprobe: in `dokuAusHuelle` (`beleg-felder.ts`) die Prüfung `STAND_MUSTER` bei gekürzter
  // Hülle entfernen → der Beleg trägt den beschnittenen Stand „0.3.0-de“ mit Fundstellen 0.
  it("knapper Platz im Schritt: ein beschnittener Doku-Stand steht weder im Beleg noch zählt die Hülle", async () => {
    const env = await setup(DOKU_SCRIPTS.einerTrifft);
    // Der erste Aufruf braucht rund 1 000 Zeichen; für den zweiten bleibt wenig Platz.
    await env.db
      .update(settingsTable)
      .set({ toolResultMaxChars: 1000, toolResultsMaxCharsPerStep: 1210 });
    const { runId } = await env.ask(FRAGE_FALLE);
    const [, zweiter] = await repo.toolCalls.listForRun(env.db, runId);
    const gespeichert = zweiter?.output as ToolEnvelope & { gekuerzt?: boolean };
    expect(gespeichert).toMatchObject({ status: "ok", gekuerzt: true });
    const stand = (gespeichert as unknown as { inhalt: { stand: string } }).inhalt.stand;
    expect(stand).not.toBe(echt.stand);
    expect(echt.stand.startsWith(stand)).toBe(true);
    const ergebnisse = results(await env.receipts(), "werkzeug.aufrufen");
    expect(ergebnisse).toHaveLength(2);
    expect(ergebnisse[0]?.result).toMatchObject({ status: "ok", found: 4, docStand: echt.stand });
    expect(ergebnisse[1]?.result).toMatchObject({ status: "ok" });
    expect(ergebnisse[1]?.result).not.toHaveProperty("docStand");
    expect(ergebnisse[1]?.result).not.toHaveProperty("found");
    expect(await env.verify()).toMatchObject({ ok: true });
  });

  it("eine Frage trifft, eine nicht: der Lauf geht weiter", async () => {
    const env = await setup(DOKU_SCRIPTS.einerTrifft);
    const { runId } = await env.ask(FRAGE_FALLE);
    expect(chats()).toHaveLength(2);
    expect((await botNachrichten(env, runId)).at(-1)).toMatchObject({
      origin: "modell",
      content: ANTWORT_MIT_SEITE,
    });
  });

  it("abgelehnter Aufruf und eine Frage ohne Treffer: der Lauf geht weiter, das Modell sieht beides", async () => {
    const env = await setup(DOKU_SCRIPTS.abgelehntUndNichts);
    const { runId } = await env.ask(FRAGE_FALLE);
    expect(chats()).toHaveLength(2);
    expect(await repo.toolCalls.listForRun(env.db, runId)).toMatchObject([
      { status: "denied", errorCode: "werkzeug_eingabe_ungueltig" },
      { status: "succeeded" },
    ]);
    expect(gesendeteHuellen(1)).toMatchObject([
      { status: "abgelehnt", code: "werkzeug_eingabe_ungueltig" },
      { status: "ok", inhalt: { status: "nichts_gefunden", gefunden: 0 } },
    ]);
    expect((await botNachrichten(env, runId)).at(-1)).toMatchObject({
      origin: "modell",
      content: ZWEITER_SCHRITT,
    });
  });

  it("nur abgelehnte Aufrufe: der Lauf geht weiter, das Modell sieht die Ablehnung", async () => {
    const env = await setup(DOKU_SCRIPTS.nurAbgelehnt);
    const { runId } = await env.ask(FRAGE_FALLE);
    expect(chats()).toHaveLength(2);
    expect(gesendeteHuellen(1)).toMatchObject([
      { status: "abgelehnt", code: "werkzeug_eingabe_ungueltig" },
    ]);
    expect((await botNachrichten(env, runId)).at(-1)).toMatchObject({
      origin: "modell",
      content: ANTWORT_OHNE_WUNSCH,
    });
  });

  it("ohne Ergebnis mit Fundstelle gibt es nie step.finished verworfen; der Schritt endet als Zwischentext, der nächste als Antwort", async () => {
    for (const script of [
      DOKU_SCRIPTS.nichtsGefunden,
      DOKU_SCRIPTS.zweimalNichts,
      DOKU_SCRIPTS.einerTrifft,
      DOKU_SCRIPTS.nurAbgelehnt,
    ]) {
      const env = await setup(script);
      await env.ask(FRAGE_FALLE);
      const endungen = (await env.events())
        .filter((e) => e.type === "step.finished")
        .map((e) => (e.data as { ending: string }).ending);
      expect(endungen).toEqual(["zwischentext", "antwort"]);
    }
  });

  // Gegenprobe: `nurAntworten: false` beim Lesen → der Entwurf erscheint.
  it("der Entwurf des Schritts erscheint nie als Antwort: die Nachrichten der Unterhaltung ohne Zwischentexte enthalten nur Frage und die Antwort des zweiten Schritts", async () => {
    const env = await setup(DOKU_SCRIPTS.nichtsGefunden);
    await env.ask(FRAGE_FALLE);
    const sichtbar = await repo.messages.listForConversation(env.db, env.conversationId, {
      nurAntworten: true,
    });
    expect(sichtbar.map((m) => [m.role, m.content])).toEqual([
      ["user", FRAGE_FALLE],
      ["assistant", ZWEITER_SCHRITT],
    ]);
    expect(JSON.stringify(sichtbar)).not.toContain(ENTWURF);
  });
});

describe("Anweisung, eingeschleuste Aufforderung, Chat", () => {
  // Gegenprobe: die Werkzeuge des Laufs nicht an `buildSystemPrompt` geben → der Satz fehlt.
  it("mit dem Doku-Werkzeug kommt beim Test-Anbieter die Anweisung mit dem Satz zum Nachschlagen und zu Daten statt Anweisungen an, in jedem Schritt gleich", async () => {
    const env = await setup(DOKU_SCRIPTS.treffer);
    await env.ask();
    expect(chats()).toHaveLength(2);
    for (const i of [0, 1]) {
      const system = body(i).messages.filter((m) => m.role === "system");
      expect(system).toHaveLength(1);
      expect(String(system[0]?.content)).toContain(SATZ_DOKU);
      expect(String(system[0]?.content)).not.toContain(SATZ_OHNE_WERKZEUGE);
    }
    expect(body(0).messages[0]).toEqual(body(1).messages[0]);
  });

  // Der Schutz ist das Tor: Eine Regel, die test_schreiben erlaubt, gibt es im vollen Satz der
  // Standard-Regeln nicht; eine Gegenprobe müsste das Tor selbst ändern.
  it("eine Aufforderung im Doku-Text, test_schreiben zu rufen: der Aufruf geht durchs Tor, R-005 fragt, abgelehnt freigabe_noetig, test_schreiben läuft 0-mal", async () => {
    const index = bereiteIndexVor(
      { version: "9.9.9-test", pruefsumme: `sha256:${"0".repeat(64)}` },
      EINSCHLEUSUNG,
    );
    const testWerkzeuge = createTestTools();
    const env = await setup(DOKU_SCRIPTS.einschleusung, {
      index,
      weitere: [testWerkzeuge.byName("test_schreiben")],
    });
    const { runId, outcome } = await env.ask("Wie stelle ich den Kompass ein?");
    expect(outcome).toMatchObject({ status: "succeeded" });
    expect(String(gesendeteHuellen(1)[0] && JSON.stringify(gesendeteHuellen(1)[0]))).toContain(
      "test_schreiben",
    );
    expect(testWerkzeuge.protocol.count("test_schreiben")).toBe(0);
    expect(await repo.toolCalls.listForRun(env.db, runId)).toMatchObject([
      { status: "succeeded", toolKey: DOKU_TOOL_KEY },
      { status: "denied", errorCode: "freigabe_noetig", name: "test_schreiben" },
    ]);
    const entscheidungen = decisions(await env.receipts(), "werkzeug.aufrufen");
    expect(
      entscheidungen.map((d) => [d.decision.outcome, d.decision.rules.map((r) => r.id)]),
    ).toEqual([
      ["allow", ["R-010"]],
      ["ask", ["R-005"]],
    ]);
  });

  it("mit Doku-Werkzeug ohne Wunsch: eine Anfrage, End-Antwort mit dem Text des Drehbuchs, origin modell, step leer, ein Beleg-Paar modell.anfragen, keine Zeile tool_calls – der Text kommt erst am Schritt-Ende", async () => {
    const env = await setup(DOKU_SCRIPTS.ohneWunsch);
    const { runId, outcome } = await env.ask("Hallo!");
    expect(outcome).toMatchObject({ status: "succeeded" });
    expect(chats()).toHaveLength(1);
    const nachrichten = await botNachrichten(env, runId);
    expect(nachrichten).toMatchObject([
      { content: ANTWORT_OHNE_WUNSCH, origin: "modell", status: "complete" },
    ]);
    expect(nachrichten[0]?.step).toBeUndefined();
    expect(await repo.toolCalls.listForRun(env.db, runId)).toEqual([]);
    expect(ablauf(await env.receipts())).toEqual([
      "decision modell.anfragen",
      "result modell.anfragen",
    ]);
    // Mit Werkzeug im Register gibt es während des Schritts nur vorläufigen Text; die Antwort
    // (`message.created`, `text.delta`) entsteht erst mit dem Ende des Schritts.
    const typen = (await env.events()).map((e) => e.type);
    expect(typen).toContain("draft.delta");
    expect(typen.indexOf("draft.delta")).toBeLessThan(typen.lastIndexOf("message.created"));
    expect(typen.indexOf("step.finished")).toBeLessThan(typen.indexOf("text.delta"));
  });
});
