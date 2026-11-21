/**
 * PaiBot – Tests: Werte in der Form, die Coolify für deploy/docker-compose.coolify.yml erzeugt,
 * bestehen die Start-Prüfungen von web und migrate.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkProductionEnv } from "./betrieb";
import { hostPasstNicht, pruefeAppUrl } from "./umgebung";

const DATEI = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../deploy/docker-compose.coolify.yml",
);

type Env = Record<string, string | undefined>;

/**
 * Liest den Abschnitt `environment:` eines Dienstes und setzt die Variablen ein wie Docker Compose:
 * `${NAME}` (fehlt: leer) und `${NAME:-standard}`.
 */
function dienstUmgebung(dienst: string, werte: Env): Env {
  const zeilen = readFileSync(DATEI, "utf8").split("\n");
  const start = zeilen.indexOf(`  ${dienst}:`);
  expect(start).toBeGreaterThan(-1);
  const env: Env = {};
  let imEnv = false;
  for (const zeile of zeilen.slice(start + 1)) {
    if (/^ {2}\S/.test(zeile)) break;
    if (/^ {4}\S/.test(zeile)) {
      imEnv = zeile === "    environment:";
      continue;
    }
    const m = imEnv ? /^ {6}([A-Z0-9_]+):(?: (.*))?$/.exec(zeile) : null;
    if (!m?.[1]) continue;
    const roh = m[2];
    if (roh === undefined) {
      env[m[1]] = werte[m[1]];
      continue;
    }
    env[m[1]] = roh.replace(
      /\$\{([A-Z0-9_]+)(?::-([^}]*))?\}/g,
      (_, name: string, standard?: string) => {
        const wert = werte[name];
        if (standard !== undefined) return wert === undefined || wert === "" ? standard : wert;
        return wert ?? "";
      },
    );
  }
  return env;
}

/** So erzeugt Coolify die Werte: bin2hex(random_bytes(32)), base64_encode(random_bytes(32)). */
function coolifyWerte(): Env {
  return {
    SERVICE_HEX_64_PGOWNER: randomBytes(32).toString("hex"),
    SERVICE_HEX_64_PGAPP: randomBytes(32).toString("hex"),
    SERVICE_REALBASE64_32_PAIBOT: randomBytes(32).toString("base64"),
    // Coolify setzt SERVICE_URL_WEB aus der Domain beim Dienst web (mit Schema, ohne Port) und
    // SERVICE_URL_WEB_3000 mit angehängtem Port.
    SERVICE_URL_WEB: "https://paibot.example.de",
    SERVICE_URL_WEB_3000: "https://paibot.example.de:3000",
  };
}

describe("deploy/docker-compose.coolify.yml mit Werten aus Coolify", () => {
  it("web und migrate bestehen die Start-Prüfung", () => {
    for (let i = 0; i < 20; i++) {
      const werte = coolifyWerte();
      const web = dienstUmgebung("web", werte);
      expect(web.DATABASE_MIGRATION_URL).toBeUndefined();
      expect(checkProductionEnv(web, "web")).toEqual([]);
      expect(pruefeAppUrl(web).warnungen).toEqual([]);
      expect(checkProductionEnv(dienstUmgebung("migrate", werte), "migrate")).toEqual([]);
    }
  });

  it("die Passwörter landen unverändert in den Datenbank-Adressen", () => {
    const werte = coolifyWerte();
    const migrate = dienstUmgebung("migrate", werte);
    const app = new URL(migrate.DATABASE_URL ?? "");
    const besitzer = new URL(migrate.DATABASE_MIGRATION_URL ?? "");
    expect(decodeURIComponent(app.password)).toBe(werte.SERVICE_HEX_64_PGAPP);
    expect(decodeURIComponent(besitzer.password)).toBe(werte.SERVICE_HEX_64_PGOWNER);
    expect(app.username).toBe("paibot_app");
    expect(besitzer.username).toBe("paibot");
    expect(dienstUmgebung("postgres", werte).POSTGRES_PASSWORD).toBe(werte.SERVICE_HEX_64_PGOWNER);
  });

  it("APP_URL ist die Domain ohne Port; mit Port passte sie nicht zum Host der Anfrage", () => {
    const web = dienstUmgebung("web", coolifyWerte());
    expect(web.APP_URL).toBe("https://paibot.example.de");
    expect(hostPasstNicht("paibot.example.de", web.APP_URL)).toBe(false);
    expect(hostPasstNicht("paibot.example.de", "https://paibot.example.de:3000")).toBe(true);
  });

  it("ohne erzeugte Werte startet nichts (kein Standard für Geheimnisse)", () => {
    const fehler = checkProductionEnv(dienstUmgebung("web", {}), "web").join("\n");
    expect(fehler).toContain("PAIBOT_SECRET fehlt");
    expect(fehler).toContain("APP_URL fehlt");
    expect(fehler).toContain("DATABASE_URL enthält kein Passwort");
    const mig = checkProductionEnv(dienstUmgebung("migrate", {}), "migrate").join("\n");
    expect(mig).toContain("DATABASE_URL enthält kein Passwort");
    expect(mig).toContain("DATABASE_MIGRATION_URL enthält kein Passwort");
    expect(dienstUmgebung("postgres", {}).POSTGRES_PASSWORD).toBe("");
  });

  it("Coolify-Domain über http (Standard ohne eigene Domain) bricht den Start ab", () => {
    const werte = { ...coolifyWerte(), SERVICE_URL_WEB: "http://web-abc.203.0.113.7.sslip.io" };
    expect(checkProductionEnv(dienstUmgebung("web", werte), "web").join("\n")).toContain(
      "http:// für eine öffentliche Adresse",
    );
  });
});
