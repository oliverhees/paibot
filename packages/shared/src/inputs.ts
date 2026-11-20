/**
 * PaiBot – Zod-Schemas für alle Eingaben der API: Einrichtung, Anmelden, Nachrichten, Anbieter,
 * Bot, Einstellungen, Unterhaltungen und Belege.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { z } from "zod";
import { actionTypeSchema } from "./actions";
import { LIMITS } from "./constants";
import { timezoneSchema } from "./grundtypen";
import { idSchema } from "./id";
import {
  avatarShapeSchema,
  botColorSchema,
  providerTemplateKeySchema,
  regionSchema,
  schleuseModeSchema,
} from "./objects";

/** Einrichtungs-Code: 12 Zeichen Crockford-Base32 in Großbuchstaben, drei Vierergruppen. */
export const SETUP_CODE_PATTERN =
  /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

/**
 * Nimmt den Einrichtungs-Code auch ohne Bindestriche, mit Leerzeichen oder in Kleinbuchstaben an
 * und liefert ihn in der Form `K7QD-9M2F-XW4H`.
 */
export const setupCodeSchema = z
  .string()
  .max(40)
  .transform((value) => {
    const plain = value.replace(/[\s-]/g, "").toUpperCase();
    return plain.length === 12
      ? `${plain.slice(0, 4)}-${plain.slice(4, 8)}-${plain.slice(8, 12)}`
      : plain;
  })
  .pipe(z.string().regex(SETUP_CODE_PATTERN));

/** Neues Passwort: mindestens 12 Zeichen. */
export const newPasswordSchema = z
  .string()
  .min(LIMITS.passwordMinChars)
  .max(LIMITS.passwordMaxChars);

/** Passwort beim Anmelden: nur die Länge wird begrenzt. */
export const passwordSchema = z.string().min(1).max(LIMITS.passwordMaxChars);

const apiKeySchema = z.string().trim().min(1).max(LIMITS.apiKeyChars);

/** Text einer Nachricht: nicht leer, höchstens `LIMITS.messageChars` Zeichen. */
export const messageTextSchema = z
  .string()
  .max(LIMITS.messageChars)
  .refine((value) => value.trim().length > 0, { message: "leer" });

/** Abschluss der Einrichtung mit allen Schritten. */
export const setupInput = z
  .strictObject({
    setupCode: setupCodeSchema,
    password: newPasswordSchema,
    passwordRepeat: z.string().max(LIMITS.passwordMaxChars),
    /** Schlüssel für EUrouter; fehlt, wenn der Schritt übersprungen wurde. */
    apiKey: apiKeySchema.optional(),
    /** Modell aus der Liste des Anbieters; nur mit Schlüssel. */
    modelSlug: z.string().min(1).max(LIMITS.modelSlugChars).optional(),
    schleuseModeDefault: schleuseModeSchema,
    botName: z.string().trim().min(1).max(LIMITS.botNameChars),
    timezone: timezoneSchema.optional(),
  })
  .refine((input) => input.password === input.passwordRepeat, { path: ["passwordRepeat"] })
  .refine((input) => input.modelSlug === undefined || input.apiKey !== undefined, {
    path: ["modelSlug"],
  });
export type SetupInput = z.infer<typeof setupInput>;

/** Anmelden mit Passwort, optional „angemeldet bleiben“. */
export const loginInput = z.strictObject({
  password: passwordSchema,
  remember: z.boolean().default(false),
});
export type LoginInput = z.infer<typeof loginInput>;

/** Passwort ändern; danach sind alle Sitzungen beendet. */
export const passwordChangeInput = z.strictObject({
  currentPassword: passwordSchema,
  newPassword: newPasswordSchema,
});
export type PasswordChangeInput = z.infer<typeof passwordChangeInput>;

/** `POST /api/unterhaltungen/:id/nachrichten`. */
export const sendMessageInput = z.strictObject({
  text: messageTextSchema,
  schleuse: schleuseModeSchema,
});
export type SendMessageInput = z.infer<typeof sendMessageInput>;

/** Unterhaltung anlegen; ohne Titel vergibt PaiBot einen. */
export const conversationCreateInput = z.strictObject({
  title: z.string().trim().min(1).max(LIMITS.conversationTitleChars).optional(),
});
export type ConversationCreateInput = z.infer<typeof conversationCreateInput>;

