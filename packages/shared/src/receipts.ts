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
import { limitCheckSchema, outcomeSchema, ruleRefSchema, scalarSchema, stageSchema } from "./gate";
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
  rules: z.array(ruleRefSchema),
  limits: z.array(limitCheckSchema),
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

const startBody = z.strictObject({
  ...common,
  type: z.literal("start"),
  facts: z.strictObject({
    installationId: idSchema("installation"),
    publicKey: publicKeySchema,
    software: softwareStandSchema,
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

/** Erste Zeile eines Beleg-Exports im JSONL-Format. */
export const receiptExportHeaderSchema = z.strictObject({
  format: z.literal("pb-belege"),
  v: z.literal(RECEIPT_VERSION),
  installationId: idSchema("installation"),
  publicKeys: z.array(publicKeyInfoSchema).min(1),
});
export type ReceiptExportHeader = z.infer<typeof receiptExportHeaderSchema>;
