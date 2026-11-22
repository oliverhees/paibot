/**
 * PaiBot – Tests der Schritt-Schleife gegen echtes Postgres 16: keine Sperre während eines
 * Werkzeugs, Abbruch und Not-Aus mitten im Werkzeug, Datenbank-Halt, Schritt-Ende in einer
 * Transaktion, Aufräumen nach einem Absturz. Läuft nur mit `PAIBOT_TEST_DATABASE_URL`.
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

describe.skipIf(url === undefined)("Schleife gegen Postgres", () => {
  describe("keine Sperre während eines Werkzeugs", () => {
    // Drehbuch `langsam`, test_langsam mit Kennung von R-010; zweite Verbindung mit lock_timeout = '200ms'.
    // Gegenprobe: Werkzeug in einer Transaktion mit `for update` ausführen → Zeitüberschreitung.
    it.todo(
      "während test_langsam läuft, sperrt eine zweite Verbindung runs, tool_calls und settings des Laufs",
    );
  });

  describe("Abbruch mitten im Werkzeug", () => {
    // Gegenprobe: Signal nicht ins Werkzeug weiterreichen → Werkzeug läuft zu Ende.
    it.todo(
      "Not-Aus während test_langsam: Signal binnen 1 s im Werkzeug, Zeile cancelled, kein weiterer Schritt, Lauf cancelled angehalten",
    );
    it.todo(
      "Stopp während test_langsam: Zeile cancelled unterbrochen, kein weiterer Schritt, Lauf cancelled",
    );
    // Schreibendes langsames Werkzeug kommt durch das echte Tor nicht als „erlaubt“ (R-005). Der Fall
    // läuft über die Ausführ-Funktion mit einer Entscheidung aus `evaluate` (wie die Tests des Aufräumens).
    // Gegenprobe: Code immer unterbrochen.
    it.todo(
      "schreibendes bzw. nach außen wirkendes Werkzeug abgebrochen: Zeile cancelled ausgang_unbekannt",
    );
    // Muster `datenbank-ausfall-postgres.test.ts`. Gegenprobe: Wächter-Grund datenbank ignorieren.
    it.todo(
      "Datenbank-Verbindung während test_langsam gekappt: Wächter hält an, Zeile nicht succeeded",
    );
    // Gegenprobe: Teiltext als End-Antwort speichern.
    it.todo(
      "Datenbank-Halt mitten in einem Schritt mit Werkzeugen: keine Nachricht mit leerem step",
    );
  });

  describe("Schritt-Ende", () => {
    // Gegenprobe: Nachricht außerhalb der Transaktion anlegen, Fehler dazwischen.
    it.todo(
      "Fehler mitten in der Transaktion des Schritt-Endes: keine halbe Nachricht, keine Zeilen",
    );
    // Lauf running ohne Herzschlag, dann Aufräumen. Gegenprobe: failRun liest draft.delta als Text.
    it.todo(
      "Absturz mitten im Schritt: keine Nachricht mit leerem step, draft.delta bleibt nur Ereignis",
    );
  });

  describe("Aufräumen", () => {
    // Gegenprobe: endOpenForRun ohne `for update`.
    it.todo(
      "endOpenForRun sperrt die offenen Zeilen; ein gleichzeitiger Wechsel nach running wartet",
    );
    // Gegenprobe: Nachlauf entfernen.
    it.todo(
      "Absturz zwischen dem Beenden des Laufs und dem Schließen der Entscheidungen: der nächste Durchgang schließt sie",
    );
    // Gegenprobe: fehlende Wirkung als unterbrochen zählen.
    it.todo("Entscheidung ohne toolReach: Ergebnis ausgang_unbekannt, gleich wie die Zeile");
    // Gegenprobe: Ergebnis-Beleg nicht an der Zeile vermerken.
    it.todo("das Aufräumen verknüpft den Ergebnis-Beleg mit der Zeile");
    // Gegenprobe: endOpenForRun aus der Transaktion von runs.finish lösen.
    it.todo("endOpenForRun bleibt in derselben Transaktion wie runs.finish");
  });
});
