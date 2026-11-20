/**
 * PaiBot – Motor auf dem Vercel AI SDK: genau ein Modell-Schritt, gestreamt, ohne Werkzeug-Ausführung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { Motor } from "@paibot/shared/motor";
import { notImplemented } from "@paibot/stub";

export interface AiSdkMotorOptions {
  /** Fehlt Antwort-Strom länger als so viele Millisekunden, endet die Runde mit `anbieter_nicht_erreichbar`. */
  idleTimeoutMs?: number;
}

/**
 * Baut den Motor auf dem Vercel AI SDK (`streamText` mit einem Modell aus
 * `createOpenAICompatible({ name, baseURL, apiKey, headers, fetch, includeUsage: true })`, alles
 * aus `TurnInput.model`).
 *
 * Zusagen:
 * - genau ein Modell-Schritt: kein `stopWhen`, Werkzeuge nur als Beschreibung ohne `execute`;
 *   Werkzeug-Wünsche kommen als `tool-call` heraus, ausgeführt wird nichts
 *   (`capabilities().toolsExecutedInternally === false`)
 * - nie eine Text-Kennung als Modell, keine Telemetrie-Registrierung, kein anderes `fetch` als
 *   `TurnInput.model.fetch`
 * - Abbruch über `signal` beendet den Strom sofort; danach kommt kein Ereignis mehr
 * - Fehler kommen als Ereignis `error` mit `MotorErrorCode` (`mapProviderError`), nicht als Ausnahme
 * - speichert nichts: Verlauf und Ergebnisse liegen nur bei der Lauf-Steuerung
 */
export function createAiSdkMotor(options?: AiSdkMotorOptions): Motor {
  return notImplemented("agents.createAiSdkMotor", options);
}
