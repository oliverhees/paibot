/**
 * PaiBot – Zugriff auf Installations-Schlüssel für Belege (Privatschlüssel nur als verschlüsselter Text).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { type KeyId, newId, PaiBotError, type PublicKeyInfo } from "@paibot/shared";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { Database } from "../client";
import { installationKeys } from "../schema";
import { standardFehler, uebersetzen } from "./fehler";
import { withTransaction } from "./transaktion";

export interface InstallationKeyRecord {
  id: KeyId;
  purpose: "receipts";
  publicKey: string;
  /** Verschlüsselt (`v1:iv:tag:ct`); das Entschlüsseln gehört dem Krypto-Paket. */
  privateKeyEnc: string;
  fingerprint: string;
  createdAt: string;
  retiredAt?: string;
}

export interface InstallationKeyCreate {
  id?: KeyId;
  purpose?: "receipts";
  publicKey: string;
  privateKeyEnc: string;
  fingerprint: string;
}

function toRecord(row: typeof installationKeys.$inferSelect): InstallationKeyRecord {
  return {
    id: row.id,
    purpose: row.purpose as "receipts",
    publicKey: row.publicKey,
    privateKeyEnc: row.privateKeyEnc,
    fingerprint: row.fingerprint,
    createdAt: row.createdAt.toISOString(),
    ...(row.retiredAt === null ? {} : { retiredAt: row.retiredAt.toISOString() }),
  };
}

export async function create(
  db: Database,
  input: InstallationKeyCreate,
): Promise<InstallationKeyRecord> {
  const [row] = await uebersetzen(
    () =>
      db
        .insert(installationKeys)
        .values({
          id: input.id ?? newId("key"),
          purpose: input.purpose ?? "receipts",
          publicKey: input.publicKey,
          privateKeyEnc: input.privateKeyEnc,
          fingerprint: input.fingerprint,
        })
        .returning(),
    standardFehler,
  );
  if (row === undefined) throw new PaiBotError("intern");
  return toRecord(row);
}

/** Der aktive (nicht ausgemusterte) Schlüssel für den Zweck. */
export async function getActive(
  db: Database,
  purpose: "receipts" = "receipts",
): Promise<InstallationKeyRecord | undefined> {
  const [row] = await db
    .select()
    .from(installationKeys)
    .where(and(eq(installationKeys.purpose, purpose), isNull(installationKeys.retiredAt)));
  return row === undefined ? undefined : toRecord(row);
}

export async function get(db: Database, id: KeyId): Promise<InstallationKeyRecord | undefined> {
  const [row] = await db.select().from(installationKeys).where(eq(installationKeys.id, id));
  return row === undefined ? undefined : toRecord(row);
}

/** Alle Schlüssel, älteste zuerst (auch ausgemusterte, sie prüfen alte Belege). */
export async function list(db: Database): Promise<InstallationKeyRecord[]> {
  const rows = await db
    .select()
    .from(installationKeys)
    .orderBy(asc(installationKeys.createdAt), asc(installationKeys.id));
  return rows.map(toRecord);
}

/** Die öffentlichen Angaben aller Schlüssel, wie sie der Beleg-Export im Kopf nennt. */
export async function listPublic(db: Database): Promise<PublicKeyInfo[]> {
  return (await list(db)).map((key) => ({
    keyId: key.id,
    publicKey: key.publicKey,
    fingerprint: key.fingerprint,
  }));
}

/** Mustert einen Schlüssel aus. `undefined`, wenn es ihn nicht gibt. */
export async function retire(
  db: Database,
  id: KeyId,
  options: { now?: Date } = {},
): Promise<InstallationKeyRecord | undefined> {
  const [row] = await db
    .update(installationKeys)
    .set({ retiredAt: options.now ?? new Date() })
    .where(eq(installationKeys.id, id))
    .returning();
  return row === undefined ? undefined : toRecord(row);
}

/** Schlüsselwechsel: der bisherige aktive Schlüssel wird ausgemustert, der neue eingefügt. */
export async function rotate(
  db: Database,
  input: InstallationKeyCreate,
  options: { now?: Date } = {},
): Promise<InstallationKeyRecord> {
  return withTransaction(db, async (tx) => {
    const bisher = await getActive(tx, input.purpose ?? "receipts");
    if (bisher !== undefined) await retire(tx, bisher.id, options);
    return create(tx, input);
  });
}
