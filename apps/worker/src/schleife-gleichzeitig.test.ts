/**
 * PaiBot – Zwei Läufe mit Werkzeug-Schritten gleichzeitig über den Handler des Workers gegen echtes Postgres (nur mit PAIBOT_TEST_DATABASE_URL); Reihenfolge über die Sperre der Beleg-Kette gesteuert wie in schluessel-gleichzeitig.test.ts.
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

describe.skipIf(url === undefined)("gleichzeitige Läufe mit Werkzeugen", () => {
  // Drehbuch `zweiWerkzeugSchritte` je Lauf; Lauf B ruft prepare() auf, während A auf die Beleg-Sperre wartet.
  // Gegenprobe: Halter wie früher (Fach bei jedem load() leeren) → mindestens ein Lauf failed intern.
  it.todo(
    "zwei Läufe in zwei Unterhaltungen: beide succeeded, kein schluessel_nicht_geladen, ein Schlüssel, Kette vertrauenswürdig",
  );
});
