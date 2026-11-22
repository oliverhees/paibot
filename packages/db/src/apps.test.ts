/**
 * PaiBot – Tests der Apps-Datenbank (Migration 0016) auf einer Datenbank im Speicher: Tabellen,
 * Einschränkungen, Trigger und die Zugriffsfunktionen. Die Rechte der App-Rolle prüft
 * `apps-postgres.test.ts` gegen echtes Postgres.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { type AppId, type BotId, newId, ruleContent, STANDARD_RULE_VERSIONS } from "@paibot/shared";
import { R014_V1 } from "@paibot/shared/tor-fassung-3";
import { beforeEach, describe, expect, it } from "vitest";
import { abdruck, BelegKette, tokenV2, zielAbdruck } from "./apps-testhilfe";
import type { Database } from "./client";
import { apps, messages, rules } from "./repo";
import { appTools, bots, conversations, messages as messageTable, runs, toolCalls } from "./schema";
import { botRow, conversationRow, messageRow, runRow, toolCallRow } from "./testdaten";
import { createTestDb, type TestDb } from "./testing";

const CHECK = "23514";
const EINDEUTIG = "23505";
const RESTRICT = "23001";

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    return e.code ?? e.cause?.code;
  }
}

let ctx: TestDb;
let db: Database;
let kette: BelegKette;
let botId: BotId;

const URL_A = "https://mcp.beispiel.test/mcp";

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  kette = new BelegKette(db);
  const bot = botRow();
  await db.insert(bots).values(bot);
  botId = bot.id;
});

async function neueApp(extra: Partial<Parameters<typeof apps.create>[1]> = {}) {
  return apps.create(db, {
    shortName: "notizen",
    name: "Notizen",
    url: URL_A,
    authKind: "token",
    tokenEnc: tokenV2(),
    ...extra,
  });
}

function werkzeug(name: string, zeichen = "1") {
  return {
    originalName: name,
    toolDigest: abdruck(zeichen),
    description: `Beschreibung ${name}`,
    inputSchema: { type: "object", properties: {} },
  };
}

/** Bestätigt die neueste Fassung des Werkzeugs mit einer passenden Entscheidung des Besitzers. */
async function bestaetigen(
  app: { id: AppId; url: string },
  toolId: Parameters<typeof apps.currentTool>[1],
  toolClass: "lesen" | "schreiben" | "gesperrt" = "lesen",
) {
  const aktuell = await apps.currentTool(db, toolId);
  if (aktuell === undefined) throw new Error("Werkzeug fehlt");
  const ziel = zielAbdruck(app.id, app.url);
  const actionId = await kette.werkzeugBestaetigen({
    appId: app.id,
    toolId,
    toolClass,
    toolDigest: aktuell.toolDigest,
    targetDigest: ziel,
    toolStatus: aktuell.status as "neu",
    toolVersion: aktuell.version,
  });
  return apps.einstufen(db, {
    toolId,
    toolClass,
    actionId,
    seenDigest: aktuell.toolDigest,
    targetDigest: ziel,
  });
}

