/**
 * PaiBot – Test: Werkzeuge aus Apps im Lauf (echtes Tor, echte Belege, Attrappe der App)
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { type Database, repo } from "@paibot/db";
import { createTestDb } from "@paibot/db/testing";
import { createFakeProvider, type FakeProvider, type FakeScript } from "@paibot/fake-provider";
import type { Gate } from "@paibot/gate";
import { createReceiptWriter, verifyChain } from "@paibot/receipts";
import type { ReceiptEntry } from "@paibot/shared/belege";
import type { Sha256Digest } from "@paibot/shared/grundtypen";
import { type AppId, type AppToolId, type BotId, newId, type RunId } from "@paibot/shared/ids";
import type { AppToolClass } from "@paibot/shared/tor-fassung-3";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createAiSdkMotor } from "../motor-aisdk";
import { type RunSetup, setupRun } from "../testing/lauf-umgebung";
import { createToolRegistry } from "../werkzeuge/register";
import { zielAbdruck } from "./app-werkzeuge";
import { executeRun } from "./ausfuehren";
import {
  abdruck,
  erzeugeTestAnschluss,
  TEST_APP_TOKEN,
  type TestAnschluss,
  type TestApp,
  type TestAppWerkzeug,
} from "./testdaten/app-umgebung";
import { ANSWER_TEXT } from "./testdaten/drehbuecher";

const PROVIDER_KEY = `sk-test-${"p".repeat(24)}`;
const RECEIPT_TOOLS = {
  createWriter: createReceiptWriter,
  verify: (entries: Parameters<typeof verifyChain>[0], options: object) =>
    verifyChain(entries, options as Parameters<typeof verifyChain>[1]),
};

let provider: FakeProvider;
let providerUrl: string;

beforeAll(async () => {
  provider = createFakeProvider({ apiKey: PROVIDER_KEY, reply: ANSWER_TEXT });
  ({ baseUrl: providerUrl } = await provider.start({ port: 0 }));
});
afterAll(async () => {
  await provider.stop();
});
afterEach(() => provider.reset());

/** Besitzer-Aktion über das echte Tor; `ausfuehren` läuft nur nach „erlaubt“. */
async function alsBesitzer<T>(
  gate: Gate,
  type: "app.werkzeuge_bestaetigen" | "app.zugriff_setzen",
  target: Record<string, string>,
  facts: Record<string, unknown>,
  ausfuehren: (actionId: ReturnType<typeof newId<"action">>) => Promise<T>,
): Promise<T> {
  const actionId = newId("action");
  const { value } = await gate.run(
    { actionId, type, actor: "besitzer", target } as never,
    facts as never,
    async () => ({ value: await ausfuehren(actionId), result: { status: "ok" } as const }),
  );
  return value;
}

/**
 * Legt eine App mit Werkzeugen an: Liste sehen, jedes Werkzeug mit `klasse` als Besitzer einstufen
 * (echte Entscheidung des Tors, echter Beleg) und dem Bot den Zugriff „lesen“ geben.
 */
async function richteAppEin(
  env: { db: Database; gate: Gate },
  input: {
    kurzname: string;
    botId: BotId | undefined;
    werkzeuge: TestAppWerkzeug[];
    url?: string;
  },
): Promise<TestApp> {
  const { db, gate } = env;
  const url = input.url ?? `https://mcp.${input.kurzname}.beispiel.test/mcp`;
  const app = await repo.apps.create(db, {
    shortName: input.kurzname,
    name: input.kurzname,
    url,
    authKind: "token",
    tokenEnc: TEST_APP_TOKEN,
  });
  const test: TestApp = {
    id: app.id,
    info: { id: app.id, kurzname: app.shortName, url: app.url },
    werkzeuge: input.werkzeuge,
    version: new Map(),
  };
  const gesehen = await repo.apps.sehen(
    db,
    app.id,
    input.werkzeuge.map((w) => ({
      originalName: w.name,
      toolDigest: abdruck("1") as Sha256Digest,
      description: `Beschreibung ${w.name}`,
      inputSchema: {
        type: "object",
        properties: { q: { type: "string" } },
        additionalProperties: false,
      },
    })),
  );
  const ziel = await zielAbdruck(app.id, app.url);
  for (const werkzeug of input.werkzeuge) {
    if (werkzeug.klasse === null) continue;
    const zeile = gesehen.find((g) => g.tool.originalName === werkzeug.name)?.tool;
    if (zeile === undefined) throw new Error("Werkzeug fehlt");
    await alsBesitzer(
      gate,
      "app.werkzeuge_bestaetigen",
      { appId: app.id, toolId: zeile.toolId },
      {
        credential: "sitzung",
        toolClass: werkzeug.klasse,
        toolVersion: zeile.version,
        toolDigest: zeile.toolDigest,
        seenToolDigest: zeile.toolDigest,
        toolStatus: zeile.status,
        targetDigest: ziel,
      },
      (actionId) =>
        repo.apps.einstufen(db, {
          toolId: zeile.toolId as AppToolId,
          toolClass: werkzeug.klasse as AppToolClass,
          actionId,
          seenDigest: zeile.toolDigest,
          targetDigest: ziel,
        }),
    );
  }
  if (input.botId !== undefined) await setzeZugriff(env, app.id, input.botId, "lesen");
  return test;
}

