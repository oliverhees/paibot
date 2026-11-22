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
  toolKeySchema,
  toolKindSchema,
  toolNameSchema,
  toolServerSchema,
  toolSourceSchema,
} from "./objects";
import { APP_ACTION_SHAPES, MCP_TOOL_CALL_FACTS } from "./tor-fassung-3";
import { BOT_PAUSED_FACTS, TEAM_ACTION_SHAPES, type TeamActionType } from "./tor-fassung-4";

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

/**
 * Fakten jeder Aktion des Besitzers: der Nachweis und, wenn bekannt, das Gerät, von dem die Aktion
 * kam (Kennung aus dem Geräte-Verzeichnis). Belege ohne `device` stammen aus der Zeit davor, von
 * einem Weg ohne Gerät (Einrichtung) oder von einer Sitzung, die zu keinem Gerät gehört.
 */
const ownerFacts = { credential: credentialSchema, device: deviceId.optional() };

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

/** Wohin ein Werkzeug wirkt: nur innerhalb von PaiBot oder nach außen. */
export const TOOL_REACHES = ["intern", "nach_aussen"] as const;
export const toolReachSchema = z.enum(TOOL_REACHES);
export type ToolReach = z.infer<typeof toolReachSchema>;

/** Was einen Lauf ausgelöst hat: eine Nachricht im Chat oder eine Automation. */
export const RUN_TRIGGERS = ["chat", "automation"] as const;
export const runTriggerSchema = z.enum(RUN_TRIGGERS);
export type RunTrigger = z.infer<typeof runTriggerSchema>;

/** Platzhalter-Name für Aufrufe mit ungültigem Namen; erfüllt `TOOL_NAME_PATTERN`. */
export const UNKNOWN_TOOL_NAME = "unbekannt";

/**
 * Pflicht-Fakten jeder Aktion in `TOOL_GATE_ACTIONS` (alle nicht optional außer `toolServer`).
 * V-12 bis V-14, G-17 und D-01 hängen an ihnen.
 */
const toolGateFacts = {
  ...toolFacts,
  /** Kennung des Werkzeugs, z. B. `eingebaut/doku.nachschlagen`. */
  toolKey: toolKeySchema,
  /** Abdruck der Beschreibung des Werkzeugs (`TOOL_DEFINITION_DIGEST_PREFIX`). */
  toolDigest: sha256DigestSchema,
  toolReach: toolReachSchema,
  /** Das Werkzeug liefert Inhalte von außerhalb von PaiBot. */
  toolForeign: z.boolean(),
  /** Das Werkzeug ist registriert (Vorbedingung V-12). */
  toolRegistered: z.boolean(),
  /** Das Werkzeug stand in der Liste dieses Schritts (Vorbedingung V-12). */
  toolOffered: z.boolean(),
  /** Die Eingabe des Modells passt zum Schema des Werkzeugs (Vorbedingung V-13). */
  inputValid: z.boolean(),
  /** Der Lauf hat schon fremde Inhalte gelesen (Deckel D-01). */
  untrustedInput: z.boolean(),
  /** Nummer des Schritts im Lauf, ab 0. */
  step: countSchema,
  /** Nummer des Aufrufs in diesem Schritt, ab 0 (Vorbedingung V-14). */
  callIndexInStep: countSchema,
  maxCallsPerStep: positiveIntSchema,
  /** Werkzeug-Aufrufe des Laufs vor diesem (Grenze G-17). */
  callsInRun: countSchema,
  maxCallsPerRun: positiveIntSchema,
  /** Not-Aus (Grenze G-05). */
  killSwitch: z.boolean(),
  trigger: runTriggerSchema,
};

/** Namen der Fakten eines App-Werkzeugs (Tor-Fassung 3), genau bei Quelle `mcp` alle gesetzt. */
const MCP_FACT_NAMES = Object.keys(MCP_TOOL_CALL_FACTS);

/**
 * Regel für `werkzeug.aufrufen`: Server genau bei Quelle `mcp`. Bei Quelle `mcp`
 * sind dazu alle Fakten der App gesetzt, die Reichweite ist `nach_aussen`, das Werkzeug liefert
 * fremde Inhalte und seine Kennung beginnt mit `mcp/<Server>/`; sonst steht kein Fakt der App da,
 * und die Kennung beginnt nie mit `mcp/`.
 */
