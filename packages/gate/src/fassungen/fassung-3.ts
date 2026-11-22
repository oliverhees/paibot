/**
 * PaiBot – Fassung 3 der Tor-Auswertung „Apps lesen“, eingefroren: Fassung 2 und dazu die
 * Aktionen für Apps (verbinden, Werkzeuge einstufen, Zugriff je Bot, trennen), die Fakten eines
 * Aufrufs eines App-Werkzeugs, die Grenzen G-06, G-07, G-08, G-40 und die Vorbedingungen V-19 und
 * V-38. Diese Datei wird nie mehr geändert.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

// Alles hier ist eine Kopie, kein Verweis auf geteilte Schemas und keiner auf Fassung 1 oder 2:
// Ändert sich später ein geteiltes Schema, bleibt Fassung 3 gleich. Importiert werden nur Grund-Schemas,
// die per Definition nie geändert werden (Kennungen, Prüfsummen-Formate), Typen und Texte.
// Die Aktionen und Arten von Akteuren stehen hier als feste Liste, nicht aus den lebenden Verträgen:
// Eine später neu hinzukommende Aktion berührt Fassung 3 weder im Typ noch im Verhalten.

import type { ErrorCode } from "@paibot/shared/fehler";
import { hmacDigestSchema, sha256DigestSchema } from "@paibot/shared/grundtypen";
import { ID_BODY_PATTERN, ID_PREFIX, idSchema } from "@paibot/shared/ids";
import { t } from "@paibot/shared/texte";
import type {
  Decision,
  GateLimitName,
  LimitCheck,
  ListDecision,
  Outcome,
  PreconditionCheck,
  RuleCondition,
  RuleDefinition,
  RuleSnapshot,
  Stage,
  StoredRuleRef,
} from "@paibot/shared/tor";
import { z } from "zod";
import type {
  CapDefinition,
  EvaluatedRule,
  FormatLimitFn,
  FormatPrecondition,
  GateFormatSpec,
} from "./typ";

// ---------------------------------------------------------------------------------------------
// Bausteine (Kopien)

const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const positiveInt = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const credential = z.enum(["sitzung", "passwort", "einrichtungs_code"]);
const schleuseMode = z.enum(["off", "on"]);
const route = z.enum(["direct", "schleuse"]);
const region = z.enum(["eu", "non_eu", "local"]);
const toolName = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const toolSource = z.enum(["eingebaut", "mcp"]);
const toolKind = z.enum(["lesen", "schreiben"]);
const toolServer = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const toolKey = z
  .string()
  .max(140)
  .regex(/^[a-z][a-z0-9]*(\/[a-z0-9][a-z0-9_.-]{0,63}){1,2}$/);
const toolReach = z.enum(["intern", "nach_aussen"]);
const trigger = z.enum(["chat", "automation"]);
const deviceKind = z.enum(["browser"]);
const origin = z
  .string()
  .max(200)
  .regex(/^https?:\/\/[^/?#@\s]+$/);
const botFields = z.enum(["name", "instructions", "avatarShape", "color", "maxOutputTokens"]);
const settingsFields = z.enum(["timezone", "historyTokenLimit", "dailyTokenBudget"]);

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
const appId = idSchema("app");
const appToolId = idSchema("tool");
const appOrigin = z
  .string()
  .max(200)
  .regex(/^https:\/\/[^/?#@\s]+$/);
const appAuthKind = z.enum(["keine", "token"]);
const appAccess = z.enum(["keiner", "lesen"]);
const appToolClass = z.enum(["lesen", "schreiben", "gesperrt"]);
const appToolStatus = z.enum(["neu", "bestaetigt", "geaendert", "entfernt", "gesperrt"]);

/** Arten von Akteuren der Fassung 3, als feste Liste. */
type ActorKind = "besitzer" | "bot";

const ACTOR_PATTERN = new RegExp(`^(besitzer|bot:${ID_PREFIX.bot}_${ID_BODY_PATTERN})$`);
const ACTOR_FACT = "akteur";

const ownerFacts = { credential, device: deviceId.optional() };

function action<K extends ActorKind>(actor: K, target: z.ZodRawShape, facts: z.ZodRawShape) {
  return { actor, target: z.strictObject(target), facts: z.strictObject(facts) as z.ZodType };
}

const toolFacts = {
  toolName,
  toolSource,
  toolServer: toolServer.optional(),
  toolKind,
};

/** Pflicht-Fakten jeder Aktion, über die ein Werkzeug-Wunsch entschieden wird. */
const toolGateFacts = {
  ...toolFacts,
  toolKey,
  toolDigest: sha256DigestSchema,
  toolReach,
  toolForeign: z.boolean(),
  toolRegistered: z.boolean(),
  toolOffered: z.boolean(),
  inputValid: z.boolean(),
  untrustedInput: z.boolean(),
  step: count,
  callIndexInStep: count,
  maxCallsPerStep: positiveInt,
  callsInRun: count,
  maxCallsPerRun: positiveInt,
  killSwitch: z.boolean(),
  trigger,
};

/**
 * Fakten eines Aufrufs eines App-Werkzeugs: genau bei Quelle `mcp` alle gesetzt, sonst keiner.
 * Sie kommen aus der Datenbank bzw. der Steuerung des Laufs, nie vom Server der App oder vom Modell.
 */
const appToolFacts = {
  appId: appId.optional(),
  toolVersion: positiveInt.optional(),
  toolStatus: appToolStatus.optional(),
  appAccess: appAccess.optional(),
  targetDigest: sha256DigestSchema.optional(),
  confirmedToolDigest: sha256DigestSchema.optional(),
  confirmedTargetDigest: sha256DigestSchema.optional(),
  stepAppId: appId.optional(),
};
const APP_TOOL_FACT_NAMES = Object.keys(appToolFacts);

/**
 * Passen Quelle, Server und Fakten der App zusammen? Server genau bei Quelle `mcp`; bei `mcp` alle
 * Fakten der App, Reichweite `nach_aussen`, fremde Inhalte und eine Kennung `mcp/<server>/…`;
 * sonst kein Fakt der App und keine Kennung, die mit `mcp/` beginnt.
 */
