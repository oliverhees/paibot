/**
 * PaiBot – Test: Anschluss an Apps (MCP) im Worker – Hülle, Zugang, Zuordnung der Fehler
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { randomBytes } from "node:crypto";
import { AppListeFehler } from "@paibot/agents";
import { deriveKey, encryptSecret, loadMasterSecret } from "@paibot/crypto";
import { type Database, repo } from "@paibot/db";
import { createTestDb } from "@paibot/db/testing";
import { McpSchichtFehler } from "@paibot/mcp";
import { appTokenBinding, secretAad } from "@paibot/shared/bindung";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { baueAppAnschluss } from "./app-anschluss";
import type { WorkerLog } from "./protokoll";

const holeWerkzeuge = vi.hoisted(() => vi.fn());
const rufeWerkzeugAuf = vi.hoisted(() => vi.fn());

vi.mock("@paibot/mcp", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@paibot/mcp")>();
  return { ...echt, holeWerkzeuge, rufeWerkzeugAuf };
});

const URL_APP = "https://mcp.notizen.beispiel.test/mcp";
const TOKEN = "tok-GEHEIM-4711-abcdefghijklmnop";

let db: Database;
let secretsKey: ReturnType<typeof deriveKey<"secrets-v1">>;
let basisFetch: ReturnType<typeof vi.fn>;
const logZeilen: string[] = [];
const log: WorkerLog = {
  info: (m) => logZeilen.push(m),
  warn: (m) => logZeilen.push(m),
  error: (m) => logZeilen.push(m),
};

async function neueApp(extra: { url?: string; tokenFuerUrl?: string } = {}) {
  const url = extra.url ?? URL_APP;
  const id = (await import("@paibot/shared/ids")).newId("app");
  const app = await repo.apps.create(db, {
    id,
    shortName: "notizen",
    name: "Notizen",
    url,
    authKind: "token",
    tokenEnc: encryptSecret(TOKEN, secretsKey, {
      aad: secretAad(appTokenBinding(id, extra.tokenFuerUrl ?? url)),
    }),
  });
  return app;
}

function anschluss() {
  return baueAppAnschluss({
    db,
    secretsKey,
    log,
    basisFetch: basisFetch as unknown as typeof fetch,
  });
}

const info = (app: { id: never; shortName: string; url: string }) => ({
  id: app.id,
  kurzname: app.shortName,
  url: app.url,
});

const ROH = {
  originalName: "suche",
  modellName: "notizen__suche",
  abdruck: `sha256:${"1".repeat(64)}`,
  beschreibung: "Sucht.",
  schemaFuerModell: { type: "object" },
  bestaetigbar: true,
  hinweise: { nurLesend: true, destruktiv: false },
  pruefer: (a: unknown) => ({ ok: typeof a === "object" && a !== null, wert: {} }),
};

beforeEach(async () => {
  ({ db } = await createTestDb());
  secretsKey = deriveKey(
    loadMasterSecret({ PAIBOT_SECRET: randomBytes(32).toString("base64") }),
    "secrets-v1",
  );
  holeWerkzeuge.mockReset();
  rufeWerkzeugAuf.mockReset();
  basisFetch = vi.fn(async () => new Response("{}"));
  logZeilen.length = 0;
});

describe("Anschluss an Apps im Worker", () => {
  it("ruft die Liste mit dem entschlüsselten Zugang, der Hülle und den Namen aus der Datenbank ab", async () => {
    const app = await neueApp();
    holeWerkzeuge.mockResolvedValue({
      werkzeuge: [ROH],
      serverName: "x",
      seiten: 1,
      abgeschnitten: false,
    });
    const lauf = anschluss().neuerLauf();
    const signal = new AbortController().signal;
    const liste = await lauf.holeListe({
      app: info(app as never),
      bekannteNamen: new Map([["suche", "notizen__suche"]]),
      bereitsVergeben: new Set(["wiki__suche"]),
      signal,
    });
    const optionen = holeWerkzeuge.mock.calls[0]?.[0];
    expect(optionen).toMatchObject({
      adresse: URL_APP,
      token: TOKEN,
      appKurzname: "notizen",
      signal,
    });
    expect(optionen.bekannteNamen).toEqual(new Map([["suche", "notizen__suche"]]));
    expect(optionen.bereitsVergeben).toEqual(new Set(["wiki__suche"]));
    expect(liste).toEqual([
      {
        originalName: "suche",
        abdruck: ROH.abdruck,
        beschreibung: "Sucht.",
        schemaFuerModell: { type: "object" },
        bestaetigbar: true,
        hinweisNurLesen: true,
        hinweisZerstoerend: false,
      },
    ]);
    // Der Zugang steht nirgends in dem, was der Lauf zurückbekommt.
    expect(JSON.stringify(liste)).not.toContain(TOKEN);
  });

  // Gegenprobe: `globalThis.fetch` statt der Hülle hineinreichen → die Anfrage an ein fremdes Ziel geht hinaus, rot.
  it("das hineingereichte fetch ist die Hülle mit genau einem Ziel: das Origin der App; alles andere wird nie versendet", async () => {
    const app = await neueApp();
    holeWerkzeuge.mockResolvedValue({
      werkzeuge: [],
      serverName: "x",
      seiten: 0,
      abgeschnitten: false,
    });
    await anschluss()
      .neuerLauf()
      .holeListe({
        app: info(app as never),
        bekannteNamen: new Map(),
        bereitsVergeben: new Set(),
        signal: new AbortController().signal,
      });
    const huelle = holeWerkzeuge.mock.calls[0]?.[0].fetch as typeof fetch;
    await expect(huelle("https://anderes.beispiel.test/mcp", { method: "POST" })).rejects.toThrow();
    await expect(huelle("https://mcp.notizen.beispiel.test:8443/mcp")).rejects.toThrow();
    await expect(huelle("http://mcp.notizen.beispiel.test/mcp")).rejects.toThrow();
    expect(basisFetch).not.toHaveBeenCalled();
  });

  it("ungültige gespeicherte Namen sind ein fester Grund, nie der Text der Schicht", async () => {
    const app = await neueApp();
    holeWerkzeuge.mockRejectedValue(new McpSchichtFehler("namen_ungueltig"));
    const fehler = await anschluss()
      .neuerLauf()
      .holeListe({
        app: info(app as never),
        bekannteNamen: new Map(),
        bereitsVergeben: new Set(),
        signal: new AbortController().signal,
      })
      .catch((e) => e);
    expect(fehler).toBeInstanceOf(AppListeFehler);
    expect(fehler.grund).toBe("namen_ungueltig");
  });

  it("jeder andere Fehler wird zu „nicht erreichbar“ ohne seinen Text", async () => {
    const app = await neueApp();
    holeWerkzeuge.mockRejectedValue(new Error(`connect ECONNREFUSED ${TOKEN}`));
    const fehler = await anschluss()
      .neuerLauf()
      .holeListe({
        app: info(app as never),
        bekannteNamen: new Map(),
        bereitsVergeben: new Set(),
        signal: new AbortController().signal,
      })
      .catch((e) => e);
    expect(fehler).toBeInstanceOf(AppListeFehler);
    expect(fehler.grund).toBe("nicht_erreichbar");
    expect(String(fehler.message)).not.toContain(TOKEN);
  });

  // Gegenprobe: die Bindung ohne die Adresse bilden → ein Zugang für eine andere Adresse lässt sich entschlüsseln, rot.
  it("ein Zugang, der für eine andere Adresse verschlüsselt wurde, lässt sich nicht verwenden: keine Anfrage", async () => {
    const app = await neueApp({ tokenFuerUrl: "https://mcp.fremd.beispiel.test/mcp" });
    const fehler = await anschluss()
      .neuerLauf()
      .holeListe({
        app: info(app as never),
        bekannteNamen: new Map(),
        bereitsVergeben: new Set(),
        signal: new AbortController().signal,
      })
      .catch((e) => e);
    expect(fehler).toBeInstanceOf(AppListeFehler);
    expect(holeWerkzeuge).not.toHaveBeenCalled();
  });

  it("eine getrennte App oder eine Adresse, die nicht der gespeicherten entspricht, löst keine Anfrage aus", async () => {
    const app = await neueApp();
    const lauf = anschluss().neuerLauf();
    const eingabe = {
      bekannteNamen: new Map<string, string>(),
      bereitsVergeben: new Set<string>(),
      signal: new AbortController().signal,
    };
    await expect(
      lauf.holeListe({
        ...eingabe,
        app: { ...info(app as never), url: "https://mcp.anders.beispiel.test/mcp" },
      }),
    ).rejects.toBeInstanceOf(AppListeFehler);
    await repo.apps.disconnect(db, app.id);
    await expect(lauf.holeListe({ ...eingabe, app: info(app as never) })).rejects.toBeInstanceOf(
      AppListeFehler,
    );
    expect(holeWerkzeuge).not.toHaveBeenCalled();
  });

  it("ein Aufruf geht nur an ein Werkzeug aus der Liste dieses Laufs und mit dem Zugang; das Ergebnis geht ohne Zusatz zurück", async () => {
    const app = await neueApp();
    holeWerkzeuge.mockResolvedValue({
      werkzeuge: [ROH],
      serverName: "x",
      seiten: 1,
      abgeschnitten: false,
    });
    rufeWerkzeugAuf.mockResolvedValue({
      status: "ok",
      text: "Treffer",
      gekuerzt: false,
      enthaeltFremdenText: true,
      ausgelasseneTeile: 0,
      fehlercode: null,
    });
    const lauf = anschluss().neuerLauf();
    const signal = new AbortController().signal;
    const eingabe = { app: info(app as never), argumente: { q: "x" }, signal };
    // Vor dem Abruf der Liste kennt dieser Lauf das Werkzeug nicht.
    expect(await lauf.rufeAuf({ ...eingabe, originalName: "suche" })).toMatchObject({
      status: "fehler",
      fehlercode: "werkzeug_unbekannt",
    });
    expect(rufeWerkzeugAuf).not.toHaveBeenCalled();
    await lauf.holeListe({
      app: info(app as never),
      bekannteNamen: new Map(),
      bereitsVergeben: new Set(),
      signal,
    });
    expect(lauf.pruefeArgumente(app.id, "suche", { q: "x" })).toBe(true);
    expect(lauf.pruefeArgumente(app.id, "anderes", { q: "x" })).toBe(false);
    expect(await lauf.rufeAuf({ ...eingabe, originalName: "suche" })).toEqual({
      status: "ok",
      text: "Treffer",
      gekuerzt: false,
      fehlercode: null,
    });
    expect(rufeWerkzeugAuf.mock.calls[0]?.[0]).toMatchObject({
      adresse: URL_APP,
      token: TOKEN,
      argumente: { q: "x" },
      signal,
      werkzeug: ROH,
    });
    // Ein zweiter Lauf teilt die Liste nicht.
    expect(
      await anschluss()
        .neuerLauf()
        .rufeAuf({ ...eingabe, originalName: "suche" }),
    ).toMatchObject({ status: "fehler" });
  });

  it("wirft ein Aufruf, kommt ein fester Satz zurück, nie der Text des Fehlers", async () => {
    const app = await neueApp();
    holeWerkzeuge.mockResolvedValue({
      werkzeuge: [ROH],
      serverName: "x",
      seiten: 1,
      abgeschnitten: false,
    });
    rufeWerkzeugAuf.mockRejectedValue(new Error(`Absturz ${TOKEN}`));
    const lauf = anschluss().neuerLauf();
    const signal = new AbortController().signal;
    await lauf.holeListe({
      app: info(app as never),
      bekannteNamen: new Map(),
      bereitsVergeben: new Set(),
      signal,
    });
    const ergebnis = await lauf.rufeAuf({
      app: info(app as never),
      originalName: "suche",
      argumente: { q: "x" },
      signal,
    });
    expect(ergebnis.status).toBe("fehler");
    expect(JSON.stringify(ergebnis)).not.toContain(TOKEN);
  });

  it("die Meldung über ein ausgeschlossenes Werkzeug schreibt nur einen festen Satz ins Log", () => {
    anschluss().meldeAusgeschlossen({
      appId: "app_x" as never,
      kennung: "mcp/notizen/geheimes-werkzeug",
      grund: "Werkzeug-Register: Beschreibung ungültig",
    });
    expect(logZeilen).toEqual(["Ein Werkzeug einer App wurde nicht angeboten."]);
  });
});
