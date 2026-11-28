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
import { ahmtKennzeichnungNach, anzeigeText } from "./anzeigetext";
import { LIMITS } from "./constants";
import { sha256DigestSchema, timezoneSchema } from "./grundtypen";
import { idSchema } from "./id";
import { istTeamName } from "./namen";
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

/**
 * Name einer Routing-Regel: sichtbarer Text ohne Steuer- und Formatzeichen, ohne Leerraum an den
 * Enden und ohne doppelte Leerzeichen, höchstens `LIMITS.routingRuleNameChars` Zeichen.
 */
const routingRuleNameSchema = z
  .string()
  .min(1)
  .max(LIMITS.routingRuleNameChars)
  .refine((name) => anzeigeText(name, LIMITS.routingRuleNameChars) === name)
  .refine((name) => !ahmtKennzeichnungNach(name));

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
    /** Nur bei EUrouter: zweiter Schlüssel, nur zum Lesen der Routing-Regeln (freiwillig). */
    managementKey: apiKeySchema.optional(),
    /** Modell aus der Liste des Anbieters; nur mit Schlüssel. */
    modelSlug: z.string().min(1).max(LIMITS.modelSlugChars).optional(),
    /** Gewählter Anbieter; ohne Angabe der Anbieter, den der Server für die Einrichtung vorsieht. */
    templateKey: providerTemplateKeySchema.optional(),
    /** Nur bei EUrouter: Routing-Regeln, die gespeichert werden (jede wird geprüft). */
    ruleNames: z.array(routingRuleNameSchema).min(1).max(LIMITS.routingRulesPerCheck).optional(),
    /** Nur bei EUrouter: die Regel, die der Bot benutzt; muss in `ruleNames` stehen. */
    ruleName: routingRuleNameSchema.optional(),
    schleuseModeDefault: schleuseModeSchema,
    botName: z.string().trim().min(1).max(LIMITS.botNameChars),
    timezone: timezoneSchema.optional(),
  })
  .refine((input) => input.password === input.passwordRepeat, { path: ["passwordRepeat"] })
  .refine((input) => input.modelSlug === undefined || input.apiKey !== undefined, {
    path: ["modelSlug"],
  })
  .refine((input) => input.ruleNames === undefined || input.apiKey !== undefined, {
    path: ["ruleNames"],
  })
  .refine((input) => input.managementKey === undefined || input.ruleNames !== undefined, {
    path: ["managementKey"],
  })
  .refine(
    (input) => input.ruleName === undefined || (input.ruleNames ?? []).includes(input.ruleName),
    { path: ["ruleName"] },
  );
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

/**
 * Unterhaltung anlegen; ohne Titel vergibt PaiBot einen. Ohne `botId` nimmt sie den Standard-Bot
 * – der bleibt die Vorgabe, nicht die einzige Wahl.
 */
