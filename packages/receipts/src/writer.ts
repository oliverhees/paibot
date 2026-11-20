/**
 * PaiBot – Belege unter Sperre an die Kette in der Datenbank anhängen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { belege, conversationEvents, type Database } from "@paibot/db";
import type { DecisionRecord, ReceiptRef, ReceiptWriter, ResultRecord } from "@paibot/gate";
import { type ReceiptBody, type ReceiptEntry, ZERO_PREV } from "@paibot/shared/belege";
import { PaiBotError } from "@paibot/shared/fehler";
import { toIsoTime } from "@paibot/shared/grundtypen";
import {
  type ConversationId,
  type InstallationId,
  isId,
  type KeyId,
  newId,
} from "@paibot/shared/ids";
import { EVENT_NOTIFY_CHANNEL } from "@paibot/shared/konstanten";
import { buildReceipt, type ReceiptDraft } from "./build";
import { hashReceipt } from "./hash";
import { signReceipt } from "./server";

/** Nummer der Transaktions-Sperre, unter der Belege angehängt werden. */
export const RECEIPT_LOCK_ID = 2026112001;

/** Ein Signaturschlüssel mit seinem entschlüsselten privaten Teil (nur im Speicher). */
export interface SigningKeyRef {
  keyId: KeyId;
  privateKey: string;
}

/** Liefert den Schlüssel, mit dem neue Belege signiert werden. */
export interface ReceiptKeys {
  current(): Promise<SigningKeyRef>;
}

/** Beleg „Start“ bei der Einrichtung. */
export interface StartInput {
  installationId: InstallationId;
  key: SigningKeyRef & { publicKey: string };
  /** Stand der Software (`PAIBOT_BUILD` oder `<version>+dev`). */
  software: string;
  time: Date;
}

/**
 * Beleg „Schlüsselwechsel“. Der Beleg nennt den neuen Schlüssel (`facts.newKeyId`,
 * `facts.publicKey`) und den bisherigen (`facts.previousKeyId`). Ist der alte private Schlüssel
 * vorhanden, signiert er (`facts.signedBy: "previous"`, `keyId` = bisheriger Schlüssel); fehlt er,
 * signiert der neue Schlüssel selbst (`facts.signedBy: "new"`, `keyId` = neuer Schlüssel).
 */
export interface KeyChangeInput {
  next: SigningKeyRef & { publicKey: string };
  previous?: { keyId: KeyId; privateKey?: string };
  time: Date;
}

/** Schreiber für die Belege-Kette. Erfüllt den Port `ReceiptWriter` des Tors. */
export interface ReceiptChainWriter extends ReceiptWriter {
  /** Erster Eintrag der Kette (`seq` 1, `prev` = `ZERO_PREV`). Fehler, wenn die Kette nicht leer ist. */
  appendStart(input: StartInput): Promise<ReceiptRef>;
  appendKeyChange(input: KeyChangeInput): Promise<ReceiptRef>;
  /** Letzter Eintrag der Kette oder `undefined` bei leerer Kette. */
  head(): Promise<ReceiptEntry | undefined>;
}

/**
 * Baut den Schreiber. Jedes Anhängen läuft in einer Transaktion mit
 * `pg_advisory_xact_lock(RECEIPT_LOCK_ID)`: Kopf lesen, Körper bauen (`buildReceipt`), hashen,
 * signieren, einfügen (`belege.appendLocked`), danach Ereignis `beleg.created`, wenn der Beleg zu
 * einer Unterhaltung gehört.
 *
 * Zusagen: Auch bei gleichzeitigen Schreibern (web und worker) bleibt die Kette lückenlos und
 * unverzweigt. Belege enthalten nie Inhalte von Nachrichten.
 */
