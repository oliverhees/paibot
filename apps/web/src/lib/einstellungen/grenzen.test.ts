/**
 * PaiBot – Tests der Route `/api/einstellungen`: Sitzung, CSRF, ungültige Werte, Glücksfall mit
 * Belegen, Ablehnung durch das Tor und der Verbrauch von heute.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { repo } from "@paibot/db";
import { LIMITS } from "@paibot/shared/konstanten";
import { describe, expect, it, vi } from "vitest";
import { einrichtungAbschliessen } from "../zugang/einrichtung";
import {
  anfrage,
  type Keksdose,
  TEST_CODE,
  TEST_PASSWORT,
  type TestUmgebung,
  testUmgebung,
  vorabDose,
} from "../zugang/testing";
import { einstellungenAendern, einstellungenLesen, tagesbeginn, tokenSeit } from "./grenzen";
import type { EinstellungenAnzeige, EinstellungenGespeichert } from "./typen";

vi.setConfig({ testTimeout: 60_000 });

const PFAD = "/api/einstellungen";

/** Eingerichtete Installation; die Dose trägt die Sitzung der Einrichtung. */
async function eingerichtet(): Promise<{ u: TestUmgebung; dose: Keksdose }> {
  const u = await testUmgebung();
  u.neuerCode(TEST_CODE);
  const abschluss = u.handler("einrichtungAbschliessen", async (k) => ({
    daten: await einrichtungAbschliessen(k),
  }));
  const dose = vorabDose();
  const r = await anfrage(u, abschluss, "POST", "/api/einrichtung", {
    dose,
    koerper: {
      setupCode: TEST_CODE,
      password: TEST_PASSWORT,
      passwordRepeat: TEST_PASSWORT,
      schleuseModeDefault: "off",
      botName: "Pai",
    },
  });
  if (r.status !== 200) throw new Error(`Einrichtung: ${r.status}`);
  return { u, dose };
}

function routen(u: TestUmgebung) {
  return {
    lesen: u.handler("einstellungen", async (k) => ({ daten: await einstellungenLesen(k) })),
    aendern: u.handler("einstellungenAendern", async (k) => ({
      daten: await einstellungenAendern(k),
    })),
  };
}

describe("GET /api/einstellungen", () => {
  it("ohne Sitzung: 401", async () => {
    const { u } = await eingerichtet();
    const r = await anfrage(u, routen(u).lesen, "GET", PFAD);
    expect(r.status).toBe(401);
    expect(r.body.fehler?.code).toBe("nicht_angemeldet");
  });

  it("liefert Zeitzone, Grenzen, Höchstwerte und den Verbrauch von heute", async () => {
    const { u, dose } = await eingerichtet();
    const r = await anfrage(u, routen(u).lesen, "GET", PFAD, { dose });
    expect(r.status).toBe(200);
    const daten = r.body.daten as EinstellungenAnzeige;
    expect(daten).toEqual({
      zeitzone: expect.any(String),
      tagesbudget: null,
      verlaufsgrenze: null,
      heute: { token: 0, seit: expect.any(String) },
      hoechstwerte: { tagesbudget: LIMITS.dailyTokenBudget, verlaufsgrenze: LIMITS.historyTokens },
    });
    expect(r.antwort.headers.get("cache-control")).toBe("no-store");
  });
});