export const conversationCreateInput = z.strictObject({
  title: z.string().trim().min(1).max(LIMITS.conversationTitleChars).optional(),
  botId: idSchema("bot").optional(),
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
 * Anbieter anlegen oder ändern. Ohne `apiKey` bleibt ein gespeicherter Schlüssel erhalten, außer
 * `removeApiKey` ist gesetzt.
 * `http` ist nur für lokale Anbieter erlaubt.
 */
export const providerInput = z
  .strictObject({
    /** Vorlage; ohne Angabe ein eigener Anbieter. */
    templateKey: providerTemplateKeySchema.default("eigener"),
    name: z.string().trim().min(1).max(LIMITS.providerNameChars),
    baseUrl: z.url({ protocol: /^https?$/ }).max(LIMITS.baseUrlChars),
    apiKey: apiKeySchema.optional(),
    /**
     * Nur beim Ändern: den gespeicherten Schlüssel löschen (geht nur bei Region `local`). Nicht
     * zusammen mit `apiKey`.
     */
    removeApiKey: z.literal(true).optional(),
    region: regionSchema,
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    enabled: z.boolean().default(true),
  })
  .refine((input) => input.baseUrl.startsWith("https://") || input.region === "local", {
    path: ["baseUrl"],
  })
  .refine((input) => input.removeApiKey === undefined || input.apiKey === undefined, {
    path: ["removeApiKey"],
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
  /** Gewählter Anbieter; ohne Angabe der Anbieter, den der Server für die Einrichtung vorsieht. */
  templateKey: providerTemplateKeySchema.optional(),
  /** Nur bei EUrouter: Namen der Routing-Regeln, die geprüft werden (je eine kleine Anfrage). */
  ruleNames: z.array(routingRuleNameSchema).min(1).max(LIMITS.routingRulesPerCheck).optional(),
  /** Nur bei EUrouter: zweiter Schlüssel, nur zum Lesen der Routing-Regeln (freiwillig). */
  managementKey: apiKeySchema.optional(),
});
export type SetupConnectionTestInput = z.infer<typeof setupConnectionTestInput>;

/**
 * Einrichtungs-Code prüfen (`POST /api/einrichtung/code-pruefen`), schon im ersten Schritt der
 * Einrichtung. Nur der Code, nichts wird gespeichert; er zählt auf dasselbe Limit je Adresse wie
 * der Abschluss.
 */
export const setupCodeCheckInput = z.strictObject({ setupCode: setupCodeSchema });
export type SetupCodeCheckInput = z.infer<typeof setupCodeCheckInput>;

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

/**
 * Name eines Bots: ohne Leerraum an den Enden, nicht leer, höchstens `LIMITS.botNameChars` Zeichen
 * und nicht mit „Team “ beginnend – solche Namen gehören einem Team und nicht einem Bot.
 */
export const botNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(LIMITS.botNameChars)
  .refine((name) => !istTeamName(name), { message: "reserviert" });

/** Bot ändern: Name, Anweisung, Avatar und Ausgabegrenze. */
export const botInput = z.strictObject({
  name: botNameSchema,
  instructions: z.string().max(LIMITS.botInstructionsChars),
  avatarShape: avatarShapeSchema,
  color: botColorSchema,
  maxOutputTokens: z.number().int().min(1).max(LIMITS.maxOutputTokens),
});
export type BotInput = z.infer<typeof botInput>;

/**
 * Weiteren Bot anlegen: Name, Aufgabe im Team, Anweisung und Aussehen. Ohne Modell nimmt der Bot
 * das Modell des Standard-Bots („wie Pai“); ohne Team steht er für sich.
 */
export const botCreateInput = z.strictObject({
  name: botNameSchema,
  role: z.string().trim().max(LIMITS.botRoleChars).default(""),
  instructions: z.string().max(LIMITS.botInstructionsChars).default(""),
  avatarShape: avatarShapeSchema,
  color: botColorSchema,
  modelId: idSchema("model").optional(),
  teamId: idSchema("team").optional(),
});
export type BotCreateInput = z.infer<typeof botCreateInput>;

/** Bot pausieren oder fortsetzen. */
export const botPauseInput = z.strictObject({ paused: z.boolean() });
export type BotPauseInput = z.infer<typeof botPauseInput>;

/** Bot einem Team zuordnen; ohne `teamId` steht er danach ohne Team da. */
export const botTeamInput = z.strictObject({ teamId: idSchema("team").optional() });
export type BotTeamInput = z.infer<typeof botTeamInput>;

/** Wie ein Team zusammenarbeitet und wer Ergebnisse abnimmt. */
export const teamCollaborationSchema = z.enum(["aus", "leitung_fuehrt"]);
export const teamAcceptanceSchema = z.enum(["leitung", "besitzer", "ohne"]);

/** Team anlegen: nur der Name; Leitung und Schalter kommen mit dem Ändern. */
export const teamCreateInput = z.strictObject({
  name: z.string().trim().min(1).max(LIMITS.teamNameChars),
});
export type TeamCreateInput = z.infer<typeof teamCreateInput>;

/**
 * Team ändern: Name, Leitung, Zusammenarbeit, Abnahme-Standard. Mindestens ein Feld; `lead: null`
 * nimmt die Leitung weg. Welche Felder kamen, meldet die Route dem Tor als Fakt `fields`.
 */
export const teamPatchInput = z
  .strictObject({
    name: z.string().trim().min(1).max(LIMITS.teamNameChars).optional(),
    lead: idSchema("bot").nullable().optional(),
    collaboration: teamCollaborationSchema.optional(),
    acceptance: teamAcceptanceSchema.optional(),
  })
  .refine((input) => Object.keys(input).length > 0, { path: ["name"] });
export type TeamPatchInput = z.infer<typeof teamPatchInput>;

/**
 * Kennung einer Team-Vorlage: zugleich der Dateiname ohne `.json` im Ordner `vorlagen/teams`. Weder
 * Punkt noch Schrägstrich sind erlaubt, damit eine Kennung aus einer Anfrage nie aus dem Ordner
 * herausführen kann.
 */
export const TEAM_TEMPLATE_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;
export const teamTemplateKeySchema = z.string().regex(TEAM_TEMPLATE_KEY_PATTERN);

/** Einen Team-Entwurf aus einer Vorlage erstellen. */
export const teamDraftCreateInput = z.strictObject({ template: teamTemplateKeySchema });
export type TeamDraftCreateInput = z.infer<typeof teamDraftCreateInput>;

/**
 * Ein Team aus einem Entwurf anlegen. `seenDigest` ist der Abdruck, den die Vorschau gezeigt hat;
 * der Server rechnet ihn über den anzulegenden Inhalt nach und lehnt bei Abweichung ab
 * (Vorbedingung „Entwurf-Fassung passt“). `content` ist der in der Vorschau geänderte Inhalt – eine
 * geänderte Anweisung, ein abgewählter Bot. Ohne `content` gilt der gespeicherte Entwurf.
 */
export const teamDraftApplyInput = z.strictObject({
  seenDigest: sha256DigestSchema,
  content: z.unknown().optional(),
});
export type TeamDraftApplyInput = z.infer<typeof teamDraftApplyInput>;

/** Modell des Bots festlegen. */
export const modelChoiceInput = z.strictObject({ modelId: idSchema("model") });

/**
 * Routing-Regel eines Anbieters (EUrouter) hinzufügen: der Name, genau wie im Konto (Groß- und
 * Kleinschreibung zählt). PaiBot prüft ihn mit einer sehr kleinen echten Anfrage.
 */
export const routingRuleInput = z.strictObject({ name: routingRuleNameSchema });
export type RoutingRuleInput = z.infer<typeof routingRuleInput>;

/**
 * Zweiter Schlüssel eines EUrouter-Eintrags (`PUT /api/anbieter/:id/verwaltungsschluessel`): nur
 * zum Lesen der Routing-Regeln des Kontos, nie für Chat-Aufrufe.
 */
export const managementKeyInput = z.strictObject({ managementKey: apiKeySchema });
export type ManagementKeyInput = z.infer<typeof managementKeyInput>;

/**
 * Regeln erneut prüfen (`POST /api/anbieter/:id/regeln/neu-pruefen`): eine gespeicherte Regel
 * (`modelId`) oder, ohne Angabe, alle gespeicherten Regeln des Anbieters.
 */
export const ruleRecheckInput = z.strictObject({ modelId: idSchema("model").optional() });
export type RuleRecheckInput = z.infer<typeof ruleRecheckInput>;
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

/**
 * `PUT /api/notaus`: Not-Aus an (`on: true`) oder aus. Aufheben verlangt das aktuelle Passwort;
 * beim Einschalten wird keins mitgeschickt.
 */
export const killSwitchInput = z
  .strictObject({
    on: z.boolean(),
    currentPassword: passwordSchema.optional(),
  })
  .refine((input) => !(input.on && input.currentPassword !== undefined), {
    path: ["currentPassword"],
  });
export type KillSwitchInput = z.infer<typeof killSwitchInput>;

/** Abfrage der Beleg-Liste: Filter nach Aktion und Unterhaltung, blättern über `before` (seq). */
export const receiptListQuery = z.strictObject({
  action: actionTypeSchema.optional(),
  conversationId: idSchema("conversation").optional(),
  before: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ReceiptListQuery = z.infer<typeof receiptListQuery>;

/** Größe eines Stücks der Kette (`/api/belege/kette`): Standard und Höchstwert. */
export const RECEIPT_CHAIN_PAGE = { default: 500, max: 1000 } as const;

/** Ganze Zahl ab 1 als Text in einer Abfrage: nur Ziffern, ohne Vorzeichen, Punkt oder Exponent. */
const queryCountSchema = z
  .string()
  .regex(/^[1-9][0-9]{0,15}$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(Number.MAX_SAFE_INTEGER));

/**
 * Abfrage der Kette in Stücken: ab Nummer `ab`, höchstens `anzahl` Belege; `pruefung=server`
 * lässt den Server die ganze Kette prüfen (Rückfall, wenn der Browser es nicht kann).
 */
export const receiptChainQuery = z.strictObject({
  ab: queryCountSchema.default(1),
  anzahl: queryCountSchema
    .pipe(z.number().max(RECEIPT_CHAIN_PAGE.max))
    .default(RECEIPT_CHAIN_PAGE.default),
  pruefung: z.literal("server").optional(),
});
export type ReceiptChainQuery = z.infer<typeof receiptChainQuery>;

/** Kopfzeile `Last-Event-ID` beim Fortsetzen des Ereignis-Stroms: letzte gesehene Nummer. */
export const lastEventIdSchema = z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

/** Suche in Unterhaltungen: so viele Treffer je Seite, höchstens bis zu diesem Versatz. */
export const SEARCH_PAGE = { size: 20, maxOffset: 1000, minChars: 2, maxChars: 100 } as const;

/**
 * Abfrage der Suche in Unterhaltungen: `q` ist das Suchwort (ohne Leerraum am Rand, Unicode in
 * Normalform NFC, 2 bis 100 Zeichen, keine Steuerzeichen), `ab` überspringt so viele Treffer
 * (seitenweise).
 */
export const conversationSearchQuery = z.strictObject({
  q: z
    .string()
    .max(SEARCH_PAGE.maxChars * 4)
    .transform((value) => value.normalize("NFC").trim())
    .pipe(
      z
        .string()
        .min(SEARCH_PAGE.minChars)
        .max(SEARCH_PAGE.maxChars)
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Steuerzeichen abweisen
        .regex(/^[^\u0000-\u001f\u007f]*$/),
    ),
  ab: queryCountSchema.pipe(z.number().max(SEARCH_PAGE.maxOffset)).default(0),
});
export type ConversationSearchQuery = z.infer<typeof conversationSearchQuery>;