export function createReceiptWriter(db: Database, keys: ReceiptKeys): ReceiptChainWriter {
  return {
    appendStart: (input) =>
      append(db, input.time, async (tx, chain) => {
        if (chain.head !== undefined) {
          throw new PaiBotError("einrichtung_fertig", {
            text: "Die Belege-Kette hat schon einen Start.",
          });
        }
        await requireStoredKey(tx, input.key.keyId, input.key.publicKey);
        return {
          draft: {
            type: "start",
            facts: {
              installationId: input.installationId,
              publicKey: input.key.publicKey,
              software: input.software,
            },
          },
          key: { keyId: input.key.keyId, privateKey: input.key.privateKey },
        };
      }),

    appendKeyChange: (input) =>
      append(db, input.time, async (tx, chain) => {
        const active = requireStarted(chain);
        const previousKeyId = input.previous?.keyId ?? active;
        if (previousKeyId !== active) {
          throw new PaiBotError("intern", {
            text: "Der bisherige Schlüssel ist nicht der aktive.",
          });
        }
        if (input.next.keyId === active) {
          throw new PaiBotError("intern", { text: "Der neue Schlüssel ist schon der aktive." });
        }
        await requireStoredKey(tx, input.next.keyId, input.next.publicKey);
        const previousPrivate = input.previous?.privateKey;
        const signedBy = previousPrivate !== undefined ? "previous" : "new";
        return {
          draft: {
            type: "key_change",
            facts: {
              newKeyId: input.next.keyId,
              publicKey: input.next.publicKey,
              previousKeyId,
              signedBy,
            },
          },
          key:
            previousPrivate !== undefined
              ? { keyId: previousKeyId, privateKey: previousPrivate }
              : { keyId: input.next.keyId, privateKey: input.next.privateKey },
        };
      }),

    appendDecision: (record: DecisionRecord) =>
      append(db, record.time, async (_tx, chain) => ({
        draft: {
          type: "decision",
          action: record.action,
          decision: record.decision,
          facts: record.facts,
          ...(record.context === undefined ? {} : { context: record.context }),
          ...(record.undo === undefined ? {} : { undo: record.undo }),
        },
        key: await currentKey(keys, requireStarted(chain)),
      })),

    appendResult: (record: ResultRecord) =>
      append(db, record.time, async (_tx, chain) => ({
        draft: {
          type: "result",
          action: record.action,
          result: record.result,
          ...(record.undo === undefined ? {} : { undo: record.undo }),
        },
        key: await currentKey(keys, requireStarted(chain)),
      })),

    head: async () => {
      const row = await db.query.belege.findFirst({ orderBy: (t, { desc }) => [desc(t.seq)] });
      return row === undefined ? undefined : toEntry(row);
    },
  };
}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type BelegRow = typeof belege.$inferSelect;

/** Zustand der Kette unter der Sperre: letzter Eintrag und der Schlüssel, der gerade signiert. */
interface ChainHead {
  head: BelegRow | undefined;
  activeKeyId: KeyId | undefined;
}

interface Prepared {
  draft: ReceiptDraft;
  key: SigningKeyRef;
}

/**
 * Hängt einen Eintrag in einer eigenen Transaktion unter der Sperre `RECEIPT_LOCK_ID` an. Wird
 * `db` als Transaktion übergeben, entsteht ein Sicherungspunkt in ihr.
 */
async function append(
  db: Database,
  time: Date,
  prepare: (tx: Tx, chain: ChainHead) => Promise<Prepared>,
): Promise<ReceiptRef> {
  return db.transaction(async (tx) => {
    await tx.execute(`select pg_advisory_xact_lock(${RECEIPT_LOCK_ID})`);
    const chain = await readChainHead(tx);
    const { draft, key } = await prepare(tx, chain);

    const seq = (chain.head?.seq ?? 0) + 1;
    const body = buildReceipt(draft, {
      id: newId("receipt"),
      seq,
      time: toIsoTime(time),
      prev: chain.head?.hash ?? ZERO_PREV,
      keyId: key.keyId,
    });
    const hash = await hashReceipt(body);
    const signature = signReceipt(hash, key.privateKey);

    const action = body.type === "decision" || body.type === "result" ? body.action : undefined;
    const target = (action?.target ?? {}) as Record<string, unknown>;
    const conversationId = isId("conversation", target.conversationId)
      ? target.conversationId
      : undefined;

    await tx.insert(belege).values({
      seq,
      id: body.id,
      entryType: body.type,
      actionId: action?.actionId ?? null,
      action: action?.type ?? null,
      actor: action?.actor ?? null,
      conversationId: conversationId ?? null,
      body,
      prevHash: body.prev,
      hash,
      keyId: body.keyId,
      signature,
    });

    if (action !== undefined && conversationId !== undefined) {
      await announce(tx, body, conversationId, target);
    }
    return { receiptId: body.id, seq };
  });
}

