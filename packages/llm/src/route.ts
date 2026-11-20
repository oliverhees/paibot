/**
 * PaiBot – Modus der Datenschleuse auflösen und den Weg zum Modell bestimmen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { Route, SchleuseMode } from "@paibot/shared/objekte";
import { notImplemented } from "@paibot/stub";
import type { SchleuseStatus } from "./schleuse";

/** Wo der Modus festgelegt sein kann, vom Genauesten zum Allgemeinsten. */
export interface SchleuseModeSources {
  /** Schalter beim Senden der Nachricht. */
  message?: SchleuseMode;
  /** Einstellung der Unterhaltung; fehlt sie, gilt der Standard. */
  conversation?: SchleuseMode;
  /** Standard aus den Einstellungen. */
  settings: SchleuseMode;
}

/** Löst den Modus auf: Nachricht → Unterhaltung → Standard. Rein. */
export function resolveSchleuseMode(sources: SchleuseModeSources): SchleuseMode {
  return notImplemented("llm.resolveSchleuseMode", sources);
}

/** Die Datenschleuse ist gefordert, aber nicht nutzbar. Es gibt nie einen Rückfall auf direkt. */
export interface SchleuseUnavailable {
  unavailable: true;
  reason: "nicht_installiert" | "nicht_erreichbar";
}

/**
 * Bestimmt den Weg: `off` → `direct`; `on` → `schleuse`, wenn sie installiert und erreichbar ist,
 * sonst `SchleuseUnavailable`. Rein; das Tor entscheidet danach (Grenze `schleuse_gefordert`).
 */
export function resolveRoute(
  mode: SchleuseMode,
  schleuse: SchleuseStatus,
): Route | SchleuseUnavailable {
  return notImplemented("llm.resolveRoute", mode, schleuse);
}

/** Typwächter für `SchleuseUnavailable`. */
export function isSchleuseUnavailable(
  value: Route | SchleuseUnavailable,
): value is SchleuseUnavailable {
  return typeof value === "object" && value.unavailable === true;
}
