/**
 * PaiBot – Typen des Tors: Regeln, Stufen, Grenzen, Entscheidung und die Berechtigung, die das
 * Tor bei Erlaubnis ausstellt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { z } from "zod";
import {
  type ActionTarget,
  type ActionType,
  type Actor,
  actionTypeSchema,
  CREDENTIALS,
  type Credential,
  type Facts,
  TOOL_GATE_ACTIONS,
} from "./actions";
import type { ErrorCode } from "./errors";
import {
  type IsoTime,
  isoTimeSchema,
  positiveIntSchema,
  type Sha256Digest,
  sha256DigestSchema,
} from "./grundtypen";
import { type ActionId, idSchema, type ReceiptId } from "./id";

/**
 * Fassung des Tor-Formats, mit der das Tor jetzt entscheidet und der Schreiber belegt. Jede
 * Änderung am Tor, die für gleiche Fakten ein anderes Ergebnis von `evaluate` geben kann, hebt
 * diese Zahl; eine Fassung selbst wird nie geändert.
 */
export const GATE_FORMAT = 2;

/** Stufen einer Aktion: nachfragen, vorbereiten, ausführen (mit Beleg). */
export const STAGES = ["ask", "prepare", "execute"] as const;
export const stageSchema = z.enum(STAGES);
export type Stage = z.infer<typeof stageSchema>;

/** Wirkung einer Regel. */
export const RULE_EFFECTS = ["allow", "deny", "ask"] as const;
export const ruleEffectSchema = z.enum(RULE_EFFECTS);
export type RuleEffect = z.infer<typeof ruleEffectSchema>;

/** Herkunft einer Regel: fest eingebaut, vom Besitzer angelegt oder vom Bot vorgeschlagen. */
export const RULE_SOURCES = ["standard", "owner", "proposal"] as const;
export const ruleSourceSchema = z.enum(RULE_SOURCES);
export type RuleSource = z.infer<typeof ruleSourceSchema>;

/**
 * Prioritäten in festen Bändern je Quelle (kleinere Zahl entscheidet zuerst):
 * - Standard-Regeln: 0 bis `STANDARD_PRIORITY_MAX`, dazu die Auffang-Regel mit `FALLBACK_PRIORITY`;
 * - eigene Regeln und Vorschläge: `OWN_RULE_PRIORITY.min` bis `OWN_RULE_PRIORITY.max`.
 * So kommt eine eigene Regel immer nach allen Standard-Regeln außer der Auffang-Regel und kann
 * keine davon überdecken. Die Datenbank prüft dasselbe (CHECK), das Tor ebenso.
 */
export const STANDARD_PRIORITY_MAX = 999;
export const FALLBACK_PRIORITY = 1_000_000;
export const OWN_RULE_PRIORITY = { min: 1000, max: 999_999 } as const;

/** Liegt die Priorität im Band dieser Quelle? */
export function priorityFitsSource(source: RuleSource, priority: number): boolean {
  if (source === "standard") {
    return (priority >= 0 && priority <= STANDARD_PRIORITY_MAX) || priority === FALLBACK_PRIORITY;
  }
  return priority >= OWN_RULE_PRIORITY.min && priority <= OWN_RULE_PRIORITY.max;
}

/** Kennung einer Standard-Regel (`R-001`); eigene Regeln und Vorschläge haben `reg_…`. */
export const STANDARD_RULE_ID_PATTERN = /^R-\d{3}$/;

/** Ergebnis des Tors. In der Basis wird `ask` wie `deny` behandelt. */
export const OUTCOMES = ["allow", "deny", "ask", "prepare"] as const;
export const outcomeSchema = z.enum(OUTCOMES);
export type Outcome = z.infer<typeof outcomeSchema>;

/** Lesbare IDs der Standard-Regeln. */
export const STANDARD_RULE_IDS = [
  "R-001",
  "R-002",
  "R-003",
  "R-004",
  "R-005",
  "R-006",
  "R-999",
] as const;
export type StandardRuleId = (typeof STANDARD_RULE_IDS)[number];

