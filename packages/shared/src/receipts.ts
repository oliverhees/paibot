/**
 * PaiBot – Format der Belege: Körper eines Eintrags, gespeicherter Eintrag und Kopfzeile des
 * Exports. Bauen, Signieren und Prüfen geschieht im Beleg-Paket.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { z } from "zod";
import { ACTIONS, type ActionRequest, actionRequestSchema } from "./actions";
import { errorCodeSchema } from "./errors";
import {
  capCheckSchema,
  GATE_FORMAT,
  limitCheckSchema,
  outcomeSchema,
  preconditionCheckSchema,
  ruleStandSchema,
  scalarSchema,
  stageSchema,
  storedRuleRefSchema,
} from "./gate";
import {
  countSchema,
  fingerprintSchema,
  hmacDigestSchema,
  isoTimeSchema,
  positiveIntSchema,
  publicKeySchema,
  servedBySchema,
  sha256DigestSchema,
  signatureSchema,
  tokenUsageSchema,
} from "./grundtypen";
import { idSchema } from "./id";
import type { JsonValue } from "./motor";

/** Formatversion des Beleg-Körpers. */
export const RECEIPT_VERSION = 1;

/** `prev` des ersten Eintrags einer Kette. */
export const ZERO_PREV = `sha256:${"0".repeat(64)}`;

export const RECEIPT_TYPES = ["start", "decision", "result", "key_change"] as const;
export const receiptTypeSchema = z.enum(RECEIPT_TYPES);
export type ReceiptType = z.infer<typeof receiptTypeSchema>;

export const RESULT_STATUSES = ["ok", "error", "cancelled", "denied"] as const;
export const resultStatusSchema = z.enum(RESULT_STATUSES);
export type ResultStatus = z.infer<typeof resultStatusSchema>;

/** Stand der Software, z. B. `0.3.0+20261205.3f9c2ab` oder `0.3.0+dev`. */
export const softwareStandSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/)
  .max(100);

const common = {
  v: z.literal(RECEIPT_VERSION),
  id: idSchema("receipt"),
  seq: positiveIntSchema,
  time: isoTimeSchema,
  prev: sha256DigestSchema,
  keyId: idSchema("key"),
};

/** Wertebereich der Fakten in einem Beleg: Texte, Ganzzahlen, Schalter und Listen davon. */
const factsRecordSchema = z.record(
  z.string().regex(/^[a-z][A-Za-z0-9]*$/),
  z.union([scalarSchema, z.array(z.union([z.string().max(200), z.number().int()]))]),
);

/**
 * Schreib-Form der Entscheidung, nur für die aktuelle Fassung des Tors (`GATE_FORMAT`). Ältere
 * Belege (ohne Fassung, ohne Vorbedingungen) liest `receiptBodyReadSchema`.
 */
export const receiptDecisionSchema = z.strictObject({
  /** Fassung des Tors, mit der entschieden wurde; ab Fassung 2 Pflicht. */
  gateFormat: z.literal(GATE_FORMAT),
  outcome: outcomeSchema,
  stage: stageSchema,
  /** Angewandte Regeln mit Fassung und Prüfsumme des Inhalts. */
  rules: z.array(storedRuleRefSchema),
  limits: z.array(limitCheckSchema),
  /** Vorbedingungen der Aktion; ab Fassung 2 Pflicht. */
  preconditions: z.array(preconditionCheckSchema),
  /** Deckel der Aktion; Pflicht genau bei Aktionen mit Deckel (prüft die Fassung je Aktion). */
  caps: z.array(capCheckSchema).optional(),
  /** Stand des Regel-Protokolls, mit dem nachgerechnet wird (`rules.listActiveAsOf`). */
  ruleStand: ruleStandSchema.optional(),
  reason: z.string().min(1).max(500),
});
export type ReceiptDecision = z.infer<typeof receiptDecisionSchema>;

