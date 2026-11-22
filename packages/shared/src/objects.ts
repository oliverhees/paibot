/**
 * PaiBot – Fachobjekte als Zod-Schemas: Unterhaltung, Nachricht, Lauf, Bot, Anbieter, Modell,
 * Einstellungen und Sitzung, so wie sie zwischen den Paketen und über die API gehen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { z } from "zod";
import { errorCodeSchema } from "./errors";
import {
  countSchema,
  hmacDigestSchema,
  isoTimeSchema,
  positiveIntSchema,
  servedBySchema,
  sha256DigestSchema,
  timezoneSchema,
} from "./grundtypen";
import { idSchema } from "./id";
import { SUPPORTED_LOCALES } from "./locale";

/** Modus der Datenschleuse. Die Datenbank lässt später zusätzlich `auto` zu. */
export const SCHLEUSE_MODES = ["off", "on"] as const;
export const schleuseModeSchema = z.enum(SCHLEUSE_MODES);
export type SchleuseMode = z.infer<typeof schleuseModeSchema>;

/** Weg einer Anfrage zum Modell: direkt zum Anbieter oder über die Datenschleuse. */
export const ROUTES = ["direct", "schleuse"] as const;
export const routeSchema = z.enum(ROUTES);
export type Route = z.infer<typeof routeSchema>;

/** Wo ein Anbieter seine Modelle betreibt. */
export const REGIONS = ["eu", "non_eu", "local"] as const;
export const regionSchema = z.enum(REGIONS);
export type Region = z.infer<typeof regionSchema>;

export const PROVIDER_KINDS = ["openai_compatible"] as const;

/**
 * Vorlage, aus der ein Anbieter angelegt wurde: eine bekannte Vorlage (in der Basis `eurouter`)
 * oder `eigener` für einen selbst eingetragenen OpenAI-kompatiblen Anbieter. Die Datenschleuse
 * bildet daraus den Modellnamen.
 */
export const PROVIDER_TEMPLATE_KEYS = ["eurouter", "mistral", "eigener"] as const;
export const providerTemplateKeySchema = z.enum(PROVIDER_TEMPLATE_KEYS);
export type ProviderTemplateKey = z.infer<typeof providerTemplateKeySchema>;
export const providerKindSchema = z.enum(PROVIDER_KINDS);
export type ProviderKind = z.infer<typeof providerKindSchema>;

export const MESSAGE_ROLES = ["user", "assistant", "system"] as const;
export const messageRoleSchema = z.enum(MESSAGE_ROLES);
export type MessageRole = z.infer<typeof messageRoleSchema>;

export const MESSAGE_STATUSES = ["complete", "streaming", "cancelled", "failed"] as const;
export const messageStatusSchema = z.enum(MESSAGE_STATUSES);

/**
 * Woher der Text einer Nachricht des Bots stammt: vom Modell oder als fester Text von PaiBot
 * (z. B. eine Meldung der Steuerung). Steht an jeder Nachricht (Spalte `origin`).
 */
export const MESSAGE_ORIGINS = ["modell", "fest"] as const;
export const messageOriginSchema = z.enum(MESSAGE_ORIGINS);
export type MessageOrigin = z.infer<typeof messageOriginSchema>;
export type MessageStatus = z.infer<typeof messageStatusSchema>;

/**
 * Zustände eines Laufs. `waiting_approval`: der Lauf ist vor einer Aktion der Stufe „fragen“
 * angehalten und wartet auf die Antwort des Besitzers; fortgesetzt wird er durch einen neuen Lauf
 * mit `resumesRunId`. In der Basis kommt dieser Zustand noch nicht vor.
 */
export const RUN_STATUSES = [
  "queued",
  "running",
  "waiting_approval",
  "succeeded",
  "failed",
  "cancelled",
  "denied",
] as const;
export const runStatusSchema = z.enum(RUN_STATUSES);
export type RunStatus = z.infer<typeof runStatusSchema>;

/**
 * Läufe in diesen Zuständen gelten als aktiv; pro Unterhaltung ist höchstens einer aktiv. Auch ein
 * wartender Lauf (`waiting_approval`) zählt dazu: Solange er wartet, nimmt die Unterhaltung keine
 * neue Nachricht an.
 */
export const ACTIVE_RUN_STATUSES = [
  "queued",
  "running",
  "waiting_approval",
] as const satisfies readonly RunStatus[];

