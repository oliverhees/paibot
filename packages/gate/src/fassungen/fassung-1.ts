/**
 * PaiBot – Fassung 1 der Tor-Auswertung, eingefroren: Aktionen, Fakten, Felder im Beleg,
 * Vorbedingungen, Grenzen und Regel-Auswertung, wie das Tor vor der Einführung der Fassungen
 * entschied. Diese Datei wird nie mehr geändert.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

// Alles hier ist eine Kopie, kein Verweis auf geteilte Schemas: Ändert sich später ein geteiltes
// Schema, bleibt Fassung 1 gleich. Importiert werden nur Grund-Schemas, die per Definition nie
// geändert werden (Kennungen, Prüfsummen-Formate), Typen und Texte.

import type { ActorKind } from "@paibot/shared/aktionen";
import type { ErrorCode } from "@paibot/shared/fehler";
import { hmacDigestSchema, sha256DigestSchema } from "@paibot/shared/grundtypen";
import { ID_BODY_PATTERN, ID_PREFIX, idSchema } from "@paibot/shared/ids";
import { t } from "@paibot/shared/texte";
import type {
  Decision,
  LimitCheck,
  LimitName,
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
import type { EvaluatedRule, FormatLimitFn, FormatPrecondition, GateFormatSpec } from "./typ";

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

function toolAction(target: z.ZodRawShape, facts: z.ZodRawShape) {
  return {
    actor: "bot" as const,
    target: z.strictObject(target),
    facts: z
      .strictObject({ ...toolFacts, ...facts })
      .refine(
        (value) =>
          ((value as { toolSource?: unknown }).toolSource === "mcp") ===
          ((value as { toolServer?: unknown }).toolServer !== undefined),
        { path: ["toolServer"] },
      ) as z.ZodType,
  };
}

// Einmalige Ausnahme vom Einfrieren, nur am Typ: Diese Datei bezog ihre Aktionen anfangs aus der
// lebenden Aktions-Liste. Damit eine neue Aktion sie nicht berührt, steht die Liste seit 2026-11-22
// hier fest. Geändert sind nur Typen und dieser Kommentar; die übersetzte Ausgabe ohne Typen ist
// Byte für Byte gleich, die festen Fälle der Fassung 1 sind unverändert.
/** Aktionen der Fassung 1, als feste Liste. */
type Action1 =
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
  | "werkzeug.freigeben"
  | "werkzeug.ausfuehren"
  | "geraet.hinzufuegen"
  | "geraet.entfernen"
  | "geraet.bestaetigen"
  | "notaus.umschalten"
  | "unterhaltung.exportieren"
  | "antwort.neu_erzeugen";

