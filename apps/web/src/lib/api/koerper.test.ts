/**
 * PaiBot – Tests der Grenzen für den Körper einer Anfrage: Proxy, Rahmen und Next-Einstellung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../../../next.config";
import { proxy, config as proxyConfig } from "../../proxy";
import { API_ROUTEN, koerperGrenze, koerperGrenzeFuerPfad, type RoutenDefinition } from "../routen";
import { anmelden } from "../zugang/anmeldung";
import { _ersetzeProzessDienste } from "../zugang/dienste";
import {
  anfrage,
  TEST_ORIGIN,
  type TestUmgebung,
  testUmgebung,
  vorabDose,
} from "../zugang/testing";
import { GROESSTER_KOERPER_BYTES, STANDARD_KOERPER_BYTES } from "./koerper";
import { GLEICHZEITIGE_KOERPER, koerperText } from "./route";

vi.setConfig({ testTimeout: 60_000 });

const MIB = 1024 * 1024;

/** Ein Strom, der zählt, wie viel jemand von ihm liest; liefert ohne Ende Stücke von 64 KiB. */
function zaehlStrom(gesamt = Number.POSITIVE_INFINITY) {
  const stand = { gelesen: 0, abgebrochen: false };
  const stueck = new Uint8Array(64 * 1024).fill(0x61);
  const strom = new ReadableStream<Uint8Array>({
    pull(steuerung) {
      if (stand.gelesen >= gesamt) {
        steuerung.close();
        return;
      }
      stand.gelesen += stueck.byteLength;
      steuerung.enqueue(stueck);
    },
    cancel() {
      stand.abgebrochen = true;
    },
  });
  return { strom, stand };
}

function anfrageMitStrom(strom: ReadableStream<Uint8Array>, kopf: Record<string, string> = {}) {
  return new Request(`${TEST_ORIGIN}/api/zugang/anmelden`, {
    method: "POST",
    headers: { "content-type": "application/json", ...kopf },
    body: strom,
    duplex: "half",
  } as RequestInit);
}

describe("Körper lesen im Rahmen", () => {
  it("lehnt eine angegebene Länge über der Grenze ab, ohne ein Byte zu lesen", async () => {
    const { strom, stand } = zaehlStrom();
    const r = anfrageMitStrom(strom, { "content-length": String(12 * MIB) });
    await expect(koerperText(r, STANDARD_KOERPER_BYTES)).rejects.toMatchObject({
      code: "eingabe_ungueltig",
      felder: [{ feld: "eingabe", code: "zu_gross" }],
    });
    // Ein Strom liest von sich aus höchstens ein Stück vor.
    expect(stand.gelesen).toBeLessThanOrEqual(64 * 1024);
  });

  it("bricht ohne Längenangabe ab, sobald mehr als die Grenze ankommt", async () => {
    const { strom, stand } = zaehlStrom();
    await expect(koerperText(anfrageMitStrom(strom), STANDARD_KOERPER_BYTES)).rejects.toMatchObject(
      { code: "eingabe_ungueltig" },
    );
    expect(stand.gelesen).toBeLessThanOrEqual(STANDARD_KOERPER_BYTES + 2 * 64 * 1024);
    expect(stand.abgebrochen).toBe(true);
  });

  it("liest einen Körper unter der Grenze vollständig", async () => {
    const { strom } = zaehlStrom(128 * 1024);
    const text = await koerperText(anfrageMitStrom(strom), GROESSTER_KOERPER_BYTES);
    expect(text.length).toBe(128 * 1024);
  });

  it("liest höchstens GLEICHZEITIGE_KOERPER Körper gleichzeitig, weitere sofort mit 429", async () => {
    // Ströme, die nie enden: Sie halten ihren Platz, bis sie abgebrochen werden.
    const haengend = Array.from({ length: GLEICHZEITIGE_KOERPER }, () => {
      let steuerung: ReadableStreamDefaultController<Uint8Array> | undefined;
      const strom = new ReadableStream<Uint8Array>({
        start(s) {
          steuerung = s;
        },
      });
      return { lesen: koerperText(anfrageMitStrom(strom), STANDARD_KOERPER_BYTES), steuerung };
    });
    await new Promise((fertig) => setTimeout(fertig, 20));
    const { strom } = zaehlStrom(1024);
    await expect(
      koerperText(anfrageMitStrom(strom), GROESSTER_KOERPER_BYTES),
    ).rejects.toMatchObject({ code: "zu_viele_versuche", retryAfterSeconds: 2 });
    for (const h of haengend) h.steuerung?.close();
    await Promise.all(haengend.map((h) => h.lesen));
    // Danach ist wieder Platz.
    const { strom: wieder } = zaehlStrom(1024);
    expect((await koerperText(anfrageMitStrom(wieder), GROESSTER_KOERPER_BYTES)).length).toBe(
      64 * 1024,
    );
  });

  it("die Anmeldung nimmt höchstens die kleine Standard-Grenze an", async () => {
    const u: TestUmgebung = await testUmgebung();
    const h = u.handler("anmelden", async (k) => ({ daten: await anmelden(k) }));
    const r = await anfrage(u, h, "POST", "/api/zugang/anmelden", {
      dose: vorabDose(),
      koerper: { password: "x".repeat(STANDARD_KOERPER_BYTES) },
    });
    expect(r.status).toBe(400);
    expect(r.body.fehler).toMatchObject({ code: "eingabe_ungueltig" });
    expect(JSON.stringify(r.body)).toContain("zu_gross");
  });
});

