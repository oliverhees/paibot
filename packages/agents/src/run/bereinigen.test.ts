/**
 * PaiBot – Tests der Bereinigung von Namen, Eingaben und Ergebnissen.
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

describe("Bereinigen", () => {
  // Gegenprobe: Bereinigung aus.
  it.todo("entfernt Steuerzeichen außer Zeilenumbruch und Tabulator");
  it.todo("entfernt Bidi-Zeichen U+202A–U+202E, U+2066–U+2069, U+200E, U+200F, U+061C");
  it.todo("entfernt unsichtbare Zeichen U+200B–U+200D, U+2060, U+FEFF und normalisiert auf NFC");
  it.todo(
    "roher Name: bereinigt, höchstens 64 Zeichen, leer → weggelassen; `<script>` bleibt Text",
  );
  it.todo("erkennt Steuer-, Bidi- und unsichtbare Zeichen in einer Eingabe (für inputValid)");
});
