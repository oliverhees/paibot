/**
 * PaiBot – feste, in sich geschlossene Kopie des Lese-Schemas für Belege vom Stand mit Tor-Fassung 2
 * (nur Tests).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

// Herkunft: `packages/shared/src/receipts.ts` auf Stand 6d8baac (dem letzten ohne Tor-Fassung 3),
// von `RECEIPT_VERSION` bis `receiptEntryReadSchema` (Lese-Form: `common`, `factsRecordSchema`,
// `startBody`, `keyChangeBody`, `boundedJsonSchema`, `actionReadSchema`, `decisionReadBody`,
// `resultReadBody`, `receiptBodyReadSchema`, `receiptEntryReadSchema`), unverändert bis auf die
// Namen. Die Lese-Form selbst hat sich zwischen den Ständen mit Fassung 1 und Fassung 2 nicht
// geändert; diese Kopie hält trotzdem den Stand fest, damit eine spätere Änderung an der lebenden
// Datei nicht still mitgeht. Bausteine aus anderen Dateien (Fakten-Werte, Zeit, Ganzzahlen,
// Software-Stand) stehen hier ebenfalls als Kopie. Importiert werden nur `zod`, die Kennungen
// (`idSchema`) und die Prüfsummen- und Schlüssel-Formate, die per Definition nie geändert werden.
// Diese Datei wird nie angepasst: Sie zeigt, dass ein Beleg einer neueren Fassung auch von dem Stand
// mit Tor-Fassung 2 gelesen wird.

import { publicKeySchema, sha256DigestSchema, signatureSchema } from "@paibot/shared/grundtypen";
import { idSchema } from "@paibot/shared/ids";
import { z } from "zod";

const RECEIPT_VERSION = 1;

const positiveInt = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const isoTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  .refine((value) => !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value);
const scalar = z.union([z.string().max(200), z.number().int(), z.boolean()]);
const softwareStand = z
  .string()
  .regex(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/)
  .max(100);

const common = {
  v: z.literal(RECEIPT_VERSION),
  id: idSchema("receipt"),
  seq: positiveInt,
  time: isoTime,
  prev: sha256DigestSchema,
  keyId: idSchema("key"),
};

const factsRecord = z.record(
  z.string().regex(/^[a-z][A-Za-z0-9]*$/),
  z.union([scalar, z.array(z.union([z.string().max(200), z.number().int()]))]),
);

const startBody = z.strictObject({
  ...common,
  type: z.literal("start"),
  facts: z.strictObject({
    installationId: idSchema("installation"),
    publicKey: publicKeySchema,
    software: softwareStand,
    format: z.number().int().min(2).max(1000).optional(),
  }),
});

const keyChangeFacts = z.strictObject({
  newKeyId: idSchema("key"),
  publicKey: publicKeySchema,
  previousKeyId: idSchema("key").optional(),
  signedBy: z.enum(["previous", "new"]),
});

const keyChangeBody = z.strictObject({
  ...common,
  type: z.literal("key_change"),
  facts: keyChangeFacts,
});

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const LIMITS = { depth: 8, text: 4000, items: 256, keys: 64 } as const;

function isBoundedJson(value: unknown, depth: number): boolean {
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.length <= LIMITS.text;
  if (typeof value !== "object" || depth > LIMITS.depth) return false;
  if (Array.isArray(value)) {
    return value.length <= LIMITS.items && value.every((item) => isBoundedJson(item, depth + 1));
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Object.keys(value);
  if (keys.length > LIMITS.keys) return false;
  return keys.every(
    (key) =>
      key.length <= LIMITS.text &&
      isBoundedJson((value as Record<string, unknown>)[key], depth + 1),
  );
}

const boundedJson: z.ZodType<Json> = z.custom<Json>((value) => isBoundedJson(value, 1));

function fewKeys(value: object): boolean {
  return Object.keys(value).length <= LIMITS.keys;
}

const actionRead = z
  .looseObject({
    actionId: idSchema("action"),
    type: z
      .string()
      .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/)
      .max(64),
    actor: boundedJson,
    target: boundedJson,
  })
  .catchall(boundedJson)
  .refine(fewKeys);

const decisionReadBody = z
  .looseObject({
    ...common,
    type: z.literal("decision"),
    action: actionRead,
    decision: z
      .looseObject({ gateFormat: z.number().int().min(1).max(1000).optional() })
      .catchall(boundedJson)
      .refine(fewKeys),
    facts: factsRecord,
  })
  .catchall(boundedJson)
  .refine(fewKeys);

const resultReadBody = z
  .looseObject({
    ...common,
    type: z.literal("result"),
    action: actionRead,
    result: z
      .looseObject({ status: z.string().max(32) })
      .catchall(boundedJson)
      .refine(fewKeys),
  })
  .catchall(boundedJson)
  .refine(fewKeys);

const bodyRead = z
  .discriminatedUnion("type", [startBody, keyChangeBody, decisionReadBody, resultReadBody])
  .superRefine((body, ctx) => {
    if (body.type !== "key_change") return;
    const { facts } = body;
    const signer = facts.signedBy === "new" ? facts.newKeyId : facts.previousKeyId;
    if (facts.previousKeyId === facts.newKeyId || signer !== body.keyId) {
      ctx.addIssue({ code: "custom", path: ["facts", "signedBy"], message: "signedBy" });
    }
  });

/** Gespeicherter Eintrag in der Lese-Form vom Stand mit Tor-Fassung 2. */
export const l2ReceiptEntryReadSchema = z
  .strictObject({
    seq: positiveInt,
    id: idSchema("receipt"),
    hash: sha256DigestSchema,
    signature: signatureSchema,
    keyId: idSchema("key"),
    body: bodyRead,
  })
  .refine(
    (entry) =>
      entry.seq === entry.body.seq &&
      entry.id === entry.body.id &&
      entry.keyId === entry.body.keyId,
    { path: ["body"] },
  );