function toolSourceConsistent(value: unknown): boolean {
  const record = value as Record<string, unknown>;
  const mcp = record.toolSource === "mcp";
  if (mcp !== (record.toolServer !== undefined)) return false;
  const present = APP_TOOL_FACT_NAMES.filter((name) => record[name] !== undefined).length;
  const key = record.toolKey;
  if (mcp) {
    return (
      present === APP_TOOL_FACT_NAMES.length &&
      record.toolReach === "nach_aussen" &&
      record.toolForeign === true &&
      typeof key === "string" &&
      key.startsWith(`mcp/${String(record.toolServer)}/`)
    );
  }
  return present === 0 && !(typeof key === "string" && key.startsWith("mcp/"));
}

function toolAction(target: z.ZodRawShape, facts: z.ZodRawShape) {
  return {
    actor: "bot" as const,
    target: z.strictObject(target),
    facts: z.strictObject(facts).refine(toolSourceConsistent, {
      path: ["toolSource"],
    }) as z.ZodType,
  };
}

/** Prüfungen der Adresse beim Verbinden (Vorbedingung V-19), gerechnet vom Server. */
const addressFacts = {
  addressHttps: z.boolean(),
  addressPublic: z.boolean(),
  addressPort443: z.boolean(),
  addressUserinfo: z.boolean(),
  addressQuery: z.boolean(),
  addressFragment: z.boolean(),
};

/** Ein Token ist genau bei Anmeldung `token` hinterlegt. */
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

/** Aktionen der Fassung 2, als feste Liste (ohne `werkzeug.freigeben` und `werkzeug.ausfuehren`). */
type Action2 =
  | "einrichtung.abschliessen"
  | "zugang.anmelden"
  | "zugang.abmelden"
  | "zugang.alle_abmelden"
  | "zugang.passwort_aendern"
  | "anbieter.speichern"
  | "anbieter.loeschen"
  | "modell.waehlen"
  | "bot.aendern"
  | "schleuse.umschalten"
  | "einstellung.aendern"
  | "unterhaltung.anlegen"
  | "unterhaltung.umbenennen"
  | "unterhaltung.loeschen"
  | "nachricht.senden"
  | "modell.anfragen"
  | "lauf.abbrechen"
  | "belege.exportieren"
  | "werkzeug.aufrufen"
  | "geraet.hinzufuegen"
  | "geraet.entfernen"
  | "geraet.bestaetigen"
  | "notaus.umschalten"
  | "unterhaltung.exportieren"
  | "antwort.neu_erzeugen";

/** Neue Aktionen der Fassung 3. */
type AppAction3 =
  | "app.verbinden"
  | "app.werkzeuge_bestaetigen"
  | "app.zugriff_setzen"
  | "app.trennen";

/** Aktionen der Fassung 3. */
type Action3 = Action2 | AppAction3;

const ACTIONS_3 = {
  "einrichtung.abschliessen": action(
    "besitzer",
    { installationId },
    { ...ownerFacts, setupOpen: z.boolean() },
  ),
  "zugang.anmelden": action("besitzer", { ownerId }, { ...ownerFacts, remember: z.boolean() }),
  "zugang.abmelden": action("besitzer", { ownerId }, ownerFacts),
  "zugang.alle_abmelden": action("besitzer", { ownerId }, { ...ownerFacts, sessions: count }),
  "zugang.passwort_aendern": action(
    "besitzer",
    { ownerId },
    { ...ownerFacts, currentPasswordVerified: z.boolean() },
  ),
  "anbieter.speichern": action(
    "besitzer",
    { providerId },
    {
      ...ownerFacts,
      created: z.boolean(),
      region,
      keySet: z.boolean(),
      managementKeySet: z.boolean().optional(),
    },
  ),
  "anbieter.loeschen": action("besitzer", { providerId }, ownerFacts),
  "modell.waehlen": action("besitzer", { botId, modelId }, ownerFacts),
  "bot.aendern": action(
    "besitzer",
    { botId },
    { ...ownerFacts, fields: z.array(botFields).min(1) },
  ),
  "schleuse.umschalten": action(
    "besitzer",
    { conversationId: conversationId.optional() },
    {
      ...ownerFacts,
      scope: z.enum(["unterhaltung", "standard"]),
      mode: schleuseMode,
      previousMode: schleuseMode.optional(),
      schleuseInstalled: z.boolean(),
    },
  ),
  "einstellung.aendern": action(
    "besitzer",
    { installationId },
    { ...ownerFacts, fields: z.array(settingsFields).min(1) },
  ),
  "unterhaltung.anlegen": action("besitzer", { conversationId, botId }, ownerFacts),
  "unterhaltung.umbenennen": action("besitzer", { conversationId }, ownerFacts),
  "unterhaltung.loeschen": action("besitzer", { conversationId }, ownerFacts),
  "nachricht.senden": action(
    "besitzer",
    { conversationId, messageId },
    {
      ...ownerFacts,
      inputChars: count,
      maxInputChars: positiveInt,
      conversationExists: z.boolean(),
      runActive: z.boolean(),
      killSwitch: z.boolean(),
    },
  ),
  "modell.anfragen": action(
    "bot",
    { conversationId, runId, botId, modelId },
    {
      botOfConversation: z.boolean(),
      providerId,
      providerEnabled: z.boolean(),
      region,
      route,
      requestedMode: schleuseMode,
      schleuseReachable: z.boolean(),
      inputChars: count,
      maxInputChars: positiveInt,
      maxOutputTokens: positiveInt,
      botMaxOutputTokens: positiveInt,
      tokensToday: count,
      dailyTokenBudget: positiveInt.optional(),
      killSwitch: z.boolean(),
      targetOrigin: origin,
      targetDigest: sha256DigestSchema,
      step: count,
      maxSteps: positiveInt,
      runTokens: count,
      stepTokenEstimate: count,
      maxRunTokens: positiveInt,
      toolCount: count,
      untrustedInput: z.boolean(),
      trigger,
    },
  ),
  "lauf.abbrechen": action(
    "besitzer",
    { conversationId, runId },
    { ...ownerFacts, runActive: z.boolean() },
  ),
  "belege.exportieren": action("besitzer", { installationId }, { ...ownerFacts, entries: count }),
  "werkzeug.aufrufen": toolAction(
    { conversationId, runId, botId },
    {
      ...toolGateFacts,
      botOfConversation: z.boolean(),
      runRunning: z.boolean(),
      argsDigest: hmacDigestSchema,
      ...appToolFacts,
    },
  ),
  "geraet.hinzufuegen": action("besitzer", { deviceId }, { ...ownerFacts, kind: deviceKind }),
  "geraet.entfernen": action(
    "besitzer",
    { deviceId },
    { ...ownerFacts, deviceActive: z.boolean(), thisDevice: z.boolean() },
  ),
  "geraet.bestaetigen": action("besitzer", { deviceId }, { ...ownerFacts, newDevices: count }),
  "notaus.umschalten": action(
    "besitzer",
    { installationId },
    { ...ownerFacts, on: z.boolean(), wasOn: z.boolean(), currentPasswordVerified: z.boolean() },
  ),
  "unterhaltung.exportieren": action(
    "besitzer",
    { conversationId },
    { ...ownerFacts, conversationExists: z.boolean(), messages: count },
  ),
  "antwort.neu_erzeugen": action(
    "besitzer",
    { conversationId, messageId },
    {
      ...ownerFacts,
      conversationExists: z.boolean(),
      runActive: z.boolean(),
      answerIsLatest: z.boolean(),
      killSwitch: z.boolean(),
    },
  ),
  "app.verbinden": withTokenRule(
    action(
      "besitzer",
      { appId },
      {
        ...ownerFacts,
        created: z.boolean(),
        authKind: appAuthKind,
        tokenSet: z.boolean(),
        targetOrigin: appOrigin,
        targetDigest: sha256DigestSchema,
        ...addressFacts,
      },
    ),
  ),
  "app.werkzeuge_bestaetigen": action(
    "besitzer",
    { appId, toolId: appToolId },
    {
      ...ownerFacts,
      toolClass: appToolClass,
      toolVersion: positiveInt,
      toolDigest: sha256DigestSchema,
      seenToolDigest: sha256DigestSchema,
      toolStatus: appToolStatus,
      targetDigest: sha256DigestSchema,
    },
  ),
  "app.zugriff_setzen": action(
    "besitzer",
    { appId, botId },
    { ...ownerFacts, access: appAccess, previousAccess: appAccess },
  ),
  "app.trennen": action("besitzer", { appId }, { ...ownerFacts, tokenSet: z.boolean() }),
} as const satisfies Record<Action3, unknown>;

