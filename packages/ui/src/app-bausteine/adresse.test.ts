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
import { kurzAdresse, normalisierteAdresse, pruefeAdresse } from "./adresse";

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

  it("erkennt einen anderen Port als 443, einen Abfrage-Teil und einen Anker schon vor dem Absenden", () => {
    expect(pruefeAdresse("https://aufgaben.beispiel.example:8443/mcp")).toBe("port");
    expect(pruefeAdresse("https://aufgaben.beispiel.example:443/mcp")).toBe("ok");
    expect(pruefeAdresse("https://aufgaben.beispiel.example/mcp?token=geheim")).toBe("zusatz");
    expect(pruefeAdresse("https://aufgaben.beispiel.example/mcp#x")).toBe("zusatz");
  });
});

describe("Adresse normalisiert", () => {
  it("zeigt den Namen in Punycode, wie PaiBot sich verbindet", () => {
    expect(normalisierteAdresse("https://BÜCHER.example/mcp")).toBe(
      "https://xn--bcher-kva.example/mcp",
    );
  });

  it("lässt Port 443, Groß-/Kleinschreibung des Namens und den Schrägstrich am Ende weg", () => {
    expect(normalisierteAdresse("  https://Mcp.Beispiel.DE:443/mcp  ")).toBe(
      "https://mcp.beispiel.de/mcp",
    );
    expect(normalisierteAdresse("https://mcp.beispiel.de/")).toBe("https://mcp.beispiel.de");
    expect(normalisierteAdresse("https://mcp.beispiel.de/mcp/")).toBe(
      "https://mcp.beispiel.de/mcp",
    );
  });

  it("gibt für alles, was keine https-Adresse ist, nichts zurück, und nie Abfrage-Teil oder Zugangsdaten", () => {
    expect(normalisierteAdresse("npx server")).toBeUndefined();
    expect(normalisierteAdresse("http://a.example")).toBeUndefined();
    expect(normalisierteAdresse("https://nutzer:pw@a.example/mcp?k=1#x")).toBe(
      "https://a.example/mcp",
    );
  });
});