/** Der Besitzer setzt den Zugriff eines Bots auf eine App (echte Entscheidung des Tors). */
async function setzeZugriff(
  env: { db: Database; gate: Gate },
  appId: AppId,
  botId: BotId,
  access: "keiner" | "lesen",
): Promise<void> {
  const vorher = await repo.apps.currentAccess(env.db, appId, botId);
  await alsBesitzer(
    env.gate,
    "app.zugriff_setzen",
    { appId, botId },
    { credential: "sitzung", access, previousAccess: vorher },
    (actionId) => repo.apps.setAccess(env.db, { appId, botId, access, actionId }),
  );
}

const never = () => new AbortController().signal;

const aufruf = (name: string, q = "x") => ({ name, arguments: { q } });
const eineAntwort: FakeScript = { steps: [{ text: ANSWER_TEXT }] };

interface Env extends RunSetup {
  anschluss: TestAnschluss;
  ask(text?: string): Promise<{ runId: RunId; outcome: Awaited<ReturnType<typeof executeRun>> }>;
}

/** Installation mit Apps, die der Bot lesen darf. `baue` richtet die Apps ein. */
async function setup(
  script: FakeScript,
  baue: (env: RunSetup) => Promise<TestApp[]>,
  options: { ohneAnschluss?: boolean } = {},
): Promise<Env & { apps: TestApp[] }> {
  const { db } = await createTestDb();
  const env = await setupRun(db, RECEIPT_TOOLS, {
    providerBaseUrl: providerUrl,
    providerKey: PROVIDER_KEY,
    motor: createAiSdkMotor(),
  });
  env.deps.tools = await createToolRegistry([]);
  const apps = await baue(env);
  const anschluss = erzeugeTestAnschluss(apps);
  if (options.ohneAnschluss !== true) env.deps.apps = anschluss.anschluss;
  provider.reset();
  provider.configure({ reply: ANSWER_TEXT, script });
  return {
    ...env,
    apps,
    anschluss,
    async ask(text = "Wie ist der Stand?") {
      const { runId } = await env.queueMessage(text);
      const outcome = await executeRun(runId, env.deps, never());
      return { runId, outcome };
    },
  };
}

function entscheidungen(eintraege: readonly ReceiptEntry[], type: string) {
  return eintraege
    .map((e) => e.body)
    .filter(
      (b): b is Extract<ReceiptEntry["body"], { type: "decision" }> =>
        b.type === "decision" && b.action.type === type,
    );
}

const notizen = (env: RunSetup) =>
  richteAppEin(env, {
    kurzname: "notizen",
    botId: env.botId,
    werkzeuge: [
      { name: "suche", klasse: "lesen" },
      { name: "anlegen", klasse: "schreiben" },
    ],
  });

