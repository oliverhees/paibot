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
import { APP_TABLE_RIGHTS, credentialsOf, scramVerifier } from "./rollen";

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
});
