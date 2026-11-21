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
import { countSchema, hmacDigestSchema, positiveIntSchema, sha256DigestSchema } from "./grundtypen";
import { type ActionId, type BotId, ID_BODY_PATTERN, ID_PREFIX, idSchema } from "./id";
import {
  regionSchema,
  routeSchema,
  schleuseModeSchema,
  toolKindSchema,
  toolNameSchema,
  toolServerSchema,
  toolSourceSchema,
} from "./objects";

/** Wer eine Aktion auslöst: der Besitzer der Installation oder ein Bot. */
export type Actor = "besitzer" | `bot:${BotId}`;
export type ActorKind = "besitzer" | "bot";

/** Muster eines Akteurs als Text; gilt gleich für Code und Datenbank. */
export const ACTOR_PATTERN_SOURCE = `^(besitzer|bot:${ID_PREFIX.bot}_${ID_BODY_PATTERN})$`;
const ACTOR_PATTERN = new RegExp(ACTOR_PATTERN_SOURCE);

export const actorSchema = z.custom<Actor>(
  (value) => typeof value === "string" && ACTOR_PATTERN.test(value),
);

/** Akteur für einen Bot. */
export function botActor(botId: BotId): `bot:${BotId}` {
  return `bot:${botId}`;
}

export function actorKind(actor: Actor): ActorKind {
  return actor === "besitzer" ? "besitzer" : "bot";
}

/**
 * Wie der Besitzer sich für die Aktion ausgewiesen hat. Welcher Nachweis für welche Aktion gilt,
 * legen die Standard-Regeln fest (`CREDENTIAL_SCOPE`): der Einrichtungs-Code nur für die
 * Einrichtung, das Passwort nur fürs Anmelden, die Sitzung für alles andere.
 */
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
const actionId = idSchema("action");
const deviceId = idSchema("device");

/** Arten bekannter Geräte. Heute gibt es nur Browser. */
export const DEVICE_KINDS = ["browser"] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];
export const deviceKindSchema = z.enum(DEVICE_KINDS);

/** Rechte eines bekannten Geräts. Heute hat jedes Gerät alle Rechte des Besitzers. */
export const DEVICE_RIGHTS = ["voll"] as const;
export type DeviceRight = (typeof DEVICE_RIGHTS)[number];

const ownerFacts = { credential: credentialSchema };