export const receiptResultSchema = z.strictObject({
  status: resultStatusSchema,
  code: errorCodeSchema.optional(),
  /** Prüfsumme der Antwort bzw. des Ergebnisses. */
  digest: hmacDigestSchema.optional(),
  tokens: tokenUsageSchema.optional(),
  /** Wer laut Antwort der Schnittstelle geantwortet hat (nur `modell.anfragen`, wenn gemeldet). */
  servedBy: servedBySchema.optional(),
  /** Modell laut Antwort der Schnittstelle, als Text. */
  modelReported: z.string().max(200).optional(),
  /** Stand der Doku, in der nachgeschlagen wurde (nur beim Nachschlagen in der Doku). */
  docStand: z.string().max(80).optional(),
  /** Zahl der Fundstellen (nur beim Nachschlagen in der Doku). */
  found: countSchema.optional(),
});
export type ReceiptResult = z.infer<typeof receiptResultSchema>;

export const receiptUndoSchema = z.strictObject({
  possible: z.boolean(),
  hint: z.string().min(1).max(300).optional(),
});
export type ReceiptUndo = z.infer<typeof receiptUndoSchema>;

export const receiptContextSchema = z.strictObject({ digest: hmacDigestSchema });

/**
 * Fassung der Regeln, nach denen eine Kette geschrieben wird; steht im Start-Beleg. Ab Fassung 2
 * trägt jede Entscheidung ihren Regelstand und jede angewandte Regel ihre Prüfsumme; der Prüfer
 * verlangt das dann. Ketten ohne Angabe (ältere Installationen) bleiben prüfbar wie bisher.
 */
export const RECEIPT_CHAIN_FORMAT = 2;

const startBody = z.strictObject({
  ...common,
  type: z.literal("start"),
  facts: z.strictObject({
    installationId: idSchema("installation"),
    publicKey: publicKeySchema,
    software: softwareStandSchema,
    format: z.number().int().min(2).max(1000).optional(),
  }),
});

/** Welcher Schlüssel einen Beleg `key_change` signiert: der bisherige oder der neue. */
export const KEY_CHANGE_SIGNERS = ["previous", "new"] as const;
export const keyChangeSignerSchema = z.enum(KEY_CHANGE_SIGNERS);
export type KeyChangeSigner = z.infer<typeof keyChangeSignerSchema>;

/**
 * Fakten eines Schlüsselwechsels. `newKeyId` und `publicKey` beschreiben den neuen Schlüssel,
 * `previousKeyId` den bisherigen. `signedBy` sagt, wer signiert hat: `previous` (Regelfall, dann
 * ist `keyId` des Belegs gleich `previousKeyId`) oder `new` (der bisherige private Schlüssel war
 * nicht mehr vorhanden, dann ist `keyId` gleich `newKeyId`).
 *
 * Nur ein Wechsel mit `previous` beglaubigt den neuen Schlüssel. Einen Wechsel mit `new` meldet
 * der Prüfer als `schluesselwechsel_nicht_beglaubigt`; ab dort ist die Vertrauenskette gebrochen
 * (`vertrauen_gebrochen`), nie `vertrauenswuerdig`.
 */
export const keyChangeFactsSchema = z.strictObject({
  newKeyId: idSchema("key"),
  publicKey: publicKeySchema,
  previousKeyId: idSchema("key").optional(),
  signedBy: keyChangeSignerSchema,
});
export type KeyChangeFacts = z.infer<typeof keyChangeFactsSchema>;

const keyChangeBody = z.strictObject({
  ...common,
  type: z.literal("key_change"),
  facts: keyChangeFactsSchema,
});

const decisionBody = z.strictObject({
  ...common,
  type: z.literal("decision"),
  action: actionRequestSchema,
  decision: receiptDecisionSchema,
  facts: factsRecordSchema,
  context: receiptContextSchema.optional(),
  undo: receiptUndoSchema.optional(),
});

const resultBody = z.strictObject({
  ...common,
  type: z.literal("result"),
  action: actionRequestSchema,
  result: receiptResultSchema,
  undo: receiptUndoSchema.optional(),
});

