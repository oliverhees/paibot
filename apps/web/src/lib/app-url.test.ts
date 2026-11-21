/**
 * PaiBot – Tests der Prüfung von `APP_URL` und `TRUST_PROXY` beim Start in Produktion und des
 * Hinweises, wenn Anfragen an einen anderen Host gehen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hostHinweis } from "../proxy";
import { checkProductionEnv, prepareStart, productionWarnings } from "./betrieb";
import { hostPasstNicht, pruefeAppUrl } from "./umgebung";

const basis = () => ({
  PAIBOT_SECRET: randomBytes(32).toString("base64"),
  DATABASE_URL: `postgres://paibot_app:${randomBytes(24).toString("hex")}@db:5432/paibot`,
});

describe("APP_URL in Produktion", () => {
  it("bricht ab, wenn sie fehlt, ungültig ist oder eine öffentliche Adresse über http nennt", () => {
    for (const wert of [
      undefined,
      "",
      "paibot.example.de",
      "ftp://paibot.example.de",
      "http://paibot.example.de",
      "http://203.0.113.7:3000",
      "http://[2a01:4f8:c0c:1::1]",
      "http://[2001:db8::1]:3000",
      "http://[::ffff:8.8.8.8]",
      "http://127.paibot-test.example.de",
      "http://10.paibot-test.example.de",
      "http://192.168.paibot.example.de",
      "http://localhost.example.de",
      "https://nutzer:geheim@paibot.example.de",
    ]) {
      const env = { ...basis(), ...(wert === undefined ? {} : { APP_URL: wert }) };
      expect(
        checkProductionEnv(env).some((f) => f.includes("APP_URL")),
        String(wert),
      ).toBe(true);
    }
  });

  it("nimmt https und den eigenen Rechner über http an", () => {
    for (const wert of [
      "https://paibot.example.de",
      "http://localhost:3000",
      "http://127.0.0.1:41234",
      "http://[::1]:3000",
      "http://[0:0:0:0:0:0:0:1]:3000",
      "http://127.1.2.3",
      "http://paibot.localhost",
    ]) {
      expect(checkProductionEnv({ ...basis(), APP_URL: wert }), wert).toEqual([]);
      expect(pruefeAppUrl({ APP_URL: wert }).warnungen, wert).toEqual([]);
    }
  });

  it("warnt bei http im eigenen Netz und bei einem Pfad, bricht aber nicht ab", () => {
    for (const wert of [
      "http://192.168.1.20:3000",
      "http://10.0.0.5",
      "http://172.20.1.1",
      "http://[fd12:3456::1]:3000",
      "http://[fe80::1]",
      "http://[::ffff:192.168.1.2]",
      "http://nas:3000",
      "http://paibot.local",
      "http://paibot.home.arpa",
    ]) {
      expect(checkProductionEnv({ ...basis(), APP_URL: wert }), wert).toEqual([]);
      expect(pruefeAppUrl({ APP_URL: wert }).warnungen[0], wert).toContain("unverschlüsselt");
    }
    expect(pruefeAppUrl({ APP_URL: "https://paibot.example.de/app" }).warnungen[0]).toContain(
      "https://paibot.example.de",
    );
  });

  it("der Start in Produktion endet mit Exit 1 ohne APP_URL", async () => {
    const zeilen: string[] = [];
    const exits: number[] = [];
    await prepareStart({ NODE_ENV: "production", ...basis() } as NodeJS.ProcessEnv, {
      log: { info: () => undefined, warn: () => undefined, error: (z) => zeilen.push(z) },
      exit: ((code: number) => {
        exits.push(code);
      }) as (code: number) => never,
    });
    expect(exits).toEqual([1]);
    expect(zeilen.some((z) => z.startsWith("APP_URL fehlt"))).toBe(true);
  });
});

describe("TRUST_PROXY in Produktion", () => {
  it("ohne TRUST_PROXY=1 eine Warnung, mit nicht", () => {
    const env = { ...basis(), APP_URL: "https://paibot.example.de" };
    expect(productionWarnings(env).some((w) => w.startsWith("TRUST_PROXY"))).toBe(true);
    expect(productionWarnings({ ...env, TRUST_PROXY: "true" }).length).toBe(1);
    expect(productionWarnings({ ...env, TRUST_PROXY: "1" })).toEqual([]);
  });
});

describe("Host der Anfrage", () => {
  it("erkennt einen anderen Host als in APP_URL", () => {
    expect(hostPasstNicht("paibot.example.de", "https://paibot.example.de")).toBe(false);
    expect(hostPasstNicht("PAIBOT.example.de", "https://paibot.example.de")).toBe(false);
    expect(hostPasstNicht("10.0.0.5:3000", "https://paibot.example.de")).toBe(true);
    expect(hostPasstNicht(null, "https://paibot.example.de")).toBe(false);
  });

  it("meldet es einmal je Prozess, ohne Sonderzeichen aus dem Host", () => {
    const zeilen: string[] = [];
    hostHinweis("paibot.example.de", "https://paibot.example.de", (z) => zeilen.push(z));
    expect(zeilen).toEqual([]);
    hostHinweis("böse\nzeile.example", "https://paibot.example.de", (z) => zeilen.push(z));
    hostHinweis("noch.einer.example", "https://paibot.example.de", (z) => zeilen.push(z));
    expect(zeilen.length).toBe(1);
    expect(zeilen[0]).toContain("bsezeile.example");
    expect(zeilen[0]).not.toContain("\n");
  });
});
