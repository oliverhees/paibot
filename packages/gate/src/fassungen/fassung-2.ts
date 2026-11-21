/**
 * PaiBot – Fassung 2 der Tor-Auswertung, eingefroren: Aktionen, Fakten, Felder im Beleg,
 * Vorbedingungen, Grenzen, Deckel und Regel-Auswertung mit den Verträgen für Werkzeug-Aufrufe.
 * Diese Datei wird nie mehr geändert.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

// Alles hier ist eine Kopie, kein Verweis auf geteilte Schemas und keiner auf Fassung 1: Ändert
// sich später ein geteiltes Schema, bleibt Fassung 2 gleich. Importiert werden nur Grund-Schemas,
// die per Definition nie geändert werden (Kennungen, Prüfsummen-Formate), Typen und Texte.

import type { ActionType, ActorKind } from "@paibot/shared/aktionen";
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

function toolAction(target: z.ZodRawShape, facts: z.ZodRawShape) {
  return {
    actor: "bot" as const,
    target: z.strictObject(target),
    facts: z
      .strictObject(facts)
      .refine(
        (value) =>
          ((value as { toolSource?: unknown }).toolSource === "mcp") ===
          ((value as { toolServer?: unknown }).toolServer !== undefined),
        { path: ["toolServer"] },
      ) as z.ZodType,
  };
}

/** Aktionen der Fassung 2: alle außer `werkzeug.freigeben` und `werkzeug.ausfuehren`. */
type Action2 = Exclude<ActionType, "werkzeug.freigeben" | "werkzeug.ausfuehren">;

const ACTIONS_2 = {
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
} as const satisfies Record<Action2, unknown>;

type Spec2Action = (typeof ACTIONS_2)[keyof typeof ACTIONS_2];

const ACTION_TYPES_2 = Object.keys(ACTIONS_2) as Action2[];

/** Fakten, die die Aktion laut Fassung 2 kennt (Schlüssel des Fakten-Schemas). */
const FACT_NAMES_2: Readonly<Record<string, ReadonlySet<string>>> = Object.fromEntries(
  ACTION_TYPES_2.map((type) => {
    const facts = (ACTIONS_2[type] as Spec2Action).facts as unknown as {
      shape?: Record<string, unknown>;
      def?: { schema?: { shape?: Record<string, unknown> } };
    };
    const shape = facts.shape ?? facts.def?.schema?.shape ?? {};
    return [type, new Set(Object.keys(shape))];
  }),
);

function hasAction(type: unknown): type is Action2 {
  return typeof type === "string" && Object.hasOwn(ACTIONS_2, type);
}

const requestVariants = ACTION_TYPES_2.map((type) =>
  z.strictObject({
    actionId,
    type: z.literal(type),
    actor: z.custom<string>((value) => typeof value === "string" && ACTOR_PATTERN.test(value)),
    target: (ACTIONS_2[type] as Spec2Action).target,
  }),
);

const REQUEST_2 = z
  .discriminatedUnion("type", requestVariants as [never, ...never[]])
  .refine(
    (request: { type: Action2; actor: string }) =>
      actorKindOf(request.actor) === (ACTIONS_2[request.type] as Spec2Action).actor,
    { path: ["actor"] },
  ) as unknown as z.ZodType;

function actorKindOf(actor: string): ActorKind {
  return actor === "besitzer" ? "besitzer" : "bot";
}

// ---------------------------------------------------------------------------------------------
// Vorbedingungen, Grenzen, Deckel, Fehlercodes, Felder im Beleg (Kopien)

const TOOL_GATE_ACTIONS_2 = ["werkzeug.aufrufen"] as const;

const LIMITS_BY_ID_2 = {
  "G-01": "schleuse_gefordert",
  "G-02": "anbieter_region",
  "G-03": "laenge",
  "G-04": "tagesbudget",
  "G-05": "not_aus",
  "G-16": "lauf_schritte",
  "G-17": "lauf_aufrufe",
  "G-18": "lauf_token",
} as const;
const LIMIT_ORDER_2 = Object.values(LIMITS_BY_ID_2) as GateLimitName[];
const LIMIT_ID_BY_NAME_2 = Object.fromEntries(
  Object.entries(LIMITS_BY_ID_2).map(([id, name]) => [name, id]),
) as Record<string, string>;
/** Grenzen der Läufe; eine verletzte ergibt den Fehlercode `limit_erreicht`. */
const RUN_LIMITS_2: readonly string[] = ["lauf_schritte", "lauf_aufrufe", "lauf_token"];

