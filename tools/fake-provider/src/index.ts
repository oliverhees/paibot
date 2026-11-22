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

import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { checkScript, DEFAULT_SCRIPT_PIECES, type FakeScript, splitInto, stepAt } from "./drehbuch";

export {
  checkScript,
  type FakeScript,
  type FakeScriptStep,
  type FakeScriptToolCall,
  toolCallsRepeated,
} from "./drehbuch";

/** Pfade der nachgebildeten Schnittstelle, relativ zur Wurzel des Servers. */
export const FAKE_PROVIDER_PATHS = {
  models: "/v1/models",
  chatCompletions: "/v1/chat/completions",
  /** Öffentliche Liste der Anbieter hinter einem Vermittler (wie `GET /api/v1/providers`). */
  providers: "/api/v1/providers",
} as const;

/** Steuerung über HTTP (für den Betrieb als eigener Container in Tests). */
export const FAKE_CONTROL_PATHS = {
  /** `GET`: alle protokollierten Anfragen als JSON. */
  anfragen: "/_steuerung/anfragen",
  /** `POST` mit `FakeFailure` als JSON: die nächsten Anfragen schlagen so fehl. */
  fehler: "/_steuerung/fehler",
  /** `POST` mit einem Teil von `FakeProviderOptions` als JSON: Verhalten ändern. */
  verhalten: "/_steuerung/verhalten",
  /** `POST` mit einem `FakeScript` als JSON: Drehbuch setzen, Position 0 (falsche Form: 400). */
  drehbuch: "/_steuerung/drehbuch",
  /** `POST`: Protokoll und Fehler zurücksetzen, Verhalten auf den Start-Stand. */
  zuruecksetzen: "/_steuerung/zuruecksetzen",
} as const;

/** Kopfzeile mit dem Steuer-Schlüssel für die Pfade unter `/_steuerung/`. */
export const FAKE_CONTROL_KEY_HEADER = "x-steuerung-schluessel";

/** Schutz der Steuerung. */
export interface FakeControlOptions {
  /**
   * Ist er gesetzt, verlangt jeder Steuer-Pfad die Kopfzeile `x-steuerung-schluessel` mit diesem
   * Wert (sonst 401). Ohne Schlüssel nimmt die Steuerung nur Anfragen von Loopback an (sonst 403).
   */
  key?: string;
}

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

/** Eine Routing-Regel: Anfragen mit `rule_name` = `name` antworten als `provider` mit `model`. */
export interface FakeRoutingRule {
  name: string;
  provider: string;
  model: string;
}

/** Eintrag der öffentlichen Anbieter-Liste (`/api/v1/providers`). */
export interface FakeProviderListEntry {
  slug: string;
  name: string;
  headquarters?: string | null;
}

export interface FakeProviderOptions {
  models: FakeModel[];
  /**
   * Form der Modell-Liste: `eurouter` (Standard: `architecture`, `supported_api_endpoints`,
   * `supported_parameters`) oder `mistral` (`capabilities.completion_chat`, `max_context_length`,
   * `archived`, kein `name`).
   */
  modelFormat?: "eurouter" | "mistral";
  /**
   * Routing-Regeln. Eine Anfrage mit `rule_name` braucht kein `model`; ein unbekannter Name gibt
   * 400 („Routing rule with name '…' not found“). Schickt die Anfrage zusätzlich `model`, gilt das
   * Modell. Antworten über eine Regel tragen `provider` und `model` der Regel in jedem Stück.
   */
  routingRules?: FakeRoutingRule[];
  /** Inhalt von `/api/v1/providers` (ohne Schlüssel abrufbar). */
  providers?: FakeProviderListEntry[];
  /** Antworttext oder Funktion aus den Nachrichten der Anfrage. */
  reply: string | ((messages: ReadonlyArray<{ role: string; content: unknown }>) => string);
  /** Zeichen pro Stück im Strom. */
  chunkChars: number;
  /** Pause vor dem ersten Stück in Millisekunden. */
  firstChunkDelayMs: number;
  /** Pause zwischen den Stücken in Millisekunden. */
  chunkDelayMs: number;
  /**
   * Hält den Strom nach so vielen Text-Stücken an, bis der Aufrufer die Verbindung schließt
   * (z. B. „Stopp“ im Chat). 0 = nie. So lässt sich eine Antwort mitten im Schreiben festhalten.
   */
  holdAfterChunks: number;
  /** Ist er gesetzt, muss jede Anfrage `Authorization: Bearer <apiKey>` senden, sonst 401. */
  apiKey?: string;
  /**
   * Antwortet mit einem Werkzeug-Aufruf (im Strom und ohne Strom). Gilt nur, solange die letzte
   * Nachricht der Anfrage nicht von der Rolle `tool` ist; danach kommt wieder der normale Text.
   * Ein leerer `reply` lässt den Text vor dem Aufruf weg.
   */
  toolCall?: FakeToolCall;
  /**
   * Drehbuch: Die n-te Chat-Anfrage seit dem Setzen bekommt `steps[n]`. `toolCall` und `reply`
   * gelten dann nur noch nach dem letzten Schritt mit `after: "normal"` (Standard). Fehlgeschlagene
   * Anfragen (geplante Fehler, falscher Schlüssel, ungültige Körper) verbrauchen keinen Schritt.
   */
  script?: FakeScript;
}

