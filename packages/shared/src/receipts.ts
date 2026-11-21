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
  limitCheckSchema,
  outcomeSchema,
  preconditionCheckSchema,
  ruleStandSchema,
  scalarSchema,
  stageSchema,
  storedRuleRefSchema,
} from "./gate";
import {
  fingerprintSchema,
  hmacDigestSchema,
  isoTimeSchema,
  positiveIntSchema,
  publicKeySchema,
  sha256DigestSchema,
  signatureSchema,
  tokenUsageSchema,
} from "./grundtypen";
import { idSchema } from "./id";

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

export const receiptDecisionSchema = z.strictObject({
  outcome: outcomeSchema,
  stage: stageSchema,
  /** Angewandte Regeln mit Fassung und Prüfsumme des Inhalts. */
  rules: z.array(storedRuleRefSchema),
  limits: z.array(limitCheckSchema),
  /** Vorbedingungen der Aktion; fehlt bei Belegen aus der Zeit vor den Vorbedingungen. */
  preconditions: z.array(preconditionCheckSchema).optional(),
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
 * Körper eines Belegs. Er wird kanonisch serialisiert, gehasht und signiert. Optionale Felder
 * fehlen, statt `null` zu sein. Die Fakten eines Belegs „Entscheidung“ passen zur Aktion; bei
 * einem Schlüsselwechsel passt `keyId` zu `facts.signedBy`.
 */
export const receiptBodySchema = z
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

/** Gespeicherter Eintrag, wie er auch im Export steht (Schlüssel in dieser Reihenfolge). */
export const receiptEntrySchema = z
  .strictObject({
    seq: positiveIntSchema,
    id: idSchema("receipt"),
    hash: sha256DigestSchema,
    signature: signatureSchema,
    keyId: idSchema("key"),
    body: receiptBodySchema,
  })
  .refine(
    (entry) =>
      entry.seq === entry.body.seq &&
      entry.id === entry.body.id &&
      entry.keyId === entry.body.keyId,
    { path: ["body"] },
  );
export type ReceiptEntry = Omit<z.infer<typeof receiptEntrySchema>, "body"> & { body: ReceiptBody };

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
] as const;
export const chainProblemSchema = z.enum(CHAIN_PROBLEMS);
export type ChainProblem = z.infer<typeof chainProblemSchema>;

/**
 * Gesamturteil über eine Kette:
 * - `vertrauenswuerdig`: alle Prüfungen ok, alle Schlüssel aus der Kette, Anker (falls gegeben) passt.
 * - `vertrauen_gebrochen`: in sich gültig, aber ab einem Schlüsselwechsel ohne Beglaubigung lässt
 *   sich nicht mehr sagen, dass die Belege vom ursprünglichen Schlüssel-Inhaber stammen.
 * - `ungueltig`: eine Prüfung schlägt fehl oder der Anker passt nicht.
 */
export const CHAIN_TRUST_LEVELS = [
  "vertrauenswuerdig",
  "vertrauen_gebrochen",
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
} as const satisfies Record<ChainProblem, Exclude<ChainTrustLevel, "vertrauenswuerdig">>;

/** Ein Problem an der Kette, mit der Stelle, an der es auftritt. */
export const chainFindingSchema = z.strictObject({
  problem: chainProblemSchema,
  seq: positiveIntSchema.optional(),
  keyId: idSchema("key").optional(),
});
export type ChainFinding = z.infer<typeof chainFindingSchema>;

/**
 * Urteil über die ganze Kette. `anchor`: ob ein Anker geprüft wurde. Ohne Anker ist ein Kürzen am
 * Ende nicht erkennbar; die Oberfläche sagt das dazu.
 */
export const chainVerdictSchema = z.strictObject({
  level: chainTrustLevelSchema,
  findings: z.array(chainFindingSchema),
  anchor: z.enum(["geprueft", "fehlt"]),
});
export type ChainVerdict = z.infer<typeof chainVerdictSchema>;

/**
 * Stufe aus den gefundenen Problemen und dem Ergebnis der Einzelprüfungen: `ungueltig` vor
 * `vertrauen_gebrochen` vor `vertrauenswuerdig`.
 */
export function chainTrustLevel(
  findings: readonly Pick<ChainFinding, "problem">[],
  checksOk: boolean,
): ChainTrustLevel {
  if (!checksOk) return "ungueltig";
  const levels = findings.map((finding) => CHAIN_PROBLEM_LEVEL[finding.problem]);
  if (levels.includes("ungueltig")) return "ungueltig";
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
