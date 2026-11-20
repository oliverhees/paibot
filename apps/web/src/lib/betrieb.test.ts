/**
 * PaiBot – Tests der Start-Prüfungen: Pflicht-Einstellungen in Produktion und Abbruch.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { checkProductionEnv, prepareStart } from "./betrieb";

const secret = () => randomBytes(32).toString("base64");
const pw = () => randomBytes(24).toString("hex");
const url = (user: string, password: string) =>
  `postgres://${user}:${password}@postgres:5432/paibot`;

describe("checkProductionEnv", () => {
  it("nimmt vollständige, zufällige Werte an", () => {
    expect(
      checkProductionEnv({
        PAIBOT_SECRET: secret(),
        DATABASE_URL: url("paibot_app", pw()),
        DATABASE_MIGRATION_URL: url("paibot", pw()),
      }),
    ).toEqual([]);
  });

  it("lehnt fehlendes, falsches oder Platzhalter-Geheimnis ab", () => {
    const db = { DATABASE_URL: url("paibot_app", pw()) };
    expect(checkProductionEnv(db)[0]).toContain("PAIBOT_SECRET fehlt");
    expect(checkProductionEnv({ ...db, PAIBOT_SECRET: "bitte-erzeugen" })[0]).toContain(
      "Platzhalter",
    );
    expect(checkProductionEnv({ ...db, PAIBOT_SECRET: "kurz" })[0]).toContain("falsche Form");
  });

  it("meldet ein Geheimnis mit richtiger Länge, aber ohne Zufall, mit eigenem Text", () => {
    const db = { DATABASE_URL: url("paibot_app", pw()) };
    for (const weak of [Buffer.alloc(32, 7), Buffer.from("das-ist-kein-zufall-sondern-text")]) {
      const value = weak.toString("base64");
      const [message, ...rest] = checkProductionEnv({ ...db, PAIBOT_SECRET: value });
      expect(rest).toEqual([]);
      expect(message).toContain("nicht zufällig");
      expect(message).not.toContain("falsche Form");
      expect(message).not.toContain(value);
    }
  });

  it("lehnt kurze, fehlende und Platzhalter-Passwörter ab, ohne sie zu nennen", () => {
    const base = { PAIBOT_SECRET: secret() };
    const kurz = checkProductionEnv({ ...base, DATABASE_URL: url("a", "kurz123") });
    expect(kurz[0]).toContain("zu kurz");
    expect(kurz.join()).not.toContain("kurz123");
    expect(
      checkProductionEnv({
        ...base,
        DATABASE_URL: url("a", pw()),
        DATABASE_MIGRATION_URL: url("b", "bitte-ein-langes-zufaelliges-passwort"),
      })[0],
    ).toBe(
      "Das Passwort in DATABASE_MIGRATION_URL ist ein Platzhalter. Setze ein zufälliges Passwort.",
    );
    expect(checkProductionEnv({ ...base })[0]).toBe("DATABASE_URL fehlt.");
    expect(checkProductionEnv({ ...base, DATABASE_URL: "postgres://a@h/db" })[0]).toContain(
      "kein Passwort",
    );
  });
});

describe("prepareStart", () => {
  const silent = () => {
    const lines: string[] = [];
    const push = (m: string) => {
      lines.push(m);
    };
    return { lines, log: { info: push, warn: push, error: push } };
  };

  it("bricht in Produktion ohne Pflicht-Einstellungen ab", async () => {
    const { lines, log } = silent();
    let code: number | undefined;
    await prepareStart({ NODE_ENV: "production" } as NodeJS.ProcessEnv, {
      log,
      exit: ((c: number) => {
        code = c;
      }) as (c: number) => never,
    });
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("Start abgebrochen");
  });

  it("startet in der Entwicklung ohne Datenbank mit Hinweis", async () => {
    const { lines, log } = silent();
    await prepareStart({ NODE_ENV: "development" } as NodeJS.ProcessEnv, { log });
    expect(lines).toEqual(["DATABASE_URL fehlt – Migrationen übersprungen."]);
  });
});
