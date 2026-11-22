/**
 * PaiBot – Neustart des Workers mitten in der Schleife: gebündelter Worker als eigener Kindprozess, hart beendet während eines Werkzeugs, danach neuer Worker und Aufräumen (nur mit PAIBOT_TEST_DATABASE_URL).
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

const url = process.env.PAIBOT_TEST_DATABASE_URL;

describe.skipIf(url === undefined)("Neustart mitten im Werkzeug", () => {
  // Drehbuch `langsam`, test_langsam mit Kennung von R-010; nur den eigenen Kindprozess beenden.
  // Gegenprobe: Aufräumen ohne endOpenForRun → Zeile bleibt running.
  it.todo(
    "kill -9 während test_langsam: Lauf failed unterbrochen, Zeile cancelled unterbrochen, Entscheidung mit Ergebnis error, Kette vertrauenswürdig",
  );
  it.todo(
    "danach keine Nachricht mit leerem step, Werkzeug lief genau einmal, neuer Lauf in derselben Unterhaltung möglich",
  );
  // Schreibendes Werkzeug kommt durch das echte Tor nicht als „erlaubt“; siehe Bericht zu den Regeln.
  it.todo("mit schreibendem Werkzeug: Zeile cancelled ausgang_unbekannt");
  // Gegenprobe: abortAll reicht das Signal nicht weiter.
  it.todo("sanftes Beenden (abortAll) mitten im Werkzeug: Lauf cancelled, Zeile cancelled");
});
