/**
 * PaiBot – Tests der Route `GET /api/selbsttest`: nur angemeldet, liest nur, nennt weder Adressen
 * noch Geheimnisse noch Namen von Rollen, und zeigt eine Beispiel-Installation mit „in Ordnung“
 * und „Hinweis“.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { geraete, repo } from "@paibot/db";
import { afterEach, describe, expect, it, vi } from "vitest";
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
import { _ersetzeSelbsttestQuellen, type SelbsttestDaten, selbsttestLesen } from "./selbsttest";

vi.setConfig({ testTimeout: 60_000 });

afterEach(() => _ersetzeSelbsttestQuellen(undefined));

const PFAD = "/api/selbsttest";
const GEHEIM_DB = "postgres://paibot_app:sehr-geheim-1234@db.intern:5432/paibot";

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

function lesen(u: TestUmgebung) {
  return u.handler("selbsttest", async (k) => ({ daten: await selbsttestLesen(k) }));
}

function quellen(env: Record<string, string> = {}) {
  _ersetzeSelbsttestQuellen({
    rolle: async () => ({ status: "eingeschraenkt", gruende: [] }),
    migrationen: async () => ({ status: "aktuell", expected: 11, applied: 11 }),
    env: () => ({ DATABASE_URL: GEHEIM_DB, PAIBOT_SECRET: "x".repeat(64), ...env }),
  });
}

describe("GET /api/selbsttest", () => {
  it("ohne Sitzung: 401, keine Prüfung", async () => {
    const { u } = await eingerichtet();
    quellen();
    const r = await anfrage(u, lesen(u), "GET", PFAD);
    expect(r.status).toBe(401);
    expect(r.body.fehler?.code).toBe("nicht_angemeldet");
    expect(JSON.stringify(r.body)).not.toContain("selbsttest");
  });

  it("Beispiel-Installation: Ergebnisse mit „in Ordnung“ und „Hinweis“, jede Nicht-ok mit Ausweg", async () => {
    const { u, dose } = await eingerichtet();
    quellen();
    await repo.schleuse.report(u.db, { state: "aus", now: new Date() });
    const r = await anfrage(u, lesen(u), "GET", PFAD, { dose });
    expect(r.status).toBe(200);
    expect(r.antwort.headers.get("cache-control")).toBe("no-store");
    const daten = r.body.daten as SelbsttestDaten;
    const nach = Object.fromEntries(daten.pruefungen.map((p) => [p.id, p]));
    expect(Object.keys(nach)).toEqual([
      "adresse",
      "proxy",
      "rolle",
      "schalter",
      "migrationen",
      "worker",
      "schleuse",
      "einrichtung",
      "notaus",
      "zugang",
      "version",
    ]);
    // Test-Umgebung: APP_URL ist http (Hinweis). Proxy vertraut, die Kopfzeile mit der Adresse ist
    // da (die setzt die App auch ohne Proxy selbst), ein Zeichen für einen Proxy fehlt: nicht
    // feststellbar, also Hinweis und nicht „in Ordnung“.
    expect(nach.adresse?.ergebnis).toBe("hinweis");
    expect(nach.proxy?.ergebnis).toBe("hinweis");
    expect(nach.proxy?.text).toContain("lässt sich von hier nicht feststellen");
    expect(nach.rolle?.ergebnis).toBe("ok");
    expect(nach.schalter?.ergebnis).toBe("ok");
    expect(nach.migrationen?.ergebnis).toBe("ok");
    expect(nach.worker?.ergebnis).toBe("ok");
    expect(nach.einrichtung?.ergebnis).toBe("ok");
    expect(nach.notaus?.ergebnis).toBe("ok");
    expect(nach.zugang?.text).toMatch(/Bekannte Geräte: 1\. Offene Sitzungen: 1\./);
    // Gegen die Tabelle der Geräte: gültige Geräte des Besitzers.
    const [besitzer] = await u.db.select().from(geraete);
    const echt = await repo.geraete.list(u.db, besitzer?.ownerId as never, { now: new Date() });
    expect(echt).toHaveLength(1);
    for (const p of daten.pruefungen) {
      if (p.ergebnis !== "ok") expect(p.ausweg, p.id).toBeTruthy();
    }
  });

  it("Proxy: „in Ordnung“ nur mit einem Zeichen, das die App nicht selbst setzt", async () => {
    const { u, dose } = await eingerichtet();
    quellen();
    const proxyZeile = async (kopf?: Record<string, string>) => {
      const r = await anfrage(u, lesen(u), "GET", PFAD, { dose, ...(kopf ? { kopf } : {}) });
      const daten = r.body.daten as SelbsttestDaten;
      return daten.pruefungen.find((p) => p.id === "proxy")?.ergebnis;
    };
    // Direkt, nur die Kopfzeile mit der Adresse (so sieht auch eine Anfrage ohne Proxy aus).
    expect(await proxyZeile()).toBe("hinweis");
    // Mit einem Zeichen eines Proxys.
    expect(await proxyZeile({ "x-real-ip": "203.0.113.7" })).toBe("ok");
    expect(await proxyZeile({ via: "1.1 proxy" })).toBe("ok");
  });

  it("nennt keine Adressen, Geheimnisse oder Zugangsdaten", async () => {
    const { u, dose } = await eingerichtet();
    quellen({ PAIBOT_ALLOW_PRIVILEGED_DB: "1" });
    const r = await anfrage(u, lesen(u), "GET", PFAD, { dose, kopf: { host: "anders.example" } });
    const text = JSON.stringify(r.body);
    for (const verboten of [
      "paibot.test",
      "anders.example",
      "203.0.113.7",
      "sehr-geheim",
      "paibot_app",
      "db.intern",
      "xxxxxxxx",
      TEST_PASSWORT,
    ]) {
      expect(text, verboten).not.toContain(verboten);
    }
    const daten = r.body.daten as SelbsttestDaten;
    expect(daten.pruefungen.find((p) => p.id === "schalter")?.ergebnis).toBe("hinweis");
  });

  it("zeigt Fehler, wenn der Worker sich nie gemeldet hat und Migrationen fehlen", async () => {
    const { u, dose } = await eingerichtet();
    _ersetzeSelbsttestQuellen({
      rolle: async () => ({ status: "zu_viele_rechte", gruende: ["ist Superuser"] }),
      migrationen: async () => ({ status: "veraltet", expected: 11, applied: 10 }),
      env: () => ({}),
    });
    const r = await anfrage(u, lesen(u), "GET", PFAD, { dose });
    const nach = Object.fromEntries(
      (r.body.daten as SelbsttestDaten).pruefungen.map((p) => [p.id, p.ergebnis]),
    );
    expect(nach).toMatchObject({ worker: "fehler", migrationen: "fehler", rolle: "fehler" });
  });

  it("Not-Aus an erscheint als Hinweis", async () => {
    const { u, dose } = await eingerichtet();
    quellen();
    await repo.settings.update(u.db, { killSwitch: true });
    const r = await anfrage(u, lesen(u), "GET", PFAD, { dose });
    const notaus = (r.body.daten as SelbsttestDaten).pruefungen.find((p) => p.id === "notaus");
    expect(notaus?.ergebnis).toBe("hinweis");
  });
});