describe("Apps anlegen und lesen", () => {
  it("legt eine App an; die Rückgabe enthält nie das Token", async () => {
    const app = await neueApp();
    expect(app).toMatchObject({
      shortName: "notizen",
      url: URL_A,
      authKind: "token",
      tokenSet: true,
      state: "verbunden",
      connectionNo: 1,
    });
    expect(JSON.stringify(app)).not.toContain("v2:");
    expect(await apps.getTokenEnc(db, app.id)).toBe(tokenV2());
    expect(await apps.list(db)).toHaveLength(1);
  });

  it("bringt die Adresse in die einheitliche Form und lehnt Unzulässiges ab", async () => {
    const app = await neueApp({ url: "HTTPS://Mcp.Beispiel.test:443/mcp/" });
    expect(app.url).toBe(URL_A);
    for (const url of [
      "http://mcp.beispiel.test/mcp",
      "https://user:pw@mcp.beispiel.test/mcp",
      "https://mcp.beispiel.test/mcp?x=1",
      "https://mcp.beispiel.test/mcp#a",
      "mcp.beispiel.test",
    ]) {
      await expect(neueApp({ shortName: "zwei", url }), url).rejects.toMatchObject({
        code: "eingabe_ungueltig",
      });
    }
  });

  it("die Datenbank lehnt auch eine nicht einheitliche Adresse ab", async () => {
    const roh = (url: string) =>
      ctx.client.query(
        "insert into apps (id, short_name, name, url, auth_kind) values ($1, $2, 'x', $3, 'keine')",
        [newId("app"), `k${Math.floor(Math.random() * 1e9)}`, url],
      );
    for (const url of [
      "http://a.test",
      "https://a.test/",
      "https://u@a.test",
      "https://a.test/?q",
      "https://a.test/#f",
      'https://a.test/"x',
      "https://a.test/ä",
      'https://a"b.test/x',
      "https://a\\b.test/x",
      "https://a.test\\x",
      'https://a.test"',
    ]) {
      expect(await codeOf(roh(url)), url).toBe(CHECK);
    }
  });

  it("Kurzname eindeutig, ohne zwei Unterstriche; Token nur verschlüsselt (v2) und nur mit Anmeldung", async () => {
    await neueApp();
    await expect(neueApp()).rejects.toMatchObject({ code: "eingabe_ungueltig" });
    expect(await codeOf(neueApp({ shortName: "a__b" }))).toBe("eingabe_ungueltig");
    expect(await codeOf(neueApp({ shortName: "zwei", tokenEnc: "klartext-token" }))).toBe(
      "eingabe_ungueltig",
    );
    expect(await codeOf(neueApp({ shortName: "drei", tokenEnc: `v1:${"a".repeat(8)}:b:c` }))).toBe(
      "eingabe_ungueltig",
    );
    expect(await codeOf(neueApp({ shortName: "vier", authKind: "keine" }))).toBe(
      "eingabe_ungueltig",
    );
    expect(
      await codeOf(neueApp({ shortName: "fuenf", authKind: "token", tokenEnc: undefined })),
    ).toBe("eingabe_ungueltig");
  });
});

describe("Werkzeuge: Namen einmal vergeben", () => {
  it("vergibt Modell-Name und Kennung beim ersten Sehen und ändert sie nie", async () => {
    const app = await neueApp();
    const erste = await apps.sehen(db, app.id, [werkzeug("suchen"), werkzeug("lesen", "2")]);
    const suchen = erste.find((e) => e.tool.originalName === "suchen")?.tool;
    expect(suchen).toMatchObject({
      modelName: "notizen__suchen",
      toolKey: "mcp/notizen/suchen",
      version: 1,
      status: "neu",
      toolClass: "schreiben",
    });
    // Neue Liste mit einem Werkzeug davor: bestehende Namen bleiben.
    await apps.sehen(db, app.id, [
      werkzeug("alpha", "3"),
      werkzeug("suchen"),
      werkzeug("lesen", "2"),
    ]);
    const danach = await apps.toolByModelName(db, "notizen__suchen");
    expect(danach?.toolId).toBe(suchen?.toolId);
    expect((await apps.toolByModelName(db, "notizen__alpha"))?.version).toBe(1);
  });

  it("zwei Apps mit gleichem Werkzeug-Namen bekommen verschiedene Namen; Kollisionen zählen hoch", async () => {
    const a = await neueApp();
    const b = await neueApp({ shortName: "kalender", url: "https://kal.beispiel.test/mcp" });
    await apps.sehen(db, a.id, [werkzeug("search")]);
    await apps.sehen(db, b.id, [werkzeug("search", "2")]);
    expect((await apps.currentTools(db, a.id))[0]?.modelName).toBe("notizen__search");
    expect((await apps.currentTools(db, b.id))[0]?.modelName).toBe("kalender__search");
    // Zwei Original-Namen, die gleich bereinigt werden.
    await apps.sehen(db, a.id, [werkzeug("search"), werkzeug("a b", "3"), werkzeug("a.b", "4")]);
    const namen = (await apps.currentTools(db, a.id)).map((t) => t.modelName).sort();
    expect(new Set(namen).size).toBe(namen.length);
    expect(namen).toContain("notizen__a_b");
    expect(namen).toContain("notizen__a_b_2");
  });

  it("die Datenbank hält den Modell-Namen eindeutig und fest", async () => {
    const app = await neueApp();
    const [erste] = await apps.sehen(db, app.id, [werkzeug("suchen")]);
    const tool = erste?.tool;
    if (tool === undefined) throw new Error("Werkzeug fehlt");
    const roh = (toolId: string, name: string, version: number, status = "neu") =>
      ctx.client.query(
        `insert into app_tools (tool_id, version, app_id, original_name, model_name, tool_key, tool_digest, input_schema, status, tool_class)
         values ($1, $2, $3, 'x', $4, 'mcp/notizen/x', $5, '{}', $6, 'schreiben')`,
        [toolId, version, app.id, name, abdruck("9"), status],
      );
    // Gleicher Modell-Name für ein anderes Werkzeug.
    expect(await codeOf(roh(newId("tool"), tool.modelName, 1))).toBe(EINDEUTIG);
    // Neue Fassung mit anderem Modell-Namen.
    expect(await codeOf(roh(tool.toolId, "notizen__anders", 2))).toBe(RESTRICT);
  });
});