describe("Werkzeuge aus Apps im Lauf", () => {
  it("ein bestätigtes Lese-Werkzeug läuft durchs Tor mit allen Fakten der App und geht als Ergebnis an das Modell", async () => {
    const env = await setup(
      { steps: [{ toolCalls: [aufruf("notizen__suche")] }, { text: ANSWER_TEXT }] },
      async (e) => [await notizen(e)],
    );
    const { outcome } = await env.ask();
    expect(outcome).toMatchObject({ status: "succeeded" });
    // Die Liste wurde beim Start einmal abgerufen, der Aufruf ging einmal hinaus.
    expect(env.anschluss.protokoll.listen).toEqual(["notizen"]);
    expect(env.anschluss.protokoll.aufrufe).toEqual([
      { app: "notizen", name: "suche", argumente: { q: "x" } },
    ]);
    const app = env.apps[0];
    const [entscheidung] = entscheidungen(await env.receipts(), "werkzeug.aufrufen");
    expect(entscheidung?.decision.outcome).toBe("allow");
    expect(entscheidung?.facts).toMatchObject({
      toolSource: "mcp",
      toolKind: "lesen",
      toolReach: "nach_aussen",
      toolForeign: true,
      appId: app?.id,
      toolStatus: "bestaetigt",
      appAccess: "lesen",
      stepAppId: app?.id,
      untrustedInput: false,
    });
    const f = entscheidung?.facts as Record<string, unknown>;
    expect(f.confirmedToolDigest).toBe(f.toolDigest);
    expect(f.confirmedTargetDigest).toBe(f.targetDigest);
    // Das Modell sieht nur das bestätigte Lese-Werkzeug, mit dem Namen `<kurzname>__<name>`.
    const angebot = (
      (provider.requests.find((r) => r.path.endsWith("/chat/completions"))?.body ?? {}) as {
        tools?: { function: { name: string } }[];
      }
    ).tools?.map((t) => t.function.name);
    expect(angebot).toEqual(["notizen__suche"]);
    expect(await env.verify()).toMatchObject({ ok: true });
  });

  it("ohne Anschluss in den Abhängigkeiten gibt es keine Werkzeuge aus Apps und keinen Abruf", async () => {
    const env = await setup(eineAntwort, async (e) => [await notizen(e)], { ohneAnschluss: true });
    await env.ask();
    expect(env.anschluss.protokoll.listen).toEqual([]);
    const body = provider.requests.find((r) => r.path.endsWith("/chat/completions"))?.body as {
      tools?: unknown;
    };
    expect(body.tools).toBeUndefined();
  });

  // Gegenprobe: Zugriff nur beim Lauf-Start lesen, nicht vor dem Aufruf → Aufruf in Schritt 1 läuft, rot.
  it("sperrt der Besitzer den Bot zwischen Schritt 0 und 1, wird der Aufruf in Schritt 1 abgelehnt: keine Anfrage an die App", async () => {
    let env: (Env & { apps: TestApp[] }) | undefined;
    env = await setup(
      {
        steps: [
          { toolCalls: [aufruf("notizen__suche", "a")] },
          { toolCalls: [aufruf("notizen__suche", "b")] },
          { text: ANSWER_TEXT },
        ],
      },
      async (e) => [
        await richteAppEin(e, {
          kurzname: "notizen",
          botId: e.botId,
          werkzeuge: [
            {
              name: "suche",
              klasse: "lesen",
              beimAufruf: async () => {
                if (env === undefined) return;
                await setzeZugriff(env, env.apps[0]?.id as never, env.botId, "keiner");
              },
            },
          ],
        }),
      ],
    );
    await env.ask();
    expect(env.anschluss.protokoll.aufrufe.map((a) => a.argumente)).toEqual([{ q: "a" }]);
    const aufrufe = entscheidungen(await env.receipts(), "werkzeug.aufrufen");
    expect(aufrufe.map((d) => d.decision.outcome)).toEqual(["allow", "deny"]);
    expect(aufrufe[1]?.facts).toMatchObject({ appAccess: "keiner" });
  });

  // Gegenprobe: `stepAppId` nicht aus der Steuerung, sondern gleich der App des Aufrufs → beide laufen, rot.
  it("im selben Schritt nur Aufrufe an die App des ersten Aufrufs: der an eine zweite App wird abgelehnt", async () => {
    const env = await setup(
      {
        steps: [
          { toolCalls: [aufruf("notizen__suche"), aufruf("wiki__suche")] },
          { text: ANSWER_TEXT },
        ],
      },
      async (e) => [
        await notizen(e),
        await richteAppEin(e, {
          kurzname: "wiki",
          botId: e.botId,
          werkzeuge: [{ name: "suche", klasse: "lesen" }],
        }),
      ],
    );
    await env.ask();
    expect(env.anschluss.protokoll.aufrufe.map((a) => a.app)).toEqual(["notizen"]);
    const [erster, zweiter] = entscheidungen(await env.receipts(), "werkzeug.aufrufen");
    expect(erster?.decision.outcome).toBe("allow");
    expect(zweiter?.decision.outcome).toBe("deny");
    expect(zweiter?.facts).toMatchObject({ stepAppId: env.apps[0]?.id, appId: env.apps[1]?.id });
  });

  // Gegenprobe: Not-Aus nicht vor dem Abruf prüfen → Anfrage an die App, rot.
  it("bei gesetztem Not-Aus geht keine Anfrage an eine App hinaus", async () => {
    const env = await setup(eineAntwort, async (e) => [await notizen(e)]);
    await repo.settings.update(env.db, { killSwitch: true });
    await env.ask();
    expect(env.anschluss.protokoll.listen).toEqual([]);
    expect(env.anschluss.protokoll.aufrufe).toEqual([]);
  });

  // Gegenprobe: alle verbundenen Apps abrufen statt nur die mit Zugriff → Abruf, rot.
  it("ein Bot ohne Zugriff löst keinen Abruf aus und bekommt keine Werkzeuge der App", async () => {
    const env = await setup(eineAntwort, async (e) => [
      await richteAppEin(e, {
        kurzname: "notizen",
        botId: undefined,
        werkzeuge: [{ name: "suche", klasse: "lesen" }],
      }),
    ]);
    await env.ask();
    expect(env.anschluss.protokoll.listen).toEqual([]);
    const body = provider.requests.find((r) => r.path.endsWith("/chat/completions"))?.body as {
      tools?: unknown;
    };
    expect(body.tools).toBeUndefined();
  });
});
