/**
 * PaiBot – alle Aktionen, die durch das Tor gehen: Akteur, Ziel und die Fakten, die das Tor prüft.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { z } from "zod";
import { countSchema, positiveIntSchema } from "./grundtypen";
import { type ActionId, type BotId, idSchema } from "./id";
import { regionSchema, routeSchema, schleuseModeSchema } from "./objects";

/** Wer eine Aktion auslöst: der Besitzer der Installation oder ein Bot. */
export type Actor = "besitzer" | `bot:${BotId}`;
export type ActorKind = "besitzer" | "bot";

const BOT_ACTOR_PATTERN = /^bot:bot_[0-7][0-9a-hjkmnp-tv-z]{25}$/;

export const actorSchema = z.custom<Actor>(
  (value) => value === "besitzer" || (typeof value === "string" && BOT_ACTOR_PATTERN.test(value)),
);

/** Akteur für einen Bot. */
export function botActor(botId: BotId): `bot:${BotId}` {
  return `bot:${botId}`;
}

export function actorKind(actor: Actor): ActorKind {
  return actor === "besitzer" ? "besitzer" : "bot";
}

/** Wie der Besitzer sich für die Aktion ausgewiesen hat. */
export const CREDENTIALS = ["sitzung", "passwort", "einrichtungs_code"] as const;
export const credentialSchema = z.enum(CREDENTIALS);
export type Credential = z.infer<typeof credentialSchema>;

/** Felder des Bots, die `bot.aendern` betreffen kann. */
export const BOT_FIELDS = [
  "name",
  "instructions",
  "avatarShape",
  "color",
  "maxOutputTokens",
] as const;
/** Einstellungen, die `einstellung.aendern` betreffen kann. */
export const SETTINGS_FIELDS = ["timezone", "historyTokenLimit", "dailyTokenBudget"] as const;

const conversationId = idSchema("conversation");
const messageId = idSchema("message");
const runId = idSchema("run");
const botId = idSchema("bot");
const providerId = idSchema("provider");
const modelId = idSchema("model");
const ownerId = idSchema("owner");
const installationId = idSchema("installation");

const ownerFacts = { credential: credentialSchema };

function action<K extends ActorKind, T extends z.ZodRawShape, F extends z.ZodRawShape>(
  actor: K,
  target: T,
  facts: F,
) {
  return { actor, target: z.strictObject(target), facts: z.strictObject(facts) };
}

/**
 * Jede Aktion mit ihrem Akteur, dem Ziel (welche Objekte) und den Fakten. Fakten enthalten nur
 * Werte wie Zahlen, Schalter und Kennungen, nie Inhalte von Nachrichten oder Schlüssel.
 */
