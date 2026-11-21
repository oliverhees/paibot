/**
 * PaiBot – Tests der Adress-Prüfung im Formular.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { describe, expect, it } from "vitest";
import { kurzAdresse, pruefeAdresse } from "./adresse";

describe("Adresse prüfen", () => {
  it("nimmt öffentliche https-Adressen", () => {
    expect(pruefeAdresse("https://aufgaben.beispiel.example/mcp")).toBe("ok");
  });

  it("erkennt einen Befehl statt einer Adresse", () => {
    expect(pruefeAdresse("npx beispiel-server --port 3000")).toBe("befehl");
  });

  it("lehnt http, Unfug und leere Eingaben ab", () => {
    expect(pruefeAdresse("http://aufgaben.beispiel.example/mcp")).toBe("kein_https");
    expect(pruefeAdresse("aufgaben.beispiel.example")).toBe("kein_https");
    expect(pruefeAdresse("   ")).toBe("leer");
  });

  it("lehnt Zugangsdaten in der Adresse ab", () => {
    expect(pruefeAdresse("https://nutzer:passwort@aufgaben.beispiel.example/mcp")).toBe(
      "zugang_in_adresse",
    );
  });

  it("zeigt Adressen ohne Abfrage-Teil und ohne Zugangsdaten", () => {
    expect(kurzAdresse("https://nutzer:passwort@host.example/pfad/mcp?schluessel=geheim")).toBe(
      "host.example/pfad/mcp?…",
    );
    expect(kurzAdresse("https://host.example/")).toBe("host.example");
  });
});