const PRECONDITIONS_2: Readonly<Record<string, FormatPrecondition>> = {
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
    actions: TOOL_GATE_ACTIONS_2,
    require: [
      { fact: "toolRegistered", op: "eq", value: true },
      { fact: "toolOffered", op: "eq", value: true },
    ],
    errorCode: "werkzeug_unbekannt",
  },
  "V-13": {
    name: "eingabe_gueltig",
    actions: TOOL_GATE_ACTIONS_2,
    require: [{ fact: "inputValid", op: "eq", value: true }],
    errorCode: "werkzeug_eingabe_ungueltig",
  },
  "V-14": {
    name: "aufrufe_je_schritt",
    actions: TOOL_GATE_ACTIONS_2,
    require: [{ fact: "callIndexInStep", op: "lt", value: { fact: "maxCallsPerStep" } }],
    errorCode: "limit_erreicht",
  },
};
const PRECONDITION_IDS_2 = Object.keys(PRECONDITIONS_2);
const PRECONDITION_NAMES_2 = PRECONDITION_IDS_2.map(
  (id) => (PRECONDITIONS_2[id] as FormatPrecondition).name,
);
const PRECONDITION_ID_BY_NAME_2 = Object.fromEntries(
  PRECONDITION_IDS_2.map((id) => [(PRECONDITIONS_2[id] as FormatPrecondition).name, id]),
) as Record<string, string>;

const CAPS_2: readonly CapDefinition[] = [
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
const CAP_ORDER_2 = CAPS_2.map((cap) => cap.name);

const ERROR_CODES_2 = [
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
] as const satisfies readonly ErrorCode[];

const scalar = z.union([z.string().max(200), z.number().int(), z.boolean()]);
const checkResult = z.enum(["ok", "verletzt", "entfaellt"]);
const capCheck = z.strictObject({
  name: z.enum(CAP_ORDER_2 as [string, ...string[]]),
  result: z.enum(["entfaellt", "nicht_noetig", "gedeckelt"]),
});

const decisionFields = {
  /** Fassung im Beleg: ab Fassung 2 Pflicht. */
  gateFormat: z.literal(2),
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
      name: z.enum(LIMIT_ORDER_2 as [string, ...string[]]),
      result: checkResult,
      value: scalar.optional(),
    }),
  ),
  /** Vorbedingungen der Aktion: ab Fassung 2 Pflicht. */
  preconditions: z.array(
    z.strictObject({
      name: z.enum(PRECONDITION_NAMES_2 as [string, ...string[]]),
      result: checkResult,
    }),
  ),
  ruleStand: positiveInt.optional(),
  reason: z.string().min(1).max(500),
};

/** Felder der Entscheidung, für alle Aktionen gemeinsam: Deckel dürfen fehlen. */
const DECISION_2 = z.strictObject({ ...decisionFields, caps: z.array(capCheck).optional() });

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