type Spec3Action = (typeof ACTIONS_3)[keyof typeof ACTIONS_3];

const ACTION_TYPES_3 = Object.keys(ACTIONS_3) as Action3[];

/** Fakten, die die Aktion laut Fassung 3 kennt (Schlüssel des Fakten-Schemas). */
const FACT_NAMES_3: Readonly<Record<string, ReadonlySet<string>>> = Object.fromEntries(
  ACTION_TYPES_3.map((type) => {
    const facts = (ACTIONS_3[type] as Spec3Action).facts as unknown as {
      shape?: Record<string, unknown>;
      def?: { schema?: { shape?: Record<string, unknown> } };
    };
    const shape = facts.shape ?? facts.def?.schema?.shape ?? {};
    return [type, new Set(Object.keys(shape))];
  }),
);

function hasAction(type: unknown): type is Action3 {
  return typeof type === "string" && Object.hasOwn(ACTIONS_3, type);
}

const requestVariants = ACTION_TYPES_3.map((type) =>
  z.strictObject({
    actionId,
    type: z.literal(type),
    actor: z.custom<string>((value) => typeof value === "string" && ACTOR_PATTERN.test(value)),
    target: (ACTIONS_3[type] as Spec3Action).target,
  }),
);

const REQUEST_3 = z
  .discriminatedUnion("type", requestVariants as [never, ...never[]])
  .refine(
    (request: { type: Action3; actor: string }) =>
      actorKindOf(request.actor) === (ACTIONS_3[request.type] as Spec3Action).actor,
    { path: ["actor"] },
  ) as unknown as z.ZodType;

function actorKindOf(actor: string): ActorKind {
  return actor === "besitzer" ? "besitzer" : "bot";
}

// ---------------------------------------------------------------------------------------------
// Vorbedingungen, Grenzen, Deckel, Fehlercodes, Felder im Beleg (Kopien)

const TOOL_GATE_ACTIONS_3 = ["werkzeug.aufrufen"] as const;

const LIMITS_BY_ID_3 = {
  "G-01": "schleuse_gefordert",
  "G-02": "anbieter_region",
  "G-03": "laenge",
  "G-04": "tagesbudget",
  "G-05": "not_aus",
  "G-16": "lauf_schritte",
  "G-17": "lauf_aufrufe",
  "G-18": "lauf_token",
  "G-06": "app_zugriff",
  "G-07": "werkzeug_bestaetigt",
  "G-08": "app_ziel",
  "G-40": "eine_app_je_schritt",
} as const;
// Die Namen G-06 bis G-08 und G-40 kennen die heutigen Verträge noch nicht (`GateLimitName`).
const LIMIT_ORDER_3 = Object.values(LIMITS_BY_ID_3) as unknown as GateLimitName[];
const LIMIT_ID_BY_NAME_3 = Object.fromEntries(
  Object.entries(LIMITS_BY_ID_3).map(([id, name]) => [name, id]),
) as Record<string, string>;
/** Grenzen der Läufe; eine verletzte ergibt den Fehlercode `limit_erreicht`. */
const RUN_LIMITS_3: readonly string[] = ["lauf_schritte", "lauf_aufrufe", "lauf_token"];

