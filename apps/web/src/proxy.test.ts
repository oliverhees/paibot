/**
 * PaiBot – Tests des Proxys: Weiterleitungen, Nonce je Antwort, CSP ohne `'unsafe-inline'` für
 * Skripte im Betrieb, HSTS nur bei https, Stand an jeder Antwort, 401 für API ohne Sitzung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { readStand } from "@paibot/shared/stand";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_ROUTEN } from "./lib/routen";
import { _ersetzeProzessDienste } from "./lib/zugang/dienste";
import { einrichtungAbschliessen } from "./lib/zugang/einrichtung";
import {
  anfrage,
  TEST_CODE,
  TEST_ORIGIN,
  TEST_PASSWORT,
  type TestUmgebung,
  testUmgebung,
  vorabDose,
} from "./lib/zugang/testing";
import { entscheide } from "./lib/zugang/weiterleitung";
import { proxy } from "./proxy";

// Passwort-Rechnungen (scrypt) und Migrationen brauchen unter Last länger als die Standard-Zeit.
vi.setConfig({ testTimeout: 60_000 });

let u: TestUmgebung;

beforeEach(async () => {
  u = await testUmgebung();
  _ersetzeProzessDienste(u.dienste);
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_URL", TEST_ORIGIN);
});

afterEach(() => {
  _ersetzeProzessDienste(undefined);
  vi.unstubAllEnvs();
  // „eingerichtet“ merkt sich der Prozess; jeder Test beginnt mit einer frischen Datenbank.
  delete (globalThis as Record<symbol, unknown>)[Symbol.for("paibot.web.eingerichtet")];
});

function req(pfad: string, optionen: { methode?: string; cookie?: string } = {}) {
  const kopf = new Headers();
  if (optionen.cookie) kopf.set("cookie", optionen.cookie);
  return new NextRequest(`${TEST_ORIGIN}${pfad}`, {
    method: optionen.methode ?? "GET",
    headers: kopf,
  });
}

async function einrichten(): Promise<string> {
  u.neuerCode(TEST_CODE);
  const dose = vorabDose();
  const h = u.handler("einrichtungAbschliessen", async (k) => ({
    daten: await einrichtungAbschliessen(k),
  }));
  await anfrage(u, h, "POST", "/api/einrichtung", {
    dose,
    koerper: {
      setupCode: TEST_CODE,
      password: TEST_PASSWORT,
      passwordRepeat: TEST_PASSWORT,
      schleuseModeDefault: "off",
      botName: "Pai",
    },
  });
  return `pb_sitzung=${dose.werte.get("pb_sitzung")}`;
}

describe("Kopfzeilen", () => {
  it("jede Antwort hat eine eigene Nonce und im Betrieb kein 'unsafe-inline' für Skripte", async () => {
    const a = await proxy(req("/einrichtung"));
    const b = await proxy(req("/einrichtung"));
    const cspA = a.headers.get("content-security-policy") ?? "";
    const cspB = b.headers.get("content-security-policy") ?? "";
    const nonceA = /'nonce-([^']+)'/.exec(cspA)?.[1];
    const nonceB = /'nonce-([^']+)'/.exec(cspB)?.[1];
    expect(nonceA).toBeDefined();
    expect(nonceA).not.toBe(nonceB);
    const skripte = /script-src ([^;]+)/.exec(cspA)?.[1] ?? "";
    expect(skripte).not.toContain("unsafe-inline");
    expect(skripte).not.toContain("unsafe-eval");
    // Die Nonce geht als Anfrage-Kopfzeile an Next, damit die Seite sie an ihre Skripte schreibt.
    expect(a.headers.get("x-middleware-request-x-nonce")).toBe(nonceA);
  });

  it("Stand-Kopfzeile nur mit Sitzung, nie für Fremde (Seiten, Dateien, Umleitungen, 401)", async () => {
    vi.stubEnv("PAIBOT_BUILD", "0.3.0+20261205.3f9c2ab");
    for (const pfad of [
      "/",
      "/_next/static/x.js",
      "/fonts/inter.woff2",
      "/api/zugang/sitzungen",
      "/einrichtung",
      "/gibtsnicht",
    ]) {
      const antwort = await proxy(req(pfad));
      expect(antwort.headers.get("x-pb-stand"), pfad).toBeNull();
    }
    const cookie = await einrichten();
    for (const pfad of ["/", "/anmelden", "/api/zugang/sitzungen"]) {
      const antwort = await proxy(req(pfad, { cookie }));
      expect(antwort.headers.get("x-pb-stand"), pfad).toBe(readStand(process.env));
      expect(antwort.headers.get("x-pb-stand")).toBe("0.3.0+20261205.3f9c2ab");
    }
  });

  it("HSTS nur, wenn APP_URL https ist", async () => {
    expect((await proxy(req("/einrichtung"))).headers.get("strict-transport-security")).toBeNull();
    vi.stubEnv("APP_URL", "https://paibot.example.de");
    expect((await proxy(req("/einrichtung"))).headers.get("strict-transport-security")).toBe(
      "max-age=31536000",
    );
  });
});

describe("Weiterleitungen", () => {
  it("ohne Einrichtung: alles zu /einrichtung, dort Vorab-Cookie", async () => {
    for (const pfad of ["/", "/anmelden", "/belege"]) {
      const a = await proxy(req(pfad));
      expect(a.status).toBe(307);
      expect(new URL(a.headers.get("location") ?? "").pathname).toBe("/einrichtung");
    }
    const e = await proxy(req("/einrichtung"));
    expect(e.status).toBe(200);
    expect(e.headers.getSetCookie()[0]).toMatch(
      /^pb_vorab=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Strict$/,
    );
  });

  it("nach der Einrichtung: ohne Sitzung zu /anmelden, mit Sitzung von /anmelden in die App", async () => {
    const cookie = await einrichten();
    expect(new URL((await proxy(req("/"))).headers.get("location") ?? "").pathname).toBe(
      "/anmelden",
    );
    expect(new URL((await proxy(req("/einrichtung"))).headers.get("location") ?? "").pathname).toBe(
      "/anmelden",
    );
    expect((await proxy(req("/anmelden"))).status).toBe(200);
    expect((await proxy(req("/", { cookie }))).status).toBe(200);
    const vonAnmelden = await proxy(req("/anmelden", { cookie }));
    expect(new URL(vonAnmelden.headers.get("location") ?? "").pathname).toBe("/");
    // Ein ungültiges Cookie zählt nicht als Anmeldung.
    expect((await proxy(req("/", { cookie: "pb_sitzung=falsch" }))).status).toBe(307);
  });

  it("API ohne Sitzung: 401 in der Antwort-Hülle; Health und Einrichtung bleiben offen", async () => {
    const a = await proxy(req("/api/zugang/sitzungen"));
    expect(a.status).toBe(401);
    expect(await a.json()).toMatchObject({ ok: false, fehler: { code: "nicht_angemeldet" } });
    expect((await proxy(req("/api/health"))).status).toBe(200);
    expect((await proxy(req("/api/einrichtung", { methode: "POST" }))).status).toBe(200);
    expect((await proxy(req("/api/zugang/anmelden", { methode: "POST" }))).status).toBe(200);
  });
});

describe("Entscheidung für jede Route des Vertrags", () => {
  it("jede Besitzer-Route wird ohne Sitzung abgewiesen, offene nicht", () => {
    for (const route of Object.values(API_ROUTEN)) {
      const pfad = route.pfad.replace(/:[A-Za-z]+/g, "unt_06f8k2m9qz3w7x1c4b5n8p0r2t");
      for (const eingerichtet of [true, false, undefined]) {
        const e = entscheide(pfad, route.methode, { eingerichtet, angemeldet: false }, false);
        if (route.zugang === "besitzer") expect(e).toEqual({ art: "nicht_angemeldet" });
        else expect(e.art).toBe("weiter");
      }
    }
  });
});