const RESULT_2 = z.strictObject({
  status: z.enum(["ok", "error", "cancelled", "denied"]),
  code: z.enum(ERROR_CODES_2).optional(),
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
  return PRECONDITION_IDS_2.filter((id) =>
    (PRECONDITIONS_2[id] as FormatPrecondition).actions.includes(type),
  );
}

function capsOf(type: string): CapDefinition[] {
  return CAPS_2.filter((cap) => cap.actions.includes(type));
}

function checkPreconditions(
  action: { type: string; actor: string },
  facts: unknown,
): PreconditionCheck[] {
  const context = factContext(action, facts);
  return preconditionsOf(action.type).map((id) => {
    const precondition = PRECONDITIONS_2[id] as FormatPrecondition;
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
  return FACT_NAMES_2[type]?.has(name) === true;
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

/** G-05 `not_aus`: jede Aktion, die laut Fassung 2 `killSwitch` kennt oder ihn mitbringt. */
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
  if (!(TOOL_GATE_ACTIONS_2 as readonly string[]).includes(action.type)) {
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
 * keine Ganzzahl: verletzt.
 */
export const limitLaufToken: FormatLimitFn = (action, facts) => {
  const name = "lauf_token";
  if (action.type !== "modell.anfragen") return notApplicable(name);
  const runTokens = fact(facts, "runTokens");
  const estimate = fact(facts, "stepTokenEstimate");
  const maxRunTokens = fact(facts, "maxRunTokens");
  const both = isCount(runTokens) && isCount(estimate);
  const sum = both ? runTokens + estimate : undefined;
  return check(name, sum !== undefined && isCount(maxRunTokens) && sum <= maxRunTokens, sum);
};

const LIMITS_2: Readonly<Record<GateLimitName, FormatLimitFn>> = {
  schleuse_gefordert: limitSchleuseGefordert,
  anbieter_region: limitAnbieterRegion,
  laenge: limitLaenge,
  tagesbudget: limitTagesbudget,
  not_aus: limitNotAus,
  lauf_schritte: limitLaufSchritte,
  lauf_aufrufe: limitLaufAufrufe,
  lauf_token: limitLaufToken,
};

function checkLimits(action: { type: string }, facts: unknown): LimitCheck[] {
  return LIMIT_ORDER_2.map((name) => LIMITS_2[name](action, facts));
}

function isValidInput(action: unknown, facts: unknown): boolean {
  if (!REQUEST_2.safeParse(action).success) return false;
  const type = (action as { type: Action2 }).type;
  return (ACTIONS_2[type] as Spec2Action).facts.safeParse(facts).success;
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
    const id = LIMIT_ID_BY_NAME_2[entry.name] as string;
    return t("tor.grenze", { id, name: t(`regel.${id}` as never) });
  });
  return t("tor.grenze_verletzt", { grenzen: names.join(", ") }).slice(0, 500);
}

function preconditionReason(violated: readonly PreconditionCheck[]): string {
  const names = violated.map((entry) => {
    const id = PRECONDITION_ID_BY_NAME_2[entry.name] as string;
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
      limits: LIMIT_ORDER_2.map((name) => ({ name, result: "entfaellt" })),
      preconditions: known
        ? preconditionsOf(type).map((id) => ({
            name: (PRECONDITIONS_2[id] as FormatPrecondition).name as PreconditionCheck["name"],
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

/**
 * Fehlercode für das Ergebnis einer nicht erlaubten Entscheidung: verletzte Vorbedingung (erste
 * nach Kennung) → ihr Code; Not-Aus → `angehalten`; Grenze eines Laufs (G-16 bis G-18) →
 * `limit_erreicht`; sonst `abgelehnt` (`deny`) bzw. `regel_fehlt` (`ask`, `prepare`).
 */
function denialCode(
  decision: Pick<Decision, "outcome" | "preconditions"> & { limits?: Decision["limits"] },
): ErrorCode {
  const violatedIds = (decision.preconditions ?? [])
    .filter((entry) => entry.result === "verletzt")
    .map((entry) => PRECONDITION_ID_BY_NAME_2[entry.name])
    .filter((id): id is string => id !== undefined)
    .sort();
  const first = violatedIds[0];
  if (first !== undefined) return (PRECONDITIONS_2[first] as FormatPrecondition).errorCode;
  const limits = decision.limits ?? [];
  const violated = (name: string) =>
    limits.some((entry) => entry.name === name && entry.result === "verletzt");
  if (violated("not_aus")) return "angehalten";
  if (RUN_LIMITS_2.some(violated)) return "limit_erreicht";
  if (decision.outcome === "deny" || decision.outcome === "allow") return "abgelehnt";
  return "regel_fehlt";
}

/** Fassung 2, eingefroren. */
export const GATE_FORMAT_2: GateFormatSpec = {
  format: 2,
  actions: ACTION_TYPES_2,
  facts: Object.fromEntries(ACTION_TYPES_2.map((type) => [type, ACTIONS_2[type].facts])),
  target: Object.fromEntries(ACTION_TYPES_2.map((type) => [type, ACTIONS_2[type].target])),
  actor: Object.fromEntries(ACTION_TYPES_2.map((type) => [type, ACTIONS_2[type].actor])),
  request: REQUEST_2,
  decision: DECISION_2,
  decisionFor,
  result: RESULT_2,
  errorCodes: ERROR_CODES_2,
  preconditions: PRECONDITIONS_2,
  limits: LIMITS_2,
  limitOrder: LIMIT_ORDER_2,
  caps: CAPS_2,
  capOrder: CAP_ORDER_2,
  denialCode,
  hasFact,
  conditionHolds,
  ruleApplies,
  checkPreconditions,
  checkLimits,
  evaluate,
};
