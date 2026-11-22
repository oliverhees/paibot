/**
 * PaiBot – Tests: Eintrag des Werkzeugs „In der Doku nachschlagen“ (Kennung, Art, Wirkung, eigener
 * Inhalt, strenge Eingabe, Zeitgrenze), Grenzen der Eingabe und kein Zugriff auf Dateien oder Netz
 * aus der Eingabe. Dazu: Die Auslieferung bietet das Werkzeug in dieser Fassung noch nicht an.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { describe, expect, it } from "vitest";
import { builtinTools } from "../eingebaut";

// Die Gegenprobe im Kommentar ist die Änderung, die den Fall rot machen muss.

describe("Eintrag ins Register", () => {
  // Gegenprobe: `kind: "schreiben"` → Lauf durchs echte Tor endet mit `freigabe_noetig`, das
  // Werkzeug läuft 0-mal; `foreignContent: true` → `createShippedRegistry` wirft.
  it.todo(
    "Kennung genau eingebaut/doku.nachschlagen, Name doku_nachschlagen, lesen, intern, eigener Inhalt, Quelle eingebaut, Zeitgrenze 2 000 ms höchstens Lauf-Zeit; das Register der Auslieferung nimmt es an",
  );
  // Gegenprobe: `z.object` statt `z.strictObject` → Zusatzfeld gilt als gültig.
  it.todo(
    "die Eingabe ist ein strenges Objekt; das JSON Schema an das Modell nennt additionalProperties false und die Längen",
  );
  it.todo(
    "die Beschreibung an das Modell ist fester Text im Code und höchstens 1 000 Zeichen lang",
  );
});

describe("Grenzen der Eingabe", () => {
  // Gegenprobe: `.max(200)` entfernen → 201 Zeichen gültig.
  it.todo(
    "Frage mit 2 oder 201 Zeichen, 3 andere Begriffe, Begriff mit 81 Zeichen, Zusatzfeld, Zahl statt Text: ungültig",
  );
  it.todo("Frage mit 3 und 200 Zeichen, 2 andere Begriffe zu je 80 Zeichen: gültig");
});

describe("Keine Pfade, kein Netz", () => {
  // Gegenprobe: das Werkzeug liest bei einer Frage, die wie ein Pfad aussieht, die Datei → Zähler
  // der Attrappe von `fs` größer 0.
  it.todo(
    "../../.env, /etc/passwd, file:///etc/passwd und https://example.org als Frage: nur Suche, nichts gefunden, kein Zugriff auf Dateien",
  );
});

describe("Auslieferung", () => {
  it("in dieser Fassung bietet die Auslieferung noch kein eingebautes Werkzeug an", () => {
    expect(builtinTools()).toEqual([]);
  });
});