const ACTIONS_1 = {
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
    { ...ownerFacts, created: z.boolean(), region, keySet: z.boolean() },
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
      botOfConversation: z.boolean(),
      runRunning: z.boolean(),
      argsDigest: hmacDigestSchema,
      killSwitch: z.boolean(),
    },
  ),
  "werkzeug.freigeben": action(
    "besitzer",
    { conversationId, runId, toolCallId: actionId },
    {
      ...ownerFacts,
      answer: z.enum(["erteilen", "ablehnen"]),
      callWaiting: z.boolean(),
      callExpired: z.boolean(),
      argsDigest: hmacDigestSchema,
      waitingArgsDigest: hmacDigestSchema,
    },
  ),
  "werkzeug.ausfuehren": toolAction(
    { conversationId, runId, botId, toolCallId: actionId, approvalId: actionId },
    {
      botOfConversation: z.boolean(),
      runRunning: z.boolean(),
      argsDigest: hmacDigestSchema,
      killSwitch: z.boolean(),
      approvalGranted: z.boolean(),
      approvalConsumed: z.boolean(),
      approvalExpired: z.boolean(),
      approvalArgsDigest: hmacDigestSchema,
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
} as const satisfies Record<Action1, unknown>;

type Spec1Action = (typeof ACTIONS_1)[keyof typeof ACTIONS_1];

const ACTION_TYPES_1 = Object.keys(ACTIONS_1) as Action1[];

/** Fakten, die die Aktion laut Fassung 1 kennt (Schlüssel des Fakten-Schemas). */
const FACT_NAMES_1: Readonly<Record<string, ReadonlySet<string>>> = Object.fromEntries(
  ACTION_TYPES_1.map((type) => {
    const facts = (ACTIONS_1[type] as Spec1Action).facts as unknown as {
      shape?: Record<string, unknown>;
      def?: { schema?: { shape?: Record<string, unknown> } };
    };
    const shape = facts.shape ?? facts.def?.schema?.shape ?? {};
    return [type, new Set(Object.keys(shape))];
  }),
);

function hasAction(type: unknown): type is Action1 {
  return typeof type === "string" && Object.hasOwn(ACTIONS_1, type);
}

const requestVariants = ACTION_TYPES_1.map((type) =>
  z.strictObject({
    actionId,
    type: z.literal(type),
    actor: z.custom<string>((value) => typeof value === "string" && ACTOR_PATTERN.test(value)),
    target: (ACTIONS_1[type] as Spec1Action).target,
  }),
);

const REQUEST_1 = z
  .discriminatedUnion("type", requestVariants as [never, ...never[]])
  .refine(
    (request: { type: Action1; actor: string }) =>
      actorKindOf(request.actor) === (ACTIONS_1[request.type] as Spec1Action).actor,
    { path: ["actor"] },
  ) as unknown as z.ZodType;

function actorKindOf(actor: string): ActorKind {
  return actor === "besitzer" ? "besitzer" : "bot";
}

// ---------------------------------------------------------------------------------------------
// Felder im Beleg (Kopien)

const LIMITS_BY_ID_1 = {
  "G-01": "schleuse_gefordert",
  "G-02": "anbieter_region",
  "G-03": "laenge",
  "G-04": "tagesbudget",
  "G-05": "not_aus",
} as const;
const LIMIT_ORDER_1 = Object.values(LIMITS_BY_ID_1) as LimitName[];
const LIMIT_ID_BY_NAME_1 = Object.fromEntries(
  Object.entries(LIMITS_BY_ID_1).map(([id, name]) => [name, id]),
) as Record<string, string>;

const PRECONDITIONS_1: Readonly<Record<string, FormatPrecondition>> = {
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
};
const PRECONDITION_IDS_1 = Object.keys(PRECONDITIONS_1);
const PRECONDITION_NAMES_1 = PRECONDITION_IDS_1.map(
  (id) => (PRECONDITIONS_1[id] as FormatPrecondition).name,
);
const PRECONDITION_ID_BY_NAME_1 = Object.fromEntries(
  PRECONDITION_IDS_1.map((id) => [(PRECONDITIONS_1[id] as FormatPrecondition).name, id]),
) as Record<string, string>;

const ERROR_CODES_1 = [
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
  "unterbrochen",
  "intern",
  "angehalten",
] as const satisfies readonly ErrorCode[];

const scalar = z.union([z.string().max(200), z.number().int(), z.boolean()]);
const limitResult = z.enum(["ok", "verletzt", "entfaellt"]);

const DECISION_1 = z.strictObject({
  /** Fassung im Beleg: in Fassung 1 fehlt sie meist; steht sie da, ist sie 1. */
  gateFormat: z.literal(1).optional(),
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
      name: z.enum(LIMIT_ORDER_1 as [string, ...string[]]),
      result: limitResult,
      value: scalar.optional(),
    }),
  ),
  preconditions: z
    .array(
      z.strictObject({
        name: z.enum(PRECONDITION_NAMES_1 as [string, ...string[]]),
        result: limitResult,
      }),
    )
    .optional(),
  ruleStand: positiveInt.optional(),
  reason: z.string().min(1).max(500),
});

const RESULT_1 = z.strictObject({
  status: z.enum(["ok", "error", "cancelled", "denied"]),
  code: z.enum(ERROR_CODES_1).optional(),
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
});

// ---------------------------------------------------------------------------------------------
// Auswertung (Kopie)

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
  return PRECONDITION_IDS_1.filter((id) =>
    (PRECONDITIONS_1[id] as FormatPrecondition).actions.includes(type),
  );
}