describe("Werkzeuge: Stand und Einstufung", () => {
  it("Fassung 1 ist immer „neu“ und schreibt; der Worker kann nicht bestätigen", async () => {
    const app = await neueApp();
    const [erste] = await apps.sehen(db, app.id, [werkzeug("suchen")]);
    const tool = erste?.tool;
    if (tool === undefined) throw new Error("Werkzeug fehlt");
    // Rohes „bestätigt“ ohne Entscheidung des Besitzers.
    const f = await codeOf(
      db.insert(appTools).values({
        ...tool,
        version: 2,
        status: "bestaetigt",
        toolClass: "lesen",
        actionId: newId("action"),
        seenDigest: tool.toolDigest,
        targetDigest: zielAbdruck(app.id, app.url),
        createdAt: undefined,
      }),
    );
    expect(f).toBe(RESTRICT);
    expect((await apps.currentTool(db, tool.toolId))?.status).toBe("neu");
  });

  it("bestätigen geht nur mit passender Entscheidung des Besitzers", async () => {
    const app = await neueApp();
    const [erste] = await apps.sehen(db, app.id, [werkzeug("suchen")]);
    const tool = erste?.tool;
    if (tool === undefined) throw new Error("Werkzeug fehlt");
    const ziel = zielAbdruck(app.id, app.url);
    const einstufung = (actionId: Awaited<ReturnType<BelegKette["entscheidung"]>>) =>
      apps.einstufen(db, {
        toolId: tool.toolId,
        toolClass: "lesen",
        actionId,
        seenDigest: tool.toolDigest,
        targetDigest: ziel,
      });
    const basis = {
      appId: app.id,
      toolId: tool.toolId,
      toolClass: "lesen" as const,
      toolDigest: tool.toolDigest,
      targetDigest: ziel,
      toolStatus: "neu" as const,
      toolVersion: 1,
    };
    // Keine Entscheidung zu dieser Kennung.
    await expect(einstufung(newId("action"))).rejects.toThrow();
    // Entscheidung abgelehnt.
    await expect(
      einstufung(await kette.werkzeugBestaetigen({ ...basis, outcome: "deny" })),
    ).rejects.toThrow();
    // Anderer Akteur (Bot).
    await expect(
      einstufung(await kette.werkzeugBestaetigen({ ...basis, actor: `bot:${botId}` })),
    ).rejects.toThrow();
    // Anderes Werkzeug, andere Einstufung, anderer Abdruck, anderes Ziel, andere Fassung.
    await expect(
      einstufung(await kette.werkzeugBestaetigen({ ...basis, toolId: newId("tool") })),
    ).rejects.toThrow();
    await expect(
      einstufung(await kette.werkzeugBestaetigen({ ...basis, toolClass: "schreiben" })),
    ).rejects.toThrow();
    await expect(
      einstufung(await kette.werkzeugBestaetigen({ ...basis, toolDigest: abdruck("e") })),
    ).rejects.toThrow();
    await expect(
      einstufung(await kette.werkzeugBestaetigen({ ...basis, targetDigest: abdruck("f") })),
    ).rejects.toThrow();
    await expect(
      einstufung(await kette.werkzeugBestaetigen({ ...basis, toolVersion: 7 })),
    ).rejects.toThrow();
    expect((await apps.currentTool(db, tool.toolId))?.status).toBe("neu");
    // Passende Entscheidung: bestätigt, und sie lässt sich nur einmal benutzen.
    const gut = await kette.werkzeugBestaetigen(basis);
    const bestaetigt = await einstufung(gut);
    expect(bestaetigt).toMatchObject({ status: "bestaetigt", toolClass: "lesen", version: 2 });
    await expect(einstufung(gut)).rejects.toThrow();
  });

  it("gesehener Abdruck ≠ gespeicherter: nichts wird bestätigt", async () => {
    const app = await neueApp();
    const [erste] = await apps.sehen(db, app.id, [werkzeug("suchen")]);
    const tool = erste?.tool;
    if (tool === undefined) throw new Error("Werkzeug fehlt");
    const ziel = zielAbdruck(app.id, app.url);
    const actionId = await kette.werkzeugBestaetigen({
      appId: app.id,
      toolId: tool.toolId,
      toolClass: "lesen",
      toolDigest: tool.toolDigest,
      seenToolDigest: abdruck("d"),
      targetDigest: ziel,
      toolStatus: "neu",
      toolVersion: 1,
    });
    await expect(
      apps.einstufen(db, {
        toolId: tool.toolId,
        toolClass: "lesen",
        actionId,
        seenDigest: abdruck("d"),
        targetDigest: ziel,
      }),
    ).rejects.toThrow();
  });

  it("geänderter Abdruck → „geändert“, nicht mehr bestätigt; entfernt und wieder da → „neu“", async () => {
    const app = await neueApp();
    const [erste] = await apps.sehen(db, app.id, [werkzeug("suchen")]);
    const tool = erste?.tool;
    if (tool === undefined) throw new Error("Werkzeug fehlt");
    await bestaetigen(app, tool.toolId);
    expect((await apps.currentTool(db, tool.toolId))?.status).toBe("bestaetigt");
    // Gleiche Liste: nichts ändert sich.
    const gleich = await apps.sehen(db, app.id, [werkzeug("suchen")]);
    expect(gleich[0]?.change).toBe("unveraendert");
    // Andere Beschreibung (anderer Abdruck): geändert, Einstufung zurück auf „schreibt“.
    const geaendert = await apps.sehen(db, app.id, [werkzeug("suchen", "7")]);
    expect(geaendert[0]).toMatchObject({
      change: "geaendert",
      tool: { status: "geaendert", toolClass: "schreiben", actionId: null },
    });
    expect(
      await apps.confirmedTool(db, { modelName: tool.modelName, toolDigest: abdruck("1") }),
    ).toBe(undefined);
    // Fehlt in der Liste: entfernt; kommt wieder: neu.
    const weg = await apps.sehen(db, app.id, []);
    expect(weg[0]?.tool.status).toBe("entfernt");
    const wieder = await apps.sehen(db, app.id, [werkzeug("suchen", "7")]);
    expect(wieder[0]).toMatchObject({ change: "wieder_da", tool: { status: "neu" } });
  });

  it("„bestätigtes Werkzeug mit unverändertem Abdruck“ liefert beide Abdrücke der Bestätigung", async () => {
    const app = await neueApp();
    const [erste] = await apps.sehen(db, app.id, [werkzeug("suchen")]);
    const tool = erste?.tool;
    if (tool === undefined) throw new Error("Werkzeug fehlt");
    expect(
      await apps.confirmedTool(db, { modelName: tool.modelName, toolDigest: tool.toolDigest }),
    ).toBe(undefined);
    await bestaetigen(app, tool.toolId);
    const treffer = await apps.confirmedTool(db, {
      modelName: tool.modelName,
      toolDigest: tool.toolDigest,
    });
    expect(treffer).toMatchObject({
      confirmedToolDigest: tool.toolDigest,
      confirmedTargetDigest: zielAbdruck(app.id, app.url),
      tool: { status: "bestaetigt", toolClass: "lesen" },
    });
    expect(
      await apps.confirmedTool(db, { modelName: tool.modelName, toolDigest: abdruck("5") }),
    ).toBe(undefined);
    expect(
      await apps.confirmedTool(db, { modelName: "gibt_es_nicht", toolDigest: tool.toolDigest }),
    ).toBe(undefined);
  });

  it("die Abdruck-Rechnung der Datenbank stimmt mit der des Codes überein", async () => {
    const app = await neueApp();
    const { rows } = await ctx.client.query<{ d: string }>(
      "select paibot_app_ziel_abdruck($1, $2) as d",
      [app.id, app.url],
    );
    expect(rows[0]?.d).toBe(zielAbdruck(app.id, app.url));
  });
});