/** ID einer Regel: lesbar (`R-001`) oder erzeugt (`reg_…`). */
export const ruleIdSchema = z.union([z.string().regex(/^R-\d{3}$/), idSchema("rule")]);
export type RuleId = z.infer<typeof ruleIdSchema>;

/** Grenzen, die das Tor zusätzlich zu den Regeln prüft, mit ihrer lesbaren ID. */
export const LIMITS_BY_ID = {
  "G-01": "schleuse_gefordert",
  "G-02": "anbieter_region",
  "G-03": "laenge",
  "G-04": "tagesbudget",
  "G-05": "not_aus",
  /** `modell.anfragen`: `step < maxSteps`. */
  "G-16": "lauf_schritte",
  /** Aktionen in `TOOL_GATE_ACTIONS`: `callsInRun < maxCallsPerRun`. */
  "G-17": "lauf_aufrufe",
  /** `modell.anfragen`: `runTokens + stepTokenEstimate <= maxRunTokens`. */
  "G-18": "lauf_token",
} as const;
export type LimitId = keyof typeof LIMITS_BY_ID;
/** Name einer Grenze (alle Grenzen, die dieser Stand kennt). */
export type GateLimitName = (typeof LIMITS_BY_ID)[LimitId];
/**
 * Namen der Grenzen G-01 bis G-05. Die eingefrorene Fassung 1 des Tors nennt diesen Typ und wird
 * nie geändert; er bleibt deshalb auf diese fünf Grenzen beschränkt. Für alle Grenzen gilt
 * `GateLimitName`.
 */
export type LimitName = (typeof LIMITS_BY_ID)["G-01" | "G-02" | "G-03" | "G-04" | "G-05"];
export const LIMIT_IDS = Object.keys(LIMITS_BY_ID) as [LimitId, ...LimitId[]];
export const LIMIT_NAMES = Object.values(LIMITS_BY_ID) as [GateLimitName, ...GateLimitName[]];
export const limitNameSchema = z.enum(LIMIT_NAMES);

/** Ergebnis einer Grenze: eingehalten, verletzt oder für diese Aktion nicht zutreffend. */
export const LIMIT_RESULTS = ["ok", "verletzt", "entfaellt"] as const;
export const limitResultSchema = z.enum(LIMIT_RESULTS);
export type LimitResult = z.infer<typeof limitResultSchema>;

/** Einzelner Wert in Fakten und Bedingungen: Text, Ganzzahl oder Schalter. */
export const scalarSchema = z.union([z.string().max(200), z.number().int(), z.boolean()]);
export type Scalar = z.infer<typeof scalarSchema>;

export const limitCheckSchema = z.strictObject({
  name: limitNameSchema,
  result: limitResultSchema,
  value: scalarSchema.optional(),
});
export type LimitCheck = z.infer<typeof limitCheckSchema>;

/**
 * Verweis auf eine angewandte Regel: Kennung, Fassung und Prüfsumme ihres Inhalts
 * (`RULE_HASH_PREFIX`, `ruleContent`). Mit der Prüfsumme lässt sich eine Entscheidung später mit
 * genau dem damaligen Regelstand nachrechnen, und eine nachträglich geänderte Regel fällt auf.
 * Das Tor entscheidet nur mit einem Regelstand (`RuleSnapshot`) und setzt `hash` deshalb immer.
 */
export const ruleRefSchema = z.strictObject({
  id: ruleIdSchema,
  version: positiveIntSchema,
  hash: sha256DigestSchema,
});
export type RuleRef = z.infer<typeof ruleRefSchema>;

/**
 * Verweis auf eine Regel, wie er in gespeicherten Belegen stehen kann: Belege aus der Zeit vor den
 * Prüfsummen tragen nur Kennung und Fassung. Neue Belege tragen immer `hash` (`ruleRefSchema`).
 */
export const storedRuleRefSchema = z.strictObject({
  id: ruleIdSchema,
  version: positiveIntSchema,
  hash: sha256DigestSchema.optional(),
});
export type StoredRuleRef = z.infer<typeof storedRuleRefSchema>;