/** Ein Werkzeug-Aufruf, den der Test-Anbieter statt (oder nach) dem Text meldet. */
export interface FakeToolCall {
  name: string;
  /** Objekt (wird als JSON-Text gesendet) oder bereits fertiger JSON-Text. */
  arguments: Record<string, unknown> | string;
  /** Kennung des Aufrufs; Standard `call_fake_<Nummer>`. */
  id?: string;
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
  /** Index des Drehbuch-Schritts, der diese Anfrage beantwortet hat (bei Wiederholung der letzte). */
  scriptStep?: number;
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
  /** Wie viele Chat-Anfragen seit dem Setzen des Drehbuchs (bzw. `reset`) schon beantwortet wurden. */
  scriptPosition(): number;
}

const DEFAULT_MODELS: FakeModel[] = [
  { id: "fake/test-modell", name: "Test-Modell", contextLength: 32000 },
  { id: "fake/zweites-modell", name: "Zweites Test-Modell", contextLength: 8000 },
  // Wird von der Modell-Liste der Anbieter-Schicht herausgefiltert (kein Text-zu-Text-Modell).
  { id: "fake/bild-modell", name: "Bild-Modell", modality: "text->image", supportsChat: false },
];

const DEFAULT_OPTIONS: FakeProviderOptions = {
  models: DEFAULT_MODELS,
  reply: "Hallo, hier antwortet der Test-Anbieter.",
  chunkChars: 8,
  firstChunkDelayMs: 0,
  chunkDelayMs: 0,
  holdAfterChunks: 0,
};

const MAX_BODY_BYTES = 5 * 1024 * 1024;
const HEALTH_PATH = "/health";

type Message = { role: string; content: unknown };

/** Ein Werkzeug-Aufruf, wie er gesendet wird; `pieces` nur für Aufrufe aus dem Drehbuch. */
interface PlannedCall {
  id: string;
  name: string;
  arguments: string;
  pieces: number | undefined;
}

/** Lauf einer Anfrage: wird `closed`, sobald die Verbindung zu ist (Client oder Server). */
interface Exchange {
  res: ServerResponse;
  record: RecordedRequest | undefined;
  closed: boolean;
  /** Vom Server selbst beendet (Abbruch, Zurücksetzen, Stoppen) und kein Wunsch des Clients. */
  serverEnded: boolean;
}

function createCounter(): () => number {
  let n = 0;
  return () => {
    n += 1;
    return n;
  };
}

function sleep(ms: number, exchange: Exchange): Promise<void> {
  if (ms <= 0 || exchange.closed) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      exchange.res.off("close", done);
      resolve();
    }
    exchange.res.once("close", done);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}

function errorBody(message: string, type: string, code: string | null = null) {
  return { error: { message, type, param: null, code } };
}