/**
 * Schreib-Form eines Beleg-Körpers: streng, nur für die aktuelle Fassung des Tors (`GATE_FORMAT`).
 * Das einzige Schema, mit dem `buildReceipt` prüft. Er wird kanonisch serialisiert, gehasht und
 * signiert. Optionale Felder fehlen, statt `null` zu sein. Die Fakten eines Belegs „Entscheidung“
 * passen zur Aktion; bei einem Schlüsselwechsel passt `keyId` zu `facts.signedBy`. Ab Fassung 2
 * steht die Fassung immer im Beleg (`decision.gateFormat` gleich `GATE_FORMAT`), ebenso die
 * Vorbedingungen.
 *
 * Zum Lesen nie dieses Schema nehmen, sondern `receiptBodyReadSchema`: Belege einer neueren
 * Fassung bestehen es nicht.
 */
export const receiptBodyWriteSchema = z
  .discriminatedUnion("type", [startBody, keyChangeBody, decisionBody, resultBody])
  .superRefine((body, ctx) => {
    if (body.type === "key_change") {
      const { facts } = body;
      const signer = facts.signedBy === "new" ? facts.newKeyId : facts.previousKeyId;
      if (facts.previousKeyId === facts.newKeyId || signer !== body.keyId) {
        ctx.addIssue({ code: "custom", path: ["facts", "signedBy"], message: "signedBy" });
      }
      return;
    }
    if (body.type !== "decision") return;
    const parsed = ACTIONS[body.action.type].facts.safeParse(body.facts);
    if (!parsed.success) ctx.addIssue({ code: "custom", path: ["facts"], message: "facts" });
  });

type StartBody = z.infer<typeof startBody>;
type KeyChangeBody = z.infer<typeof keyChangeBody>;
type DecisionBody = Omit<z.infer<typeof decisionBody>, "action"> & { action: ActionRequest };
type ResultBody = Omit<z.infer<typeof resultBody>, "action"> & { action: ActionRequest };
export type ReceiptBody = StartBody | KeyChangeBody | DecisionBody | ResultBody;

/** Feste Grenzen für JSON-Werte in gelesenen Belegen. */
export const BOUNDED_JSON_LIMITS = { depth: 8, text: 4000, items: 256, keys: 64 } as const;

function isBoundedJson(value: unknown, depth: number): boolean {
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.length <= BOUNDED_JSON_LIMITS.text;
  if (typeof value !== "object" || depth > BOUNDED_JSON_LIMITS.depth) return false;
  if (Array.isArray(value)) {
    return (
      value.length <= BOUNDED_JSON_LIMITS.items &&
      value.every((item) => isBoundedJson(item, depth + 1))
    );
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Object.keys(value);
  if (keys.length > BOUNDED_JSON_LIMITS.keys) return false;
  return keys.every(
    (key) =>
      key.length <= BOUNDED_JSON_LIMITS.text &&
      isBoundedJson((value as Record<string, unknown>)[key], depth + 1),
  );
}

/** JSON-Wert mit festen Grenzen: Tiefe ≤ 8, Text ≤ 4 000 Zeichen, Liste ≤ 256 Einträge, Objekt ≤ 64 Schlüssel. */
export const boundedJsonSchema: z.ZodType<JsonValue> = z.custom<JsonValue>((value) =>
  isBoundedJson(value, 1),
);

/** Höchstens `BOUNDED_JSON_LIMITS.keys` Schlüssel in einem gelesenen Objekt. */
function fewKeys(value: object): boolean {
  return Object.keys(value).length <= BOUNDED_JSON_LIMITS.keys;
}

/** Form einer Aktion beim Lesen: Kennung streng, Typ nach Muster, Akteur und Ziel nur als JSON. */
export const actionReadSchema = z
  .looseObject({
    actionId: idSchema("action"),
    type: z
      .string()
      .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/)
      .max(64),
    actor: boundedJsonSchema,
    target: boundedJsonSchema,
  })
  .catchall(boundedJsonSchema)
  .refine(fewKeys);

const decisionReadBody = z
  .looseObject({
    ...common,
    type: z.literal("decision"),
    action: actionReadSchema,
    decision: z
      .looseObject({ gateFormat: z.number().int().min(1).max(1000).optional() })
      .catchall(boundedJsonSchema)
      .refine(fewKeys),
    facts: factsRecordSchema,
  })
  .catchall(boundedJsonSchema)
  .refine(fewKeys);