/** Origin einer Basis-URL, z. B. `https://api.eurouter.ai` (ohne Pfad, Anfrage-Teil oder Anker). */
export const originSchema = z
  .string()
  .max(200)
  .regex(/^https?:\/\/[^/?#@\s]+$/);

function action<K extends ActorKind, T extends z.ZodRawShape, F extends z.ZodRawShape>(
  actor: K,
  target: T,
  facts: F,
) {
  return { actor, target: z.strictObject(target), facts: z.strictObject(facts) };
}

/** Fakten eines Werkzeugs: Name, Quelle und Art; der Server genau dann, wenn die Quelle `mcp` ist. */
const toolFacts = {
  toolName: toolNameSchema,
  toolSource: toolSourceSchema,
  /** Genau bei Quelle `mcp` gesetzt, sonst nie. */
  toolServer: toolServerSchema.optional(),
  toolKind: toolKindSchema,
};

/** Fakten eines Werkzeug-Aufrufs mit der Regel „Server genau bei Quelle `mcp`“. */
function toolAction<T extends z.ZodRawShape, F extends z.ZodRawShape>(target: T, facts: F) {
  const base = action("bot", target, { ...toolFacts, ...facts });
  return {
    ...base,
    facts: base.facts.refine(
      (value) =>
        ((value as { toolSource?: unknown }).toolSource === "mcp") ===
        ((value as { toolServer?: unknown }).toolServer !== undefined),
      { path: ["toolServer"] },
    ),
  };
}

/**
 * Jede Aktion mit ihrem Akteur, dem Ziel (welche Objekte) und den Fakten. Fakten enthalten nur
 * Werte wie Zahlen, Schalter und Kennungen, nie Inhalte von Nachrichten oder Schlüssel.
 */
export const ACTIONS = {
  "einrichtung.abschliessen": action(
    "besitzer",
    { installationId },
    {
      ...ownerFacts,
      /** Die Einrichtung ist noch nicht abgeschlossen (Vorbedingung V-07). */
      setupOpen: z.boolean(),
    },
  ),
  "zugang.anmelden": action("besitzer", { ownerId }, { ...ownerFacts, remember: z.boolean() }),
  "zugang.abmelden": action("besitzer", { ownerId }, ownerFacts),
  "zugang.alle_abmelden": action("besitzer", { ownerId }, { ...ownerFacts, sessions: countSchema }),
  "zugang.passwort_aendern": action(
    "besitzer",
    { ownerId },
    {
      ...ownerFacts,
      /** Das aktuelle Passwort wurde in dieser Anfrage geprüft (Vorbedingung V-06). */
      currentPasswordVerified: z.boolean(),
    },
  ),
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
      /** Wohin die Anfrage geht, lesbar: Origin der Basis-URL des Anbieters bzw. der Schleuse. */
      targetOrigin: originSchema,
      /** Abdruck von Anbieter-ID und Basis-URL (`targetDigestInput`), geprüft vor dem Abruf. */
      targetDigest: sha256DigestSchema,
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
  "werkzeug.aufrufen": toolAction(
    { conversationId, runId, botId },
    {
      /** Der aufrufende Bot gehört zu dieser Unterhaltung. */
      botOfConversation: z.boolean(),
      /** Der Lauf läuft gerade (Vorbedingung V-05). */
      runRunning: z.boolean(),
      /** Abdruck der Argumente (`TOOL_ARGS_DIGEST_PREFIX`); die Argumente selbst nie. */
      argsDigest: hmacDigestSchema,
      killSwitch: z.boolean(),
    },
  ),
  /**
   * Der Besitzer beantwortet einen wartenden Werkzeug-Aufruf (`toolCallId` = `actionId` des
   * Aufrufs `werkzeug.aufrufen`). Die Fakten liest die Route aus dem gespeicherten Aufruf.
   */
  "werkzeug.freigeben": action(
    "besitzer",
    { conversationId, runId, toolCallId: actionId },
    {
      ...ownerFacts,
      /** Antwort des Besitzers. */
      answer: z.enum(["erteilen", "ablehnen"]),
      /** Der Aufruf wartet auf eine Freigabe (Vorbedingung V-08). */
      callWaiting: z.boolean(),
      /** Die Wartezeit des Aufrufs ist abgelaufen (Vorbedingung V-08). */
      callExpired: z.boolean(),
      /** Abdruck der Argumente, wie der Besitzer sie gesehen hat. */
      argsDigest: hmacDigestSchema,
      /** Abdruck der Argumente des gespeicherten, wartenden Aufrufs (Vorbedingung V-09). */
      waitingArgsDigest: hmacDigestSchema,
    },
  ),
  /**
   * Ausführung eines Werkzeug-Aufrufs nach der Freigabe: eine eigene Entscheidung mit eigener
   * Kennung, die auf den wartenden Aufruf (`toolCallId`) und die Freigabe (`approvalId` =
   * `actionId` der Aktion `werkzeug.freigeben`) verweist. Erlaubt nur über R-007 („einmal
   * erlaubt“); danach ist die Freigabe verbraucht.
   */
  "werkzeug.ausfuehren": toolAction(
    { conversationId, runId, botId, toolCallId: actionId, approvalId: actionId },
    {
      botOfConversation: z.boolean(),
      /** Der Lauf läuft gerade (Vorbedingung V-05). */
      runRunning: z.boolean(),
      /** Abdruck der Argumente des Aufrufs, der jetzt ausgeführt werden soll. */
      argsDigest: hmacDigestSchema,
      killSwitch: z.boolean(),
      /** Zu `approvalId` gibt es eine erteilte Freigabe des Besitzers für diesen Aufruf. */
      approvalGranted: z.boolean(),
      /** Die Freigabe wurde schon für eine Ausführung benutzt. */
      approvalConsumed: z.boolean(),
      /** Die Freigabe ist abgelaufen. */
      approvalExpired: z.boolean(),
      /** Abdruck der Argumente, für den die Freigabe erteilt wurde. */
      approvalArgsDigest: hmacDigestSchema,
    },
  ),
  /** Ein Browser wird nach der Anmeldung zum bekannten Gerät (mit der neuen Sitzung). */
  "geraet.hinzufuegen": action("besitzer", { deviceId }, { ...ownerFacts, kind: deviceKindSchema }),
  /** Ein bekanntes Gerät wird widerrufen; seine Sitzungen enden mit. */
  "geraet.entfernen": action(
    "besitzer",
    { deviceId },
    {
      ...ownerFacts,
      /** Das Gerät ist bekannt und nicht schon widerrufen. */
      deviceActive: z.boolean(),
      /** Es ist das Gerät, von dem die Anfrage kommt. */
      thisDevice: z.boolean(),
    },
  ),
  /**
   * Der Besitzer schaltet den Not-Aus („Alle Bots anhalten“) an oder aus. Die Fakten heißen
   * bewusst nicht `killSwitch`: Die Grenze G-05 trifft so nur Aktionen, die zu einem Bot führen,
   * und der Besitzer kann den Not-Aus immer wieder aufheben.
   */
  "notaus.umschalten": action(
    "besitzer",
    { installationId },
    {
      ...ownerFacts,
      /** Der Not-Aus soll danach an sein. */
      on: z.boolean(),
      /** Der Not-Aus war vorher an. */
      wasOn: z.boolean(),
      /** Das aktuelle Passwort wurde in dieser Anfrage geprüft (Vorbedingung V-10 beim Aufheben). */
      currentPasswordVerified: z.boolean(),
    },
  ),
} as const;

type Actions = typeof ACTIONS;
export type ActionType = keyof Actions;
export const ACTION_TYPES = Object.keys(ACTIONS) as [ActionType, ...ActionType[]];
export const actionTypeSchema = z.enum(ACTION_TYPES);

/** Aktionen für Werkzeug-Aufrufe des Bots (Teil von `ACTIONS`). */
export const TOOL_ACTION_TYPES = [
  "werkzeug.aufrufen",
  "werkzeug.ausfuehren",
] as const satisfies readonly ActionType[];
export type ToolActionType = (typeof TOOL_ACTION_TYPES)[number];
export const toolActionTypeSchema = z.enum(TOOL_ACTION_TYPES);

/**
 * Aktionen, über die das Tor schon entscheiden kann, die die Datenbank aber noch nicht speichert:
 * Die CHECKs `rules_action_werte` und `belege_action_werte` nehmen sie erst nach der nächsten
 * Migration an. Bis dahin lässt sich für sie weder eine Regel noch ein Beleg speichern; das Tor
 * scheitert dann beim Schreiben des Belegs „Entscheidung“ und führt nichts aus.
 */
export const UNSTORED_ACTION_TYPES = [
  "werkzeug.freigeben",
  "werkzeug.ausfuehren",
] as const satisfies readonly ActionType[];
export type UnstoredActionType = (typeof UNSTORED_ACTION_TYPES)[number];

/** Alle Aktionen, die die Datenbank in `rules.action` und `belege.action` zulässt. */
export const STORED_ACTION_TYPES = ACTION_TYPES.filter(
  (type): type is Exclude<ActionType, UnstoredActionType> =>
    !(UNSTORED_ACTION_TYPES as readonly string[]).includes(type),
) as [Exclude<ActionType, UnstoredActionType>, ...Exclude<ActionType, UnstoredActionType>[]];
export type StoredActionType = Exclude<ActionType, UnstoredActionType>;

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
