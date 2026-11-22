/**
 * PaiBot – Bindung der Werkzeug-Aufrufe an ihre Belege im Trigger und Rechte der App-Rolle auf Läufen, gegen echtes Postgres als App-Rolle (nur mit PAIBOT_TEST_DATABASE_URL).
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

describe.skipIf(url === undefined)("Werkzeug-Aufruf und Beleg", () => {
  // Gegenprobe je Fall: Prüfung aus dem Trigger entfernen.
  it.todo("running nur mit Entscheidung allow genau dieser Aktion: deny-Beleg → Fehler");
  it.todo("running mit Entscheidung einer anderen Aktion → Fehler");
  it.todo("running mit einem Ergebnis-Beleg als Entscheidung → Fehler");
  it.todo("denied nur mit Entscheidung dieser Aktion, die nicht allow ist");
  it.todo("succeeded/failed ohne Ergebnis-Beleg bzw. mit Beleg einer anderen Aktion → Fehler");
  it.todo("einmal gesetzte decision_receipt_id bzw. result_receipt_id ändern → Fehler");
  it.todo("der neue Rumpf des Triggers steht in der Liste der Sicherung");
  // Gegenprobe: CHECK entfernen.
  it.todo("Ergebnis über der Grenze in der Datenbank (Länge von output) → Fehler");
});

describe.skipIf(url === undefined)("Rechte der App-Rolle auf Läufen", () => {
  // Gegenprobe: Recht zurückgeben.
  it.todo("delete from runs als App-Rolle → 42501");
});
