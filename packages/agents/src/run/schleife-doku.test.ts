/**
 * PaiBot – Tests: Läufe mit dem Werkzeug „In der Doku nachschlagen“ über das echte Tor mit allen
 * Standard-Regeln (erlaubt nur über R-010), den Test-Anbieter mit Drehbuch und eine echte
 * Datenbank: Ergebnis nur als Werkzeug-Ergebnis, ehrliche Quellen, Abdruck und Belege,
 * Bereinigung, kein weiterer Modell-Schritt bei „nichts gefunden“, „verworfen“, Anweisung,
 * eingeschleuste Aufforderung, Chat ohne Wunsch.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { describe, it } from "vitest";

// Drehbücher: `testdaten/drehbuecher-doku.ts`, Test-Indizes: `../werkzeuge/doku/testdaten`.
// Erlaubt wird das Nachschlagen nur durch das echte Tor mit dem vollen Satz der Standard-Regeln
// (R-010); kein Test setzt eine eigene Regel, die „erlaubt“ erzwingt. Reine Entscheidungstests
// nutzen `evaluate` mit einer Regel-Liste. Die Gegenprobe im Kommentar ist die Änderung, die den
// Fall rot machen muss.

describe("Erlaubt nur über R-010", () => {
  // Gegenprobe: Entscheidungstest mit `evaluate` und einer Kopie von R-010 ohne die Bedingung
  // `toolKey` → ein anderes lesendes Werkzeug wird erlaubt.
  it.todo(
    "Lauf mit Doku-Aufruf: Entscheidung allow, Regel R-010 im Beleg, das Werkzeug läuft einmal",
  );
  it.todo(
    "Entscheidung mit evaluate: R-010 erlaubt nur genau diese Kennung; ein anderes lesendes Werkzeug fragt (R-005)",
  );
  // Gegenprobe: `kind: "schreiben"` am Werkzeug → `freigabe_noetig`, Werkzeug läuft 0-mal.
  it.todo(
    "als schreibendes Werkzeug eingetragen: abgelehnt freigabe_noetig, das Werkzeug läuft nicht",
  );
});

describe("Eingabe im Lauf", () => {
  it.todo(
    "ungültige Eingaben an den Rändern: je werkzeug_eingabe_ungueltig mit Beleg-Paar, das Werkzeug läuft 0-mal",
  );
  it.todo("Pfade und Adressen als Frage: nichts gefunden, kein Dateizugriff");
});

describe("Ergebnis, Quellen, Abdruck, Belege", () => {
  it.todo(
    "beim Test-Anbieter kommt das Ergebnis nur als role tool mit der Hülle werkzeug-ergebnis an, nie in system oder user",
  );
  // Gegenprobe: `found` bzw. Quellen aus dem Ergebnis vor dem Kürzen.
  it.todo(
    "Quellen und Zahl der Fundstellen entsprechen genau den Abschnitten in tool_calls.output und beim Test-Anbieter, auch wenn die Hülle gekürzt wurde",
  );
  // Gegenprobe: einen Abschnitt nach dem Senden in der Zeile ändern → Nachrechnen passt nicht.
  it.todo(
    "Abdruck des Ergebnisses = HMAC mit Vorsatz pb-werkzeugergebnis/v1 über genau die gesendete Hülle; Doku-Stand höchstens 80 Zeichen",
  );
  // Gegenprobe: die Beleg-Felder weglassen → `found` fehlt.
  it.todo(
    "Belege mit Treffer: modell.anfragen, werkzeug.aufrufen (R-010) mit Doku-Stand und Fundstellen, modell.anfragen; Kette vertrauenswürdig",
  );
  it.todo(
    "Belege ohne Treffer: modell.anfragen, werkzeug.aufrufen (R-010) mit Fundstellen 0 und Doku-Stand, danach kein Beleg mehr",
  );
  // Gegenprobe: die Bereinigung der Ausgabe in `aufruf.ts` überspringen → ein Zeichen kommt an.
  it.todo(
    "unsichtbare Zeichen im Index (Tag, Variantenwähler, Bidi, Nullbreite) kommen beim Test-Anbieter nicht an",
  );
});

describe("Kein weiterer Modell-Schritt bei „nichts gefunden“", () => {
  // Gegenprobe: `nachAufrufen` immer „weiter“ → die zweite Anfrage kommt an.
  it.todo(
    "„Wie verbinde ich Telegram?“: genau eine Anfrage, End-Antwort origin fest mit dem festen Satz samt Version, Lauf succeeded, Zwischentext step 0 mit dem Entwurf, keine andere End-Antwort",
  );
  it.todo("zwei Fragen ohne Treffer im selben Schritt: kein weiterer Modell-Schritt");
  it.todo("abgelehnter Aufruf und eine Frage ohne Treffer: kein weiterer Modell-Schritt");
  // Gegenprobe: abgelehnte Aufrufe als „nichts gefunden“ zählen → hier Kurzschluss.
  it.todo("nur abgelehnte Aufrufe: der Lauf geht weiter, das Modell sieht die Ablehnung");
  // Gegenprobe: Ereignis „verworfen“ weglassen.
  it.todo(
    "nach dem Kurzschluss: für den Schritt erst step.finished zwischentext, dann step.finished verworfen, beide gültig, in der Transaktion der festen Antwort",
  );
  it.todo("ohne Kurzschluss gibt es nie step.finished verworfen");
  // Gegenprobe: `nurAntworten: false` beim Lesen → der Entwurf erscheint.
  it.todo(
    "der Entwurf des Schritts erscheint nie als Antwort: die Nachrichten der Unterhaltung ohne Zwischentexte enthalten nur Frage und festen Satz",
  );
});

describe("Anweisung, eingeschleuste Aufforderung, Chat", () => {
  it.todo(
    "mit dem Doku-Werkzeug kommt beim Test-Anbieter die Anweisung mit dem Satz zum Nachschlagen und zu Daten statt Anweisungen an",
  );
  it.todo(
    "eine Aufforderung im Doku-Text, test_schreiben zu rufen: der Aufruf geht durchs Tor, R-005 fragt, abgelehnt freigabe_noetig, test_schreiben läuft 0-mal",
  );
  it.todo(
    "mit Doku-Werkzeug ohne Wunsch: eine Anfrage, End-Antwort mit dem Text des Drehbuchs, origin modell, step leer, ein Beleg-Paar modell.anfragen, keine Zeile tool_calls – der Text kommt erst am Schritt-Ende",
  );
});