const PRECONDITIONS_3: Readonly<Record<string, FormatPrecondition>> = {
  "V-01": {
    name: "unterhaltung_vorhanden",
    actions: ["nachricht.senden", "unterhaltung.exportieren", "antwort.neu_erzeugen"],
    require: [{ fact: "conversationExists", op: "eq", value: true }],
    errorCode: "nicht_gefunden",
  },
  "V-02": {
    name: "kein_lauf_aktiv",
    actions: ["nachricht.senden", "antwort.neu_erzeugen"],
    require: [{ fact: "runActive", op: "eq", value: false }],
    errorCode: "lauf_aktiv",
  },
  "V-03": {
    name: "lauf_aktiv",
    actions: ["lauf.abbrechen"],
    require: [{ fact: "runActive", op: "eq", value: true }],
    errorCode: "nicht_gefunden",
  },
  "V-04": {
    name: "schleuse_eingerichtet",
    actions: ["schleuse.umschalten"],
    when: [{ fact: "mode", op: "eq", value: "on" }],
    require: [{ fact: "schleuseInstalled", op: "eq", value: true }],
    errorCode: "schleuse_nicht_installiert",
  },
  "V-05": {
    name: "lauf_laeuft",
    actions: ["werkzeug.aufrufen", "werkzeug.ausfuehren"],
    require: [{ fact: "runRunning", op: "eq", value: true }],
    errorCode: "nicht_gefunden",
  },
  "V-06": {
    name: "passwort_bestaetigt",
    actions: ["zugang.passwort_aendern"],
    require: [{ fact: "currentPasswordVerified", op: "eq", value: true }],
    errorCode: "passwort_falsch",
  },
  "V-07": {
    name: "einrichtung_offen",
    actions: ["einrichtung.abschliessen"],
    require: [{ fact: "setupOpen", op: "eq", value: true }],
    errorCode: "einrichtung_fertig",
  },
  "V-08": {
    name: "freigabe_wartet",
    actions: ["werkzeug.freigeben"],
    require: [
      { fact: "callWaiting", op: "eq", value: true },
      { fact: "callExpired", op: "eq", value: false },
    ],
    errorCode: "nicht_gefunden",
  },
  "V-09": {
    name: "freigabe_passt",
    actions: ["werkzeug.freigeben"],
    require: [{ fact: "argsDigest", op: "eq", value: { fact: "waitingArgsDigest" } }],
    errorCode: "abgelehnt",
  },
  "V-10": {
    name: "notaus_aufheben_bestaetigt",
    actions: ["notaus.umschalten"],
    when: [{ fact: "on", op: "eq", value: false }],
    require: [{ fact: "currentPasswordVerified", op: "eq", value: true }],
    errorCode: "passwort_falsch",
  },
  "V-11": {
    name: "antwort_ist_letzte",
    actions: ["antwort.neu_erzeugen"],
    require: [{ fact: "answerIsLatest", op: "eq", value: true }],
    errorCode: "nicht_gefunden",
  },
  "V-12": {
    name: "werkzeug_angeboten",
    actions: TOOL_GATE_ACTIONS_3,
    require: [
      { fact: "toolRegistered", op: "eq", value: true },
      { fact: "toolOffered", op: "eq", value: true },
    ],
    errorCode: "werkzeug_unbekannt",
  },
  "V-13": {
    name: "eingabe_gueltig",
    actions: TOOL_GATE_ACTIONS_3,
    require: [{ fact: "inputValid", op: "eq", value: true }],
    errorCode: "werkzeug_eingabe_ungueltig",
  },
  "V-14": {
    name: "aufrufe_je_schritt",
    actions: TOOL_GATE_ACTIONS_3,
    require: [{ fact: "callIndexInStep", op: "lt", value: { fact: "maxCallsPerStep" } }],
    errorCode: "limit_erreicht",
  },
  "V-19": {
    name: "app_adresse_erlaubt",
    actions: ["app.verbinden"],
    require: [
      { fact: "addressHttps", op: "eq", value: true },
      { fact: "addressPublic", op: "eq", value: true },
      { fact: "addressPort443", op: "eq", value: true },
      { fact: "addressUserinfo", op: "eq", value: false },
      { fact: "addressQuery", op: "eq", value: false },
      { fact: "addressFragment", op: "eq", value: false },
    ],
    errorCode: "app_adresse_unzulaessig" as ErrorCode,
  },
  "V-38": {
    name: "abdruck_gesehen",
    actions: ["app.werkzeuge_bestaetigen"],
    require: [
      { fact: "seenToolDigest", op: "eq", value: { fact: "toolDigest" } },
      { fact: "toolStatus", op: "in", value: ["neu", "bestaetigt", "geaendert", "gesperrt"] },
    ],
    errorCode: "werkzeug_abdruck_ungesehen" as ErrorCode,
  },
};
const PRECONDITION_IDS_3 = Object.keys(PRECONDITIONS_3);
const PRECONDITION_NAMES_3 = PRECONDITION_IDS_3.map(
  (id) => (PRECONDITIONS_3[id] as FormatPrecondition).name,
);
const PRECONDITION_ID_BY_NAME_3 = Object.fromEntries(
  PRECONDITION_IDS_3.map((id) => [(PRECONDITIONS_3[id] as FormatPrecondition).name, id]),
) as Record<string, string>;

const CAPS_3: readonly CapDefinition[] = [
  {
    id: "D-01",
    name: "fremd_dann_fragen",
    actions: ["werkzeug.aufrufen"],
    // biome-ignore lint/suspicious/noThenProperty: Feld des Vertrags (ein Text, keine Funktion)
    then: "ask",
    when: [{ fact: "untrustedInput", op: "eq", value: true }],
    anyOf: [
      { fact: "toolKind", op: "eq", value: "schreiben" },
      { fact: "toolReach", op: "eq", value: "nach_aussen" },
    ],
  },
];
const CAP_ORDER_3 = CAPS_3.map((cap) => cap.name);

const ERROR_CODES_3 = [
  "nicht_angemeldet",
  "pruefzeichen_fehlt",
  "herkunft_falsch",
  "eingabe_ungueltig",
  "nicht_gefunden",
  "zu_viele_versuche",
  "passwort_falsch",
  "einrichtungs_code_falsch",
  "einrichtung_offen",
  "einrichtung_fertig",
  "regel_fehlt",
  "abgelehnt",
  "lauf_aktiv",
  "kein_modell",
  "schleuse_blockiert",
  "schleuse_nicht_installiert",
  "anbieter_nicht_erreichbar",
  "schluessel_ungueltig",
  "schluessel_passt_nicht",
  "antwort_zu_gross",
  "limit_erreicht",
  "regel_unbekannt",
  "unterbrochen",
  "intern",
  "angehalten",
  "freigabe_noetig",
  "werkzeug_unbekannt",
  "werkzeug_eingabe_ungueltig",
  "werkzeug_zeitgrenze",
  "werkzeug_fehler",
  "ausgang_unbekannt",
  "schritte_aufgebraucht",
  "zu_viele_aufrufe",
  "app_nicht_erreichbar",
  "app_zugang_ungueltig",
  "app_adresse_unzulaessig",
  "app_kein_mcp",
  "app_befehl_nicht_erlaubt",
  "app_version_unbekannt",
  "werkzeug_geaendert",
  "werkzeug_kein_zugriff",
  "werkzeug_ergebnis_zu_gross",
  "werkzeug_schema_nicht_pruefbar",
  "app_braucht_eingabe",
  "werkzeug_platzhalter",
  "werkzeug_zweite_app",
  "werkzeug_abdruck_ungesehen",
] as const;

