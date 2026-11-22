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
  kurzTagText,
  laengenHinweis,
  schleuseFehler,
  schleuseFehlerArt,
  TITEL_ZEICHEN,
  tagesbudgetAusweg,
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

describe("tagesbudgetAusweg", () => {
  const grund = "Das Tor hat die Aktion abgelehnt. Grenze nicht eingehalten: G-04 „Tagesbudget“.";
  it("nennt bei G-04 den Ausweg und führt zu den Grenzen", () => {
    const r = tagesbudgetAusweg({ ergebnis: "abgelehnt", code: "abgelehnt" }, [grund]);
    expect(r?.ausweg).toContain("Einstellungen › Grenzen");
    expect(r?.ausweg).toContain("Mitternacht");
    expect(r?.ziel.href).toBe("/einstellungen/grenzen");
  });
  it("sonst nichts: andere Grenze, anderer Code, anderes Ende, kein Grund", () => {
    const andere = "Das Tor hat die Aktion abgelehnt. Grenze nicht eingehalten: G-03 „Länge“.";
    expect(
      tagesbudgetAusweg({ ergebnis: "abgelehnt", code: "abgelehnt" }, [andere]),
    ).toBeUndefined();
    expect(
      tagesbudgetAusweg({ ergebnis: "abgelehnt", code: "angehalten" }, [grund]),
    ).toBeUndefined();
    expect(
      tagesbudgetAusweg({ ergebnis: "fehlgeschlagen", code: "abgelehnt" }, [grund]),
    ).toBeUndefined();
    expect(
      tagesbudgetAusweg({ ergebnis: "abgelehnt", code: "abgelehnt" }, [undefined]),
    ).toBeUndefined();
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

describe("kurzTagText", () => {
  const jetzt = new Date("2026-11-21T10:00:00Z");
  it("heute, gestern, Datum im selben Jahr, Datum mit Jahr", () => {
    expect(kurzTagText("2026-11-21T08:00:00Z", "Europe/Berlin", jetzt)).toBe("heute");
    expect(kurzTagText("2026-11-20T23:30:00Z", "Europe/Berlin", jetzt)).toBe("heute");
    expect(kurzTagText("2026-11-20T10:00:00Z", "Europe/Berlin", jetzt)).toBe("gestern");
    expect(kurzTagText("2026-11-16T10:00:00Z", "Europe/Berlin", jetzt)).toBe("16.11.");
    expect(kurzTagText("2025-11-16T10:00:00Z", "Europe/Berlin", jetzt)).toBe("16.11.2025");
  });
  it("zählt Tage in der Zeitzone der Einstellungen, nicht in UTC", () => {
    // 23:30 UTC am 20.11. ist in Berlin schon der 21.11. (heute), in Los Angeles noch der 20.11.
    // (dort ist jetzt 02:00 am 21.11.) und damit gestern.
    expect(kurzTagText("2026-11-20T23:30:00Z", "Europe/Berlin", jetzt)).toBe("heute");
    expect(kurzTagText("2026-11-20T23:30:00Z", "America/Los_Angeles", jetzt)).toBe("gestern");
    expect(kurzTagText("2026-11-21T09:00:00Z", "America/Los_Angeles", jetzt)).toBe("heute");
  });
  it("gestern stimmt auch nach einem 23-Stunden-Tag (Zeitumstellung) und am Monatsanfang", () => {
    // 29.03.2026: Beginn der Sommerzeit, der Tag hat nur 23 Stunden.
    const nachUmstellung = new Date("2026-03-30T00:30:00+02:00");
    expect(kurzTagText("2026-03-29T12:00:00+02:00", "Europe/Berlin", nachUmstellung)).toBe(
      "gestern",
    );
    const monat = new Date("2026-12-01T09:00:00Z");
    expect(kurzTagText("2026-11-30T09:00:00Z", "Europe/Berlin", monat)).toBe("gestern");
  });
  it("ungültige Zeit: keine Angabe", () => {
    expect(kurzTagText("kein Datum", "Europe/Berlin", jetzt)).toBeUndefined();
  });
});