export const ACTIONS = {
  "einrichtung.abschliessen": action("besitzer", { installationId }, ownerFacts),
  "zugang.anmelden": action("besitzer", { ownerId }, { ...ownerFacts, remember: z.boolean() }),
  "zugang.abmelden": action("besitzer", { ownerId }, ownerFacts),
  "zugang.alle_abmelden": action("besitzer", { ownerId }, { ...ownerFacts, sessions: countSchema }),
  "zugang.passwort_aendern": action("besitzer", { ownerId }, ownerFacts),
  "anbieter.speichern": action(
    "besitzer",
    { providerId },
    { ...ownerFacts, created: z.boolean(), region: regionSchema, keySet: z.boolean() },
  ),
  "anbieter.loeschen": action("besitzer", { providerId }, ownerFacts),
  "modell.waehlen": action("besitzer", { botId, modelId }, ownerFacts),
  "bot.aendern": action(
    "besitzer",
    { botId },
    { ...ownerFacts, fields: z.array(z.enum(BOT_FIELDS)).min(1) },
  ),
  "schleuse.umschalten": action(
    "besitzer",
    { conversationId: conversationId.optional() },
    {
      ...ownerFacts,
      scope: z.enum(["unterhaltung", "standard"]),
      mode: schleuseModeSchema,
      previousMode: schleuseModeSchema.optional(),
      schleuseInstalled: z.boolean(),
    },
  ),
  "einstellung.aendern": action(
    "besitzer",
    { installationId },
    { ...ownerFacts, fields: z.array(z.enum(SETTINGS_FIELDS)).min(1) },
  ),
  "unterhaltung.anlegen": action("besitzer", { conversationId, botId }, ownerFacts),
  "unterhaltung.umbenennen": action("besitzer", { conversationId }, ownerFacts),
  "unterhaltung.loeschen": action("besitzer", { conversationId }, ownerFacts),
  "nachricht.senden": action(
    "besitzer",
    { conversationId, messageId },
    {
      ...ownerFacts,
      inputChars: countSchema,
      maxInputChars: positiveIntSchema,
      conversationExists: z.boolean(),
      runActive: z.boolean(),
      killSwitch: z.boolean(),
    },
  ),
  "modell.anfragen": action(
    "bot",
    { conversationId, runId, botId, modelId },
    {
      /** Der anfragende Bot gehört zu dieser Unterhaltung. */
      botOfConversation: z.boolean(),
      providerId,
      providerEnabled: z.boolean(),
      region: regionSchema,
      route: routeSchema,
      requestedMode: schleuseModeSchema,
      schleuseReachable: z.boolean(),
      inputChars: countSchema,
      maxInputChars: positiveIntSchema,
      /** Ausgabegrenze dieser Anfrage. */
      maxOutputTokens: positiveIntSchema,
      /** Ausgabegrenze des Bots. */
      botMaxOutputTokens: positiveIntSchema,
      tokensToday: countSchema,
      dailyTokenBudget: positiveIntSchema.optional(),
      killSwitch: z.boolean(),
    },
  ),
  "lauf.abbrechen": action(
    "besitzer",
    { conversationId, runId },
    { ...ownerFacts, runActive: z.boolean() },
  ),
  "belege.exportieren": action(
    "besitzer",
    { installationId },
    { ...ownerFacts, entries: countSchema },
  ),
} as const;

type Actions = typeof ACTIONS;
export type ActionType = keyof Actions;
export const ACTION_TYPES = Object.keys(ACTIONS) as [ActionType, ...ActionType[]];
export const actionTypeSchema = z.enum(ACTION_TYPES);

/** Akteur-Art, die eine Aktion auslösen darf. */
export type ActorKindOf<T extends ActionType> = Actions[T]["actor"];
type ActorOf<T extends ActionType> = ActorKindOf<T> extends "bot" ? `bot:${BotId}` : "besitzer";

/** Ziel einer Aktion, z. B. `{ conversationId, modelId }`. */
export type ActionTarget<T extends ActionType = ActionType> = T extends ActionType
  ? z.infer<Actions[T]["target"]>
  : never;

/** Fakten, die das Tor für eine Aktion sieht. */
export type Facts<T extends ActionType = ActionType> = T extends ActionType
  ? z.infer<Actions[T]["facts"]>
  : never;

/** Anfrage an das Tor: welche Aktion, von wem, mit welchem Ziel. */
export type ActionRequest<T extends ActionType = ActionType> = T extends ActionType
  ? { actionId: ActionId; type: T; actor: ActorOf<T>; target: ActionTarget<T> }
  : never;

const requestVariants = ACTION_TYPES.map((type) =>
  z.strictObject({
    actionId: idSchema("action"),
    type: z.literal(type),
    actor: actorSchema,
    target: ACTIONS[type].target as z.ZodType<ActionTarget>,
  }),
);
type RequestVariant = (typeof requestVariants)[number];

/** Schema für eine Anfrage an das Tor; prüft auch, ob der Akteur zur Aktion passt. */
export const actionRequestSchema = z
  .discriminatedUnion("type", requestVariants as [RequestVariant, ...RequestVariant[]])
  .refine((request) => actorKind(request.actor) === ACTIONS[request.type].actor, {
    path: ["actor"],
  }) as unknown as z.ZodType<ActionRequest>;

/** Schema der Fakten für eine bestimmte Aktion. */
export function factsSchema<T extends ActionType>(type: T): Actions[T]["facts"] {
  return ACTIONS[type].facts;
}