const scalar = z.union([z.string().max(200), z.number().int(), z.boolean()]);
const checkResult = z.enum(["ok", "verletzt", "entfaellt"]);
const capCheck = z.strictObject({
  name: z.enum(CAP_ORDER_3 as [string, ...string[]]),
  result: z.enum(["entfaellt", "nicht_noetig", "gedeckelt"]),
});

const decisionFields = {
  /** Fassung im Beleg: ab Fassung 2 Pflicht. */
  gateFormat: z.literal(3),
  outcome: z.enum(["allow", "deny", "ask", "prepare"]),
  stage: z.enum(["ask", "prepare", "execute"]),
  rules: z.array(
    z.strictObject({
      id: z.union([z.string().regex(/^R-\d{3}$/), idSchema("rule")]),
      version: positiveInt,
      hash: sha256DigestSchema.optional(),
    }),
  ),
  limits: z.array(
    z.strictObject({
      name: z.enum(LIMIT_ORDER_3 as [string, ...string[]]),
      result: checkResult,
      value: scalar.optional(),
    }),
  ),
  /** Vorbedingungen der Aktion: ab Fassung 2 Pflicht. */
  preconditions: z.array(
    z.strictObject({
      name: z.enum(PRECONDITION_NAMES_3 as [string, ...string[]]),
      result: checkResult,
    }),
  ),
  ruleStand: positiveInt.optional(),
  reason: z.string().min(1).max(500),
};

/** Felder der Entscheidung, für alle Aktionen gemeinsam: Deckel dürfen fehlen. */
const DECISION_3 = z.strictObject({ ...decisionFields, caps: z.array(capCheck).optional() });

/** Felder der Entscheidung je Aktion: Deckel genau bei Aktionen mit Deckel, in ihrer Reihenfolge. */
function decisionFor(type: string): z.ZodType {
  const caps = capsOf(type);
  if (caps.length === 0) return z.strictObject(decisionFields);
  return z.strictObject({
    ...decisionFields,
    caps: z.tuple(
      caps.map((cap) =>
        z.strictObject({
          name: z.literal(cap.name),
          result: z.enum(["entfaellt", "nicht_noetig", "gedeckelt"]),
        }),
      ) as unknown as [z.ZodType, ...z.ZodType[]],
    ),
  });
}

const RESULT_3 = z.strictObject({
  status: z.enum(["ok", "error", "cancelled", "denied"]),
  code: z.enum(ERROR_CODES_3).optional(),
  digest: hmacDigestSchema.optional(),
  tokens: z.strictObject({ input: count, output: count }).optional(),
  servedBy: z
    .strictObject({
      provider: z
        .string()
        .regex(/^[a-z0-9][a-z0-9._-]{0,63}$/)
        .optional(),
      model: z
        .string()
        .regex(/^[\x21-\x7e]{1,200}$/)
        .optional(),
    })
    .optional(),
  modelReported: z.string().max(200).optional(),
  docStand: z.string().max(80).optional(),
  found: count.optional(),
});

// ---------------------------------------------------------------------------------------------
// Auswertung (Kopie, erweitert um die Grenzen der Läufe und die Deckel)

type FactRecord = Readonly<Record<string, unknown>>;
type Comparable = string | number | boolean;