describe("Adress- und Token-Wechsel, Trennen", () => {
  async function mitBestaetigtemWerkzeug() {
    const app = await neueApp();
    const [erste] = await apps.sehen(db, app.id, [werkzeug("suchen"), werkzeug("lesen", "2")]);
    for (const e of erste === undefined ? [] : [erste]) await bestaetigen(app, e.tool.toolId);
    const zweites = (await apps.currentTools(db, app.id)).find((t) => t.originalName === "lesen");
    if (zweites === undefined) throw new Error("Werkzeug fehlt");
    await bestaetigen(app, zweites.toolId, "schreiben");
    return app;
  }

  it("Token-Wechsel bei gleicher Adresse: alle Werkzeuge wieder „neu“", async () => {
    const app = await mitBestaetigtemWerkzeug();
    expect((await apps.currentTools(db, app.id)).map((t) => t.status).sort()).toEqual([
      "bestaetigt",
      "bestaetigt",
    ]);
    await apps.changeAccess(db, app.id, {
      tokenEnc: `v2:${"d".repeat(16)}:${"e".repeat(22)}:${"f".repeat(40)}`,
    });
    const danach = await apps.currentTools(db, app.id);
    expect(danach.map((t) => t.status)).toEqual(["neu", "neu"]);
    expect(danach.every((t) => t.toolClass === "schreiben" && t.actionId === null)).toBe(true);
    expect(
      await apps.confirmedTool(db, {
        modelName: danach[0]?.modelName ?? "",
        toolDigest: danach[0]?.toolDigest ?? abdruck("0"),
      }),
    ).toBe(undefined);
    // Die Vorgeschichte bleibt.
    expect((await apps.toolHistory(db, danach[0]?.toolId as never)).map((t) => t.status)).toEqual([
      "neu",
      "bestaetigt",
      "neu",
    ]);
  });

  it("Adresswechsel: alle Werkzeuge wieder „neu“, auch die gesperrten", async () => {
    const app = await mitBestaetigtemWerkzeug();
    const [t] = await apps.currentTools(db, app.id);
    if (t === undefined) throw new Error("Werkzeug fehlt");
    await bestaetigen(app, t.toolId, "gesperrt");
    await apps.changeAccess(db, app.id, {
      url: "https://anders.beispiel.test/mcp",
      tokenEnc: tokenV2(),
    });
    expect((await apps.currentTools(db, app.id)).map((x) => x.status)).toEqual(["neu", "neu"]);
  });

  it("ohne Änderung von Adresse oder Zugang bleibt alles; der Name ändert nichts an den Werkzeugen", async () => {
    const app = await mitBestaetigtemWerkzeug();
    await apps.update(db, app.id, { name: "Neue Notizen", serverVersion: "1.2.3" });
    expect((await apps.currentTools(db, app.id)).map((t) => t.status)).toEqual([
      "bestaetigt",
      "bestaetigt",
    ]);
  });

  it("getrennte App: Zugang weg, Zugriff „keiner“, keine neuen Werkzeuge, Rest bleibt erhalten", async () => {
    const app = await mitBestaetigtemWerkzeug();
    await apps.setAccess(db, {
      appId: app.id,
      botId,
      access: "lesen",
      actionId: await kette.zugriffSetzen({ appId: app.id, botId, access: "lesen" }),
    });
    expect(await apps.currentAccess(db, app.id, botId)).toBe("lesen");
    const getrennt = await apps.disconnect(db, app.id);
    expect(getrennt).toMatchObject({ state: "getrennt", tokenSet: false });
    expect(await apps.getTokenEnc(db, app.id)).toBeUndefined();
    expect(await apps.currentAccess(db, app.id, botId)).toBe("keiner");
    expect(await apps.readableApps(db, botId)).toEqual([]);
    await expect(apps.sehen(db, app.id, [])).rejects.toThrow();
    expect(await apps.disconnect(db, app.id)).toBeUndefined();
    expect(await apps.currentTools(db, app.id)).toHaveLength(2);
    // Roh: Token trotz Trennung ist unmöglich.
    expect(
      await codeOf(
        ctx.client.query("update apps set token_enc = $2 where id = $1", [app.id, tokenV2()]),
      ),
    ).toBe(RESTRICT);
  });

  it("erneutes Verbinden: höhere Verbindungsnummer, früherer Zugriff gilt nicht, Werkzeuge „neu“", async () => {
    const app = await mitBestaetigtemWerkzeug();
    await apps.setAccess(db, {
      appId: app.id,
      botId,
      access: "lesen",
      actionId: await kette.zugriffSetzen({ appId: app.id, botId, access: "lesen" }),
    });
    await apps.disconnect(db, app.id);
    // Roh: Beim erneuten Verbinden steigt die Nummer um genau eins.
    expect(
      await codeOf(
        ctx.client.query(
          "update apps set state = 'verbunden', disconnected_at = null, connection_no = 5, auth_kind = 'keine' where id = $1",
          [app.id],
        ),
      ),
    ).toBe(RESTRICT);
    const wieder = await apps.reconnect(db, app.id, { authKind: "token", tokenEnc: tokenV2() });
    expect(wieder).toMatchObject({ state: "verbunden", connectionNo: 2 });
    expect(await apps.currentAccess(db, app.id, botId)).toBe("keiner");
    expect((await apps.currentTools(db, app.id)).map((t) => t.status)).toEqual(["neu", "neu"]);
    expect(await apps.reconnect(db, app.id, { authKind: "keine" })).toBeUndefined();
    // Roh: Verbindungsnummer lässt sich nicht beliebig setzen.
    expect(
      await codeOf(ctx.client.query("update apps set connection_no = 9 where id = $1", [app.id])),
    ).toBe(RESTRICT);
  });

  it("Token ohne Anmeldung nach dem Trennen: Anmeldung mit Token verlangt wieder ein Token", async () => {
    const app = await neueApp();
    await apps.disconnect(db, app.id);
    expect(await codeOf(apps.reconnect(db, app.id, { authKind: "token" }))).toBe(
      "eingabe_ungueltig",
    );
  });
});

