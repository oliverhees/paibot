/**
 * PaiBot – feste Kopie des Lese-Schemas für Belege vom Stand vor der Tor-Fassung (nur Tests).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

// Herkunft: `packages/shared/src/receipts.ts` auf Stand 39d882b, Zeilen 37–214 (von
// `RECEIPT_VERSION` bis `receiptEntrySchema`), unverändert bis auf die Namen und die Importe.
// Bausteine, die diese Änderung nicht berührt (Aktionen, Fehlercodes, Grundtypen, Kennungen und
// die Typen des Tors), kommen aus `@paibot/shared`. Diese Datei wird nie angepasst: Sie zeigt, dass
// ein heute geschriebener Beleg auch von einer PaiBot-Fassung vor der Tor-Fassung gelesen wird.

import { ACTIONS, actionRequestSchema } from "@paibot/shared/aktionen";
import { errorCodeSchema } from "@paibot/shared/fehler";
import {
  hmacDigestSchema,
  isoTimeSchema,
  positiveIntSchema,
  publicKeySchema,
  servedBySchema,
  sha256DigestSchema,
  signatureSchema,
  tokenUsageSchema,
} from "@paibot/shared/grundtypen";
import { idSchema } from "@paibot/shared/ids";
import {
  limitCheckSchema,
  outcomeSchema,
  preconditionCheckSchema,
  ruleStandSchema,
  scalarSchema,
  stageSchema,
  storedRuleRefSchema,
} from "@paibot/shared/tor";
import { z } from "zod";

/** Formatversion des Beleg-Körpers. */
const RECEIPT_VERSION = 1;

const RESULT_STATUSES = ["ok", "error", "cancelled", "denied"] as const;
const resultStatusSchema = z.enum(RESULT_STATUSES);

/** Stand der Software, z. B. `0.3.0+20261205.3f9c2ab` oder `0.3.0+dev`. */
const softwareStandSchema = z
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

const receiptDecisionSchema = z.strictObject({
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

const receiptResultSchema = z.strictObject({
  status: resultStatusSchema,
  code: errorCodeSchema.optional(),
  /** Prüfsumme der Antwort bzw. des Ergebnisses. */
  digest: hmacDigestSchema.optional(),
  tokens: tokenUsageSchema.optional(),
  /** Wer laut Antwort der Schnittstelle geantwortet hat (nur `modell.anfragen`, wenn gemeldet). */
  servedBy: servedBySchema.optional(),
});

const receiptUndoSchema = z.strictObject({
  possible: z.boolean(),
  hint: z.string().min(1).max(300).optional(),
});

const receiptContextSchema = z.strictObject({ digest: hmacDigestSchema });

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
const KEY_CHANGE_SIGNERS = ["previous", "new"] as const;
const keyChangeSignerSchema = z.enum(KEY_CHANGE_SIGNERS);

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
const keyChangeFactsSchema = z.strictObject({
  newKeyId: idSchema("key"),
  publicKey: publicKeySchema,
  previousKeyId: idSchema("key").optional(),
  signedBy: keyChangeSignerSchema,
});

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
const altReceiptBodySchema = z
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

/** Gespeicherter Eintrag, wie er auch im Export steht (Schlüssel in dieser Reihenfolge). */
export const altReceiptEntrySchema = z
  .strictObject({
    seq: positiveIntSchema,
    id: idSchema("receipt"),
    hash: sha256DigestSchema,
    signature: signatureSchema,
    keyId: idSchema("key"),
    body: altReceiptBodySchema,
  })
  .refine(
    (entry) =>
      entry.seq === entry.body.seq &&
      entry.id === entry.body.id &&
      entry.keyId === entry.body.keyId,
    { path: ["body"] },
  );