function isComparable(value: unknown): value is Comparable {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function factValue(facts: FactRecord, name: string): unknown {
  return Object.hasOwn(facts, name) ? facts[name] : undefined;
}

function conditionHolds(condition: RuleCondition, facts: FactRecord): boolean {
  const left = factValue(facts, condition.fact);
  if (!isComparable(left)) return false;

  const raw = condition.value;
  if (condition.op === "in") {
    return Array.isArray(raw) && raw.some((item) => item === left);
  }
  if (Array.isArray(raw)) return false;

  let right: unknown = raw;
  if (typeof raw === "object" && raw !== null) {
    right = factValue(facts, raw.fact);
  }
  if (!isComparable(right)) return false;

  switch (condition.op) {
    case "eq":
      return left === right;
    case "ne":
      return left !== right;
    case "lt":
    case "lte":
    case "gt":
    case "gte":
      if (typeof left !== "number" || typeof right !== "number") return false;
      if (condition.op === "lt") return left < right;
      if (condition.op === "lte") return left <= right;
      if (condition.op === "gt") return left > right;
      return left >= right;
    default:
      return false;
  }
}

function factContext(action: { actor: string }, facts: unknown): FactRecord {
  return { ...(facts as FactRecord), [ACTOR_FACT]: actorKindOf(action.actor) };
}

function preconditionsOf(type: string): string[] {
  return PRECONDITION_IDS_3.filter((id) =>
    (PRECONDITIONS_3[id] as FormatPrecondition).actions.includes(type),
  );
}

function capsOf(type: string): CapDefinition[] {
  return CAPS_3.filter((cap) => cap.actions.includes(type));
}

function checkPreconditions(
  action: { type: string; actor: string },
  facts: unknown,
): PreconditionCheck[] {
  const context = factContext(action, facts);
  return preconditionsOf(action.type).map((id) => {
    const precondition = PRECONDITIONS_3[id] as FormatPrecondition;
    const name = precondition.name as PreconditionCheck["name"];
    const when = precondition.when ?? [];
    if (!when.every((condition) => conditionHolds(condition, context))) {
      return { name, result: "entfaellt" };
    }
    const ok = precondition.require.every((condition) => conditionHolds(condition, context));
    return { name, result: ok ? "ok" : "verletzt" };
  });
}

function fact(facts: unknown, name: string): unknown {
  const record = facts as FactRecord;
  return Object.hasOwn(record, name) ? record[name] : undefined;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function check(name: GateLimitName, ok: boolean, value?: string | number | boolean): LimitCheck {
  const result: LimitCheck = { name, result: ok ? "ok" : "verletzt" };
  if (value !== undefined) result.value = value;
  return result;
}

function notApplicable(name: GateLimitName): LimitCheck {
  return { name, result: "entfaellt" };
}

function scalarOrUndefined(value: unknown): string | number | boolean | undefined {
  if (typeof value === "string") return value.slice(0, 200);
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  return undefined;
}

function hasFact(type: string, name: string): boolean {
  return FACT_NAMES_3[type]?.has(name) === true;
}

/** G-01 `schleuse_gefordert`. */
export const limitSchleuseGefordert: FormatLimitFn = (action, facts) => {
  const name = "schleuse_gefordert";
  if (action.type !== "modell.anfragen") return notApplicable(name);
  const mode = fact(facts, "requestedMode");
  const routeValue = fact(facts, "route");
  const value = scalarOrUndefined(routeValue);
  if (mode === "off") return check(name, true, value);
  return check(name, routeValue === "schleuse" && fact(facts, "schleuseReachable") === true, value);
};

/** G-02 `anbieter_region`. */
export const limitAnbieterRegion: FormatLimitFn = (action, facts) => {
  const name = "anbieter_region";
  if (action.type !== "modell.anfragen") return notApplicable(name);
  const regionValue = fact(facts, "region");
  const allowed = regionValue === "eu" || regionValue === "local";
  return check(
    name,
    fact(facts, "providerEnabled") === true && allowed,
    scalarOrUndefined(regionValue),
  );
};

/** G-03 `laenge`. */
export const limitLaenge: FormatLimitFn = (action, facts) => {
  const name = "laenge";
  if (action.type !== "nachricht.senden" && action.type !== "modell.anfragen") {
    return notApplicable(name);
  }
  const inputChars = fact(facts, "inputChars");
  const maxInputChars = fact(facts, "maxInputChars");
  let ok = isCount(inputChars) && isCount(maxInputChars) && inputChars <= maxInputChars;
  if (action.type === "modell.anfragen") {
    const maxOutput = fact(facts, "maxOutputTokens");
    const botMaxOutput = fact(facts, "botMaxOutputTokens");
    ok = ok && isCount(maxOutput) && isCount(botMaxOutput) && maxOutput <= botMaxOutput;
  }
  return check(name, ok, isCount(inputChars) ? inputChars : undefined);
};

/** G-04 `tagesbudget`. */
export const limitTagesbudget: FormatLimitFn = (action, facts) => {
  const name = "tagesbudget";
  if (action.type !== "modell.anfragen") return notApplicable(name);
  const budget = fact(facts, "dailyTokenBudget");
  if (budget === undefined) return notApplicable(name);
  const tokensToday = fact(facts, "tokensToday");
  return check(
    name,
    isCount(budget) && isCount(tokensToday) && tokensToday < budget,
    isCount(tokensToday) ? tokensToday : undefined,
  );
};

/** G-05 `not_aus`: jede Aktion, die laut Fassung 3 `killSwitch` kennt oder ihn mitbringt. */
export const limitNotAus: FormatLimitFn = (action, facts) => {
  const name = "not_aus";
  const killSwitch = fact(facts, "killSwitch");
  const concerned = hasFact(action.type, "killSwitch") || killSwitch !== undefined;
  if (!concerned) return notApplicable(name);
  return check(
    name,
    killSwitch === false,
    typeof killSwitch === "boolean" ? killSwitch : undefined,
  );
};

/** G-16 `lauf_schritte`: `step < maxSteps`; fehlt ein Fakt oder ist keine Ganzzahl: verletzt. */
export const limitLaufSchritte: FormatLimitFn = (action, facts) => {
  const name = "lauf_schritte";
  if (action.type !== "modell.anfragen") return notApplicable(name);
  const step = fact(facts, "step");
  const maxSteps = fact(facts, "maxSteps");
  return check(
    name,
    isCount(step) && isCount(maxSteps) && step < maxSteps,
    isCount(step) ? step : undefined,
  );
};

/** G-17 `lauf_aufrufe`: `callsInRun < maxCallsPerRun`; fehlt ein Fakt oder ist keine Ganzzahl: verletzt. */
export const limitLaufAufrufe: FormatLimitFn = (action, facts) => {
  const name = "lauf_aufrufe";
  if (!(TOOL_GATE_ACTIONS_3 as readonly string[]).includes(action.type)) {
    return notApplicable(name);
  }
  const calls = fact(facts, "callsInRun");
  const maxCalls = fact(facts, "maxCallsPerRun");
  return check(
    name,
    isCount(calls) && isCount(maxCalls) && calls < maxCalls,
    isCount(calls) ? calls : undefined,
  );
};

/**
 * G-18 `lauf_token`: `runTokens + stepTokenEstimate <= maxRunTokens`; fehlt ein Fakt oder ist
 * keine Ganzzahl: verletzt. Liegt die Summe außerhalb der sicheren Ganzzahlen, ist sie größer als
 * jede zulässige Grenze: verletzt, ohne Wert, damit der Beleg schreibbar bleibt.
 */
export const limitLaufToken: FormatLimitFn = (action, facts) => {
  const name = "lauf_token";
  if (action.type !== "modell.anfragen") return notApplicable(name);
  const runTokens = fact(facts, "runTokens");
  const estimate = fact(facts, "stepTokenEstimate");
  const maxRunTokens = fact(facts, "maxRunTokens");
  const both = isCount(runTokens) && isCount(estimate);
  const raw = both ? runTokens + estimate : undefined;
  const sum = isCount(raw) ? raw : undefined;
  return check(name, sum !== undefined && isCount(maxRunTokens) && sum <= maxRunTokens, sum);
};

const APP_TOOL_ACTIONS_3: readonly string[] = ["werkzeug.aufrufen"];

/**
 * Betrifft die Prüfung einen Aufruf eines App-Werkzeugs? Ja bei `werkzeug.aufrufen`, außer die
 * Quelle ist genau `eingebaut` und kein Fakt einer App ist da (dann entfallen G-06 bis G-08 und
 * G-40). Fehlt die Quelle oder steht ein Fakt einer App dabei, gilt die Prüfung (fail closed).
 */
function appToolConcerned(action: { type: string }, facts: unknown): boolean {
  if (!APP_TOOL_ACTIONS_3.includes(action.type)) return false;
  if (fact(facts, "toolSource") !== "eingebaut") return true;
  return APP_TOOL_FACT_NAMES.some((name) => fact(facts, name) !== undefined);
}

function textOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" ? value.slice(0, 200) : undefined;
}

/** G-06 `app_zugriff`: `appAccess = lesen` und `toolKind = lesen`; sonst verletzt. */
export const limitAppZugriff: FormatLimitFn = (action, facts) => {
  const name = "app_zugriff" as GateLimitName;
  if (!appToolConcerned(action, facts)) return notApplicable(name);
  const access = fact(facts, "appAccess");
  return check(
    name,
    access === "lesen" && fact(facts, "toolKind") === "lesen",
    textOrUndefined(access),
  );
};

/**
 * G-07 `werkzeug_bestaetigt`: `toolStatus = bestaetigt` und `toolDigest = confirmedToolDigest`
 * (beide Text); sonst verletzt.
 */
export const limitWerkzeugBestaetigt: FormatLimitFn = (action, facts) => {
  const name = "werkzeug_bestaetigt" as GateLimitName;
  if (!appToolConcerned(action, facts)) return notApplicable(name);
  const status = fact(facts, "toolStatus");
  const digest = fact(facts, "toolDigest");
  return check(
    name,
    status === "bestaetigt" &&
      typeof digest === "string" &&
      digest === fact(facts, "confirmedToolDigest"),
    textOrUndefined(status),
  );
};

/** G-08 `app_ziel`: `targetDigest = confirmedTargetDigest` (beide Text); sonst verletzt. */
export const limitAppZiel: FormatLimitFn = (action, facts) => {
  const name = "app_ziel" as GateLimitName;
  if (!appToolConcerned(action, facts)) return notApplicable(name);
  const target = fact(facts, "targetDigest");
  return check(name, typeof target === "string" && target === fact(facts, "confirmedTargetDigest"));
};

/**
 * G-40 `eine_app_je_schritt`: `stepAppId = appId` (beide Text). `stepAppId` ist die App des ersten
 * App-Aufrufs im Schritt; fehlt der Fakt, ist die Grenze verletzt.
 */
export const limitEineAppJeSchritt: FormatLimitFn = (action, facts) => {
  const name = "eine_app_je_schritt" as GateLimitName;
  if (!appToolConcerned(action, facts)) return notApplicable(name);
  const stepApp = fact(facts, "stepAppId");
  return check(name, typeof stepApp === "string" && stepApp === fact(facts, "appId"));
};

const LIMITS_3: Readonly<Record<string, FormatLimitFn>> = {
  schleuse_gefordert: limitSchleuseGefordert,
  anbieter_region: limitAnbieterRegion,
  laenge: limitLaenge,
  tagesbudget: limitTagesbudget,
  not_aus: limitNotAus,
  lauf_schritte: limitLaufSchritte,
  lauf_aufrufe: limitLaufAufrufe,
  lauf_token: limitLaufToken,
  app_zugriff: limitAppZugriff,
  werkzeug_bestaetigt: limitWerkzeugBestaetigt,
  app_ziel: limitAppZiel,
  eine_app_je_schritt: limitEineAppJeSchritt,
};

function checkLimits(action: { type: string }, facts: unknown): LimitCheck[] {
  return LIMIT_ORDER_3.map((name) => (LIMITS_3[name] as FormatLimitFn)(action, facts));
}

function isValidInput(action: unknown, facts: unknown): boolean {
  if (!REQUEST_3.safeParse(action).success) return false;
  const type = (action as { type: Action3 }).type;
  return (ACTIONS_3[type] as Spec3Action).facts.safeParse(facts).success;
}

function compareRules(a: RuleDefinition, b: RuleDefinition): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return a.version - b.version;
}

