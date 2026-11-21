/**
 * PaiBot – feste, geschlossene Kopie des Lese-Schemas für Belege vom Stand vor der Tor-Fassung
 * (nur Tests).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

// Herkunft: `packages/shared/src/receipts.ts` auf Stand 39d882b (von `RECEIPT_VERSION` bis
// `receiptEntrySchema`), wie `altes-lese-schema.ts`, aber ohne lebende Verträge: Aktionen, Fakten,
// Ergebnis-Felder, Grenzen, Vorbedingungen und Fehlercodes stammen aus der eingefrorenen Fassung 1
// des Tors (`GATE_FORMATS[1]`, gleich dem Stand 39d882b und durch Prüfsummen festgehalten), die
// übrigen Bausteine stehen hier als Kopie. `altes-lese-schema.ts` bleibt unverändert; es nimmt
// lebende Verträge und wird mit jeder neuen Fassung still lockerer, deshalb gilt diese Datei als
// Maßstab für „ein Leser vor der Tor-Fassung“. Diese Datei wird nie angepasst.

import { GATE_FORMATS } from "@paibot/gate";
import {
  hmacDigestSchema,
  publicKeySchema,
  sha256DigestSchema,
  signatureSchema,
} from "@paibot/shared/grundtypen";
import { idSchema } from "@paibot/shared/ids";
import { z } from "zod";

const FASSUNG_1 = GATE_FORMATS[1];

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
const checkResult = z.enum(["ok", "verletzt", "entfaellt"]);

const common = {
  v: z.literal(1),
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

/** Entscheidung vor der Tor-Fassung: ohne Feld `gateFormat`, ohne Deckel. */
const decision = z.strictObject({
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
      name: z.enum(FASSUNG_1.limitOrder as [string, ...string[]]),
      result: checkResult,
      value: scalar.optional(),
    }),
  ),
  preconditions: z
    .array(
      z.strictObject({
        name: z.enum(
          Object.values(FASSUNG_1.preconditions).map((p) => p.name) as [string, ...string[]],
        ),
        result: checkResult,
      }),
    )
    .optional(),
  ruleStand: positiveInt.optional(),
  reason: z.string().min(1).max(500),
});

const undo = z.strictObject({
  possible: z.boolean(),
  hint: z.string().min(1).max(300).optional(),
});

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

const keyChangeBody = z.strictObject({
  ...common,
  type: z.literal("key_change"),
  facts: z.strictObject({
    newKeyId: idSchema("key"),
    publicKey: publicKeySchema,
    previousKeyId: idSchema("key").optional(),
    signedBy: z.enum(["previous", "new"]),
  }),
});

const decisionBody = z.strictObject({
  ...common,
  type: z.literal("decision"),
  action: FASSUNG_1.request,
  decision,
  facts: factsRecord,
  context: z.strictObject({ digest: hmacDigestSchema }).optional(),
  undo: undo.optional(),
});

const resultBody = z.strictObject({
  ...common,
  type: z.literal("result"),
  action: FASSUNG_1.request,
  result: FASSUNG_1.result,
  undo: undo.optional(),
});

const body = z
  .discriminatedUnion("type", [startBody, keyChangeBody, decisionBody, resultBody])
  .superRefine((value, ctx) => {
    if (value.type === "key_change") {
      const { facts } = value;
      const signer = facts.signedBy === "new" ? facts.newKeyId : facts.previousKeyId;
      if (facts.previousKeyId === facts.newKeyId || signer !== value.keyId) {
        ctx.addIssue({ code: "custom", path: ["facts", "signedBy"], message: "signedBy" });
      }
      return;
    }
    if (value.type !== "decision") return;
    const type = (value.action as { type: string }).type;
    const facts = FASSUNG_1.facts[type];
    if (facts === undefined || !facts.safeParse(value.facts).success) {
      ctx.addIssue({ code: "custom", path: ["facts"], message: "facts" });
    }
  });

/** Gespeicherter Eintrag, wie ein Stand vor der Tor-Fassung ihn las. */
export const vorFassungReceiptEntrySchema = z
  .strictObject({
    seq: positiveInt,
    id: idSchema("receipt"),
    hash: sha256DigestSchema,
    signature: signatureSchema,
    keyId: idSchema("key"),
    body,
  })
  .refine(
    (entry) =>
      entry.seq === entry.body.seq &&
      entry.id === entry.body.id &&
      entry.keyId === entry.body.keyId,
    { path: ["body"] },
  );