/**
 * Name des Fakts, unter dem das Tor die Art des Akteurs (`besitzer` oder `bot`) für Bedingungen
 * bereitstellt. Alle anderen Namen sind Felder der Fakten der Aktion.
 */
export const ACTOR_FACT = "akteur";

/** Vergleich in einer Bedingung. `in` erwartet eine Liste, die anderen einen einzelnen Wert. */
export const CONDITION_OPS = ["eq", "ne", "lt", "lte", "gt", "gte", "in"] as const;
export const conditionOpSchema = z.enum(CONDITION_OPS);
export type ConditionOp = z.infer<typeof conditionOpSchema>;

const factNameSchema = z.string().regex(/^[a-z][A-Za-z0-9]*$/);

/** Bedingung einer Regel: ein Fakt wird mit einem Wert oder einem anderen Fakt verglichen. */
export const ruleConditionSchema = z
  .strictObject({
    fact: factNameSchema,
    op: conditionOpSchema,
    value: z.union([
      scalarSchema,
      z.array(z.union([z.string().max(200), z.number().int()])).min(1),
      z.strictObject({ fact: factNameSchema }),
    ]),
  })
  .refine((condition) => (condition.op === "in") === Array.isArray(condition.value), {
    path: ["value"],
  });
export type RuleCondition = z.infer<typeof ruleConditionSchema>;

/** Inhalt einer Regel. Eine Regel greift, wenn die Aktion passt und alle Bedingungen gelten. */
export const ruleDefinitionSchema = z.strictObject({
  id: ruleIdSchema,
  version: positiveIntSchema,
  /** Aktion oder `*` für alle Aktionen. */
  action: z.union([actionTypeSchema, z.literal("*")]),
  effect: ruleEffectSchema,
  stage: stageSchema,
  conditions: z.array(ruleConditionSchema).max(20),
  /** Kleinere Zahl wird zuerst geprüft; die erste passende Regel entscheidet. */
  priority: z.number().int().min(0).max(1000000),
  source: ruleSourceSchema,
  enabled: z.boolean(),
  title: z.string().min(1).max(200),
  reason: z.string().min(1).max(500),
});
export type RuleDefinition = z.infer<typeof ruleDefinitionSchema>;

/**
 * Gespeicherte Fassung einer Regel. Jede Änderung ist eine neue Fassung. `seq` ist die Nummer der
 * Zeile im Regel-Protokoll (siehe `ruleStandSchema`).
 */
export const ruleSchema = ruleDefinitionSchema.extend({
  createdAt: isoTimeSchema,
  seq: positiveIntSchema.optional(),
});
export type Rule = z.infer<typeof ruleSchema>;

const R001_V1 = {
  id: "R-001",
  version: 1,
  action: "*",
  effect: "allow",
  stage: "execute",
  conditions: [
    { fact: ACTOR_FACT, op: "eq", value: "besitzer" },
    { fact: "credential", op: "in", value: [...CREDENTIALS] },
  ],
  priority: 100,
  source: "standard",
  enabled: true,
  title: "Besitzer verwaltet seine Installation",
  reason: "Der Besitzer hat sich ausgewiesen und verwaltet seine eigene Installation.",
} as const satisfies RuleDefinition;

const R002_V1 = {
  id: "R-002",
  version: 1,
  action: "modell.anfragen",
  effect: "allow",
  stage: "execute",
  conditions: [
    { fact: ACTOR_FACT, op: "eq", value: "bot" },
    { fact: "botOfConversation", op: "eq", value: true },
  ],
  priority: 100,
  source: "standard",
  enabled: true,
  title: "Bot darf antworten",
  reason: "Der Bot der Unterhaltung darf ein Modell anfragen, wenn alle Grenzen eingehalten sind.",
} as const satisfies RuleDefinition;

/**
 * Standard-Regel R-010: Der Bot der Unterhaltung darf in der mitgelieferten Doku nachschlagen. Sie
 * steht im Code fest, aber noch nicht in der Datenbank; eine spätere Migration legt sie an.
 */