export const AVATAR_SHAPES = [
  "blatt",
  "bogen",
  "kiesel",
  "raute",
  "dee",
  "wabe",
  "bluete",
] as const;
export const avatarShapeSchema = z.enum(AVATAR_SHAPES);
export type AvatarShape = z.infer<typeof avatarShapeSchema>;

export const BOT_COLORS = [
  "limette",
  "blau",
  "gruen",
  "violett",
  "pink",
  "tuerkis",
  "gelb",
  "orange",
] as const;
export const botColorSchema = z.enum(BOT_COLORS);
export type BotColor = z.infer<typeof botColorSchema>;

export const SESSION_AUTH_LEVELS = ["password", "password+totp"] as const;
export const sessionAuthLevelSchema = z.enum(SESSION_AUTH_LEVELS);
export type SessionAuthLevel = z.infer<typeof sessionAuthLevelSchema>;

export const SESSION_METHODS = ["password"] as const;
export const sessionMethodSchema = z.enum(SESSION_METHODS);
export type SessionMethod = z.infer<typeof sessionMethodSchema>;

/** ID einer Sitzung: SHA-256 des Sitzungs-Tokens, 64 Hex-Zeichen klein. */
export const sessionIdSchema = z.string().regex(/^[0-9a-f]{64}$/);
export type SessionId = z.infer<typeof sessionIdSchema>;

export const localeSchema = z.enum(SUPPORTED_LOCALES);

export const conversationSchema = z.strictObject({
  id: idSchema("conversation"),
  botId: idSchema("bot"),
  title: z.string().min(1).max(200),
  /** Fehlt der Wert, gilt der Standard aus den Einstellungen. */
  schleuseMode: schleuseModeSchema.optional(),
  lastMessageAt: isoTimeSchema.optional(),
  createdAt: isoTimeSchema,
  updatedAt: isoTimeSchema,
});
export type Conversation = z.infer<typeof conversationSchema>;

export const messageSchema = z.strictObject({
  id: idSchema("message"),
  conversationId: idSchema("conversation"),
  role: messageRoleSchema,
  content: z.string(),
  status: messageStatusSchema,
  runId: idSchema("run").optional(),
  modelId: idSchema("model").optional(),
  providerId: idSchema("provider").optional(),
  route: routeSchema.optional(),
  tokensIn: countSchema.optional(),
  tokensOut: countSchema.optional(),
  errorCode: errorCodeSchema.optional(),
  /** Wer laut Antwort der Schnittstelle geantwortet hat (nur Antworten des Bots, wenn gemeldet). */
  servedBy: servedBySchema.optional(),
  /** Schritt eines Laufs mit Werkzeugen; fehlt bei der End-Antwort und bei Nachrichten der Person. */
  step: countSchema.optional(),
  /** Woher der Text stammt; fehlt = `modell`. */
  origin: messageOriginSchema.optional(),
  /**
   * Die Nachricht enthält oder stützt sich auf fremde Inhalte (etwa aus einer App). Fehlt das
   * Feld, gilt `false`. Nur gesetzt, wenn es `true` ist. Clients, die unbekannte Felder
   * durchlassen, bleiben kompatibel; ein Client mit dem alten, strengen Schema lehnt eine Nachricht
   * mit diesem Feld ab.
   */
  untrusted: z.boolean().optional(),
  createdAt: isoTimeSchema,
});
export type Message = z.infer<typeof messageSchema>;

export const runSchema = z.strictObject({
  id: idSchema("run"),
  conversationId: idSchema("conversation"),
  triggerMessageId: idSchema("message"),
  botId: idSchema("bot"),
  status: runStatusSchema,
  /** Wartender Lauf, den dieser Lauf nach einer Freigabe fortsetzt. */
  resumesRunId: idSchema("run").optional(),
  cancelRequestedAt: isoTimeSchema.optional(),
  heartbeatAt: isoTimeSchema.optional(),
  startedAt: isoTimeSchema.optional(),
  finishedAt: isoTimeSchema.optional(),
  errorCode: errorCodeSchema.optional(),
  createdAt: isoTimeSchema,
});
export type Run = z.infer<typeof runSchema>;

export const botSchema = z.strictObject({
  id: idSchema("bot"),
  name: z.string().min(1).max(60),
  instructions: z.string().max(8000),
  modelId: idSchema("model").optional(),
  avatarShape: avatarShapeSchema,
  color: botColorSchema,
  maxOutputTokens: positiveIntSchema,
  createdAt: isoTimeSchema,
  updatedAt: isoTimeSchema,
});
export type Bot = z.infer<typeof botSchema>;