describe("Zugriff der Bots", () => {
  it("ohne Zeile „keiner“; nur mit Entscheidung des Besitzers; die letzte Zeile gilt", async () => {
    const app = await neueApp();
    expect(await apps.currentAccess(db, app.id, botId)).toBe("keiner");
    await expect(
      apps.setAccess(db, { appId: app.id, botId, access: "lesen", actionId: newId("action") }),
    ).rejects.toThrow();
    // Abgelehnte Entscheidung, anderer Bot, anderer Zugriff.
    await expect(
      apps.setAccess(db, {
        appId: app.id,
        botId,
        access: "lesen",
        actionId: await kette.zugriffSetzen({
          appId: app.id,
          botId,
          access: "lesen",
          outcome: "deny",
        }),
      }),
    ).rejects.toThrow();
    await expect(
      apps.setAccess(db, {
        appId: app.id,
        botId,
        access: "lesen",
        actionId: await kette.zugriffSetzen({
          appId: app.id,
          botId: newId("bot"),
          access: "lesen",
        }),
      }),
    ).rejects.toThrow();
    await expect(
      apps.setAccess(db, {
        appId: app.id,
        botId,
        access: "lesen",
        actionId: await kette.zugriffSetzen({ appId: app.id, botId, access: "keiner" }),
      }),
    ).rejects.toThrow();
    expect(await apps.currentAccess(db, app.id, botId)).toBe("keiner");
    const gut = await kette.zugriffSetzen({ appId: app.id, botId, access: "lesen" });
    await apps.setAccess(db, { appId: app.id, botId, access: "lesen", actionId: gut });
    expect(await apps.currentAccess(db, app.id, botId)).toBe("lesen");
    expect(await apps.readableApps(db, botId)).toEqual([app.id]);
    // Dieselbe Entscheidung nicht zweimal.
    await expect(
      apps.setAccess(db, { appId: app.id, botId, access: "lesen", actionId: gut }),
    ).rejects.toThrow();
    await apps.setAccess(db, {
      appId: app.id,
      botId,
      access: "keiner",
      actionId: await kette.zugriffSetzen({ appId: app.id, botId, access: "keiner" }),
    });
    expect(await apps.currentAccess(db, app.id, botId)).toBe("keiner");
  });

  it("ein anderer Bot hat keinen Zugriff; ein Bot, den es nicht gibt, bekommt keinen", async () => {
    const app = await neueApp();
    const fremd = botRow();
    await db.insert(bots).values(fremd);
    await apps.setAccess(db, {
      appId: app.id,
      botId,
      access: "lesen",
      actionId: await kette.zugriffSetzen({ appId: app.id, botId, access: "lesen" }),
    });
    expect(await apps.currentAccess(db, app.id, fremd.id)).toBe("keiner");
    const unbekannt = newId("bot");
    await expect(
      apps.setAccess(db, {
        appId: app.id,
        botId: unbekannt,
        access: "lesen",
        actionId: await kette.zugriffSetzen({ appId: app.id, botId: unbekannt, access: "lesen" }),
      }),
    ).rejects.toThrow();
  });
});