function outcomeOf(rule: RuleDefinition): Outcome {
  if (rule.effect === "deny") return "deny";
  if (rule.effect === "ask") return "ask";
  if (rule.stage === "execute") return "allow";
  return rule.stage === "prepare" ? "prepare" : "ask";
}

function ruleApplies(
  rule: RuleDefinition,
  action: { type: string; actor: string },
  facts: unknown,
): boolean {
  if (rule.enabled !== true) return false;
  if (rule.action !== "*" && rule.action !== action.type) return false;
  const context = factContext(action, facts);
  return rule.conditions.every((condition) => conditionHolds(condition, context));
}

/** Greift der Deckel für diese Fakten (`when` gilt und mindestens eine Bedingung aus `anyOf`)? */
function capApplies(cap: CapDefinition, action: { actor: string }, facts: unknown): boolean {
  const context = factContext(action, facts);
  return (
    cap.when.every((condition) => conditionHolds(condition, context)) &&
    cap.anyOf.some((condition) => conditionHolds(condition, context))
  );
}

function limitReason(violated: readonly LimitCheck[]): string {
  const names = violated.map((entry) => {
    const id = LIMIT_ID_BY_NAME_3[entry.name] as string;
    return t("tor.grenze", { id, name: t(`regel.${id}` as never) });
  });
  return t("tor.grenze_verletzt", { grenzen: names.join(", ") }).slice(0, 500);
}

function preconditionReason(violated: readonly PreconditionCheck[]): string {
  const names = violated.map((entry) => {
    const id = PRECONDITION_ID_BY_NAME_3[entry.name] as string;
    return t("tor.grenze", { id, name: t(`regel.${id}` as never) });
  });
  return t("tor.vorbedingung_verletzt", { vorbedingungen: names.join(", ") }).slice(0, 500);
}

function invalidInputReason(): string {
  return `${t("fehler.abgelehnt")} ${t("fehler.eingabe_ungueltig")}`;
}

function ruleRef(rule: EvaluatedRule): StoredRuleRef {
  const ref: StoredRuleRef = { id: rule.id, version: rule.version };
  if (typeof rule.hash === "string") ref.hash = rule.hash;
  return ref;
}

type CapEntry = { name: string; result: "entfaellt" | "nicht_noetig" | "gedeckelt" };

