/**
 * PaiBot – Tests eines einzelnen Werkzeug-Aufrufs: Ausführung nur in execute(permit), Normalisieren.
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

describe("Ausführung nur mit Berechtigung", () => {
  // Gegenprobe: Prüfung entfernen → Werkzeug zählt 1.
  it.todo("nachgebaute Berechtigung: wirft, Werkzeug zählt 0");
  it.todo("Berechtigung mit fremder actionId: wirft, Werkzeug zählt 0");
  it.todo("Berechtigung des Tors mit der Kennung der Zeile: Werkzeug läuft genau einmal");
});

describe("Normalisieren", () => {
  // Gegenprobe: Ergebnis von invalid/rawInput des SDK übernehmen.
  it.todo("Name gegen TOOL_NAME_PATTERN, nicht registriert, nicht angeboten → passende Fakten");
  it.todo(
    "callId leer oder über 200 Zeichen: inputValid false, Ersatz pb-<index> in der Zeile, an das Modell die gesendete",
  );
  it.todo("doppelte callId: Endung -<index> in der Zeile");
  it.todo("Eingabe kein reines Objekt oder rawInput gesetzt: inputValid false, nie geparst");
  // Gegenprobe: Fehler aus toolCallDigestText nicht abfangen.
  it.todo("Gleitkommazahl: inputValid false, args = { roh }, kein Fehler");
  it.todo(
    "gespeicherte Eingabe ungültig: { roh } gekürzt auf 2 000 Zeichen; Abdruck über den ganzen Text",
  );
  it.todo("Abbruch: Code ausgang_unbekannt bei schreiben oder nach_aussen, sonst unterbrochen");
});
