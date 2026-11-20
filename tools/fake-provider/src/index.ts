/**
 * PaiBot – Test-Anbieter mit OpenAI-kompatibler Schnittstelle (`/v1/models`,
 * `/v1/chat/completions` mit Streaming) für Tests, End-to-End-Läufe und Screenshots.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { notImplemented } from "@paibot/stub";

/** Pfade der nachgebildeten Schnittstelle, relativ zur Wurzel des Servers. */
export const FAKE_PROVIDER_PATHS = {
  models: "/v1/models",
  chatCompletions: "/v1/chat/completions",
} as const;

/** Steuerung über HTTP (für den Betrieb als eigener Container in Tests). */
export const FAKE_CONTROL_PATHS = {
  /** `GET`: alle protokollierten Anfragen als JSON. */
  anfragen: "/_steuerung/anfragen",
  /** `POST` mit `FakeFailure` als JSON: die nächsten Anfragen schlagen so fehl. */
  fehler: "/_steuerung/fehler",
  /** `POST` mit einem Teil von `FakeProviderOptions` als JSON: Verhalten ändern. */
  verhalten: "/_steuerung/verhalten",
  /** `POST`: Protokoll und Fehler zurücksetzen, Verhalten auf den Start-Stand. */
  zuruecksetzen: "/_steuerung/zuruecksetzen",
} as const;

/** Name der Umgebungsvariable für den Port beim Start als eigener Prozess. */
export const FAKE_PROVIDER_PORT_ENV = "FAKE_PROVIDER_PORT";

/** Ein Modell in der Liste des Test-Anbieters, im Format von EUrouter mit den Zusatzfeldern. */
export interface FakeModel {
  id: string;
  name?: string;
  contextLength?: number;
  /** z. B. `text->text`; andere Werte prüfen den Filter der Anbieter-Schicht. */
  modality?: string;
  supportsStream?: boolean;
  supportsChat?: boolean;
}

export interface FakeProviderOptions {
  models: FakeModel[];
  /** Antworttext oder Funktion aus den Nachrichten der Anfrage. */
  reply: string | ((messages: ReadonlyArray<{ role: string; content: unknown }>) => string);
  /** Zeichen pro Stück im Strom. */
  chunkChars: number;
  /** Pause vor dem ersten Stück in Millisekunden. */
  firstChunkDelayMs: number;
  /** Pause zwischen den Stücken in Millisekunden. */
  chunkDelayMs: number;
  /** Ist er gesetzt, muss jede Anfrage `Authorization: Bearer <apiKey>` senden, sonst 401. */
  apiKey?: string;
}

/** Wie die nächsten Anfragen fehlschlagen sollen. */
export type FakeFailure =
  | { kind: "status"; status: number; body?: unknown }
  /** Verbindung nach `afterChunks` Stücken hart trennen. */
  | { kind: "abbruch"; afterChunks: number }
  /** Nie antworten. */
  | { kind: "haengen" };

/** Protokoll einer eingegangenen Anfrage, vollständig mit Kopfzeilen und Körper. */
export interface RecordedRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
  receivedAt: string;
  /** `true`, wenn der Aufrufer die Verbindung vor dem Ende der Antwort geschlossen hat. */
  closedByClient: boolean;
}

export interface FakeProvider {
  /** Startet den Server; Port 0 wählt einen freien Port. Liefert die Basis-URL `http://host:port/v1`. */
  start(options?: { host?: string; port?: number }): Promise<{ baseUrl: string; port: number }>;
  stop(): Promise<void>;
  /** Alle Anfragen seit Start bzw. dem letzten `reset`, in Eingangsreihenfolge. */
  readonly requests: readonly RecordedRequest[];
  configure(change: Partial<FakeProviderOptions>): void;
  /** Die nächsten `count` Anfragen (Standard 1) schlagen wie angegeben fehl. */
  failNext(failure: FakeFailure, count?: number): void;
  reset(): void;
}

/**
 * Baut den Test-Anbieter. Er streamt Antworten als Server-Sent Events im OpenAI-Format
 * (`data: {…}`, am Ende `data: [DONE]`), liefert bei `stream_options.include_usage` die
 * Token-Zahlen im letzten Stück und antwortet ohne Streaming mit einer ganzen Antwort.
 * Er baut nie eine Verbindung nach außen auf.
 */
export function createFakeProvider(options?: Partial<FakeProviderOptions>): FakeProvider {
  return notImplemented("fakeProvider.createFakeProvider", options);
}