function readBody(req: IncomingMessage): Promise<string | undefined> {
  return new Promise((resolve) => {
    const parts: Buffer[] = [];
    let size = 0;
    req.on("data", (part: Buffer) => {
      size += part.length;
      if (size > MAX_BODY_BYTES) {
        resolve(undefined);
        req.destroy();
        return;
      }
      parts.push(part);
    });
    req.on("end", () => resolve(Buffer.concat(parts).toString("utf8")));
    req.on("error", () => resolve(undefined));
  });
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  if (text.trim() === "") return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function flattenHeaders(req: IncomingMessage): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (value !== undefined) headers[name] = Array.isArray(value) ? value.join(", ") : value;
  }
  return headers;
}

/** Grobe, gleichbleibende Schätzung: ein Token je vier Zeichen, mindestens eins. */
function countTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (content === null || content === undefined) return "";
  return JSON.stringify(content);
}

function toMessages(value: unknown): Message[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const messages: Message[] = [];
  for (const entry of value) {
    if (!isObject(entry) || typeof entry.role !== "string") return undefined;
    messages.push({ role: entry.role, content: entry.content });
  }
  return messages;
}

function splitText(text: string, size: number): string[] {
  const characters = Array.from(text);
  const step = Math.max(1, Math.floor(size));
  const pieces: string[] = [];
  for (let i = 0; i < characters.length; i += step)
    pieces.push(characters.slice(i, i + step).join(""));
  return pieces;
}

function mistralModelEntry(model: FakeModel) {
  return {
    id: model.id,
    object: "model",
    created: 1760000000,
    owned_by: "fake",
    capabilities: {
      completion_chat:
        model.supportsChat !== false && (model.modality ?? "text->text") === "text->text",
      completion_fim: false,
      function_calling: true,
      fine_tuning: false,
      vision: false,
      classification: false,
    },
    max_context_length: model.contextLength ?? 32000,
    archived: false,
    aliases: [],
  };
}

function modelEntry(model: FakeModel) {
  const endpoints = model.supportsChat === false ? ["images.generations"] : ["chat.completions"];
  const parameters = ["temperature", "max_tokens", "tools", "tool_choice"];
  if (model.supportsStream !== false) parameters.push("stream");
  return {
    id: model.id,
    object: "model",
    created: 1760000000,
    owned_by: "fake",
    name: model.name ?? model.id,
    context_length: model.contextLength ?? 32000,
    architecture: { modality: model.modality ?? "text->text" },
    supported_api_endpoints: endpoints,
    supported_parameters: parameters,
  };
}

function checkFailure(value: unknown): FakeFailure | string {
  if (!isObject(value)) return "Erwartet ein JSON-Objekt mit `kind`.";
  if (value.kind === "status") {
    const status = value.status;
    if (typeof status !== "number" || !Number.isInteger(status) || status < 400 || status > 599) {
      return "`status` muss eine ganze Zahl von 400 bis 599 sein.";
    }
    return { kind: "status", status, ...("body" in value ? { body: value.body } : {}) };
  }
  if (value.kind === "abbruch") {
    const after = value.afterChunks;
    if (typeof after !== "number" || !Number.isInteger(after) || after < 0) {
      return "`afterChunks` muss eine ganze Zahl ab 0 sein.";
    }
    return { kind: "abbruch", afterChunks: after };
  }
  if (value.kind === "haengen") return { kind: "haengen" };
  return "`kind` muss `status`, `abbruch` oder `haengen` sein.";
}