/** Anbieter, wie er die Oberfläche erreicht: der Schlüssel erscheint nur als „gesetzt“. */
export const providerSchema = z.strictObject({
  id: idSchema("provider"),
  kind: providerKindSchema,
  templateKey: providerTemplateKeySchema,
  name: z.string().min(1).max(100),
  baseUrl: z.url(),
  keySet: z.boolean(),
  /** Nur wenn ein zweiter Schlüssel (nur zum Lesen der Routing-Regeln) hinterlegt ist; nie der Schlüssel. */
  managementKeySet: z.boolean().optional(),
  region: regionSchema,
  /** Land als ISO-3166-Code, fehlt bei unbekanntem Land. */
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  enabled: z.boolean(),
  lastCheckedAt: isoTimeSchema.optional(),
  lastCheckOk: z.boolean().optional(),
  createdAt: isoTimeSchema,
  updatedAt: isoTimeSchema,
});
export type Provider = z.infer<typeof providerSchema>;

export const modelSchema = z.strictObject({
  id: idSchema("model"),
  providerId: idSchema("provider"),
  slug: z.string().min(1).max(200),
  displayName: z.string().min(1).max(200),
  contextWindow: positiveIntSchema.optional(),
  enabled: z.boolean(),
  createdAt: isoTimeSchema,
});
export type Model = z.infer<typeof modelSchema>;

export const settingsSchema = z.strictObject({
  locale: localeSchema,
  timezone: timezoneSchema,
  schleuseModeDefault: schleuseModeSchema,
  maxHops: positiveIntSchema,
  dailyTokenBudget: positiveIntSchema.optional(),
  historyTokenLimit: positiveIntSchema.optional(),
  setupCompletedAt: isoTimeSchema.optional(),
  installationId: idSchema("installation").optional(),
  defaultBotId: idSchema("bot").optional(),
  killSwitch: z.boolean(),
  /** Grenzen eines Laufs mit Werkzeugen (fest, in der Oberfläche nicht änderbar). */
  maxStepsPerRun: positiveIntSchema,
  maxToolCallsPerStep: positiveIntSchema,
  maxToolCallsPerRun: positiveIntSchema,
  maxTokensPerRun: positiveIntSchema,
  toolResultMaxChars: positiveIntSchema,
  toolResultsMaxCharsPerStep: positiveIntSchema,
  createdAt: isoTimeSchema,
  updatedAt: isoTimeSchema,
});
export type Settings = z.infer<typeof settingsSchema>;

/** Sitzung in der Übersicht unter Einstellungen. `current` markiert die eigene Sitzung. */
export const sessionSchema = z.strictObject({
  id: sessionIdSchema,
  ownerId: idSchema("owner"),
  authLevel: sessionAuthLevelSchema,
  method: sessionMethodSchema,
  userAgent: z.string().max(200).optional(),
  createdAt: isoTimeSchema,
  lastSeenAt: isoTimeSchema,
  expiresAt: isoTimeSchema,
  current: z.boolean(),
});
export type Session = z.infer<typeof sessionSchema>;

/** Name eines Werkzeugs, wie ihn auch das Modell sieht. */
export const TOOL_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
export const toolNameSchema = z.string().regex(TOOL_NAME_PATTERN);

/**
 * Kennung eines Werkzeugs in Regeln, Belegen und Oberfläche: Quelle/Name, z. B.
 * `eingebaut/doku.nachschlagen`, mit höchstens einer weiteren Ebene (`mcp/<server>/<name>`).
 * Steht hier statt in `werkzeug.ts`, weil die Fakten der Aktionen sie brauchen; `werkzeug.ts`
 * gibt sie weiter.
 */
export const TOOL_KEY_PATTERN = /^[a-z][a-z0-9]*(\/[a-z0-9][a-z0-9_.-]{0,63}){1,2}$/;
export const toolKeySchema = z.string().max(140).regex(TOOL_KEY_PATTERN);
export type ToolKey = z.infer<typeof toolKeySchema>;

/** Woher ein Werkzeug kommt: eingebaut in PaiBot oder von einem MCP-Server. */
export const TOOL_SOURCES = ["eingebaut", "mcp"] as const;
export const toolSourceSchema = z.enum(TOOL_SOURCES);
export type ToolSource = z.infer<typeof toolSourceSchema>;

/** Ob ein Werkzeug nur liest oder etwas verändert. */
export const TOOL_KINDS = ["lesen", "schreiben"] as const;
export const toolKindSchema = z.enum(TOOL_KINDS);
export type ToolKind = z.infer<typeof toolKindSchema>;

