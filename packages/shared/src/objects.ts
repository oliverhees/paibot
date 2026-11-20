/**
 * PaiBot – Fachobjekte als Zod-Schemas: Unterhaltung, Nachricht, Lauf, Bot, Anbieter, Modell,
 * Einstellungen und Sitzung, so wie sie zwischen den Paketen und über die API gehen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { z } from "zod";
import { errorCodeSchema } from "./errors";
import { countSchema, isoTimeSchema, positiveIntSchema, timezoneSchema } from "./grundtypen";
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
export const providerKindSchema = z.enum(PROVIDER_KINDS);
export type ProviderKind = z.infer<typeof providerKindSchema>;

export const MESSAGE_ROLES = ["user", "assistant", "system"] as const;
export const messageRoleSchema = z.enum(MESSAGE_ROLES);
export type MessageRole = z.infer<typeof messageRoleSchema>;

export const MESSAGE_STATUSES = ["complete", "streaming", "cancelled", "failed"] as const;
export const messageStatusSchema = z.enum(MESSAGE_STATUSES);
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
  name: z.string().min(1).max(100),
  baseUrl: z.url(),
  keySet: z.boolean(),
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