const R010_V1 = {
  id: "R-010",
  version: 1,
  action: "werkzeug.aufrufen",
  effect: "allow",
  stage: "execute",
  conditions: [
    { fact: ACTOR_FACT, op: "eq", value: "bot" },
    { fact: "botOfConversation", op: "eq", value: true },
    { fact: "toolKey", op: "eq", value: "eingebaut/doku.nachschlagen" },
    { fact: "toolSource", op: "eq", value: "eingebaut" },
    { fact: "toolKind", op: "eq", value: "lesen" },
    { fact: "toolReach", op: "eq", value: "intern" },
  ],
  priority: 90,
  source: "standard",
  enabled: true,
  title: "Bot liest in der Doku seiner Version",
  reason: "In der mitgelieferten Doku nachschlagen ändert nichts und geht nicht nach außen.",
} as const satisfies RuleDefinition;

const R999_V1 = {
  id: "R-999",
  version: 1,
  action: "*",
  effect: "ask",
  stage: "ask",
  conditions: [],
  priority: 1000000,
  source: "standard",
  enabled: true,
  title: "Ohne passende Regel",
  reason: "Dafür gibt es noch keine Regel.",
} as const satisfies RuleDefinition;

const R003_V1 = {
  id: "R-003",
  version: 1,
  action: "einrichtung.abschliessen",
  effect: "allow",
  stage: "execute",
  conditions: [
    { fact: ACTOR_FACT, op: "eq", value: "besitzer" },
    { fact: "credential", op: "eq", value: "einrichtungs_code" },
  ],
  priority: 50,
  source: "standard",
  enabled: true,
  title: "Einrichtung mit Einrichtungs-Code",
  reason: "Der Einrichtungs-Code gilt nur, um die Einrichtung abzuschließen.",
} as const satisfies RuleDefinition;

const R004_V1 = {
  id: "R-004",
  version: 1,
  action: "zugang.anmelden",
  effect: "allow",
  stage: "execute",
  conditions: [
    { fact: ACTOR_FACT, op: "eq", value: "besitzer" },
    { fact: "credential", op: "eq", value: "passwort" },
  ],
  priority: 50,
  source: "standard",
  enabled: true,
  title: "Anmelden mit Passwort",
  reason: "Das Passwort gilt nur, um sich anzumelden.",
} as const satisfies RuleDefinition;

const R005_V1 = {
  id: "R-005",
  version: 1,
  action: "werkzeug.aufrufen",
  effect: "ask",
  stage: "ask",
  conditions: [
    { fact: ACTOR_FACT, op: "eq", value: "bot" },
    { fact: "botOfConversation", op: "eq", value: true },
  ],
  priority: 100,
  source: "standard",
  enabled: true,
  title: "Bot fragt vor Werkzeugen",
  reason: "Bevor der Bot ein Werkzeug benutzt, fragt PaiBot dich.",
} as const satisfies RuleDefinition;

const R006_V1 = {
  id: "R-006",
  version: 1,
  action: "*",
  effect: "deny",
  stage: "execute",
  conditions: [
    { fact: ACTOR_FACT, op: "eq", value: "besitzer" },
    { fact: "credential", op: "ne", value: "sitzung" },
  ],
  priority: 60,
  source: "standard",
  enabled: true,
  title: "Nachweis passt nicht zur Aktion",
  reason: "Für diese Aktion gilt nur eine Anmeldung mit Sitzung.",
} as const satisfies RuleDefinition;

/**
 * Alle Fassungen der Standard-Regeln, in der Reihenfolge, in der sie dazugekommen sind. Die Liste
 * wird nur verlängert: Eine Änderung ist eine neue Fassung, eine alte Fassung bleibt unverändert,
 * damit alte Belege nachrechenbar bleiben. Die Migrationen legen genau diese Zeilen an.
 */
export const STANDARD_RULE_VERSIONS = [
  R001_V1,
  R002_V1,
  R999_V1,
  R003_V1,
  R004_V1,
  R005_V1,
  R006_V1,
] as const satisfies readonly RuleDefinition[];