const resultReadBody = z
  .looseObject({
    ...common,
    type: z.literal("result"),
    action: actionReadSchema,
    result: z
      .looseObject({ status: z.string().max(32) })
      .catchall(boundedJsonSchema)
      .refine(fewKeys),
  })
  .catchall(boundedJsonSchema)
  .refine(fewKeys);

/**
 * Lese-Form eines Beleg-Körpers (Export, Prüfprogramm). Prüft KEINEN Inhalt einer Fassung: Ob eine
 * Entscheidung oder ein Ergebnis zu seiner Fassung passt, prüft die Ketten-Prüfung
 * (`verifyChain`) je Fassung. So bleibt ein Beleg aus einer neueren PaiBot-Fassung lesbar.
 *
 * - `start`, `key_change`: streng wie beim Schreiben.
 * - `decision`: gemeinsame Felder streng, `type`, `action` nach `actionReadSchema`, `decision` mit
 *   optionalem `gateFormat` (Ganzzahl 1–1000) und sonst beliebigen JSON-Werten, `facts` im
 *   Wertebereich der Fakten; weitere Schlüssel nur als `boundedJsonSchema`.
 * - `result`: gemeinsame Felder streng, `type`, `action` nach `actionReadSchema`, `result` mit
 *   `status` (Text ≤ 32) und sonst beliebigen JSON-Werten; weitere Schlüssel nur als
 *   `boundedJsonSchema`.
 */
export const receiptBodyReadSchema = z
  .discriminatedUnion("type", [startBody, keyChangeBody, decisionReadBody, resultReadBody])
  .superRefine((body, ctx) => {
    if (body.type !== "key_change") return;
    const { facts } = body;
    const signer = facts.signedBy === "new" ? facts.newKeyId : facts.previousKeyId;
    if (facts.previousKeyId === facts.newKeyId || signer !== body.keyId) {
      ctx.addIssue({ code: "custom", path: ["facts", "signedBy"], message: "signedBy" });
    }
  });

/**
 * Gespeicherter Eintrag, wie er auch im Export steht (Schlüssel in dieser Reihenfolge), in der
 * Lese-Form (`receiptBodyReadSchema`): `seq`, `id` und `keyId` passen zum Körper.
 */
export const receiptEntryReadSchema = z
  .strictObject({
    seq: positiveIntSchema,
    id: idSchema("receipt"),
    hash: sha256DigestSchema,
    signature: signatureSchema,
    keyId: idSchema("key"),
    body: receiptBodyReadSchema,
  })
  .refine(
    (entry) =>
      entry.seq === entry.body.seq &&
      entry.id === entry.body.id &&
      entry.keyId === entry.body.keyId,
    { path: ["body"] },
  );
export type ReceiptEntry = Omit<z.infer<typeof receiptEntryReadSchema>, "body"> & {
  body: ReceiptBody;
};

export const publicKeyInfoSchema = z.strictObject({
  keyId: idSchema("key"),
  publicKey: publicKeySchema,
  fingerprint: fingerprintSchema,
});
export type PublicKeyInfo = z.infer<typeof publicKeyInfoSchema>;

/**
 * Anker der Beleg-Kette: der Kopf der Kette zu einem Zeitpunkt und ihr Anfang. Der Besitzer bewahrt
 * ihn außerhalb der Datenbank auf (als Text zum Kopieren oder als Datei). Mit ihm erkennt der
 * Prüfer eine gekürzte Kette, eine umgeschriebene Kette und einen ausgetauschten Anfang.
 *
 * - `seq`, `hash`: Nummer und Prüfsumme des letzten Belegs.
 * - `keyId`: Schlüssel, der diesen letzten Beleg signiert hat (der aktive).
 * - `startKeyId`, `startPublicKey`: der erste Schlüssel aus dem Start-Beleg (`facts.publicKey`).
 * - `time`: wann der Anker erstellt wurde.
 */
export const chainAnchorSchema = z.strictObject({
  format: z.literal("pb-anker"),
  v: z.literal(1),
  installationId: idSchema("installation"),
  seq: positiveIntSchema,
  hash: sha256DigestSchema,
  keyId: idSchema("key"),
  startKeyId: idSchema("key"),
  startPublicKey: publicKeySchema,
  time: isoTimeSchema,
});
export type ChainAnchor = z.infer<typeof chainAnchorSchema>;