describe("Nur anhängen", () => {
  it("app_tools und bot_app_grants lassen sich weder ändern noch löschen noch leeren", async () => {
    const app = await neueApp();
    await apps.sehen(db, app.id, [werkzeug("suchen")]);
    await apps.setAccess(db, {
      appId: app.id,
      botId,
      access: "lesen",
      actionId: await kette.zugriffSetzen({ appId: app.id, botId, access: "lesen" }),
    });
    for (const sql of [
      "update app_tools set description = 'x'",
      "delete from app_tools",
      "truncate app_tools",
      "update bot_app_grants set access = 'keiner'",
      "delete from bot_app_grants",
      "truncate bot_app_grants",
    ]) {
      expect(await codeOf(ctx.client.query(sql)), sql).toBe(RESTRICT);
    }
    // Eine App lässt sich auch nicht löschen, solange sie Werkzeuge hat.
    expect(await codeOf(ctx.client.query("delete from apps"))).toBe(RESTRICT);
  });
});

describe("Fremde Inhalte an Nachrichten", () => {
  async function unterhaltung() {
    const konv = conversationRow(botId);
    await db.insert(conversations).values(konv);
    const frage = messageRow(konv.id);
    await db.insert(messageTable).values(frage as never);
    const lauf = runRow({ conversationId: konv.id, triggerMessageId: frage.id, botId });
    await db.insert(runs).values(lauf);
    return { konv, frage, lauf };
  }

  it("standardmäßig nicht gekennzeichnet; einmal gesetzt nie zurückgenommen", async () => {
    const { konv, lauf } = await unterhaltung();
    const m = await messages.insert(db, {
      conversationId: konv.id,
      role: "assistant",
      runId: lauf.id,
      step: 0,
    });
    expect(await messages.anyUntrusted(db, [m.id])).toBe(false);
    await messages.markUntrusted(db, m.id);
    expect(await messages.anyUntrusted(db, [m.id])).toBe(true);
    expect(await messages.untrustedIds(db, [m.id])).toEqual([m.id]);
    expect(
      await codeOf(ctx.client.query("update messages set untrusted = false where id = $1", [m.id])),
    ).toBe(RESTRICT);
  });

  it("Vererbung im Lauf: spätere Nachrichten eines gekennzeichneten Laufs erben; Kette über zwei Läufe", async () => {
    const { konv, lauf } = await unterhaltung();
    const erste = await messages.insert(db, {
      conversationId: konv.id,
      role: "assistant",
      runId: lauf.id,
      step: 0,
    });
    expect(await messages.markRunUntrusted(db, lauf.id)).toBe(1);
    const zweite = await messages.insert(db, {
      conversationId: konv.id,
      role: "assistant",
      runId: lauf.id,
      step: 1,
    });
    expect(await messages.untrustedIds(db, [erste.id, zweite.id])).toEqual([erste.id, zweite.id]);
    // Lauf 2 ohne Werkzeug: sein Verlauf enthält die gekennzeichnete Antwort; das spätere Paket für den Lauf kennzeichnet die
    // Antworten dieses Laufs, 50 weitere Nachrichten ändern daran nichts.
    const frage2 = messageRow(konv.id);
    await db.insert(messageTable).values(frage2 as never);
    const lauf2 = runRow({ conversationId: konv.id, triggerMessageId: frage2.id, botId });
    await db
      .insert(runs)
      .values({ ...lauf2, status: "succeeded" } as never)
      .catch(() => undefined);
    for (let i = 0; i < 50; i++)
      await messages.insert(db, { conversationId: konv.id, role: "user" });
    expect(await messages.anyUntrusted(db, [erste.id])).toBe(true);
    // Nachrichten anderer Läufe erben nicht.
    const unbelastet = await messages.insert(db, { conversationId: konv.id, role: "user" });
    expect(await messages.anyUntrusted(db, [unbelastet.id])).toBe(false);
  });

  it("neue Nachricht mit Kennzeichen von Anfang an", async () => {
    const { konv } = await unterhaltung();
    const m = await messages.insert(db, { conversationId: konv.id, role: "user", untrusted: true });
    expect(await messages.anyUntrusted(db, [m.id])).toBe(true);
  });
});

