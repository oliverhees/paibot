/**
 * PaiBot – Verhaltens-Tests der Schritt-Schleife mit dem echten Motor gegen den Test-Anbieter mit
 * Drehbuch (PGlite): Ausführung nur nach „erlaubt“, Fakten je Schritt, Grenzen mitten im Lauf,
 * Schritt-Ende, Rückhalten des Texts, Hüllen, Ränder von Namen, Eingaben und Kennungen.
 *
 * Noch nicht gebaut: Fälle als `it.todo`, Gegenprobe im Kommentar (Hinweise unten).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { describe, it } from "vitest";

// Drehbücher: `testdaten/drehbuecher.ts`, Test-Werkzeuge: `testing/werkzeuge.ts`. Die Gegenprobe
// ist die Änderung, die den Fall rot machen muss. Durch das echte Tor kommt ein Werkzeug-Aufruf nur
// als „erlaubt“, wenn das Werkzeug die Kennung von R-010 trägt (`createTestTools({ allowedByR010 })`);
// alles andere entscheidet R-005 als „fragen“, und das ist in dieser Fassung abgelehnt.

describe("Ausführung nur nach „erlaubt“", () => {
  // Drehbuch `textDannAufruf`, `test_lesen` mit Kennung von R-010; Beleg-Schreiber schreibt die Reihenfolge mit.
  // Gegenprobe: (a) `run()` vor `gate.run` aufrufen; (b) im Zweig „abgelehnt“ ausführen.
  it.todo(
    "vor jeder Ausführung stehen Zeile requested, Entscheidung allow und running – in dieser Reihenfolge; Zählwerk = Zahl der allow",
  );
  // Drehbuch `schreiben` mit Standard-Regeln. Gegenprobe: Zweig „fragen“ auf „warten“ (`recordDecision` mit ask bzw. `markWaiting`).
  it.todo(
    "„fragen“ (R-005): test_schreiben läuft nicht, Zeile denied/freigabe_noetig, Hülle mit festem Satz, nichts wartet, Lauf succeeded mit Antwort aus Schritt 2",
  );
  // Fehlschlagendes Repo beim Anlegen der Zeilen bzw. beim Wechsel nach running. Gegenprobe: Fehler ignorieren und ausführen.
  it.todo("scheitert das Schreiben der Zeilen oder der Wechsel nach running, läuft kein Werkzeug");
});

describe("Fremde Inhalte (Deckel D-01)", () => {
  // Lauf 1: `fremd` mit test_fremd (Kennung R-010), End-Antwort. Lauf 2: `schreiben`.
  // Gegenprobe: (a) nur aus dem eigenen Lauf; (b) über message_id statt run_id; (c) `untrustedInput: false` fest.
  it.todo(
    "Lauf 2 nach fremden Inhalten in Lauf 1: Fakt untrustedInput = true, Deckel nicht_noetig statt entfaellt, test_schreiben läuft nicht",
  );
  // Drehbuch `fremdDannLesen`. Gegenprobe: (c).
  it.todo("nach test_fremd ist untrustedInput = true an modell.anfragen des nächsten Schritts");
  // Drehbuch `fremdDannSchreibenImSchritt`. Gegenprobe: Wert nur einmal je Schritt lesen.
  it.todo("nach test_fremd ist untrustedInput = true am nächsten Aufruf im selben Schritt");
  // Gegenprobe: Verlauf kürzen ändert nichts am Wert.
  it.todo(
    "fällt die End-Antwort des fremden Laufs aus dem gesendeten Verlauf, gilt der Lauf nicht mehr als fremd",
  );
});

describe("Fakten je Schritt", () => {
  // Drehbuch `zweiSchritteMitAufruf`. Gegenprobe: `step: 0` fest; `untrustedInput: false` in kontext.ts zurück.
  it.todo(
    "zweiter Schritt: step 1, runTokens = Verbrauch von Schritt 1, maxSteps aus den Einstellungen, toolCount im letzten Schritt 0",
  );
  // Drehbuch `ohneVerbrauch`, kleiner Wert für max_tokens_per_run. Gegenprobe: Schätzung 0.
  it.todo(
    "ohne Verbrauchsangabe zählt jeder Schritt ⌈Eingabe ÷ 4⌉ + Ausgabe; Ende an G-18 vor max_steps_per_run",
  );
  // Drehbuch `dreiSchritteVerbrauch`, Tagesbudget knapp. Gegenprobe: tokensToday nur vom Lauf-Anfang.
  it.todo(
    "G-04 je Schritt: Schritt 3 abgelehnt, wenn Schritt 1 und 2 das Tagesbudget erreicht haben; tokensSince = Summe",
  );
  // Bot auf 200 000, max_tokens_per_run 60 000. Gegenprobe: ohne Begrenzung (erster Schritt an G-18 abgelehnt).
  it.todo("beim Test-Anbieter kommt max_tokens = min(200000, max(Rest, 1000)) an");
  // Gegenprobe: Rest nicht beachtet → Antwort statt festem Satz.
  it.todo("Rest der Lauf-Grenze unter 1 000: G-18 lehnt mit Beleg ab, End-Antwort mit festem Satz");
  // Drehbuch `riesigerVerbrauch`. Gegenprobe: ungekappt → eingabe_ungueltig ohne Beleg.
  it.todo(
    "gemeldeter Verbrauch 2^53: Beleg geschrieben oder sauber abgelehnt, nie wirft der Beleg-Bau",
  );
  // Test-Anbieter meldet je Schritt einen anderen Anbieter. Gegenprobe: nur den letzten servedBy belegen.
  it.todo(
    "zwei Schritte mit zwei Anbietern: zwei Ergebnis-Belege mit eigenem servedBy/modelReported, zwei step.finished",
  );
  // `startFakeSchleuse`, Schleuse nach Schritt 1 weg. Gegenprobe: Zustand nur einmal je Lauf lesen.
  it.todo(
    "Datenschleuse je Schritt: Schleuse nach Schritt 1 weg → Schritt 2 an G-01 abgelehnt, kein Rückfall auf direkt",
  );
});

describe("Grenzen mitten in der Kette", () => {
  // Drehbuch `endlos`. Gegenprobe: letzter Schritt mit Werkzeugen (body.tools gesetzt); toolOffered immer true.
  it.todo(
    "endlose Aufrufe: nach max_steps_per_run Ende, letzter Schritt ohne tools, Aufruf dort V-12, End-Antwort fest, failed schritte_aufgebraucht",
  );
  // Drehbuch `endlosZweiAufrufe`. Gegenprobe: callsInRun nicht hochzählen.
  it.todo("17. Aufruf im Lauf: G-17 mit Beleg-Paar, Schleife geht weiter");
  // Drehbuch `dreiAufrufe`. Gegenprobe: eine actionId für alle.
  it.todo(
    "drei Aufrufe in einem Schritt: drei actionId, drei Beleg-Paare, Reihenfolge wie vom Modell, callIndexInStep 0, 1, 2",
  );
  // Drehbuch `neunAufrufe`. Gegenprobe: callIndexInStep fest 0.
  it.todo("Aufruf 9 bei max_tool_calls_per_step = 8: V-14 mit Beleg-Paar");
  // Drehbuch `siebzehnAufrufe`, `fuenfhundertAufrufe`. Gegenprobe: Obergrenze weg → 500 Beleg-Paare.
  it.todo(
    "mehr als 2 × max_tool_calls_per_step Wünsche: keine Zeile, kein Beleg je Aufruf, modell.anfragen error/zu_viele_aufrufe, Lauf failed",
  );
  // Gegenprobe: Schritt ≥ 1 an G-03 wie Schritt 0 behandeln (denied ohne Antwort).
  it.todo(
    "G-03 oder G-18 lehnt Schritt ≥ 1 ab: Lauf failed limit_erreicht, End-Antwort fest, Zwischentexte bleiben",
  );
  // Gegenprobe: feste End-Antwort auch hier.
  it.todo(
    "andere Ablehnung von Schritt ≥ 1 (G-01, G-02, G-04, G-05): Lauf denied, run.denied, keine End-Antwort",
  );
});

describe("Name und Eingabe prüft die Steuerung selbst", () => {
  // Drehbücher `schemaVerstoss`, `zusatzfeld`. Gegenprobe: inputValid = !invalid.
  it.todo(
    "Schema-Verstoß und Zusatzfeld ohne invalid: inputValid = false, V-13 mit Beleg-Paar, nicht ausgeführt",
  );
  // Drehbücher `jsonAlsText`, `kaputtesJson`. Gegenprobe: Zeichenkette parsen.
  it.todo(
    "Eingabe als Zeichenkette (auch gültiges JSON) und kaputtes JSON: V-13, nicht ausgeführt, nie geparst",
  );
  // Drehbuch `gleitkomma`. Gegenprobe: Fehler des Abdrucks nicht abfangen → Lauf failed intern.
  it.todo("Gleitkommazahl: werkzeug_eingabe_ungueltig mit Beleg-Paar, Lauf läuft weiter");
  // Drehbuch `steuerzeichenInEingabe`. Gegenprobe: Bereinigung aus.
  it.todo("Steuer- oder Bidi-Zeichen in der Eingabe: inputValid = false");
  // Drehbücher `nameMitPunkt`, `nameLeer`, `name65`, `name300`. Gegenprobe: roher Name in den Fakten → eingabe_ungueltig ohne Beleg; ungekürzt in raw_name → CHECK-Fehler.
  it.todo(
    "ungültiger Name: toolName = unbekannt, raw_name bereinigt und ≤ 64, V-12 mit Beleg-Paar, kein Datenbankfehler",
  );
  // Drehbuch `nameNichtRegistriert`. Gegenprobe: toolRegistered fest true.
  it.todo(
    "gültiger, nicht registrierter Name: toolRegistered = false, V-12, Hülle nennt die angebotenen Namen",
  );
  // Drehbuch `name300` (enthält `<script>`). Gegenprobe: Bereinigung aus → Steuerzeichen in raw_name.
  it.todo(
    "raw_name ohne Steuer-, Bidi- und unsichtbare Zeichen gespeichert, `<script>` bleibt reiner Text",
  );
  // Drehbücher `callIdLeer`, `callId201`. Gegenprobe: callId ungeprüft in die Tabelle → Datenbankfehler.
  it.todo(
    "leere und 201 Zeichen lange callId: V-13 mit Beleg-Paar, Ersatz in der Zeile, kein Datenbankfehler",
  );
  // Drehbuch `callIdDoppelt`. Gegenprobe: ohne Endung → eindeutiger Index verletzt.
  it.todo("doppelte callId im Schritt: zwei Zeilen, kein Fehler");
  // Drehbücher `langeEingabeA`, `langeEingabeB`. Gegenprobe: Abdruck über die gekürzte Eingabe → gleiche Abdrücke.
  it.todo(
    "Eingabe über 2 000 Zeichen: nur gekürzt gespeichert, argsDigest über die ganze Eingabe verschieden",
  );
});

describe("Hüllen und Ergebnisse", () => {
  // Protokoll des Test-Anbieters. Gegenprobe: Ergebnis als system- oder user-Nachricht.
  it.todo("das Ergebnis steht beim Test-Anbieter nur als role tool, nie in system oder user");
  // Drehbuch `wirft`. Gegenprobe: Meldung durchreichen.
  it.todo("test_wirft: Merkmal der Meldung weder beim Test-Anbieter noch im Log noch in der Zeile");
  // Drehbuch `fremd`. Gegenprobe: Bereinigung aus.
  it.todo(
    "test_fremd: Steuer-, Bidi- und unsichtbare Zeichen vor dem Modell und in der Zeile entfernt",
  );
  // Drehbuch `grossesErgebnis`. Gegenprobe: Kürzen aus → Hülle zu groß bzw. G-03 im nächsten Schritt.
  it.todo(
    "test_riesig: Hülle ≤ tool_result_max_chars, gekuerzt, output_truncated, output_chars = 100000; zwei Ergebnisse ≤ Grenze je Schritt, das zweite gekürzt",
  );
  // Gegenprobe: Hülle ohne Kennzeichen an das Modell.
  it.todo(
    "Ergebnisse gehen nur als gekennzeichneter fremder Inhalt (feste Hülle) in den nächsten Schritt",
  );
  // Gegenprobe: draft.delta ungebündelt bzw. ohne Höchstlänge.
  it.todo("draft.delta und gespeicherte Eingabe sind in der Länge begrenzt");
});

describe("Schritt-Ende und Rückhalten des Texts", () => {
  // Drehbuch `textDannAufruf`. Gegenprobe: Rückhalten aus → text.delta vor dem Aufruf.
  it.todo(
    "mit Werkzeugen: vor dem Schritt-Ende nur draft.delta, keine text.delta, keine Nachricht; der Text wird Zwischentext",
  );
  // Drehbuch `nurText` mit angebotenen Werkzeugen. Gegenprobe: End-Antwort ohne message.created.
  it.todo(
    "mit Werkzeugen, nur Text: End-Antwort mit genau diesem Text, dann message.created, text.delta, message.completed",
  );
  // Gegenprobe: Abdruck über den Text vor dem Bereinigen bzw. vor dem Speichern.
  it.todo("Abdruck im Ergebnis-Beleg = HMAC über genau den gespeicherten Text");
  // Gegenprobe: Nachricht außerhalb der Transaktion, Fehler dazwischen eingespielt.
  it.todo(
    "Fehler mitten in der Transaktion des Schritt-Endes: keine halbe Nachricht, keine Zeilen",
  );
  // Gegenprobe: Zwischentext mit message.created.
  it.todo(
    "Zwischentext bekommt nur step.finished, kein message.created, text.delta oder message.completed",
  );
});

describe("Abbruch bleibt Zwischentext", () => {
  // Gegenprobe je Fall: Teiltext als End-Antwort speichern.
  it.todo(
    "Stopp mitten in einem Schritt mit Werkzeugen: keine Nachricht mit leerem step, Text als Zwischentext",
  );
  it.todo(
    "Not-Aus mitten in einem Schritt mit Werkzeugen: keine Nachricht mit leerem step, Text als Zwischentext",
  );
  it.todo(
    "Fehler des Anbieters mitten in einem Schritt mit Werkzeugen: keine Nachricht mit leerem step",
  );
});

describe("Spätere Läufe sehen nur End-Antworten", () => {
  // Lauf mit zwei Werkzeug-Schritten, dann „neu erzeugen“ mit Abbruch im ersten Schritt. Gegenprobe: currentAnswers ohne Filter.
  it.todo("der nächste Lauf sieht die ältere End-Antwort, keinen Zwischentext, kein role tool");
  // Gegenprobe: Verlauf ohne nurAntworten laden.
  it.todo("historyMaxMessages zählt nur Nachrichten der Person und End-Antworten");
});

describe("Chat ohne Werkzeuge", () => {
  // Gegenprobe: maxSteps = 0.
  it.todo(
    "ohne angebotene Werkzeuge: ein Schritt, text.delta live, Nachricht streaming wie bisher",
  );
  // Drehbuch `aufrufOhneWerkzeuge`. Gegenprobe: Wunsch ignorieren.
  it.todo(
    "Wunsch trotz leerer Liste: V-12 mit Beleg-Paar je Wunsch, Lauf failed werkzeug_unbekannt, kein weiterer Schritt",
  );
  // Fester Wert aus dem Start-Stand. Gegenprobe: Vorsatz v2 auch ohne Werkzeuge.
  it.todo("Abdruck der Anfrage ohne Werkzeuge Byte für Byte wie vorher");
});

describe("Denk-Text", () => {
  // Drehbuch `mitDenkText`. Gegenprobe: reasoning als Text durchreichen (nur im Test-Motor).
  it.todo(
    "Denk-Text (auch JSON-artig) steht nicht in Nachricht, draft.delta, nächster Anfrage oder Argumenten",
  );
});

describe("Für später nichts verbaut", () => {
  // Gegenprobe: chainRootRunId = Kennung der Unterhaltung.
  it.todo("argsDigest mit chainRootRunId = eigener Lauf");
  // Gegenprobe: Ergebnis des Tors auf freigabe_noetig ändern.
  it.todo("freigabe_noetig nur an Zeile und Hülle; das Ergebnis des Tors bleibt regel_fehlt");
  // Gegenprobe: run.waiting schreiben.
  it.todo(
    "nie run.waiting, nie run.resumed, kein Zustand waiting_approval an runs oder tool_calls",
  );
});
