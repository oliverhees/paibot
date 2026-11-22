/**
 * PaiBot – Test: Die Pfade der App-Routen für den Browser entsprechen dem Routen-Vertrag.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { describe, expect, it } from "vitest";
import { API_ROUTEN, routenPfad } from "../routen";
import { APP_PFADE } from "./pfade";

describe("APP_PFADE", () => {
  it("entsprechen den Pfaden und Methoden des Vertrags", () => {
    const id = "app_01m81wg92mhw4f655fe1rf19gk";
    const bot = "bot_01m81wg92mhw4f655fe1rf19gk";
    const werkzeug = "tool_01m81wg92mhw4f655fe1rf19gk";
    expect(APP_PFADE.liste()).toBe(routenPfad("appsListe", {}));
    expect(APP_PFADE.verbinden()).toBe(routenPfad("appVerbinden", {}));
    expect(APP_PFADE.werkzeuge(id)).toBe(routenPfad("appWerkzeuge", { id }));
    expect(APP_PFADE.werkzeuge(id)).toBe(routenPfad("appWerkzeugeAbrufen", { id }));
    expect(APP_PFADE.werkzeugEinstufen(id, werkzeug)).toBe(
      routenPfad("appWerkzeugBestaetigen", { id, werkzeug }),
    );
    expect(APP_PFADE.zugriff(id, bot)).toBe(routenPfad("appZugriffSetzen", { id, bot }));
    expect(APP_PFADE.trennen(id)).toBe(routenPfad("appTrennen", { id }));
    expect(API_ROUTEN.appsListe.methode).toBe("GET");
    expect(API_ROUTEN.appVerbinden.methode).toBe("POST");
    expect(API_ROUTEN.appWerkzeugeAbrufen.methode).toBe("POST");
    expect(API_ROUTEN.appWerkzeugBestaetigen.methode).toBe("PUT");
    expect(API_ROUTEN.appZugriffSetzen.methode).toBe("PUT");
    expect(API_ROUTEN.appTrennen.methode).toBe("DELETE");
  });
});