async function readChainHead(tx: Tx): Promise<ChainHead> {
  const head = await tx.query.belege.findFirst({ orderBy: (t, { desc }) => [desc(t.seq)] });
  const signer = await tx.query.belege.findFirst({
    where: (t, { inArray }) => inArray(t.entryType, ["start", "key_change"]),
    orderBy: (t, { desc }) => [desc(t.seq)],
  });
  let activeKeyId: KeyId | undefined;
  if (signer?.body.type === "start") activeKeyId = signer.body.keyId;
  if (signer?.body.type === "key_change") activeKeyId = signer.body.facts.newKeyId;
  return { head, activeKeyId };
}

function requireStarted(chain: ChainHead): KeyId {
  if (chain.head === undefined || chain.activeKeyId === undefined) {
    throw new PaiBotError("einrichtung_offen", { text: "Die Belege-Kette hat noch keinen Start." });
  }
  return chain.activeKeyId;
}

async function currentKey(keys: ReceiptKeys, active: KeyId): Promise<SigningKeyRef> {
  const key = await keys.current();
  if (key.keyId !== active) {
    throw new PaiBotError("intern", { text: "Der Signaturschlüssel ist nicht der aktive." });
  }
  return key;
}

async function requireStoredKey(tx: Tx, keyId: KeyId, publicKey: string): Promise<void> {
  const row = await tx.query.installationKeys.findFirst({
    where: (t, { eq }) => eq(t.id, keyId),
    columns: { publicKey: true },
  });
  if (row === undefined || row.publicKey !== publicKey) {
    throw new PaiBotError("intern", { text: "Der Schlüssel ist nicht gespeichert." });
  }
}

/** Wie oft das Ereignis bei einer gleichzeitig vergebenen Nummer neu versucht wird. */
const EVENT_ATTEMPTS = 3;

/**
 * Hängt `beleg.created` an die Ereignisse der Unterhaltung an und weckt die Zuhörer. Läuft in
 * einem Sicherungspunkt: scheitert das Ereignis (z. B. weil die Unterhaltung gelöscht ist), bleibt
 * der Beleg trotzdem bestehen.
 */
async function announce(
  tx: Tx,
  body: ReceiptBody,
  conversationId: ConversationId,
  target: Record<string, unknown>,
): Promise<void> {
  if (body.type !== "decision" && body.type !== "result") return;
  const runId = isId("run", target.runId) ? target.runId : null;
  const messageId = isId("message", target.messageId) ? target.messageId : undefined;
  const payload = {
    belegId: body.id,
    action: body.action.type,
    ...(messageId === undefined ? {} : { messageId }),
  };

  for (let attempt = 0; attempt < EVENT_ATTEMPTS; attempt++) {
    try {
      await tx.transaction(async (sp) => {
        const conversation = await sp.query.conversations.findFirst({
          where: (t, { eq }) => eq(t.id, conversationId),
          columns: { id: true },
        });
        if (conversation === undefined) return;
        const last = await sp.query.conversationEvents.findFirst({
          where: (t, { eq }) => eq(t.conversationId, conversation.id),
          orderBy: (t, { desc }) => [desc(t.seq)],
          columns: { seq: true },
        });
        await sp.insert(conversationEvents).values({
          conversationId: conversation.id,
          seq: (last?.seq ?? 0) + 1,
          runId,
          type: "beleg.created",
          payload,
        });
        // Die Kennung ist geprüft (nur Kleinbuchstaben, Ziffern, Unterstrich).
        await sp.execute(`select pg_notify('${EVENT_NOTIFY_CHANNEL}', '${conversation.id}')`);
      });
      return;
    } catch {
      // nächster Versuch; nach dem letzten bleibt der Beleg ohne Ereignis
    }
  }
}

function toEntry(row: BelegRow): ReceiptEntry {
  return {
    seq: row.seq,
    id: row.id,
    hash: row.hash,
    signature: row.signature,
    keyId: row.keyId,
    body: row.body,
  };
}
