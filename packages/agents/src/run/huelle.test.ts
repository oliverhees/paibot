/**
 * PaiBot – Tests der festen Hülle eines Werkzeug-Ergebnisses: Texte nur aus Text-Schlüsseln, Kürzen.
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

describe("Hülle", () => {
  // Gegenprobe: Text aus decision.reason bzw. aus der Meldung des Werkzeugs.
  it.todo("unbekannt: werkzeug_unbekannt mit den Namen der angebotenen Werkzeuge, ≤ 500 Zeichen");
  it.todo(
    "Eingabe ungültig: Feld nur aus Schlüsseln des Schemas, Art fester Text je Zod-Fehlerart, nie Werte",
  );
  it.todo(
    "andere Ablehnung: Titel der ersten verletzten Vorbedingung, sonst Grenze, sonst Regel, sonst Fehlertext",
  );
  it.todo("fragen: freigabe_noetig mit festem Satz");
  it.todo("Zeitgrenze und Fehler: feste Texte; Abbruch: unterbrochen bzw. ausgang_unbekannt");
  it.todo("jede Hülle besteht toolEnvelopeSchema");
  it.todo("Rückweg: ok → ok, fehler → error, abgelehnt → denied");
});

describe("Kürzen", () => {
  // Gegenprobe: Kürzen aus.
  it.todo(
    "Grenze je Aufruf = min(maxOutputChars, tool_result_max_chars), gemessen in JSON.stringify-Zeichen",
  );
  it.todo("Grenze je Schritt: die zuletzt kommenden Ergebnisse werden zuerst gekürzt");
  it.todo(
    "deterministisch: erst Zeichenketten vom Ende, dann Listen vom Ende; gekuerzt, outputChars = Länge vorher",
  );
  it.todo("passt es auch gekürzt nicht: Hülle fehler/werkzeug_fehler");
});