function checkBehaviour(value: unknown): Partial<FakeProviderOptions> | string {
  if (!isObject(value)) return "Erwartet ein JSON-Objekt.";
  const change: Partial<FakeProviderOptions> = {};
  const whole = (v: unknown, min: number) =>
    typeof v === "number" && Number.isInteger(v) && v >= min;
  for (const [key, v] of Object.entries(value)) {
    switch (key) {
      case "models": {
        if (!Array.isArray(v) || !v.every((m) => isObject(m) && typeof m.id === "string")) {
          return "`models` muss eine Liste von Objekten mit `id` sein.";
        }
        change.models = v as FakeModel[];
        break;
      }
      case "modelFormat":
        if (v !== "eurouter" && v !== "mistral")
          return "`modelFormat` muss eurouter oder mistral sein.";
        change.modelFormat = v;
        break;
      case "routingRules":
        if (
          !Array.isArray(v) ||
          !v.every(
            (r) =>
              isObject(r) &&
              typeof r.name === "string" &&
              typeof r.provider === "string" &&
              typeof r.model === "string",
          )
        ) {
          return "`routingRules` muss eine Liste mit `name`, `provider` und `model` sein.";
        }
        change.routingRules = v as FakeRoutingRule[];
        break;
      case "providers":
        if (!Array.isArray(v) || !v.every((e) => isObject(e) && typeof e.slug === "string")) {
          return "`providers` muss eine Liste von Objekten mit `slug` sein.";
        }
        change.providers = v as FakeProviderListEntry[];
        break;
      case "reply":
        if (typeof v !== "string") return "`reply` muss Text sein.";
        change.reply = v;
        break;
      case "chunkChars":
        if (!whole(v, 1)) return "`chunkChars` muss eine ganze Zahl ab 1 sein.";
        change.chunkChars = v as number;
        break;
      case "firstChunkDelayMs":
      case "chunkDelayMs":
      case "holdAfterChunks":
        if (!whole(v, 0)) return `\`${key}\` muss eine ganze Zahl ab 0 sein.`;
        change[key] = v as number;
        break;
      case "apiKey":
        if (v !== null && typeof v !== "string") return "`apiKey` muss Text oder null sein.";
        (change as { apiKey: string | undefined }).apiKey = v === null ? undefined : v;
        break;
      case "toolCall":
        if (v === null) {
          (change as { toolCall: FakeToolCall | undefined }).toolCall = undefined;
        } else if (
          isObject(v) &&
          typeof v.name === "string" &&
          (typeof v.arguments === "string" || isObject(v.arguments))
        ) {
          change.toolCall = v as unknown as FakeToolCall;
        } else {
          return "`toolCall` braucht `name` und `arguments` (oder null zum Entfernen).";
        }
        break;
      case "script": {
        if (v === null) {
          (change as { script: FakeScript | undefined }).script = undefined;
          break;
        }
        const checked = checkScript(v);
        if (typeof checked === "string") return checked;
        change.script = checked;
        break;
      }
      default:
        return `Unbekannte Einstellung: ${key}`;
    }
  }
  return change;
}

/**
 * Baut den Test-Anbieter. Er streamt Antworten als Server-Sent Events im OpenAI-Format
 * (`data: {…}`, am Ende `data: [DONE]`), liefert bei `stream_options.include_usage` die
 * Token-Zahlen im letzten Stück und antwortet ohne Streaming mit einer ganzen Antwort.
 * Er baut nie eine Verbindung nach außen auf.
 */
