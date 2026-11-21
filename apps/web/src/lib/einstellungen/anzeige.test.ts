/**
 * PaiBot – Tests der reinen Hilfen der Einstellungen (ohne DOM).
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
  formularAus,
  grenzeErreicht,
  grenzeLesen,
  grenzenPruefen,
  grobesGeraet,
  passwortPruefliste,
  verbrauchSatz,
  zeitpunkt,
} from "./anzeige";
import type { EinstellungenAnzeige } from "./typen";

const E: EinstellungenAnzeige = {
  zeitzone: "Europe/Berlin",
  tagesbudget: null,
  verlaufsgrenze: 8000,
  heute: { token: 0, seit: "2026-11-20T23:00:00.000Z" },
  hoechstwerte: { tagesbudget: LIMITS.dailyTokenBudget, verlaufsgrenze: LIMITS.historyTokens },
};

describe("grobe Geräte-Angabe", () => {
  it.each([
    ["Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0", "Firefox auf Linux"],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0",
      "Edge auf Windows",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      "Safari auf iPhone",
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36",
      "Chrome auf macOS",
    ],
    [
      "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36",
      "Chrome auf Android",
    ],
    [
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0 Safari/537.36",
      "Chrome auf Linux",
    ],
  ])("%s → %s", (kennung, erwartet) => {
    expect(grobesGeraet(kennung)).toBe(erwartet);
  });

  it("ohne oder mit unbekannter Kennung: nichts erfinden", () => {
    expect(grobesGeraet(undefined)).toBe("Gerät ohne Angabe");
    expect(grobesGeraet("curl/8.0")).toBe("Gerät ohne Angabe");
    expect(grobesGeraet("<script>alert(1)</script>")).toBe("Gerät ohne Angabe");
  });
});

describe("Zeit und Prüfliste", () => {
  it("Zeitpunkt in der Zeitzone der Installation", () => {
    expect(zeitpunkt("2026-11-20T13:05:00.000Z", "Europe/Berlin")).toBe("20.11.2026, 14:05");
  });

  it("Prüfliste wie in der Einrichtung", () => {
    expect(passwortPruefliste("kurz", "kurz", 12)).toEqual({
      laenge: false,
      gleich: true,
      fertig: false,
    });
    expect(passwortPruefliste("Fahrrad-Kaffee-Mond-42", "anders", 12).fertig).toBe(false);
    expect(passwortPruefliste("", "", 12).gleich).toBe(false);
    expect(passwortPruefliste("Fahrrad-Kaffee-Mond-42", "Fahrrad-Kaffee-Mond-42", 12).fertig).toBe(
      true,
    );
  });
});

describe("Grenzen im Formular", () => {
  it("liest leer als keine Grenze, Zahlen mit Punkten, lehnt Unsinn ab", () => {
    expect(grenzeLesen("", 100)).toBeNull();
    expect(grenzeLesen("  ", 100)).toBeNull();
    expect(grenzeLesen("1.000", 5000)).toBe(1000);
    expect(grenzeLesen("0", 100)).toBeUndefined();
    expect(grenzeLesen("-3", 100)).toBeUndefined();
    expect(grenzeLesen("1,5", 100)).toBeUndefined();
    expect(grenzeLesen("101", 100)).toBeUndefined();
    expect(grenzeLesen("zehn", 100)).toBeUndefined();
  });

  it("schickt nur geänderte Felder, mit den Namen des Vertrags", () => {
    expect(grenzenPruefen(formularAus(E), E)).toEqual({ ok: true, aenderung: {}, leer: true });
    expect(grenzenPruefen({ tagesbudget: "5000", verlaufsgrenze: "", zeitzone: "UTC" }, E)).toEqual(
      {
        ok: true,
        aenderung: { timezone: "UTC", historyTokenLimit: null, dailyTokenBudget: 5000 },
        leer: false,
      },
    );
  });

  it("meldet ungültige Felder mit Text", () => {
    const p = grenzenPruefen({ tagesbudget: "0", verlaufsgrenze: "x", zeitzone: E.zeitzone }, E);
    expect(p.ok).toBe(false);
    if (!p.ok) {
      expect(p.felder.tagesbudget).toContain("ganze Zahl von 1 bis 1.000.000.000");
      expect(p.felder.verlaufsgrenze).toContain("2.000.000");
    }
  });

  it("Satz zum Verbrauch und erreichte Grenze wie im Tor (nicht kleiner als die Grenze)", () => {
    expect(verbrauchSatz(E)).toBe("0 Token seit 00:00 Uhr. Es gibt keine Tagesgrenze.");
    const mit = { ...E, tagesbudget: 100, heute: { ...E.heute, token: 100 } };
    expect(verbrauchSatz(mit)).toBe("100 von 100 Token seit 00:00 Uhr.");
    expect(grenzeErreicht(mit)).toBe(true);
    expect(grenzeErreicht({ ...mit, heute: { ...mit.heute, token: 99 } })).toBe(false);
    expect(grenzeErreicht(E)).toBe(false);
  });

  it("Adresse des Belegs ist kodiert", () => {
    expect(belegAdresse("bel_123")).toBe("/belege/bel_123");
    expect(belegAdresse("a/b")).toBe("/belege/a%2Fb");
  });
});