const R007_V1 = {
  id: "R-007",
  version: 1,
  action: "werkzeug.ausfuehren",
  effect: "allow",
  stage: "execute",
  conditions: [
    { fact: ACTOR_FACT, op: "eq", value: "bot" },
    { fact: "botOfConversation", op: "eq", value: true },
    { fact: "approvalGranted", op: "eq", value: true },
    { fact: "approvalConsumed", op: "eq", value: false },
    { fact: "approvalExpired", op: "eq", value: false },
    { fact: "argsDigest", op: "eq", value: { fact: "approvalArgsDigest" } },
  ],
  priority: 100,
  source: "standard",
  enabled: true,
  title: "Einmal erlaubt",
  reason: "Du hast diesen Werkzeug-Aufruf freigegeben; er darf genau einmal laufen.",
} as const satisfies RuleDefinition;

const R008_V1 = {
  id: "R-008",
  version: 1,
  action: "werkzeug.ausfuehren",
  effect: "deny",
  stage: "execute",
  conditions: [],
  priority: 200,
  source: "standard",
  enabled: true,
  title: "Ausführen nur mit Freigabe",
  reason: "Für diesen Werkzeug-Aufruf gibt es keine gültige, unbenutzte Freigabe.",
} as const satisfies RuleDefinition;

/**
 * Fassungen der Standard-Regeln, die im Code feststehen, aber noch nicht in der Datenbank stehen
 * (R-007 und R-008 gehören zu Aktionen aus `UNSTORED_ACTION_TYPES`, R-010 wirkt erst mit dem
 * ersten Werkzeug). Das Tor erkennt sie als Standard-Regeln wie die aus `STANDARD_RULE_VERSIONS`;
 * eine spätere Migration legt genau diese Zeilen an, danach wandern sie dorthin.
 */
export const UNSTORED_STANDARD_RULE_VERSIONS = [
  R007_V1,
  R008_V1,
  R010_V1,
] as const satisfies readonly RuleDefinition[];

/** Je Standard-Regel die neueste Fassung, in der Reihenfolge von `STANDARD_RULE_IDS`. */
export const ACTIVE_STANDARD_RULES = [
  R001_V1,
  R002_V1,
  R003_V1,
  R004_V1,
  R005_V1,
  R006_V1,
  R999_V1,
] as const satisfies readonly RuleDefinition[];

/**
 * Die ersten Standard-Regeln (R-001, R-002, R-999 je Fassung 1).
 *
 * @deprecated Ohne die Bindung des Nachweises an die Aktion. Aktuell sind
 * `ACTIVE_STANDARD_RULES`; alle Fassungen stehen in `STANDARD_RULE_VERSIONS`.
 */
export const STANDARD_RULES = [
  R001_V1,
  R002_V1,
  R999_V1,
] as const satisfies readonly RuleDefinition[];

/**
 * Welcher Nachweis für welche Aktionen gilt (`*` = alle übrigen Aktionen des Besitzers). Die
 * Standard-Regeln setzen das so um: R-003 (Einrichtungs-Code) und R-004 (Passwort) erlauben ihre
 * eine Aktion mit Vorrang 50; R-006 lehnt jeden anderen Nachweis als die Sitzung mit Vorrang 60
 * ab; danach erlaubt R-001 (Vorrang 100) alles mit Sitzung.
 */
export const CREDENTIAL_SCOPE = {
  sitzung: "*",
  einrichtungs_code: ["einrichtung.abschliessen"],
  passwort: ["zugang.anmelden"],
} as const satisfies Record<Credential, "*" | readonly ActionType[]>;

/** Nur die Felder einer Regel, die ihren Inhalt ausmachen (ohne Zeit, Nummer und Prüfsumme). */
export function ruleContent(rule: RuleDefinition): RuleDefinition {
  return {
    id: rule.id,
    version: rule.version,
    action: rule.action,
    effect: rule.effect,
    stage: rule.stage,
    conditions: rule.conditions,
    priority: rule.priority,
    source: rule.source,
    enabled: rule.enabled,
    title: rule.title,
    reason: rule.reason,
  };
}