describe("Regel R-014 und Werte der Aktionen", () => {
  it("R-014 steht genau wie der Vertrag in der Datenbank", async () => {
    const aktiv = await rules.listActive(db);
    const r014 = aktiv.find((r) => r.id === "R-014");
    expect(r014).toBeDefined();
    expect(ruleContent(r014 as never)).toEqual(R014_V1);
    expect(STANDARD_RULE_VERSIONS.map((r) => r.id)).toContain("R-014");
    const alle = await ctx.client.query<{ id: string }>("select id from rules where id = 'R-014'");
    expect(alle.rows).toHaveLength(1);
  });

  it("Regeln und Belege kennen die vier Aktionen für Apps, nicht mehr", async () => {
    for (const aktion of [
      "app.verbinden",
      "app.werkzeuge_bestaetigen",
      "app.zugriff_setzen",
      "app.trennen",
    ]) {
      const { rows } = await ctx.client.query<{ ok: boolean }>(
        `select (select true from pg_constraint where conname = 'rules_action_werte' and pg_get_constraintdef(oid) like '%' || $1 || '%') as ok`,
        [`'${aktion}'`],
      );
      expect(rows[0]?.ok, aktion).toBe(true);
    }
    for (const aktion of ["app.aendern", "app.oauth_starten", "regel.anlegen"]) {
      const { rows } = await ctx.client.query<{ ok: boolean | null }>(
        `select (select true from pg_constraint where conname = 'belege_action_werte' and pg_get_constraintdef(oid) like '%' || $1 || '%') as ok`,
        [`'${aktion}'`],
      );
      expect(rows[0]?.ok, aktion).toBeNull();
    }
  });
});