describe("PATCH /api/einstellungen", () => {
  it("ohne Sitzung: 401, nichts geändert", async () => {
    const { u } = await eingerichtet();
    const r = await anfrage(u, routen(u).aendern, "PATCH", PFAD, {
      koerper: { dailyTokenBudget: 1000 },
    });
    expect(r.status).toBe(401);
    expect((await repo.settings.get(u.db))?.dailyTokenBudget).toBeUndefined();
  });

  it("CSRF: ohne Prüfzeichen oder mit fremder Herkunft 403, nichts geändert", async () => {
    const { u, dose } = await eingerichtet();
    const h = routen(u).aendern;
    const ohne = await anfrage(u, h, "PATCH", PFAD, {
      dose,
      pruefzeichen: null,
      koerper: { dailyTokenBudget: 1000 },
    });
    expect(ohne.status).toBe(403);
    expect(ohne.body.fehler?.code).toBe("pruefzeichen_fehlt");
    const fremd = await anfrage(u, h, "PATCH", PFAD, {
      dose,
      origin: "https://boese.example",
      koerper: { dailyTokenBudget: 1000 },
    });
    expect(fremd.status).toBe(403);
    expect(fremd.body.fehler?.code).toBe("herkunft_falsch");
    expect((await repo.settings.get(u.db))?.dailyTokenBudget).toBeUndefined();
  });

  it.each([
    ["Null als Grenze", { dailyTokenBudget: 0 }],
    ["negative Grenze", { historyTokenLimit: -5 }],
    ["Kommazahl", { dailyTokenBudget: 10.5 }],
    ["Text statt Zahl", { dailyTokenBudget: "1000" }],
    ["über dem Höchstwert", { dailyTokenBudget: LIMITS.dailyTokenBudget + 1 }],
    ["unbekannte Zeitzone", { timezone: "Mars/Olympus" }],
    ["leere Änderung", {}],
    ["Not-Aus ist kein Feld dieser Route", { killSwitch: true }],
    ["Sprache ist kein Feld dieser Route", { locale: "en" }],
  ])("%s: 400, kein Beleg, nichts geändert", async (_name, koerper) => {
    const { u, dose } = await eingerichtet();
    const vorher = await repo.settings.get(u.db);
    const belege = (await repo.belege.listFrom(u.db)).length;
    const r = await anfrage(u, routen(u).aendern, "PATCH", PFAD, { dose, koerper });
    expect(r.status).toBe(400);
    expect(r.body.fehler?.code).toBe("eingabe_ungueltig");
    expect((await repo.belege.listFrom(u.db)).length).toBe(belege);
    const nachher = await repo.settings.get(u.db);
    expect(nachher?.killSwitch).toBe(false);
    expect(nachher?.updatedAt).toBe(vorher?.updatedAt);
  });

  it("Glücksfall: speichert, antwortet mit neuen Werten und dem Beleg; Belege nennen die Felder", async () => {
    const { u, dose } = await eingerichtet();
    const belegeVorher = (await repo.belege.listFrom(u.db)).length;
    const r = await anfrage(u, routen(u).aendern, "PATCH", PFAD, {
      dose,
      koerper: { timezone: "America/New_York", dailyTokenBudget: 50_000 },
    });
    expect(r.status).toBe(200);
    const daten = r.body.daten as EinstellungenGespeichert;
    expect(daten.einstellungen).toMatchObject({
      zeitzone: "America/New_York",
      tagesbudget: 50_000,
      verlaufsgrenze: null,
    });
    const settings = await repo.settings.get(u.db);
    expect(settings).toMatchObject({ timezone: "America/New_York", dailyTokenBudget: 50_000 });

    const neu = (await repo.belege.listFrom(u.db)).slice(belegeVorher);
    expect(neu.map((b) => b.body.type)).toEqual(["decision", "result"]);
    const [entscheidung, ergebnis] = neu;
    if (entscheidung?.body.type !== "decision" || ergebnis?.body.type !== "result") {
      throw new Error("Belege fehlen");
    }
    expect(entscheidung.body.action).toMatchObject({
      type: "einstellung.aendern",
      actor: "besitzer",
      target: { installationId: settings?.installationId },
    });
    expect(entscheidung.body.facts).toEqual({
      credential: "sitzung",
      fields: ["timezone", "dailyTokenBudget"],
    });
    expect(entscheidung.body.decision.outcome).toBe("allow");
    expect(ergebnis.body.result.status).toBe("ok");
    expect(daten.beleg).toEqual({ id: ergebnis.id, nummer: ergebnis.seq });
  });

  it("null entfernt eine Grenze wieder", async () => {
    const { u, dose } = await eingerichtet();
    const h = routen(u).aendern;
    await anfrage(u, h, "PATCH", PFAD, { dose, koerper: { historyTokenLimit: 8000 } });
    expect((await repo.settings.get(u.db))?.historyTokenLimit).toBe(8000);
    const r = await anfrage(u, h, "PATCH", PFAD, { dose, koerper: { historyTokenLimit: null } });
    expect(r.status).toBe(200);
    expect((r.body.daten as EinstellungenGespeichert).einstellungen.verlaufsgrenze).toBeNull();
    expect((await repo.settings.get(u.db))?.historyTokenLimit).toBeUndefined();
  });

  it("lehnt das Tor ab (Regel des Besitzers), antwortet die Route mit dem Code und ändert nichts", async () => {
    const { u, dose } = await eingerichtet();
    await repo.rules.appendVersion(u.db, {
      id: "R-900",
      version: 1,
      action: "einstellung.aendern",
      effect: "deny",
      stage: "execute",
      conditions: [],
      priority: 10,
      source: "owner",
      enabled: true,
      title: "Einstellungen gesperrt",
      reason: "Einstellungen bleiben, wie sie sind.",
    });
    const r = await anfrage(u, routen(u).aendern, "PATCH", PFAD, {
      dose,
      koerper: { dailyTokenBudget: 1000 },
    });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.body.ok).toBe(false);
    expect(r.body.fehler?.code).toBe("abgelehnt");
    expect((await repo.settings.get(u.db))?.dailyTokenBudget).toBeUndefined();
    const letzte = (await repo.belege.listFrom(u.db)).at(-1);
    expect(letzte?.body.type).toBe("result");
    if (letzte?.body.type === "result") expect(letzte.body.result.status).toBe("denied");
  });
});

describe("Verbrauch von heute", () => {
  it("Tagesbeginn ist Mitternacht in der Zeitzone", () => {
    const jetzt = new Date("2026-11-20T10:00:00.000Z");
    expect(tagesbeginn(jetzt, "Europe/Berlin").toISOString()).toBe("2026-11-19T23:00:00.000Z");
    expect(tagesbeginn(jetzt, "UTC").toISOString()).toBe("2026-11-20T00:00:00.000Z");
    expect(
      tagesbeginn(new Date("2026-11-20T03:00:00.000Z"), "America/New_York").toISOString(),
    ).toBe("2026-11-19T05:00:00.000Z");
  });

  it("zählt Ein- und Ausgabe der Antworten des Bots, nicht die Nachrichten der Person", async () => {
    const { u, dose } = await eingerichtet();
    const bot = await repo.bots.getDefault(u.db);
    if (bot === undefined) throw new Error("kein Bot");
    const unterhaltung = await repo.conversations.create(u.db, {
      botId: bot.id,
      title: "Beispiel",
    });
    await repo.messages.insert(u.db, {
      conversationId: unterhaltung.id,
      role: "user",
      content: "Hallo",
    });
    await repo.messages.insert(u.db, {
      conversationId: unterhaltung.id,
      role: "assistant",
      content: "Hallo zurück",
      status: "complete",
      tokensIn: 120,
      tokensOut: 30,
    });
    expect(await tokenSeit(u.db, new Date(0))).toBe(150);
    expect(await tokenSeit(u.db, new Date(Date.now() + 60_000))).toBe(0);
    const r = await anfrage(u, routen(u).lesen, "GET", PFAD, { dose });
    expect((r.body.daten as EinstellungenAnzeige).heute.token).toBe(150);
  });
});
