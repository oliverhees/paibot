/**
 * PaiBot – Test: Die öffentliche Schnittstelle der MCP-Schicht (Liste der Exporte, kein Aufruf ohne Prüfung).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { describe, expect, it } from "vitest";
import * as schnittstelle from "./index";

describe("Öffentliche Schnittstelle", () => {
  it("bietet für Verbindungen nur das Holen der Liste, die Adress-Prüfung und den geprüften Aufruf", () => {
    const aus = Object.keys(schnittstelle).filter((name) =>
      [
        "holeWerkzeuge",
        "rufeWerkzeugAuf",
        "pruefeAdresse",
        "oeffneVerbindung",
        "baueSicheresFetch",
        "rufeAuf",
      ].includes(name),
    );
    expect(aus.sort()).toEqual(["holeWerkzeuge", "pruefeAdresse", "rufeWerkzeugAuf"]);
  });

  it("gibt keine Funktion heraus, die eine Verbindung offen hält oder ohne Prüfung aufruft", () => {
    for (const name of Object.keys(schnittstelle)) {
      expect(name).not.toMatch(/^(oeffneVerbindung|baueSicheresFetch|rufeAuf)$/);
    }
  });

  it("die Liste aller Exporte ist fest (eine neue Funktion muss hier bewusst eingetragen werden)", () => {
    expect(Object.keys(schnittstelle).sort()).toEqual([
      "APP_KURZNAME_MUSTER",
      "MCP_EMPFOHLENES_LEERLAUF_MS",
      "MCP_EMPFOHLENE_ANTWORT_BYTES",
      "MCP_FEHLERCODES",
      "MCP_FEHLERTEXTE",
      "MODELL_NAME_MUSTER",
      "MODELL_STICHWORTE",
      "McpSchichtFehler",
      "NAMEN_TRENNER",
      "OBJEKT_NAMEN",
      "SCHEMA_PROBLEME",
      "STANDARD_GRENZEN",
      "WERKZEUG_ABDRUCK_VORSATZ",
      "abdruckVonText",
      "abdruckVonWert",
      "bereinigeNamensteil",
      "bereinigeText",
      "bereiteWerkzeugeAuf",
      "entferneMarkdownBilder",
      "ergebnisZuText",
      "holeWerkzeuge",
      "kanonischeForm",
      "mitStandardGrenzen",
      "modellDefinition",
      "ordneFehlerZu",
      "ordneStatusZu",
      "pruefeAdresse",
      "pruefeStruktur",
      "rufeWerkzeugAuf",
      "verarbeiteSchema",
      "vergebeModellNamen",
      "vergleicheWerkzeuge",
    ]);
  });
});
