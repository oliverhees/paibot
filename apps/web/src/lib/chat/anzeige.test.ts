/**
 * PaiBot – Tests der kleinen Regeln der Chat-Oberfläche: Titel aus der ersten Nachricht, Zeiten,
 * Kennung, Weg der Anfrage, passende Seite zu Fehlercodes und Hinweis zur Länge.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { LIMITS } from "@paibot/shared/konstanten";
import { describe, expect, it } from "vitest";
import {
  belegAdresse,
  belegKennung,
  laengenHinweis,
  schleuseFehler,
  schleuseFehlerArt,
  TITEL_ZEICHEN,
  tagText,
  titelAusNachricht,
  uhrzeit,
  wegAngabe,
  zielZuCode,
  zielZuSchleuseFehler,
} from "./anzeige";

describe("titelAusNachricht", () => {
  it("nimmt die erste nicht leere Zeile, fasst Leerraum zusammen", () => {
    expect(titelAusNachricht("\n\n  Hilf mir,   meine Woche\tzu planen.\nZweite Zeile")).toBe(
      "Hilf mir, meine Woche zu planen.",
    );
  });

  it("kürzt lange Zeilen an einer Wortgrenze mit Auslassungszeichen", () => {
    const titel = titelAusNachricht(
      "Schreib mir bitte eine freundliche, aber bestimmte Absage für den Termin am Donnerstag um zehn Uhr",
    );
    expect(Array.from(titel).length).toBeLessThanOrEqual(TITEL_ZEICHEN);
    expect(titel.endsWith("…")).toBe(true);
    expect(titel).toBe("Schreib mir bitte eine freundliche, aber bestimmte Absage…");
  });

  it("schneidet ein sehr langes Wort hart und zählt Zeichen, nicht Bytes", () => {
    expect(titelAusNachricht("a".repeat(100))).toBe(`${"a".repeat(TITEL_ZEICHEN - 1)}…`);
    expect(Array.from(titelAusNachricht("😀".repeat(80))).length).toBe(TITEL_ZEICHEN);
  });

  it("ohne Text: Neue Unterhaltung", () => {
    expect(titelAusNachricht("   \n  ")).toBe("Neue Unterhaltung");
  });
});

describe("Zeiten", () => {
  it("Uhrzeit und Tag in der Zeitzone der Einstellungen", () => {
    expect(uhrzeit("2026-11-21T13:32:00.000Z", "Europe/Berlin")).toBe("14:32");
    const jetzt = new Date("2026-11-21T22:30:00.000Z"); // 23:30 in Berlin
    expect(tagText("2026-11-21T22:10:00.000Z", "Europe/Berlin", jetzt)).toBe("Heute");
    expect(tagText("2026-11-20T10:00:00.000Z", "Europe/Berlin", jetzt)).toBe("Gestern");
    expect(tagText("2026-11-02T10:00:00.000Z", "Europe/Berlin", jetzt)).toBe("2. November 2026");
  });
});

describe("Belege", () => {
  it("Kennung aus der Nummer, Adresse der Beleg-Seite", () => {
    expect(belegKennung(142)).toBe("B-0142");
    expect(belegKennung(12345)).toBe("B-12345");
    expect(belegAdresse("rec_abc")).toBe("/belege/rec_abc");
  });
});

describe("wegAngabe", () => {
  it("direkt ohne pauschale Herkunft, über die Datenschleuse ohne Zahl", () => {
    expect(wegAngabe("direct")).toMatchObject({ modus: "direkt", text: "direkt an den Anbieter" });
    expect(wegAngabe("direct").text).not.toContain("EU");
    expect(wegAngabe("schleuse")).toMatchObject({
      modus: "schleuse",
      text: "geschützt über die Datenschleuse",
    });
  });
});

describe("zielZuCode", () => {
  it("führt zur passenden Seite", () => {
    expect(zielZuCode("kein_modell")?.href).toBe("/modelle");
    expect(zielZuCode("schluessel_ungueltig")?.href).toBe("/modelle");
    expect(zielZuCode("schleuse_blockiert")?.href).toBe("/datenschleuse");
    expect(zielZuCode("limit_erreicht")?.href).toBe("/einstellungen");
    expect(zielZuCode("intern")).toBeUndefined();
  });
});

describe("laengenHinweis", () => {
  it("still bei viel Platz, warnt kurz vor der Grenze, sperrt darüber", () => {
    const max = LIMITS.messageChars;
    expect(laengenHinweis("Hallo", max)).toEqual({ art: "ok" });
    expect(laengenHinweis("x".repeat(max - 100), max)).toEqual({
      art: "knapp",
      text: "Noch 100 Zeichen",
    });
    expect(laengenHinweis("x".repeat(max + 1200), max)).toEqual({
      art: "zu_lang",
      text: "1.200 Zeichen zu viel. Kürze die Nachricht, dann lässt sie sich senden.",
    });
  });
});

describe("Fehler der Datenschleuse", () => {
  it("erkennt, woran es an der Datenschleuse lag", () => {
    expect(schleuseFehlerArt({ ergebnis: "fehlgeschlagen", code: "schleuse_blockiert" })).toBe(
      "blockiert",
    );
    // Abgelehnt mit schluessel_ungueltig gibt es nur, wenn die Datenschleuse den Schlüssel ablehnt.
    expect(schleuseFehlerArt({ ergebnis: "abgelehnt", code: "schluessel_ungueltig" })).toBe(
      "schluessel_passt_nicht",
    );
    expect(schleuseFehlerArt({ ergebnis: "fehlgeschlagen", code: "schluessel_passt_nicht" })).toBe(
      "schluessel_passt_nicht",
    );
    expect(
      schleuseFehlerArt({ ergebnis: "abgelehnt", code: "abgelehnt", schleuseGemeldet: true }),
    ).toBe("nicht_erreichbar");
    expect(
      schleuseFehlerArt({
        ergebnis: "fehlgeschlagen",
        code: "antwort_zu_gross",
        ueberSchleuse: true,
      }),
    ).toBe("antwort_zu_gross");
  });

  it("andere Fehler bleiben beim allgemeinen Text", () => {
    // Der Schlüssel des Anbieters fällt im Lauf auf: das ist kein Fehler der Datenschleuse.
    expect(
      schleuseFehlerArt({ ergebnis: "fehlgeschlagen", code: "schluessel_ungueltig" }),
    ).toBeUndefined();
    expect(schleuseFehlerArt({ ergebnis: "abgelehnt", code: "abgelehnt" })).toBeUndefined();
    expect(
      schleuseFehlerArt({ ergebnis: "fehlgeschlagen", code: "antwort_zu_gross" }),
    ).toBeUndefined();
    expect(
      schleuseFehlerArt({ ergebnis: "abgebrochen", code: "schleuse_blockiert" }),
    ).toBeUndefined();
  });

  it("jede Art hat Satz und Ausweg; der Ausweg führt zur Datenschleuse, nicht zum Anbieter", () => {
    for (const art of [
      "blockiert",
      "nicht_erreichbar",
      "schluessel_passt_nicht",
      "antwort_zu_gross",
    ] as const) {
      const f = schleuseFehler(art);
      expect(f.text.length).toBeGreaterThan(10);
      expect(f.ausweg.length).toBeGreaterThan(10);
    }
    expect(schleuseFehler("schluessel_passt_nicht").ausweg).toContain("SCHLEUSE_KEY");
    expect(zielZuSchleuseFehler("schluessel_passt_nicht")?.href).toBe("/datenschleuse");
    expect(zielZuSchleuseFehler("antwort_zu_gross")).toBeUndefined();
    expect(zielZuCode("schluessel_passt_nicht")?.href).toBe("/datenschleuse");
  });
});
