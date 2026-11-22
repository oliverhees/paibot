/**
 * PaiBot – Hilfen für die Browser-Tests: eigener Zwischenspeicher je Vite-Server, Netz-Sperre für Chromium.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

// Vitest startet jede Testdatei in einem eigenen Prozess, und jede Datei startet einen eigenen
// Vite-Server. Teilen sich die Server den Standard-Zwischenspeicher (node_modules/.vite), bündeln
// sie beim ersten Lauf dieselben Abhängigkeiten gleichzeitig in denselben Ordner und blockieren
// oder überschreiben sich: Die Seite bleibt leer, `#wurzel > *` erscheint nie. Darum bekommt jeder
// Server einen eigenen, frischen Ordner, den er am Ende wieder löscht.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** Legt einen leeren Zwischenspeicher-Ordner an und gibt seinen Pfad zurück. */
export function neuerCacheOrdner() {
  return mkdtempSync(path.join(tmpdir(), "paibot-vite-"));
}

/** Löscht den Ordner wieder; ein Fehler dabei darf einen Test nicht kippen. */
export function loescheCacheOrdner(ordner) {
  if (!ordner) return;
  try {
    rmSync(ordner, { recursive: true, force: true });
  } catch {
    // aufräumen ist Kür
  }
}

/**
 * Startoptionen für `chromium.launch()`: Chromium löst nur 127.0.0.1 auf. Ein Aufruf nach außen
 * (Schrift, Skript, Bild von einem fremden Server) scheitert damit sofort und sichtbar, lokal
 * wie in der CI, statt je nach Netz mal zu klappen und mal nicht.
 */
export const CHROMIUM_OPTIONEN = {
  args: ["--no-proxy-server", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"],
};
