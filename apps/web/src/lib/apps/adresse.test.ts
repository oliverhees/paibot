/**
 * PaiBot – Tests der Prüfung einer eingegebenen Adresse einer App: Die Fakten für das Tor werden
 * aus der Eingabe gerechnet, vor jeder Verbindung; Benutzer-, Abfrage- und Anker-Teil, nicht
 * öffentliche Ziele und fremde Ports werden erkannt, ohne dass etwas davon in den Fakten steht.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { newId } from "@paibot/shared/ids";
import { PRECONDITIONS_3 } from "@paibot/shared/tor-fassung-3";
import { describe, expect, it } from "vitest";
import { type AdressFakten, zielAus } from "./adresse";

const appId = newId("app");
const MUSTER_TOKEN = "tok-Geheim-0123456789abcdef";

/** Erfüllt der Fakten-Satz die Vorbedingung V-19 (`app_adresse_erlaubt`)? */
function erlaubt(fakten: AdressFakten): boolean {
  const werte = fakten as unknown as Record<string, unknown>;
  return PRECONDITIONS_3["V-19"].require.every(
    (bedingung) => werte[bedingung.fact] === bedingung.value,
  );
}

describe("Adresse einer App: Fakten für das Tor", () => {
  it("eine saubere https-Adresse erfüllt die Vorbedingung und kommt in die gespeicherte Form", () => {
    const ziel = zielAus("https://mcp.beispiel.de/mcp", appId);
    expect(ziel.fakten).toEqual({
      addressHttps: true,
      addressPublic: true,
      addressPort443: true,
      addressUserinfo: false,
      addressQuery: false,
      addressFragment: false,
    });
    expect(erlaubt(ziel.fakten)).toBe(true);
    expect(ziel.origin).toBe("https://mcp.beispiel.de");
    expect(ziel.url).toBe("https://mcp.beispiel.de/mcp");
    expect(ziel.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("Port 443 ausdrücklich und Leerzeichen am Rand sind erlaubt", () => {
    const ziel = zielAus("  https://mcp.beispiel.de:443/mcp  ", appId);
    expect(erlaubt(ziel.fakten)).toBe(true);
    expect(ziel.origin).toBe("https://mcp.beispiel.de");
  });

  it("bei eingegebenem http: Ursprung bleibt https, das echte Schema steht im Fakt und das Tor lehnt ab", () => {
    const ziel = zielAus("http://mcp.beispiel.de/mcp", appId);
    expect(ziel.origin).toBe("https://mcp.beispiel.de");
    expect(ziel.fakten.addressHttps).toBe(false);
    expect(erlaubt(ziel.fakten)).toBe(false);
    // Mit https dieselbe Adresse: Fakt wahr, erlaubt.
    expect(zielAus("https://mcp.beispiel.de/mcp", appId).fakten.addressHttps).toBe(true);
  });

  const ABGELEHNT: [string, string, Partial<Record<string, boolean>>][] = [
    ["http statt https", "http://mcp.beispiel.de/mcp", { addressHttps: false }],
    [
      "Benutzer-Teil",
      `https://nutzer:${MUSTER_TOKEN}@mcp.beispiel.de/mcp`,
      { addressUserinfo: true },
    ],
    ["nur Benutzername", "https://nutzer@mcp.beispiel.de/mcp", { addressUserinfo: true }],
    [
      "Abfrage-Teil mit Token",
      `https://mcp.beispiel.de/mcp?token=${MUSTER_TOKEN}`,
      { addressQuery: true },
    ],
    ["leerer Abfrage-Teil", "https://mcp.beispiel.de/mcp?", { addressQuery: true }],
    ["Anker", "https://mcp.beispiel.de/mcp#abschnitt", { addressFragment: true }],
    [
      "Anker mit Fragezeichen ist kein Abfrage-Teil",
      "https://mcp.beispiel.de/mcp#a?b",
      { addressFragment: true },
    ],
    ["IPv4", "https://192.0.2.10/mcp", { addressPublic: false }],
    ["Schleife", "https://127.0.0.1/mcp", { addressPublic: false }],
    ["Link-lokal", "https://169.254.169.254/latest", { addressPublic: false }],
    ["IPv6", "https://[::1]/mcp", { addressPublic: false }],
    ["interner Name", "https://postgres/mcp", { addressPublic: false }],
    ["localhost", "https://localhost/mcp", { addressPublic: false }],
    ["anderer Port", "https://mcp.beispiel.de:8443/mcp", { addressPort443: false }],
    [
      "http und IP und Port",
      "http://127.0.0.1:8080/mcp",
      { addressHttps: false, addressPublic: false, addressPort443: false },
    ],
  ];

  for (const [name, roh, erwartet] of ABGELEHNT) {
    it(`${name}: Vorbedingung verletzt, ohne dass die Adresse in den Fakten steht`, () => {
      const ziel = zielAus(roh, appId);
      expect(erlaubt(ziel.fakten)).toBe(false);
      for (const [fakt, wert] of Object.entries(erwartet)) {
        expect(ziel.fakten[fakt as keyof typeof ziel.fakten], fakt).toBe(wert);
      }
      // Weder Benutzer-Teil noch Abfrage-Teil noch Anker erreichen Ursprung, Abdruck oder Fakten.
      const alles = JSON.stringify(ziel);
      expect(alles).not.toContain(MUSTER_TOKEN);
      expect(alles).not.toContain("nutzer");
      expect(alles).not.toContain("abschnitt");
      expect(ziel.origin).toMatch(/^https:\/\/[^/?#@\s]+$/);
    });
  }

  it("der Abdruck hängt von Kennung und Adresse ab, nicht vom Benutzer- oder Abfrage-Teil", () => {
    const sauber = zielAus("https://mcp.beispiel.de/mcp", appId);
    const mit = zielAus("https://u:p@mcp.beispiel.de/mcp?x=1#y", appId);
    expect(mit.digest).toBe(sauber.digest);
    expect(zielAus("https://mcp.beispiel.de/mcp", newId("app")).digest).not.toBe(sauber.digest);
    expect(zielAus("https://mcp.beispiel.de/anderer-pfad", appId).digest).not.toBe(sauber.digest);
  });

  it("ein Befehl statt einer Adresse: app_befehl_nicht_erlaubt", () => {
    for (const befehl of [
      "npx -y @beispiel/server",
      "uvx mcp-server-git",
      "node server.js",
      "docker run x",
    ]) {
      expect(() => zielAus(befehl, appId), befehl).toThrowError(
        expect.objectContaining({ code: "app_befehl_nicht_erlaubt" }),
      );
    }
  });

  it("keine Adresse und keine andere Art von Adresse: abgewiesen, ohne etwas zu verbinden", () => {
    for (const roh of [
      "",
      "   ",
      "kein-url",
      "javascript:alert(1)",
      "file:///etc/passwd",
      "ftp://beispiel.de/x",
      `https://${"a".repeat(3000)}.de/`,
    ]) {
      expect(() => zielAus(roh, appId), roh.slice(0, 30)).toThrow();
    }
  });

  // Gegenprobe: Steuerzeichen und Länge erst nach dem Normalisieren prüfen → `new URL` entfernt
  // Tab und Zeilenumbruch still, aus `https://a.te\nst/mcp` wird `https://a.test/mcp`.
  it("Steuerzeichen in der Adresse: abgewiesen, bevor etwas normalisiert wird", () => {
    for (const roh of [
      "https://mcp.beispiel.de/m\ncp",
      "https://mcp.be\tispiel.de/mcp",
      "https://mcp.beispiel.de/\u0000mcp",
      "https://mcp.beispiel.de/\u007fmcp",
      "https://mcp.beispiel.de/\u0085mcp",
      "https://mcp.beispiel.de/\u202emcp",
      "https://mcp.beispiel.de/\u200bmcp",
    ]) {
      expect(() => zielAus(roh, appId), JSON.stringify(roh)).toThrowError(
        expect.objectContaining({
          code: "eingabe_ungueltig",
          felder: [{ feld: "url", code: "ungueltig" }],
        }),
      );
    }
  });

  it("höchstens 2 000 Zeichen", () => {
    const pfad = (laenge: number) => `https://mcp.beispiel.de/${"a".repeat(laenge - 24)}`;
    expect(pfad(2000)).toHaveLength(2000);
    expect(() => zielAus(pfad(2000), appId)).not.toThrow();
    expect(() => zielAus(pfad(2001), appId)).toThrowError(
      expect.objectContaining({ code: "eingabe_ungueltig" }),
    );
  });

  it("Leerzeichen am Rand bleiben erlaubt, Leerzeichen in der Mitte nicht", () => {
    expect(() => zielAus("  https://mcp.beispiel.de/mcp \n", appId)).not.toThrow();
    expect(() => zielAus("https://mcp.beispiel.de/m cp", appId)).toThrow();
  });
});
