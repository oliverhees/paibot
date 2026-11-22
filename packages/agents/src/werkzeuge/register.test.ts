/**
 * PaiBot – Tests des Registers der Werkzeuge: Prüfung beim Aufbau, Abdruck einmal, eingefroren, Auslieferung.
 *
 * Noch nicht gebaut: Die Fälle stehen als `it.todo` mit ihrer Gegenprobe im Kommentar.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { describe, it } from "vitest";

describe("Register der Werkzeuge", () => {
  // Gegenprobe je Fall: Prüfung entfernen.
  it.todo("wirft bei doppeltem key oder modelName");
  it.todo("wirft bei modelName gegen TOOL_NAME_PATTERN oder mit „__“");
  it.todo("wirft bei Beschreibung über 1 000 Zeichen oder mit Steuerzeichen");
  it.todo(
    "wirft bei gateAction außerhalb von TOOL_GATE_ACTIONS und bei Eingabe, die kein strictObject ist",
  );
  it.todo("wirft für ein echtes Werkzeug mit der Platzhalter-Kennung eingebaut/unbekannt");
  // Gegenprobe: Abdruck je Aufruf neu aus geänderter Beschreibung.
  it.todo("Abdruck einmal beim Aufbau; Beschreibung eingefroren (Ändern wirft)");
  it.todo("toolDigest im Fakt = Abdruck genau der ausgeführten Definition");
  it.todo("Platzhalter: toolKey eingebaut/unbekannt mit festem Abdruck");
});

describe("Register der Auslieferung", () => {
  // Gegenprobe: Test-Werkzeug mit foreignContent true bzw. Quelle mcp in die Auslieferung → Start wirft.
  it.todo("ist in dieser Fassung leer und enthält kein test_*");
  it.todo("wirft beim Aufbau für ein Werkzeug mit foreignContent true oder Quelle außer eingebaut");
});