function checkPreconditions(
  action: { type: string; actor: string },
  facts: unknown,
): PreconditionCheck[] {
  const context = factContext(action, facts);
  return preconditionsOf(action.type).map((id) => {
    const precondition = PRECONDITIONS_1[id] as FormatPrecondition;
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

function check(name: LimitName, ok: boolean, value?: string | number | boolean): LimitCheck {
  const result: LimitCheck = { name, result: ok ? "ok" : "verletzt" };
  if (value !== undefined) result.value = value;
  return result;
}

function notApplicable(name: LimitName): LimitCheck {
  return { name, result: "entfaellt" };
}

function scalarOrUndefined(value: unknown): string | number | boolean | undefined {
  if (typeof value === "string") return value.slice(0, 200);
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  return undefined;
}

function hasFact(type: string, name: string): boolean {
  return FACT_NAMES_1[type]?.has(name) === true;
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

/** G-05 `not_aus`: jede Aktion, die laut Fassung 1 `killSwitch` kennt oder ihn mitbringt. */
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

const LIMITS_1: Readonly<Record<LimitName, FormatLimitFn>> = {
  schleuse_gefordert: limitSchleuseGefordert,
  anbieter_region: limitAnbieterRegion,
  laenge: limitLaenge,
  tagesbudget: limitTagesbudget,
  not_aus: limitNotAus,
};

function checkLimits(action: { type: string }, facts: unknown): LimitCheck[] {
  return LIMIT_ORDER_1.map((name) => LIMITS_1[name](action, facts));
}

function isValidInput(action: unknown, facts: unknown): boolean {
  if (!REQUEST_1.safeParse(action).success) return false;
  const type = (action as { type: Action1 }).type;
  return (ACTIONS_1[type] as Spec1Action).facts.safeParse(facts).success;
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

function limitReason(violated: readonly LimitCheck[]): string {
  const names = violated.map((entry) => {
    const id = LIMIT_ID_BY_NAME_1[entry.name] as string;
    return t("tor.grenze", { id, name: t(`regel.${id}` as never) });
  });
  return t("tor.grenze_verletzt", { grenzen: names.join(", ") }).slice(0, 500);
}

function preconditionReason(violated: readonly PreconditionCheck[]): string {
  const names = violated.map((entry) => {
    const id = PRECONDITION_ID_BY_NAME_1[entry.name] as string;
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

  if (!isValidInput(action, facts)) {
    const type = (action as { type?: unknown } | null)?.type;
    return {
      outcome: "deny",
      stage: "ask",
      matchedRules: [],
      limits: LIMIT_ORDER_1.map((name) => ({ name, result: "entfaellt" })),
      preconditions: hasAction(type)
        ? preconditionsOf(type).map((id) => ({
            name: (PRECONDITIONS_1[id] as FormatPrecondition).name as PreconditionCheck["name"],
            result: "entfaellt",
          }))
        : [],
      ...stand,
      reason: invalidInputReason(),
    };
  }

  const request = action as { type: string; actor: string };
  const preconditions = checkPreconditions(request, facts);
  const limits = checkLimits(request, facts);
  const candidates = ruleList.filter((rule) => ruleApplies(rule, request, facts));
  const winner = [...candidates].sort(compareRules)[0];
  const stage: Stage = winner ? winner.stage : "ask";
  const matchedRules = winner ? [ruleRef(winner)] : [];
  const base = { stage, matchedRules, limits, preconditions, ...stand };

  const violatedPreconditions = preconditions.filter((entry) => entry.result === "verletzt");
  if (violatedPreconditions.length > 0) {
    return { outcome: "deny", ...base, reason: preconditionReason(violatedPreconditions) };
  }
  const violated = limits.filter((entry) => entry.result === "verletzt");
  if (violated.length > 0) {
    return { outcome: "deny", ...base, reason: limitReason(violated) };
  }
  if (!winner) {
    return { outcome: "ask", ...base, stage: "ask", reason: t("fehler.regel_fehlt") };
  }
  return { outcome: outcomeOf(winner), ...base, reason: winner.reason };
}

/** Fassung 1, eingefroren. */
export const GATE_FORMAT_1: GateFormatSpec = {
  format: 1,
  actions: ACTION_TYPES_1,
  facts: Object.fromEntries(ACTION_TYPES_1.map((type) => [type, ACTIONS_1[type].facts])),
  target: Object.fromEntries(ACTION_TYPES_1.map((type) => [type, ACTIONS_1[type].target])),
  actor: Object.fromEntries(ACTION_TYPES_1.map((type) => [type, ACTIONS_1[type].actor])),
  request: REQUEST_1,
  decision: DECISION_1,
  result: RESULT_1,
  errorCodes: ERROR_CODES_1,
  preconditions: PRECONDITIONS_1,
  limits: LIMITS_1,
  limitOrder: LIMIT_ORDER_1,
  caps: [],
  hasFact,
  conditionHolds,
  ruleApplies,
  checkPreconditions,
  checkLimits,
  evaluate,
};