const ANCHOR_KEYS = [
  "format",
  "v",
  "installationId",
  "seq",
  "hash",
  "keyId",
  "startKeyId",
  "startPublicKey",
  "time",
] as const satisfies readonly (keyof ChainAnchor)[];

/** Anker als eine Zeile JSON in fester Reihenfolge, z. B. für die Datei `pb-anker.json`. */
export function encodeAnchor(anchor: ChainAnchor): string {
  const checked = chainAnchorSchema.parse(anchor);
  return JSON.stringify(Object.fromEntries(ANCHOR_KEYS.map((key) => [key, checked[key]])));
}

/** Liest einen Anker aus Text (Leerraum davor und danach ist erlaubt); wirft bei ungültigem Text. */
export function parseAnchor(text: string): ChainAnchor {
  return chainAnchorSchema.parse(JSON.parse(text.trim()));
}

/**
 * Was der Prüfer an einer Kette beanstanden kann, über die einzelnen Prüfungen hinaus:
 * - `andere_installation`: Anker und Start-Beleg nennen verschiedene Installationen.
 * - `kette_kuerzer_als_anker`: die Kette endet vor `anchor.seq` (am Ende gekürzt).
 * - `kopf_abweichend`: der Beleg mit `anchor.seq` hat eine andere Prüfsumme (umgeschrieben).
 * - `anderer_anfang_als_anker`: Start-Schlüssel (ID oder öffentlicher Schlüssel) passt nicht.
 * - `schluessel_nicht_aus_kette`: ein Beleg ist mit einem Schlüssel signiert, der nicht aus der
 *   Kette selbst folgt (Start-Beleg, dann beglaubigte Schlüsselwechsel).
 * - `schluesselwechsel_nicht_beglaubigt`: ein Schlüsselwechsel ist nur vom neuen Schlüssel signiert.
 * - `fassung_unbekannt`: eine Entscheidung stammt aus einer neueren Fassung des Tors, die dieser
 *   Stand nicht kennt; ihr Inhalt lässt sich nicht prüfen.
 * - `fassung_unpassend`: eine Entscheidung oder ein Ergebnis passt nicht zu seiner (bekannten)
 *   Fassung, z. B. ein unbekanntes Feld oder eine Aktion, die es in der Fassung nicht gibt.
 */
export const CHAIN_PROBLEMS = [
  "andere_installation",
  "kette_kuerzer_als_anker",
  "kopf_abweichend",
  "anderer_anfang_als_anker",
  "schluessel_nicht_aus_kette",
  "schluesselwechsel_nicht_beglaubigt",
  "ergebnis_ohne_entscheidung",
  "ergebnis_passt_nicht_zur_entscheidung",
  "aktion_doppelt",
  "regelstand_fehlt",
  "fassung_unbekannt",
  "fassung_unpassend",
] as const;
export const chainProblemSchema = z.enum(CHAIN_PROBLEMS);
export type ChainProblem = z.infer<typeof chainProblemSchema>;

/**
 * Gesamturteil über eine Kette:
 * - `vertrauenswuerdig`: alle Prüfungen ok, alle Schlüssel aus der Kette, Anker (falls gegeben) passt.
 * - `vertrauen_gebrochen`: in sich gültig, aber ab einem Schlüsselwechsel ohne Beglaubigung lässt
 *   sich nicht mehr sagen, dass die Belege vom ursprünglichen Schlüssel-Inhaber stammen.
 * - `nicht_pruefbar`: die Kette enthält Belege aus einer neueren Fassung des Tors; dieser Stand kann
 *   sie nicht vollständig prüfen. Nie „vertrauenswürdig“.
 * - `ungueltig`: eine Prüfung schlägt fehl oder der Anker passt nicht.
 */
export const CHAIN_TRUST_LEVELS = [
  "vertrauenswuerdig",
  "vertrauen_gebrochen",
  "nicht_pruefbar",
  "ungueltig",
] as const;
export const chainTrustLevelSchema = z.enum(CHAIN_TRUST_LEVELS);
export type ChainTrustLevel = z.infer<typeof chainTrustLevelSchema>;

