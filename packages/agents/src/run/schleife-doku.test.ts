/**
 * PaiBot – Tests: Läufe mit dem Werkzeug „In der Doku nachschlagen“ über das echte Tor mit allen
 * Standard-Regeln (erlaubt nur über R-010), den Test-Anbieter mit Drehbuch und eine echte
 * Datenbank: Ergebnis nur als Werkzeug-Ergebnis, ehrliche Quellen, Abdruck und Belege,
 * Bereinigung, kein weiterer Modell-Schritt bei „nichts gefunden“, „verworfen“, Anweisung,
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
import { type RunSetup, setupRun } from "../testing/lauf-umgebung";
import { dokuIndexAusText } from "../werkzeuge/doku/index-laden";
import { bereiteIndexVor, type GeladenerDokuIndex } from "../werkzeuge/doku/suche";
import { echterIndexText } from "../werkzeuge/doku/testdaten/echter-index";
import {
  UNSICHTBAR,
  UNSICHTBAR_BEREINIGT,
  UNSICHTBARE_ZEICHEN,
} from "../werkzeuge/doku/testdaten/indizes";
import { DOKU_TOOL_KEY, dokuErgebnisSchema, dokuNachschlagen } from "../werkzeuge/doku/werkzeug";
import { createToolRegistry } from "../werkzeuge/register";
import { executeRun } from "./ausfuehren";
import {
  ANTWORT_MIT_SEITE,
  DOKU_SCRIPTS,
  EINGABE_RAENDER,
  PFAD_FRAGEN,
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
      return def.run(input, ctx);
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

  it.todo(
    "Belege ohne Treffer: modell.anfragen, werkzeug.aufrufen (R-010) mit Fundstellen 0 und Doku-Stand, danach kein Beleg mehr",
  );

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

describe("Kein weiterer Modell-Schritt bei „nichts gefunden“", () => {
  it.todo(
    "„Wie verbinde ich Telegram?“: genau eine Anfrage, End-Antwort origin fest mit dem festen Satz samt Version, Lauf succeeded, Zwischentext step 0 mit dem Entwurf, keine andere End-Antwort",
  );
  it.todo("zwei Fragen ohne Treffer im selben Schritt: kein weiterer Modell-Schritt");
  it.todo("abgelehnter Aufruf und eine Frage ohne Treffer: kein weiterer Modell-Schritt");
  it.todo("nur abgelehnte Aufrufe: der Lauf geht weiter, das Modell sieht die Ablehnung");
  it.todo(
    "nach dem Kurzschluss: für den Schritt erst step.finished zwischentext, dann step.finished verworfen, beide gültig, in der Transaktion der festen Antwort",
  );
  it.todo("ohne Kurzschluss gibt es nie step.finished verworfen");
  it.todo(
    "der Entwurf des Schritts erscheint nie als Antwort: die Nachrichten der Unterhaltung ohne Zwischentexte enthalten nur Frage und festen Satz",
  );
});

describe("Anweisung, eingeschleuste Aufforderung, Chat", () => {
  it.todo(
    "mit dem Doku-Werkzeug kommt beim Test-Anbieter die Anweisung mit dem Satz zum Nachschlagen und zu Daten statt Anweisungen an",
  );
  it.todo(
    "eine Aufforderung im Doku-Text, test_schreiben zu rufen: der Aufruf geht durchs Tor, R-005 fragt, abgelehnt freigabe_noetig, test_schreiben läuft 0-mal",
  );
  it.todo(
    "mit Doku-Werkzeug ohne Wunsch: eine Anfrage, End-Antwort mit dem Text des Drehbuchs, origin modell, step leer, ein Beleg-Paar modell.anfragen, keine Zeile tool_calls – der Text kommt erst am Schritt-Ende",
  );
});