/**
 * Stand des Regel-Protokolls: die höchste laufende Nummer (`rules.seq`) aller Regel-Zeilen, die das
 * Tor beim Entscheiden sah. Mit ihm liefert die Datenbank genau den damaligen Regelstand
 * (`rules.listActiveAsOf`).
 */
export const ruleStandSchema = positiveIntSchema;

/** Regel, wie das Tor sie bekommt: Inhalt, Prüfsumme des Inhalts und Nummer im Regel-Protokoll. */
export type GateRule = RuleDefinition & { readonly hash: Sha256Digest; readonly seq: number };

/** Gültige Regeln zu einem Stand. */
export interface RuleSnapshot {
  stand: number;
  rules: readonly GateRule[];
}

/**
 * Vorbedingungen: feste Prüfungen des Zustands, bevor Grenzen und Regeln zählen. Jede hat eine
 * lesbare ID (`V-01` …), einen Namen, die Aktionen, für die sie gilt, und Bedingungen über die
 * Fakten der Aktion:
 * - `when`: nur wenn alle gelten, wird die Vorbedingung geprüft (sonst `entfaellt`);
 * - `require`: alle müssen gelten, sonst ist sie `verletzt`. Fehlt ein Fakt, gilt die Bedingung
 *   nicht, die Vorbedingung ist also verletzt.
 * `errorCode` ist der Fehler, mit dem die Route die Ablehnung meldet.
 *
 * Reihenfolge im Tor: 1. Eingabe prüfen, 2. Vorbedingungen, 3. Grenzen, 4. Regeln. Alle
 * Vorbedingungen der Aktion stehen in `Decision.preconditions` (nur die der Aktion, nach ID); ist
 * eine verletzt, lautet das Ergebnis `deny`, `reason` nennt sie (`tor.vorbedingung_verletzt`),
 * und das geht einer verletzten Grenze vor.
 */
export const PRECONDITIONS = {
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
    actions: TOOL_GATE_ACTIONS,
    require: [
      { fact: "toolRegistered", op: "eq", value: true },
      { fact: "toolOffered", op: "eq", value: true },
    ],
    errorCode: "werkzeug_unbekannt",
  },
  "V-13": {
    name: "eingabe_gueltig",
    actions: TOOL_GATE_ACTIONS,
    require: [{ fact: "inputValid", op: "eq", value: true }],
    errorCode: "werkzeug_eingabe_ungueltig",
  },
  "V-14": {
    name: "aufrufe_je_schritt",
    actions: TOOL_GATE_ACTIONS,
    require: [{ fact: "callIndexInStep", op: "lt", value: { fact: "maxCallsPerStep" } }],
    errorCode: "limit_erreicht",
  },
} as const satisfies Record<
  string,
  {
    name: string;
    actions: readonly ActionType[];
    when?: readonly RuleCondition[];
    require: readonly RuleCondition[];
    errorCode: ErrorCode;
  }
>;
export type PreconditionId = keyof typeof PRECONDITIONS;
export type PreconditionName = (typeof PRECONDITIONS)[PreconditionId]["name"];
export const PRECONDITION_IDS = Object.keys(PRECONDITIONS) as [PreconditionId, ...PreconditionId[]];
export const PRECONDITION_NAMES = PRECONDITION_IDS.map((id) => PRECONDITIONS[id].name) as [
  PreconditionName,
  ...PreconditionName[],
];
export const preconditionNameSchema = z.enum(PRECONDITION_NAMES);

/** IDs der Vorbedingungen einer Aktion, nach ID geordnet. */
export function preconditionsFor(action: ActionType): PreconditionId[] {
  return PRECONDITION_IDS.filter((id) =>
    (PRECONDITIONS[id].actions as readonly string[]).includes(action),
  );
}

/** Ergebnis einer Vorbedingung, gleiche Werte wie bei Grenzen. */
export const preconditionCheckSchema = z.strictObject({
  name: preconditionNameSchema,
  result: limitResultSchema,
});
export type PreconditionCheck = z.infer<typeof preconditionCheckSchema>;