/** Welche Stufe ein Problem mindestens bedeutet. */
export const CHAIN_PROBLEM_LEVEL = {
  andere_installation: "ungueltig",
  kette_kuerzer_als_anker: "ungueltig",
  kopf_abweichend: "ungueltig",
  anderer_anfang_als_anker: "ungueltig",
  schluessel_nicht_aus_kette: "ungueltig",
  schluesselwechsel_nicht_beglaubigt: "vertrauen_gebrochen",
  ergebnis_ohne_entscheidung: "ungueltig",
  ergebnis_passt_nicht_zur_entscheidung: "ungueltig",
  aktion_doppelt: "ungueltig",
  regelstand_fehlt: "ungueltig",
  fassung_unbekannt: "nicht_pruefbar",
  fassung_unpassend: "ungueltig",
} as const satisfies Record<ChainProblem, Exclude<ChainTrustLevel, "vertrauenswuerdig">>;

/** Ein Problem an der Kette, mit der Stelle, an der es auftritt. */
export const chainFindingSchema = z.strictObject({
  problem: chainProblemSchema,
  seq: positiveIntSchema.optional(),
  keyId: idSchema("key").optional(),
});
export type ChainFinding = z.infer<typeof chainFindingSchema>;

/**
 * Hinweise an der Kette, die das Urteil nie ändern:
 * - `fassung_rueckschritt`: nach einer Entscheidung mit Fassungsangabe (`decision.gateFormat`)
 *   folgt eine ohne. Das kann beim Update kurz vorkommen.
 */
export const CHAIN_NOTES = ["fassung_rueckschritt"] as const;
export const chainNoteSchema = z.enum(CHAIN_NOTES);
export type ChainNoteKind = z.infer<typeof chainNoteSchema>;
export const chainNoteEntrySchema = z.strictObject({
  note: chainNoteSchema,
  seq: positiveIntSchema,
});
export type ChainNote = z.infer<typeof chainNoteEntrySchema>;

/**
 * Urteil über die ganze Kette. `anchor`: ob ein Anker geprüft wurde. Ohne Anker ist ein Kürzen am
 * Ende nicht erkennbar; die Oberfläche sagt das dazu. `notes`: Hinweise, die die Stufe nie ändern
 * (fehlt, wenn es keine gibt).
 */
export const chainVerdictSchema = z.strictObject({
  level: chainTrustLevelSchema,
  findings: z.array(chainFindingSchema),
  anchor: z.enum(["geprueft", "fehlt"]),
  notes: z.array(chainNoteEntrySchema).optional(),
});
export type ChainVerdict = z.infer<typeof chainVerdictSchema>;

/**
 * Stufe aus den gefundenen Problemen und dem Ergebnis der Einzelprüfungen: `ungueltig` vor
 * `nicht_pruefbar` vor `vertrauen_gebrochen` vor `vertrauenswuerdig`.
 */
export function chainTrustLevel(
  findings: readonly Pick<ChainFinding, "problem">[],
  checksOk: boolean,
): ChainTrustLevel {
  if (!checksOk) return "ungueltig";
  const levels = findings.map((finding) => CHAIN_PROBLEM_LEVEL[finding.problem]);
  if (levels.includes("ungueltig")) return "ungueltig";
  if (levels.includes("nicht_pruefbar")) return "nicht_pruefbar";
  if (levels.includes("vertrauen_gebrochen")) return "vertrauen_gebrochen";
  return "vertrauenswuerdig";
}

/**
 * Erste Zeile eines Beleg-Exports im JSONL-Format. `publicKeys` dient nur der Anzeige
 * (Kurzformen); der Prüfer vertraut Schlüsseln nur, wenn sie aus der Kette folgen. `anchor` ist
 * der Kopf beim Export; der Besitzer kann ihn sich außerhalb notieren.
 */
export const receiptExportHeaderSchema = z.strictObject({
  format: z.literal("pb-belege"),
  v: z.literal(RECEIPT_VERSION),
  installationId: idSchema("installation"),
  publicKeys: z.array(publicKeyInfoSchema).min(1),
  anchor: chainAnchorSchema.optional(),
});
export type ReceiptExportHeader = z.infer<typeof receiptExportHeaderSchema>;