describe("Grenzen je Route", () => {
  it("klein als Standard, groß nur für Nachrichten", () => {
    expect(koerperGrenzeFuerPfad("/api/zugang/anmelden", "POST")).toBe(STANDARD_KOERPER_BYTES);
    expect(koerperGrenzeFuerPfad("/api/einrichtung", "POST")).toBe(STANDARD_KOERPER_BYTES);
    expect(koerperGrenzeFuerPfad("/gibtsnicht", "POST")).toBe(STANDARD_KOERPER_BYTES);
    expect(koerperGrenzeFuerPfad("/api/unterhaltungen/con_abc/nachrichten", "POST")).toBe(
      GROESSTER_KOERPER_BYTES,
    );
    expect(koerperGrenzeFuerPfad("/api/unterhaltungen/con_abc/nachrichten", "GET")).toBe(
      STANDARD_KOERPER_BYTES,
    );
    expect(STANDARD_KOERPER_BYTES).toBeLessThanOrEqual(16 * 1024);
  });
});

describe("Proxy", () => {
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
  });

  function mitLaenge(pfad: string, laenge: string) {
    return new NextRequest(`${TEST_ORIGIN}${pfad}`, {
      method: "POST",
      headers: { "content-length": laenge, "content-type": "application/json" },
    });
  }

  it("weist zu große Körper an der angegebenen Länge ab, auf jedem Pfad und ohne Anmeldung", async () => {
    for (const pfad of ["/gibtsnicht", "/api/zugang/anmelden", "/einrichtung", "/api/x"]) {
      const antwort = await proxy(mitLaenge(pfad, String(12 * MIB)));
      expect(antwort.status, pfad).toBe(413);
      expect(await antwort.json()).toMatchObject({
        ok: false,
        fehler: { code: "eingabe_ungueltig" },
      });
      expect(antwort.headers.get("content-security-policy")).toContain("default-src 'self'");
    }
    expect((await proxy(mitLaenge("/api/zugang/anmelden", "abc"))).status).toBe(413);
  });

  it("lässt Körper bis zur Grenze der Route durch", async () => {
    const klein = await proxy(mitLaenge("/api/zugang/anmelden", "200"));
    expect(klein.status).not.toBe(413);
    const nachricht = await proxy(
      mitLaenge("/api/unterhaltungen/con_abc/nachrichten", String(200 * 1024)),
    );
    expect(nachricht.status).not.toBe(413);
    const zuGross = await proxy(
      mitLaenge("/api/zugang/anmelden", String(STANDARD_KOERPER_BYTES + 1)),
    );
    expect(zuGross.status).toBe(413);
  });
});

describe("Next-Einstellungen", () => {
  it("Next hält vor dem Proxy höchstens die Standard-Grenze im Speicher", () => {
    expect(nextConfig.experimental?.proxyClientMaxBodySize).toBe(STANDARD_KOERPER_BYTES + 1);
  });

  it("der Proxy läuft auf jedem Pfad außer den Routen mit größerer Grenze", () => {
    const passt = (url: string) =>
      unstable_doesMiddlewareMatch({ config: proxyConfig, url, nextConfig });
    const gross = Object.values(API_ROUTEN as Record<string, RoutenDefinition>).filter(
      (def) => koerperGrenze(def) > STANDARD_KOERPER_BYTES,
    );
    expect(gross.map((def) => def.pfad).sort()).toEqual([
      "/api/bot",
      "/api/bots",
      "/api/team-entwuerfe/:id/anlegen",
      "/api/unterhaltungen/:id/nachrichten",
    ]);
    for (const def of Object.values(API_ROUTEN as Record<string, RoutenDefinition>)) {
      const pfad = def.pfad.replace(/:[A-Za-z]+/g, "con_abc");
      const ausgenommen = Object.values(API_ROUTEN as Record<string, RoutenDefinition>).some(
        (d) => d.pfad === def.pfad && koerperGrenze(d) > STANDARD_KOERPER_BYTES,
      );
      expect(passt(pfad), pfad).toBe(!ausgenommen);
    }
    for (const pfad of [
      "/",
      "/gibtsnicht",
      "/anmelden",
      "/api/bot/modell",
      "/api/botx",
      "/api/unterhaltungen/con_abc/nachrichtenx",
      "/api/unterhaltungen/con_abc/nachrichten/mehr",
      "/api/team-entwuerfe/con_abc/anlegenx",
      "/api/team-entwuerfe/con_abc/anlegen/mehr",
      "/api/team-entwuerfe/con_abc",
      "/x/api/bot",
    ]) {
      expect(passt(pfad), pfad).toBe(true);
    }
  });

  it("der Bild-Optimierer ist aus", () => {
    expect(nextConfig.images?.unoptimized).toBe(true);
  });
});