function evaluate(action: unknown, facts: unknown, rules: RuleSnapshot): Decision;
function evaluate(action: unknown, facts: unknown, rules: readonly EvaluatedRule[]): ListDecision;
function evaluate(
  action: unknown,
  facts: unknown,
  rules: readonly EvaluatedRule[] | RuleSnapshot,
): Decision | ListDecision;
function evaluate(
  action: unknown,
  facts: unknown,
  rules: readonly EvaluatedRule[] | RuleSnapshot,
): Decision | ListDecision {
  const snapshot = Array.isArray(rules) ? undefined : (rules as RuleSnapshot);
  const ruleList: readonly EvaluatedRule[] = snapshot ? snapshot.rules : (rules as EvaluatedRule[]);
  const stand = snapshot === undefined ? {} : { ruleStand: snapshot.stand };

  // 1. Eingabe
  if (!isValidInput(action, facts)) {
    const type = (action as { type?: unknown } | null)?.type;
    const known = hasAction(type);
    const caps: CapEntry[] = known
      ? capsOf(type).map((cap) => ({ name: cap.name, result: "entfaellt" }))
      : [];
    return {
      outcome: "deny",
      stage: "ask",
      matchedRules: [],
      limits: LIMIT_ORDER_3.map((name) => ({ name, result: "entfaellt" })),
      preconditions: known
        ? preconditionsOf(type).map((id) => ({
            name: (PRECONDITIONS_3[id] as FormatPrecondition).name as PreconditionCheck["name"],
            result: "entfaellt",
          }))
        : [],
      ...(caps.length > 0 ? { caps } : {}),
      ...stand,
      reason: invalidInputReason(),
    } as Decision;
  }

  // 2. Vorbedingungen, 3. Grenzen, 4. Regeln
  const request = action as { type: string; actor: string };
  const preconditions = checkPreconditions(request, facts);
  const limits = checkLimits(request, facts);
  const candidates = ruleList.filter((rule) => ruleApplies(rule, request, facts));
  const winner = [...candidates].sort(compareRules)[0];
  const stage: Stage = winner ? winner.stage : "ask";
  const matchedRules = winner ? [ruleRef(winner)] : [];
  const base = { stage, matchedRules, limits, preconditions, ...stand };

  let decision: { outcome: Outcome; stage: Stage; reason: string };
  const violatedPreconditions = preconditions.filter((entry) => entry.result === "verletzt");
  const violated = limits.filter((entry) => entry.result === "verletzt");
  if (violatedPreconditions.length > 0) {
    decision = { outcome: "deny", stage, reason: preconditionReason(violatedPreconditions) };
  } else if (violated.length > 0) {
    decision = { outcome: "deny", stage, reason: limitReason(violated) };
  } else if (!winner) {
    decision = { outcome: "ask", stage: "ask", reason: t("fehler.regel_fehlt") };
  } else {
    decision = { outcome: outcomeOf(winner), stage, reason: winner.reason };
  }

  // 5. Deckel: nur nach den Regeln, nur aus `allow` wird `ask`.
  const caps: CapEntry[] = [];
  for (const cap of capsOf(request.type)) {
    if (!capApplies(cap, request, facts)) {
      caps.push({ name: cap.name, result: "entfaellt" });
    } else if (decision.outcome !== "allow") {
      caps.push({ name: cap.name, result: "nicht_noetig" });
    } else {
      caps.push({ name: cap.name, result: "gedeckelt" });
      decision = { outcome: cap.then, stage: "ask", reason: t(`tor.deckel.${cap.id}` as never) };
    }
  }

  return {
    outcome: decision.outcome,
    ...base,
    stage: decision.stage,
    ...(caps.length > 0 ? { caps } : {}),
    reason: decision.reason,
  } as Decision;
}

/** Grenzen der Apps und ihr Fehlercode, in der Reihenfolge der Grenzen. */
const APP_LIMIT_CODES_3: readonly (readonly [string, string])[] = [
  ["app_zugriff", "werkzeug_kein_zugriff"],
  ["werkzeug_bestaetigt", "werkzeug_geaendert"],
  ["app_ziel", "werkzeug_geaendert"],
  ["eine_app_je_schritt", "werkzeug_zweite_app"],
];

/**
 * Fehlercode für das Ergebnis einer nicht erlaubten Entscheidung: verletzte Vorbedingung (erste
 * nach Kennung) → ihr Code; Not-Aus → `angehalten`; Grenze eines Laufs (G-16 bis G-18) →
 * `limit_erreicht`; G-06 → `werkzeug_kein_zugriff`; G-07 oder G-08 → `werkzeug_geaendert`;
 * G-40 → `werkzeug_zweite_app`; sonst `abgelehnt` (`deny`) bzw. `regel_fehlt` (`ask`, `prepare`).
 * Die Codes der Fassung 3 kennen die heutigen Verträge noch nicht (`ErrorCode`).
 */
function denialCode(
  decision: Pick<Decision, "outcome" | "preconditions"> & { limits?: Decision["limits"] },
): ErrorCode {
  const violatedIds = (decision.preconditions ?? [])
    .filter((entry) => entry.result === "verletzt")
    .map((entry) => PRECONDITION_ID_BY_NAME_3[entry.name])
    .filter((id): id is string => id !== undefined)
    .sort();
  const first = violatedIds[0];
  if (first !== undefined) return (PRECONDITIONS_3[first] as FormatPrecondition).errorCode;
  const limits = decision.limits ?? [];
  const violated = (name: string) =>
    limits.some((entry) => entry.name === name && entry.result === "verletzt");
  if (violated("not_aus")) return "angehalten";
  if (RUN_LIMITS_3.some(violated)) return "limit_erreicht";
  for (const [name, code] of APP_LIMIT_CODES_3) if (violated(name)) return code as ErrorCode;
  if (decision.outcome === "deny" || decision.outcome === "allow") return "abgelehnt";
  return "regel_fehlt";
}

/** Fassung 3, eingefroren. */
export const GATE_FORMAT_3: GateFormatSpec = {
  format: 3,
  actions: ACTION_TYPES_3,
  facts: Object.fromEntries(ACTION_TYPES_3.map((type) => [type, ACTIONS_3[type].facts])),
  target: Object.fromEntries(ACTION_TYPES_3.map((type) => [type, ACTIONS_3[type].target])),
  actor: Object.fromEntries(ACTION_TYPES_3.map((type) => [type, ACTIONS_3[type].actor])),
  request: REQUEST_3,
  decision: DECISION_3,
  decisionFor,
  result: RESULT_3,
  errorCodes: ERROR_CODES_3,
  preconditions: PRECONDITIONS_3,
  limits: LIMITS_3,
  limitOrder: LIMIT_ORDER_3,
  caps: CAPS_3,
  capOrder: CAP_ORDER_3,
  denialCode,
  hasFact,
  conditionHolds,
  ruleApplies,
  checkPreconditions,
  checkLimits,
  evaluate,
};