/** Unterhaltung umbenennen. */
export const conversationRenameInput = z.strictObject({
  title: z.string().trim().min(1).max(LIMITS.conversationTitleChars),
});
export type ConversationRenameInput = z.infer<typeof conversationRenameInput>;

/** Schalter der Datenschleuse, pro Unterhaltung oder als Standard. */
export const schleuseInput = z.strictObject({ mode: schleuseModeSchema });
export type SchleuseInput = z.infer<typeof schleuseInput>;

/**
 * Anbieter anlegen oder ändern. Ohne `apiKey` bleibt ein gespeicherter Schlüssel erhalten.
 * `http` ist nur für lokale Anbieter erlaubt.
 */
export const providerInput = z
  .strictObject({
    /** Vorlage; ohne Angabe ein eigener Anbieter. */
    templateKey: providerTemplateKeySchema.default("eigener"),
    name: z.string().trim().min(1).max(LIMITS.providerNameChars),
    baseUrl: z.url({ protocol: /^https?$/ }).max(LIMITS.baseUrlChars),
    apiKey: apiKeySchema.optional(),
    region: regionSchema,
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    enabled: z.boolean().default(true),
  })
  .refine((input) => input.baseUrl.startsWith("https://") || input.region === "local", {
    path: ["baseUrl"],
  });
export type ProviderInput = z.infer<typeof providerInput>;

/**
 * Verbindungstest während der Einrichtung (`POST /api/einrichtung/verbindungstest`): nur mit dem
 * Einrichtungs-Code und einem neu eingegebenen Schlüssel, nie mit einem gespeicherten Anbieter.
 * Der Code wird wie beim Abschließen geprüft und zählt auf dasselbe Limit je Adresse.
 */
export const setupConnectionTestInput = z.strictObject({
  setupCode: setupCodeSchema,
  apiKey: apiKeySchema,
});
export type SetupConnectionTestInput = z.infer<typeof setupConnectionTestInput>;

/**
 * Verbindungstest nach der Anmeldung (`POST /api/anbieter/verbindungstest`) mit einem neuen
 * Schlüssel oder dem gespeicherten eines Anbieters.
 */
export const connectionTestInput = z
  .strictObject({
    providerId: idSchema("provider").optional(),
    apiKey: apiKeySchema.optional(),
  })
  .refine((input) => input.providerId !== undefined || input.apiKey !== undefined, {
    path: ["apiKey"],
  });
export type ConnectionTestInput = z.infer<typeof connectionTestInput>;

/** Bot ändern: Name, Anweisung, Avatar und Ausgabegrenze. */
export const botInput = z.strictObject({
  name: z.string().trim().min(1).max(LIMITS.botNameChars),
  instructions: z.string().max(LIMITS.botInstructionsChars),
  avatarShape: avatarShapeSchema,
  color: botColorSchema,
  maxOutputTokens: z.number().int().min(1).max(LIMITS.maxOutputTokens),
});
export type BotInput = z.infer<typeof botInput>;

/** Modell des Bots festlegen. */
export const modelChoiceInput = z.strictObject({ modelId: idSchema("model") });
export type ModelChoiceInput = z.infer<typeof modelChoiceInput>;

/** Einstellungen ändern. `null` entfernt eine Grenze. Mindestens ein Feld. */
export const settingsInput = z
  .strictObject({
    timezone: timezoneSchema.optional(),
    historyTokenLimit: z.number().int().min(1).max(LIMITS.historyTokens).nullable().optional(),
    dailyTokenBudget: z.number().int().min(1).max(LIMITS.dailyTokenBudget).nullable().optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    path: ["eingabe"],
  });
export type SettingsInput = z.infer<typeof settingsInput>;

/** Abfrage der Beleg-Liste: Filter nach Aktion und Unterhaltung, blättern über `before` (seq). */
export const receiptListQuery = z.strictObject({
  action: actionTypeSchema.optional(),
  conversationId: idSchema("conversation").optional(),
  before: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ReceiptListQuery = z.infer<typeof receiptListQuery>;

/** Kopfzeile `Last-Event-ID` beim Fortsetzen des Ereignis-Stroms: letzte gesehene Nummer. */
export const lastEventIdSchema = z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
