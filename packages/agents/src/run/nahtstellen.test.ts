/**
 * PaiBot – Tests der Nahtstellen eines Laufs und der Fakten-Funktionen (je genau eine Funktion).
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

describe("Nahtstellen", () => {
  // Vertragstest: Exporte und je Nahtstelle ein Ersatz im Lauf. Gegenprobe: zweite Stelle setzt den Wert.
  it.todo(
    "es gibt genau je eine Funktion werkzeugeFuerLauf, kettenStand, untrustedInput, nachFrage, nachAufrufen",
  );
  it.todo("werkzeugeFuerLauf liefert in dieser Fassung das Register; kettenStand ist 0/0/0");
  it.todo("nachFrage liefert immer „abgelehnt“, nachAufrufen immer „weiter“");
  it.todo("laufAusloeser liefert in dieser Fassung chat");
});

describe("untrustedInput", () => {
  // Gegenprobe: (a) nur eigener Lauf; (b) über message_id statt run_id.
  it.todo("Lauf im gesendeten Verlauf mit succeeded-Aufruf mit foreign_content: true");
  it.todo("Lauf im gesendeten Verlauf mit Aufruf untrusted_input = true: true");
  it.todo("fremder Aufruf, der nicht succeeded ist (denied, failed, cancelled): zählt nicht");
  it.todo("eigener Lauf mit succeeded-Aufruf mit foreign_content: true");
  it.todo("nichts davon: false");
});

describe("schrittFakten", () => {
  // Gegenprobe: Werte fest wie bisher.
  it.todo(
    "step, maxSteps, runTokens, stepTokenEstimate, maxRunTokens, toolCount, untrustedInput, trigger aus den Eingaben",
  );
  it.todo("tokensToday = Wert vom Lauf-Anfang + runTokens");
  // Gegenprobe: ungekappt → Tor eingabe_ungueltig ohne Beleg.
  it.todo("Zähler gekappt: je Feld 0 … 1 000 000 000, Summe ≤ Number.MAX_SAFE_INTEGER");
  it.todo("Ausgabegrenze = min(bot.maxOutputTokens, max(Rest, 1000))");
});