/**
 * Deckel: greifen nach den Regeln und machen aus einem `allow` ein `ask`, wenn `when` gilt und
 * mindestens eine Bedingung aus `anyOf`. Keine Regel und keine Einstellung hebt einen Deckel auf;
 * `deny`, `ask` und `prepare` bleiben, wie sie sind.
 */
export const CAPS = {
  "D-01": {
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
} as const satisfies Record<
  string,
  {
    name: string;
    actions: readonly ActionType[];
    then: "ask";
    when: readonly RuleCondition[];
    anyOf: readonly RuleCondition[];
  }
>;
export type CapId = keyof typeof CAPS;
export const CAP_IDS = Object.keys(CAPS) as [CapId, ...CapId[]];
export const CAP_NAMES = ["fremd_dann_fragen"] as const;
export type CapName = (typeof CAP_NAMES)[number];
/** Ergebnis eines Deckels: nicht zutreffend, zutreffend ohne Wirkung (nicht `allow`), gedeckelt. */
export const CAP_RESULTS = ["entfaellt", "nicht_noetig", "gedeckelt"] as const;
export type CapResult = (typeof CAP_RESULTS)[number];
export const capCheckSchema = z.strictObject({
  name: z.enum(CAP_NAMES),
  result: z.enum(CAP_RESULTS),
});
export type CapCheck = z.infer<typeof capCheckSchema>;

/** IDs der Deckel einer Aktion, nach ID geordnet. */
export function capsFor(action: ActionType): CapId[] {
  return CAP_IDS.filter((id) => (CAPS[id].actions as readonly string[]).includes(action));
}

/** Entscheidung des Tors für eine Aktion. */
export const decisionSchema = z.strictObject({
  outcome: outcomeSchema,
  stage: stageSchema,
  matchedRules: z.array(ruleRefSchema),
  limits: z.array(limitCheckSchema),
  /** Vorbedingungen der Aktion (`preconditionsFor`), leer bei Aktionen ohne. */
  preconditions: z.array(preconditionCheckSchema),
  /**
   * Deckel der Aktion (`capsFor`). Ab Fassung 2 bei jeder Aktion mit Deckel gesetzt, sonst nie;
   * optional, weil Fassung 1 keine Deckel kennt.
   */
  caps: z.array(capCheckSchema).optional(),
  /** Stand des Regel-Protokolls beim Entscheiden. Das Tor entscheidet immer mit einem Regelstand. */
  ruleStand: ruleStandSchema,
  /** Deutscher Satz, warum das Tor so entschieden hat. */
  reason: z.string().min(1).max(500),
});
export type Decision = z.infer<typeof decisionSchema>;

/**
 * Entscheidung aus einer einfachen Liste von Regeln ohne Regelstand (`evaluate` mit Liste, z. B.
 * beim Nachrechnen älterer Belege): `ruleStand` fehlt, `hash` steht nur bei Regeln, die ihn
 * mitbringen. Das Tor selbst entscheidet nie so.
 */
export const listDecisionSchema = decisionSchema.extend({
  matchedRules: z.array(storedRuleRefSchema),
  ruleStand: ruleStandSchema.optional(),
});
export type ListDecision = z.infer<typeof listDecisionSchema>;

declare const permitBrand: unique symbol;

/**
 * Berechtigung für eine erlaubte Aktion. Nur das Tor stellt sie aus, nachdem der Beleg
 * „Entscheidung“ geschrieben ist; die Anbieter-Schicht gibt ein Modell nur gegen sie heraus.
 */
export type GatePermit<T extends ActionType = ActionType> = T extends ActionType
  ? {
      readonly actionId: ActionId;
      readonly action: T;
      readonly actor: Actor;
      readonly target: ActionTarget<T>;
      readonly facts: Facts<T>;
      readonly decisionReceiptId: ReceiptId;
      readonly issuedAt: IsoTime;
      readonly [permitBrand]: true;
    }
  : never;