/** Kurzname eines MCP-Servers, wie er in den Fakten steht. */
export const toolServerSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);

/**
 * Zustände eines Werkzeug-Aufrufs:
 * `requested` (vom Modell gewünscht, noch nicht am Tor) → `waiting_approval` (Tor sagt „fragen“,
 * der Lauf wartet) → `approved` (Besitzer hat zugestimmt) → `running` → `succeeded` | `failed`.
 * `denied`: Tor oder Besitzer lehnen ab. `cancelled`: der Lauf wurde abgebrochen.
 */
export const TOOL_CALL_STATUSES = [
  "requested",
  "waiting_approval",
  "approved",
  "running",
  "succeeded",
  "failed",
  "denied",
  "cancelled",
] as const;
export const toolCallStatusSchema = z.enum(TOOL_CALL_STATUSES);
export type ToolCallStatus = z.infer<typeof toolCallStatusSchema>;

/**
 * Wohin ein Werkzeug wirkt, wie es an einem Aufruf gespeichert ist. Gleich `TOOL_REACHES` der
 * Aktionen (ein Test vergleicht beide); eine eigene Liste, weil die Aktionen diese Datei einbinden.
 */
export const TOOL_CALL_REACHES = ["intern", "nach_aussen"] as const;

/** Zustände, in denen der Aufruf erledigt ist und ein Ergebnis für das Modell hat. */
export const FINISHED_TOOL_CALL_STATUSES = [
  "succeeded",
  "failed",
  "denied",
  "cancelled",
] as const satisfies readonly ToolCallStatus[];

/** Ergebnis-Art für das Modell (wie `ToolResult.status` des Motors). */
export const TOOL_RESULT_STATUSES = ["ok", "error", "denied"] as const;
export const toolResultStatusSchema = z.enum(TOOL_RESULT_STATUSES);

/** JSON-Wert ohne Gleitkommazahlen-Prüfung (Argumente und Ergebnisse von Werkzeugen). */
const jsonValueSchema: z.ZodType<unknown> = z.json();

/**
 * Ein Werkzeug-Aufruf im Verlauf: der Wunsch des Modells (Teil der Antwort `messageId`, an Stelle
 * `position`) und sein Ergebnis. Die Kennung ist die `actionId` der Aktion `werkzeug.aufrufen`,
 * über sie hängt der Aufruf an seinen Belegen.
 */
export const toolCallSchema = z.strictObject({
  actionId: idSchema("action"),
  conversationId: idSchema("conversation"),
  runId: idSchema("run"),
  messageId: idSchema("message"),
  position: countSchema,
  /** Kennung des Aufrufs beim Modell, für die Zuordnung des Ergebnisses. */
  callId: z.string().min(1).max(200),
  name: toolNameSchema,
  source: toolSourceSchema,
  server: toolServerSchema.optional(),
  kind: toolKindSchema,
  input: jsonValueSchema,
  argsDigest: hmacDigestSchema,
  status: toolCallStatusSchema,
  decisionReceiptId: idSchema("receipt").optional(),
  resultReceiptId: idSchema("receipt").optional(),
  resultStatus: toolResultStatusSchema.optional(),
  output: jsonValueSchema.optional(),
  errorCode: errorCodeSchema.optional(),
  /** Kennung des Werkzeugs (`toolKeySchema`). Fehlt nur bei Aufrufen aus der Zeit davor. */
  toolKey: toolKeySchema.optional(),
  /** Abdruck der Beschreibung des Werkzeugs. */
  toolDigest: sha256DigestSchema.optional(),
  reach: z.enum(TOOL_CALL_REACHES).optional(),
  /** Das Werkzeug liefert Inhalte von außerhalb von PaiBot. */
  foreignContent: z.boolean().optional(),
  /** Schritt des Laufs, ab 0. */
  step: countSchema.optional(),
  /** Der Lauf hatte vor diesem Aufruf schon fremde Inhalte gelesen. */
  untrustedInput: z.boolean().optional(),
  /** Roher Name des Modells, nur wenn `name` der Platzhalter ist (bereinigt und gekürzt). */
  rawName: z.string().min(1).max(64).optional(),
  /** Das Ergebnis wurde für das Modell gekürzt. */
  outputTruncated: z.boolean().optional(),
  /** Zeichen des Ergebnisses vor dem Kürzen. */
  outputChars: countSchema.optional(),
  createdAt: isoTimeSchema,
  updatedAt: isoTimeSchema,
  finishedAt: isoTimeSchema.optional(),
});
export type ToolCallRecord = z.infer<typeof toolCallSchema>;