function toolSourceConsistent(value: unknown): boolean {
  const record = value as Record<string, unknown>;
  const mcp = record.toolSource === "mcp";
  if (mcp !== (record.toolServer !== undefined)) return false;
  const present = MCP_FACT_NAMES.filter((name) => record[name] !== undefined).length;
  const key = record.toolKey;
  if (mcp) {
    return (
      present === MCP_FACT_NAMES.length &&
      record.toolReach === "nach_aussen" &&
      record.toolForeign === true &&
      typeof key === "string" &&
      key.startsWith(`mcp/${String(record.toolServer)}/`)
    );
  }
  return present === 0 && !(typeof key === "string" && key.startsWith("mcp/"));
}

/** Werkzeug-Aufruf (`werkzeug.aufrufen`) mit den Regeln für App-Werkzeuge. */
function mcpToolAction<T extends z.ZodRawShape, F extends z.ZodRawShape>(target: T, facts: F) {
  const base = action("bot", target, { ...toolFacts, ...facts });
  return {
    ...base,
    facts: base.facts.refine(toolSourceConsistent, { path: ["toolSource"] }),
  };
}

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

/** Ein Token ist genau bei Anmeldung `token` hinterlegt (`app.verbinden`). */
function withTokenRule<T extends { facts: z.ZodType }>(spec: T): T {
  return {
    ...spec,
    facts: spec.facts.refine(
      (value) =>
        ((value as { authKind?: unknown }).authKind === "token") ===
        ((value as { tokenSet?: unknown }).tokenSet === true),
      { path: ["tokenSet"] },
    ) as z.ZodType,
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
    {
      ...ownerFacts,
      created: z.boolean(),
      region: regionSchema,
      keySet: z.boolean(),
      /** Ob ein zweiter Schlüssel (nur zum Lesen der Routing-Regeln) hinterlegt ist; nie der Schlüssel. */
      managementKeySet: z.boolean().optional(),
    },
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
      /** Der Bot der Unterhaltung ist pausiert (Grenze G-15, ab Fassung 4). */
      ...BOT_PAUSED_FACTS,
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
      /** Nummer des Schritts im Lauf, ab 0 (Grenze G-16). */
      step: countSchema,
      /** Höchstzahl der Schritte im Lauf (Grenze G-16). */
      maxSteps: positiveIntSchema,
      /** Token, die der Lauf schon verbraucht hat (Grenze G-18). */
      runTokens: countSchema,
      /** Geschätzte Token dieses Schritts (Grenze G-18). */
      stepTokenEstimate: countSchema,
      /** Höchstzahl der Token im Lauf (Grenze G-18). */
      maxRunTokens: positiveIntSchema,
      /** Zahl der Werkzeuge, die dieser Schritt dem Modell anbietet. */
      toolCount: countSchema,
      /** Der Lauf hat schon fremde Inhalte gelesen. */
      untrustedInput: z.boolean(),
      trigger: runTriggerSchema,
      /** Der Bot ist pausiert (Grenze G-15, ab Fassung 4). */
      ...BOT_PAUSED_FACTS,
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
  "werkzeug.aufrufen": mcpToolAction(
    { conversationId, runId, botId },
    {
      ...toolGateFacts,
      /** Der aufrufende Bot gehört zu dieser Unterhaltung. */
      botOfConversation: z.boolean(),
      /** Der Lauf läuft gerade (Vorbedingung V-05). */
      runRunning: z.boolean(),
      /** Abdruck des Aufrufs (`TOOL_CALL_DIGEST_PREFIX`, Fassung 2); die Argumente selbst nie. */
      argsDigest: hmacDigestSchema,
      /**
       * Fakten eines App-Werkzeugs (ab Fassung 3): genau bei Quelle `mcp` alle gesetzt, sonst
       * keiner. Sie kommen aus der Datenbank und der Steuerung des Laufs, nie von der App.
       */
      appId: MCP_TOOL_CALL_FACTS.appId.optional(),
      appToolId: MCP_TOOL_CALL_FACTS.appToolId.optional(),
      toolVersion: MCP_TOOL_CALL_FACTS.toolVersion.optional(),
      toolStatus: MCP_TOOL_CALL_FACTS.toolStatus.optional(),
      appAccess: MCP_TOOL_CALL_FACTS.appAccess.optional(),
      targetDigest: MCP_TOOL_CALL_FACTS.targetDigest.optional(),
      confirmedToolDigest: MCP_TOOL_CALL_FACTS.confirmedToolDigest.optional(),
      confirmedTargetDigest: MCP_TOOL_CALL_FACTS.confirmedTargetDigest.optional(),
      stepAppId: MCP_TOOL_CALL_FACTS.stepAppId.optional(),
      /** Der Bot ist pausiert (Grenze G-15, ab Fassung 4). */
      ...BOT_PAUSED_FACTS,
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
   * Der Besitzer bestätigt auf einem Gerät den Hinweis auf neue Anmeldungen („Das war ich“); Ziel
   * ist das Gerät, auf dem der Hinweis geschlossen wird.
   */
  "geraet.bestaetigen": action(
    "besitzer",
    { deviceId },
    {
      ...ownerFacts,
      /** Anzahl der neuen Geräte, die der Hinweis nannte. */
      newDevices: countSchema,
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
  /** Der Besitzer sichert eine Unterhaltung als lesbare Datei (Markdown). */
  "unterhaltung.exportieren": action(
    "besitzer",
    { conversationId },
    {
      ...ownerFacts,
      /** Die Unterhaltung gibt es (Vorbedingung V-01). */
      conversationExists: z.boolean(),
      /** Anzahl der Nachrichten in der Datei. */
      messages: countSchema,
    },
  ),
  /**
   * Der Besitzer lässt die letzte Antwort des Bots neu erzeugen. Ziel ist die Antwort, die ersetzt
   * wird; sie bleibt als frühere Fassung erhalten. Die neue Antwort entsteht in einem eigenen Lauf
   * zur selben Nachricht.
   */
  "antwort.neu_erzeugen": action(
    "besitzer",
    { conversationId, messageId },
    {
      ...ownerFacts,
      conversationExists: z.boolean(),
      runActive: z.boolean(),
      /** Die Antwort ist die letzte Nachricht der Unterhaltung (Vorbedingung V-11). */
      answerIsLatest: z.boolean(),
      killSwitch: z.boolean(),
    },
  ),
  /** Der Besitzer verbindet eine App oder testet sie erneut (`created: false`). */
  "app.verbinden": withTokenRule(
    action(
      APP_ACTION_SHAPES["app.verbinden"].actorKind,
      APP_ACTION_SHAPES["app.verbinden"].target,
      APP_ACTION_SHAPES["app.verbinden"].facts,
    ),
  ),
  /** Der Besitzer stuft genau ein Werkzeug einer App ein (Vorbedingung V-38). */
  "app.werkzeuge_bestaetigen": action(
    APP_ACTION_SHAPES["app.werkzeuge_bestaetigen"].actorKind,
    APP_ACTION_SHAPES["app.werkzeuge_bestaetigen"].target,
    APP_ACTION_SHAPES["app.werkzeuge_bestaetigen"].facts,
  ),
  /** Der Besitzer setzt den Zugriff eines Bots auf eine App. */
  "app.zugriff_setzen": action(
    APP_ACTION_SHAPES["app.zugriff_setzen"].actorKind,
    APP_ACTION_SHAPES["app.zugriff_setzen"].target,
    APP_ACTION_SHAPES["app.zugriff_setzen"].facts,
  ),
  /** Der Besitzer trennt eine App; ein hinterlegter Token wird gelöscht. */
  "app.trennen": action(
    APP_ACTION_SHAPES["app.trennen"].actorKind,
    APP_ACTION_SHAPES["app.trennen"].target,
    APP_ACTION_SHAPES["app.trennen"].facts,
  ),
  /**
   * Aktionen der Tor-Fassung 4 (Bots, Teams, Entwürfe, Fäden), alle nur vom Besitzer. Die
   * Datenbank speichert sie ab Migration 0018 in Regeln und Belegen.
   */
  ...(Object.fromEntries(
    (Object.keys(TEAM_ACTION_SHAPES) as TeamActionType[]).map((type) => [
      type,
      action(
        TEAM_ACTION_SHAPES[type].actorKind,
        TEAM_ACTION_SHAPES[type].target,
        TEAM_ACTION_SHAPES[type].facts,
      ),
    ]),
  ) as {
    [K in TeamActionType]: ReturnType<
      typeof action<
        (typeof TEAM_ACTION_SHAPES)[K]["actorKind"],
        (typeof TEAM_ACTION_SHAPES)[K]["target"],
        (typeof TEAM_ACTION_SHAPES)[K]["facts"]
      >
    >;
  }),
} as const;

type Actions = typeof ACTIONS;
export type ActionType = keyof Actions;
export const ACTION_TYPES = Object.keys(ACTIONS) as [ActionType, ...ActionType[]];
export const actionTypeSchema = z.enum(ACTION_TYPES);

/** Aktionen, über die ein Werkzeug-Wunsch entschieden wird. V-12 bis V-14, G-17 und D-01 hängen daran. */
export const TOOL_GATE_ACTIONS = ["werkzeug.aufrufen"] as const satisfies readonly ActionType[];
export type ToolGateAction = (typeof TOOL_GATE_ACTIONS)[number];

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
