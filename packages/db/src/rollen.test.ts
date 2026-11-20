/**
 * PaiBot – Tests der Rollen-Helfer ohne Datenbank: Zugangsdaten aus der Adresse, Prüfwert des
 * Passworts, Rechte-Tabelle.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { describe, expect, it } from "vitest";
import { APP_DEFAULT_TABLE_RIGHTS, APP_TABLE_RIGHTS, credentialsOf, scramVerifier } from "./rollen";
import { createTestDb } from "./testing";

describe("credentialsOf", () => {
  it("liest Benutzer und Passwort, auch mit kodierten Zeichen", () => {
    expect(credentialsOf("postgres://paibot_app:ab%40cd@postgres:5432/paibot")).toEqual({
      user: "paibot_app",
      password: "ab@cd",
    });
  });
});

describe("scramVerifier", () => {
  it("liefert das Format von Postgres und enthält das Passwort nicht", () => {
    const value = scramVerifier("ein-geheimes-passwort");
    expect(value).toMatch(/^SCRAM-SHA-256\$4096:[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    expect(value).not.toContain("ein-geheimes-passwort");
  });

  it("ist mit festem Salz deterministisch und mit neuem Salz verschieden", () => {
    const salt = Buffer.alloc(16, 7);
    expect(scramVerifier("x", salt)).toBe(scramVerifier("x", salt));
    expect(scramVerifier("x")).not.toBe(scramVerifier("x"));
  });
});

describe("APP_TABLE_RIGHTS", () => {
  it("Belege und Regeln: nur lesen und anhängen", () => {
    expect(APP_TABLE_RIGHTS.belege).toBe("select, insert");
    expect(APP_TABLE_RIGHTS.rules).toBe("select, insert");
    expect(Object.values(APP_TABLE_RIGHTS).join()).not.toMatch(/truncate|trigger|references/);
  });

  it("Werkzeug-Aufrufe: kein Löschen, ändern nur Zustand und Ergebnis", () => {
    expect(APP_TABLE_RIGHTS.tool_calls).toMatch(/^select, insert, update \([a-z_, ]+\)$/);
    expect(APP_TABLE_RIGHTS.tool_calls).not.toMatch(/delete|input|name|args_digest/);
    expect(APP_TABLE_RIGHTS.installation_keys).toBe("select, insert, update (retired_at)");
  });

  it("jede Tabelle des Schemas hat einen Eintrag, und es gibt keinen Eintrag ohne Tabelle", async () => {
    const { client } = await createTestDb();
    try {
      const { rows } = await client.query<{ name: string }>(`
        select c.relname as name from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p')
        order by c.relname`);
      expect(rows.map((row) => row.name)).toEqual(Object.keys(APP_TABLE_RIGHTS).sort());
    } finally {
      await client.close();
    }
  });

  it("nur die Standard-Rechte oder weniger, nie mehr", () => {
    const allowed = new Set(APP_DEFAULT_TABLE_RIGHTS.split(", "));
    for (const [table, rights] of Object.entries(APP_TABLE_RIGHTS)) {
      const words = rights
        .replace(/\([^)]*\)/g, "")
        .split(",")
        .map((w) => w.trim());
      for (const word of words) expect(allowed.has(word), `${table}: ${word}`).toBe(true);
    }
  });
});