export function createFakeProvider(
  options?: Partial<FakeProviderOptions>,
  control: FakeControlOptions = {},
): FakeProvider {
  const startOptions: FakeProviderOptions = { ...DEFAULT_OPTIONS, ...definedOnly(options) };
  let current: FakeProviderOptions = { ...startOptions };
  let records: RecordedRequest[] = [];
  let failures: FakeFailure[] = [];
  const nextId = createCounter();
  let scriptPosition = 0;
  const exchanges = new Set<Exchange>();
  const sockets = new Set<Socket>();
  let server: Server | undefined;

  function definedOnly(change: Partial<FakeProviderOptions> | undefined) {
    const result: Partial<FakeProviderOptions> = {};
    if (!change) return result;
    for (const [key, value] of Object.entries(change)) {
      if (value !== undefined) (result as Record<string, unknown>)[key] = value;
    }
    return result;
  }

  function configure(change: Partial<FakeProviderOptions>): void {
    const next: Record<string, unknown> = { ...current };
    for (const [key, value] of Object.entries(change)) {
      if (value === undefined) {
        if (
          key === "apiKey" ||
          key === "toolCall" ||
          key === "script" ||
          key === "routingRules" ||
          key === "providers" ||
          key === "modelFormat"
        )
          delete next[key];
      } else {
        next[key] = value;
      }
    }
    current = next as unknown as FakeProviderOptions;
    if ("script" in change) scriptPosition = 0;
  }

  function endHard(exchange: Exchange): void {
    exchange.serverEnded = true;
    exchange.res.destroy();
  }

  function reset(): void {
    records = [];
    failures = [];
    current = { ...startOptions };
    scriptPosition = 0;
    for (const exchange of exchanges) endHard(exchange);
  }

  /** `undefined`, wenn die Steuerung erlaubt ist, sonst der HTTP-Status der Ablehnung. */
  function controlRejection(req: IncomingMessage): 401 | 403 | undefined {
    if (control.key !== undefined && control.key !== "") {
      const sent = req.headers[FAKE_CONTROL_KEY_HEADER];
      const given = Buffer.from(typeof sent === "string" ? sent : "");
      const expected = Buffer.from(control.key);
      return given.length === expected.length && timingSafeEqual(given, expected) ? undefined : 401;
    }
    return isLoopback(req.socket.remoteAddress) ? undefined : 403;
  }

  function authorized(req: IncomingMessage): boolean {
    if (current.apiKey === undefined) return true;
    return req.headers.authorization === `Bearer ${current.apiKey}`;
  }

  async function handleApi(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
    const exchange: Exchange = { res, record: undefined, closed: false, serverEnded: false };
    exchanges.add(exchange);
    res.once("close", () => {
      exchange.closed = true;
      exchanges.delete(exchange);
      if (exchange.record && !res.writableFinished && !exchange.serverEnded) {
        exchange.record.closedByClient = true;
      }
    });

    const raw = await readBody(req);
    if (raw === undefined) {
      if (!res.destroyed)
        sendJson(res, 413, errorBody("Anfrage zu groß.", "invalid_request_error"));
      return;
    }
    const parsed = parseJson(raw);
    const record: RecordedRequest = {
      method: req.method ?? "GET",
      path,
      headers: flattenHeaders(req),
      body: parsed.ok ? parsed.value : raw,
      receivedAt: new Date().toISOString(),
      closedByClient: false,
    };
    exchange.record = record;
    records.push(record);
    if (exchange.closed) {
      record.closedByClient = !exchange.serverEnded;
      return;
    }

    if (!authorized(req)) {
      sendJson(
        res,
        401,
        errorBody("Incorrect API key provided.", "invalid_request_error", "invalid_api_key"),
      );
      return;
    }

    const expected = path === FAKE_PROVIDER_PATHS.models ? "GET" : "POST";
    if (req.method !== expected) {
      res.setHeader("allow", expected);
      sendJson(res, 405, errorBody("Methode nicht erlaubt.", "invalid_request_error"));
      return;
    }

    const failure = failures.shift();
    if (failure?.kind === "status") {
      sendJson(
        res,
        failure.status,
        failure.body ?? errorBody("Absichtlich herbeigeführter Fehler.", "fake_error"),
      );
      return;
    }
    if (failure?.kind === "haengen") return; // bleibt offen, bis der Client geht oder der Server endet

    if (path === FAKE_PROVIDER_PATHS.models) {
      if (failure?.kind === "abbruch") return endHard(exchange);
      const entry: (m: FakeModel) => unknown =
        current.modelFormat === "mistral" ? mistralModelEntry : modelEntry;
      sendJson(res, 200, { object: "list", data: current.models.map(entry) });
      return;
    }

    if (!parsed.ok || !isObject(parsed.value)) {
      sendJson(
        res,
        400,
        errorBody("Der Körper ist kein gültiges JSON-Objekt.", "invalid_request_error"),
      );
      return;
    }
    const body = parsed.value;
    const messages = toMessages(body.messages);
    let rule: FakeRoutingRule | undefined;
    if (body.rule_name !== undefined) {
      rule =
        typeof body.rule_name === "string"
          ? current.routingRules?.find((r) => r.name === body.rule_name)
          : undefined;
      if (rule === undefined) {
        const shown = typeof body.rule_name === "string" ? body.rule_name : "";
        sendJson(res, 400, {
          error: {
            code: 400,
            message: `Routing rule with name '${shown}' not found`,
            type: "invalid_request_error",
            param: null,
          },
        });
        return;
      }
    }
    if ((typeof body.model !== "string" && rule === undefined) || messages === undefined) {
      sendJson(
        res,
        400,
        errorBody(
          "`model` (Text) und `messages` (Liste mit `role`) sind Pflicht.",
          "invalid_request_error",
        ),
      );
      return;
    }
    await answer(exchange, body, messages, failure?.kind === "abbruch" ? failure : undefined, rule);
  }

  async function answer(
    exchange: Exchange,
    body: Record<string, unknown>,
    messages: Message[],
    abort: { kind: "abbruch"; afterChunks: number } | undefined,
    rule: FakeRoutingRule | undefined,
  ): Promise<void> {
    const { res } = exchange;
    const settings = current;
    // Den Schritt gleich zu Beginn festlegen, damit parallele Anfragen verschiedene Schritte bekommen.
    const scripted = stepAt(settings.script, scriptPosition);
    if (settings.script !== undefined) scriptPosition += 1;
    if (scripted && exchange.record) exchange.record.scriptStep = scripted.index;

    const lastRole = messages[messages.length - 1]?.role;
    const legacyTool = scripted || lastRole === "tool" ? undefined : settings.toolCall;
    const text = scripted
      ? (scripted.step.text ?? "")
      : typeof settings.reply === "function"
        ? settings.reply(messages)
        : settings.reply;
    const calls: PlannedCall[] = scripted
      ? (scripted.step.toolCalls ?? []).map((call) => ({
          id: call.id ?? `call_fake_${nextId()}`,
          name: call.name,
          arguments:
            typeof call.arguments === "string" ? call.arguments : JSON.stringify(call.arguments),
          pieces: call.pieces ?? DEFAULT_SCRIPT_PIECES,
        }))
      : legacyTool
        ? [
            {
              id: legacyTool.id ?? `call_fake_${nextId()}`,
              name: legacyTool.name,
              arguments:
                typeof legacyTool.arguments === "string"
                  ? legacyTool.arguments
                  : JSON.stringify(legacyTool.arguments),
              pieces: undefined,
            },
          ]
        : [];
    const reasoning = scripted?.step.reasoning;
    const reasoningField = reasoning?.field ?? "reasoning";
    const scriptedServedBy = scripted?.step.servedBy;
    const model =
      scriptedServedBy?.model ??
      (typeof body.model === "string" ? body.model : (rule?.model ?? ""));
    // Wie bei einem Vermittler: Wer geantwortet hat, steht in jedem Stück und in der Antwort. Ein
    // Drehbuch-Schritt kann das je Schritt festlegen.
    const servedBy =
      scriptedServedBy !== undefined
        ? { provider: scriptedServedBy.provider }
        : rule === undefined
          ? {}
          : { provider: rule.provider };
    const id = `chatcmpl-fake-${nextId()}`;
    const created = Math.floor(Date.now() / 1000);
    const finishReason = scripted?.step.finish ?? (calls.length > 0 ? "tool_calls" : "stop");
    const usageSetting = scripted?.step.usage;
    const fixedUsage = typeof usageSetting === "object" ? usageSetting : undefined;
    const promptTokens = fixedUsage
      ? fixedUsage.prompt
      : messages.reduce((sum, m) => sum + countTokens(contentToText(m.content)), 0);
    const completionTokens = fixedUsage
      ? fixedUsage.completion
      : countTokens(text + calls.map((call) => call.name + call.arguments).join(""));
    const usageJson =
      usageSetting === false
        ? undefined
        : {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens,
          };

    await sleep(settings.firstChunkDelayMs, exchange);
    if (exchange.closed) return;

    if (body.stream !== true) {
      if (abort) return endHard(exchange);
      const message: Record<string, unknown> = {
        role: "assistant",
        content: text === "" && calls.length > 0 ? null : text,
      };
      if (reasoning) message[reasoningField] = reasoning.text;
      if (calls.length > 0) {
        message.tool_calls = calls.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: call.arguments },
        }));
      }
      sendJson(res, 200, {
        id,
        object: "chat.completion",
        created,
        model,
        choices: [{ index: 0, message, finish_reason: finishReason }],
        ...(usageJson ? { usage: usageJson } : {}),
        ...servedBy,
      });
      return;
    }

    const includeUsage =
      isObject(body.stream_options) && body.stream_options.include_usage === true;
    const chunk = (delta: Record<string, unknown>, finish: string | null = null) => ({
      id,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [{ index: 0, delta, finish_reason: finish }],
      ...servedBy,
    });

    const events: unknown[] = [chunk({ role: "assistant", content: "" })];
    if (reasoning) {
      for (const piece of splitText(reasoning.text, settings.chunkChars))
        events.push(chunk({ [reasoningField]: piece }));
    }
    for (const piece of splitText(text, settings.chunkChars))
      events.push(chunk({ content: piece }));
    for (const [index, call] of calls.entries()) {
      events.push(
        chunk({
          tool_calls: [
            { index, id: call.id, type: "function", function: { name: call.name, arguments: "" } },
          ],
        }),
      );
      const pieces =
        call.pieces === undefined
          ? splitText(call.arguments, settings.chunkChars)
          : splitInto(call.arguments, call.pieces);
      for (const piece of pieces) {
        events.push(chunk({ tool_calls: [{ index, function: { arguments: piece } }] }));
      }
    }
    events.push(chunk({}, finishReason));
    if (includeUsage && usageJson)
      events.push({
        id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [],
        usage: usageJson,
        ...servedBy,
      });

    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    res.flushHeaders();

    for (let i = 0; i <= events.length; i += 1) {
      if (exchange.closed) return;
      if (abort && i >= abort.afterChunks) {
        // Erst die schon geschriebenen Stücke abschicken lassen, dann hart trennen.
        await new Promise<void>((resolve) => res.write("", () => resolve()));
        return endHard(exchange);
      }
      if (i === events.length) break;
      if (i > 0) {
        await sleep(settings.chunkDelayMs, exchange);
        if (exchange.closed) return;
      }
      res.write(`data: ${JSON.stringify(events[i])}\n\n`);
      if (settings.holdAfterChunks > 0 && i === settings.holdAfterChunks) {
        await new Promise<void>((resolve) => {
          if (exchange.closed) resolve();
          else exchange.res.once("close", () => resolve());
        });
        return;
      }
    }
    res.end("data: [DONE]\n\n");
  }

  async function handleControl(
    req: IncomingMessage,
    res: ServerResponse,
    path: string,
  ): Promise<void> {
    const raw = (await readBody(req)) ?? "";
    const parsed = parseJson(raw);
    const bad = (message: string) =>
      sendJson(res, 400, errorBody(message, "invalid_request_error"));
    const wrongMethod = (allowed: string) => {
      res.setHeader("allow", allowed);
      sendJson(res, 405, errorBody("Methode nicht erlaubt.", "invalid_request_error"));
    };

    if (path === FAKE_CONTROL_PATHS.anfragen) {
      if (req.method !== "GET") return wrongMethod("GET");
      // Den Schlüssel geben wir auch hier nicht wieder heraus.
      const shown = records.map((r) => ({
        ...r,
        headers: r.headers.authorization
          ? { ...r.headers, authorization: "Bearer ***" }
          : r.headers,
      }));
      return sendJson(res, 200, { requests: shown });
    }
    if (req.method !== "POST") return wrongMethod("POST");
    if (!parsed.ok) return bad("Der Körper ist kein gültiges JSON.");

    if (path === FAKE_CONTROL_PATHS.fehler) {
      const value = parsed.value;
      const failure = checkFailure(value);
      if (typeof failure === "string") return bad(failure);
      const count = isObject(value) && value.count !== undefined ? value.count : 1;
      if (typeof count !== "number" || !Number.isInteger(count) || count < 1) {
        return bad("`count` muss eine ganze Zahl ab 1 sein.");
      }
      failNext(failure, count);
      return sendJson(res, 200, { ok: true, geplant: failures.length });
    }
    if (path === FAKE_CONTROL_PATHS.verhalten) {
      const change = checkBehaviour(parsed.value ?? {});
      if (typeof change === "string") return bad(change);
      configure(change);
      return sendJson(res, 200, { ok: true });
    }
    if (path === FAKE_CONTROL_PATHS.drehbuch) {
      const script = checkScript(parsed.value);
      if (typeof script === "string") return bad(script);
      configure({ script });
      return sendJson(res, 200, { ok: true, schritte: script.steps.length });
    }
    // zuruecksetzen
    reset();
    return sendJson(res, 200, { ok: true });
  }

  function failNext(failure: FakeFailure, count = 1): void {
    for (let i = 0; i < count; i += 1) failures.push(failure);
  }

  function guardedControl(req: IncomingMessage, res: ServerResponse, path: string) {
    const rejected = controlRejection(req);
    if (rejected === undefined) return handleControl(req, res, path);
    req.resume();
    return Promise.resolve(
      sendJson(
        res,
        rejected,
        errorBody(
          rejected === 401
            ? "Steuer-Schlüssel fehlt oder ist falsch."
            : "Steuerung nur von Loopback erlaubt.",
          "invalid_request_error",
        ),
      ),
    );
  }

  function handle(req: IncomingMessage, res: ServerResponse): void {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    const controlPaths: readonly string[] = Object.values(FAKE_CONTROL_PATHS);
    if (path === FAKE_PROVIDER_PATHS.providers) {
      req.resume();
      sendJson(res, 200, { data: current.providers ?? [] });
      return;
    }
    const task =
      path === FAKE_PROVIDER_PATHS.models || path === FAKE_PROVIDER_PATHS.chatCompletions
        ? handleApi(req, res, path)
        : controlPaths.includes(path)
          ? guardedControl(req, res, path)
          : path === HEALTH_PATH
            ? Promise.resolve(sendJson(res, 200, { status: "ok" }))
            : Promise.resolve(
                sendJson(
                  res,
                  404,
                  errorBody("Pfad nicht gefunden.", "invalid_request_error", "not_found"),
                ),
              );
    task.catch(() => {
      if (!res.headersSent) sendJson(res, 500, errorBody("Interner Fehler.", "fake_error"));
      else res.destroy();
    });
  }

  return {
    async start(startArgs) {
      if (server) throw new Error("Der Test-Anbieter läuft schon.");
      const host = startArgs?.host ?? "127.0.0.1";
      const created = createServer(handle);
      // Der Server schließt ruhende Verbindungen sonst nach 5 s von sich aus. Der Client legt sie
      // aber zur Wiederverwendung zurück; ist die Ereignisschleife gerade belegt (z. B. beim Anlegen
      // einer Test-Datenbank), trifft die nächste Anfrage eine schon geschlossene Verbindung
      // (ECONNRESET). Ein Test-Anbieter hält Verbindungen offen, bis `stop` sie schließt.
      created.keepAliveTimeout = 0;
      created.on("connection", (socket) => {
        sockets.add(socket);
        socket.once("close", () => sockets.delete(socket));
      });
      await new Promise<void>((resolve, reject) => {
        created.once("error", reject);
        created.listen(startArgs?.port ?? 0, host, () => {
          created.off("error", reject);
          resolve();
        });
      });
      server = created;
      const address = created.address();
      const port = typeof address === "object" && address ? address.port : 0;
      const shownHost = host.includes(":") ? `[${host}]` : host;
      return { baseUrl: `http://${shownHost}:${port}/v1`, port };
    },
    async stop() {
      const running = server;
      if (!running) return;
      server = undefined;
      for (const exchange of exchanges) endHard(exchange);
      const closing = new Promise<void>((resolve) => running.close(() => resolve()));
      for (const socket of sockets) socket.destroy();
      await closing;
    },
    get requests() {
      return [...records];
    },
    configure,
    failNext,
    reset,
    scriptPosition: () => scriptPosition,
  };
}

/** Ist die Adresse eine Loopback-Adresse (IPv4, IPv6 oder IPv4 in IPv6)? */
export function isLoopback(address: string | undefined): boolean {
  if (address === undefined) return false;
  const plain = address.startsWith("::ffff:") ? address.slice(7) : address;
  return plain === "::1" || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(plain);
}
