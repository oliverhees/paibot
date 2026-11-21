/**
 * PaiBot – Gegenprobe der Ende-zu-Ende-Prüfung: ein absichtlich eingebauter Aufruf nach außen.
 * Wird nur mit `--gegenprobe server` zusätzlich in die Web-App geladen und ruft kurz nach dem Start
 * eine fremde Adresse auf. Die Netz-Sperre muss ihn melden, die Prüfung muss rot werden.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use strict";

setTimeout(() => {
  fetch("https://example.org/").catch(() => undefined);
}, 2000).unref();
