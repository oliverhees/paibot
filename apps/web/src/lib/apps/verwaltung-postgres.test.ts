/**
 * PaiBot – Tests der App-Verwaltung gegen echtes Postgres: Das Trennen wartet auf einen laufenden
 * Abgleich höchstens `SPERR_WARTEZEIT_MS` und endet dann mit einer klaren Meldung. Das geht nur
 * mit zwei Verbindungen und echten Sperren (die Datenbank im Speicher hat nur eine).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { createDb, repo } from "@paibot/db";
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
  TEST_DATABASE_URL_ENV,
} from "@paibot/db/testing";
import { bereiteWerkzeugeAuf } from "@paibot/mcp";
import { afterAll, describe, expect, it, vi } from "vitest";
import { belegeSeit, eingerichtet, letzteNummer } from "../modelle/testing";
import { _ersetzeAppDienste } from "./dienste";
import { SPERR_WARTEZEIT_MS } from "./sperre";
import { appTrennen, appVerbinden, appZugriffSetzen } from "./verwaltung";

const BASIS_URL = process.env[TEST_DATABASE_URL_ENV];

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

describe.skipIf(BASIS_URL === undefined)("Trennen gegen echtes Postgres", () => {
  let datenbank: PostgresTestDatabase | undefined;
  afterAll(async () => {
    _ersetzeAppDienste(undefined);
    await datenbank?.drop();
  });

  it("ein laufender Abgleich hält die Zeile der App: das Trennen wartet höchstens die Sperr-Wartezeit und meldet klar", async () => {
    datenbank = await createPostgresTestDatabase(BASIS_URL ?? "");
    _ersetzeAppDienste({
      async werkzeugeAbrufen(abruf) {
        return {
          werkzeuge: bereiteWerkzeugeAuf(
            [{ name: "echo", description: "x", inputSchema: { type: "object", properties: {} } }],
            { appKurzname: abruf.appKurzname, bekannteNamen: abruf.bekannteNamen },
          ),
          serverName: "Beispiel",
          seiten: 1,
          abgeschnitten: false,
        };
      },
    });
    const hauptVerbindung = createDb(datenbank.url);
    const sperrVerbindung = createDb(datenbank.url);
    const haupt = hauptVerbindung.db;
    const sperrer = sperrVerbindung.db;
    const e = await eingerichtet({ db: haupt });
    const verbinden = e.u.handler("appVerbinden", appVerbinden);
    const trennen = e.u.handler("appTrennen", appTrennen);
    const r = await e.rufe(verbinden, "POST", "/api/apps", {
      koerper: { url: "https://mcp.beispiel.de/mcp" },
    });
    const id = (r.body.daten as { app: { id: string } }).app.id;

    // Ein anderer Vorgang (etwa ein Abgleich) hält die Zeile der App gesperrt.
    let freigeben: () => void = () => undefined;
    const gehalten = new Promise<void>((fertig) => {
      freigeben = fertig;
    });
    let gesperrt: () => void = () => undefined;
    const istGesperrt = new Promise<void>((fertig) => {
      gesperrt = fertig;
    });
    const halter = sperrer.transaction(async (tx) => {
      await tx.execute(`select id from apps where id = '${id}' for update`);
      gesperrt();
      await gehalten;
    });
    await istGesperrt;

    const vorher = await letzteNummer(e.u);
    const start = Date.now();
    const antwort = await e.rufe(trennen, "DELETE", `/api/apps/${id}`, { params: { id } });
    const dauer = Date.now() - start;
    expect(antwort.status).toBe(429);
    expect(antwort.body.fehler?.code).toBe("limit_erreicht");
    expect(dauer).toBeGreaterThanOrEqual(SPERR_WARTEZEIT_MS - 500);
    expect(dauer).toBeLessThan(SPERR_WARTEZEIT_MS + 5000);
    // Nichts getrennt, aber das Beleg-Paar des Versuchs steht da: Entscheidung und Ergebnis „Fehler“.
    expect((await belegeSeit(e.u, vorher)).map((b) => [b.typ, b.aktion])).toEqual([
      ["decision", "app.trennen"],
      ["result", "app.trennen"],
    ]);

    freigeben();
    await halter;
    expect((await repo.apps.get(haupt, id as never))?.state).toBe("verbunden");
    // Ohne laufenden Abgleich geht das Trennen sofort.
    const zweiter = await e.rufe(trennen, "DELETE", `/api/apps/${id}`, { params: { id } });
    expect(zweiter.status).toBe(200);
    expect((await repo.apps.get(haupt, id as never))?.state).toBe("getrennt");
    await hauptVerbindung.sql.end({ timeout: 2 });
    await sperrVerbindung.sql.end({ timeout: 2 });
  });
});

describe.skipIf(BASIS_URL === undefined)("Zugriff setzen gegen echtes Postgres", () => {
  let datenbank: PostgresTestDatabase | undefined;
  afterAll(async () => {
    _ersetzeAppDienste(undefined);
    await datenbank?.drop();
  });

  it("hält ein anderer Vorgang die Zeile der App, endet das Setzen nach der Wartezeit mit 429 limit_erreicht, ohne Zeile", async () => {
    datenbank = await createPostgresTestDatabase(BASIS_URL ?? "");
    _ersetzeAppDienste({
      async werkzeugeAbrufen(abruf) {
        return {
          werkzeuge: bereiteWerkzeugeAuf(
            [{ name: "echo", description: "x", inputSchema: { type: "object", properties: {} } }],
            { appKurzname: abruf.appKurzname, bekannteNamen: abruf.bekannteNamen },
          ),
          serverName: "Beispiel",
          seiten: 1,
          abgeschnitten: false,
        };
      },
    });
    const hauptVerbindung = createDb(datenbank.url);
    const sperrVerbindung = createDb(datenbank.url);
    const haupt = hauptVerbindung.db;
    const sperrer = sperrVerbindung.db;
    const e = await eingerichtet({ db: haupt });
    const bot = await repo.bots.getDefault(haupt);
    if (bot === undefined) throw new Error("kein Bot");
    const verbinden = e.u.handler("appVerbinden", appVerbinden);
    const zugriff = e.u.handler("appZugriffSetzen", appZugriffSetzen);
    const r = await e.rufe(verbinden, "POST", "/api/apps", {
      koerper: { url: "https://mcp.beispiel.de/mcp" },
    });
    const id = (r.body.daten as { app: { id: string } }).app.id;

    let freigeben: () => void = () => undefined;
    const gehalten = new Promise<void>((fertig) => {
      freigeben = fertig;
    });
    let gesperrt: () => void = () => undefined;
    const istGesperrt = new Promise<void>((fertig) => {
      gesperrt = fertig;
    });
    const halter = sperrer.transaction(async (tx) => {
      await tx.execute(`select id from apps where id = '${id}' for update`);
      gesperrt();
      await gehalten;
    });
    await istGesperrt;

    const start = Date.now();
    const antwort = await e.rufe(zugriff, "PUT", `/api/apps/${id}/zugriff/${bot.id}`, {
      params: { id, bot: bot.id },
      koerper: { zugriff: "lesen" },
    });
    const dauer = Date.now() - start;
    expect(antwort.status).toBe(429);
    expect(antwort.body.fehler?.code).toBe("limit_erreicht");
    expect(dauer).toBeGreaterThanOrEqual(SPERR_WARTEZEIT_MS - 500);
    expect(dauer).toBeLessThan(SPERR_WARTEZEIT_MS + 5000);

    freigeben();
    await halter;
    expect(await repo.apps.currentAccess(haupt, id as never, bot.id)).toBe("keiner");
    // Ohne den anderen Vorgang geht es sofort.
    const zweiter = await e.rufe(zugriff, "PUT", `/api/apps/${id}/zugriff/${bot.id}`, {
      params: { id, bot: bot.id },
      koerper: { zugriff: "lesen" },
    });
    expect(zweiter.status).toBe(200);
    await hauptVerbindung.sql.end({ timeout: 2 });
    await sperrVerbindung.sql.end({ timeout: 2 });
  });
});