describe("Aufrufe von App-Werkzeugen", () => {
  it("ein Aufruf mit Quelle mcp gehört zu einer gespeicherten Fassung eines Werkzeugs dieser App", async () => {
    const app = await neueApp();
    const [erste] = await apps.sehen(db, app.id, [werkzeug("suchen")]);
    const tool = erste?.tool;
    if (tool === undefined) throw new Error("Werkzeug fehlt");
    const konv = conversationRow(botId);
    await db.insert(conversations).values(konv);
    const frage = messageRow(konv.id);
    await db.insert(messageTable).values(frage as never);
    const lauf = runRow({ conversationId: konv.id, triggerMessageId: frage.id, botId });
    await db.insert(runs).values(lauf);
    const antwort = await messages.insert(db, {
      conversationId: konv.id,
      role: "assistant",
      runId: lauf.id,
      step: 0,
    });
    const basis = toolCallRow(
      { conversationId: konv.id, runId: lauf.id, messageId: antwort.id },
      {
        name: tool.modelName,
        source: "mcp",
        server: "notizen",
        toolKey: tool.toolKey,
        toolDigest: tool.toolDigest,
        reach: "nach_aussen",
        foreignContent: true,
      },
    );
    // Ohne App-Angaben, mit falscher Fassung, falscher App: abgelehnt.
    expect(await codeOf(db.insert(toolCalls).values(basis))).toBe(CHECK);
    expect(
      await codeOf(
        db.insert(toolCalls).values({
          ...basis,
          appId: app.id,
          appToolId: tool.toolId,
          toolVersion: 9,
          position: 1,
          callId: "c1",
        }),
      ),
    ).toBe(CHECK);
    expect(
      await codeOf(
        db.insert(toolCalls).values({
          ...basis,
          appId: app.id,
          appToolId: newId("tool"),
          toolVersion: 1,
          position: 2,
          callId: "c2",
        }),
      ),
    ).toBe(CHECK);
    // Nur ein Teil der Angaben: Einschränkung.
    expect(
      await codeOf(
        db.insert(toolCalls).values({ ...basis, appId: app.id, position: 3, callId: "c3" }),
      ),
    ).toBe(CHECK);
    // Eingebautes Werkzeug mit App-Angaben: abgelehnt.
    expect(
      await codeOf(
        db.insert(toolCalls).values({
          ...toolCallRow(
            { conversationId: konv.id, runId: lauf.id, messageId: antwort.id },
            { position: 4, callId: "c4" },
          ),
          appId: app.id,
          appToolId: tool.toolId,
          toolVersion: 1,
        }),
      ),
    ).toBe(CHECK);
    // Passend: geht; die Angaben sind danach fest.
    await db.insert(toolCalls).values({
      ...basis,
      appId: app.id,
      appToolId: tool.toolId,
      toolVersion: 1,
      position: 5,
      callId: "c5",
    });
    expect(
      await codeOf(ctx.client.query("update tool_calls set tool_version = 2 where call_id = 'c5'")),
    ).toBe(RESTRICT);
  });
});
