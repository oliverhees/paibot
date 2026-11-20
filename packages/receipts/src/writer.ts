/**
 * PaiBot – Belege unter Sperre an die Kette in der Datenbank anhängen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { BELEGE_LOCK_KEY, belege, type Database, repo } from "@paibot/db";
import type { DecisionRecord, ReceiptRef, ReceiptWriter, ResultRecord } from "@paibot/gate";
import { type ReceiptBody, type ReceiptEntry, ZERO_PREV } from "@paibot/shared/belege";
import { isPaiBotError, PaiBotError } from "@paibot/shared/fehler";
import { toIsoTime } from "@paibot/shared/grundtypen";
import {
  type ConversationId,
  type InstallationId,
  isId,
  type KeyId,
  newId,
} from "@paibot/shared/ids";
import { t } from "@paibot/shared/texte";
import { buildReceipt, type ReceiptDraft } from "./build";
import { hashReceipt } from "./hash";
import { signReceipt } from "./server";

/** Nummer der Transaktions-Sperre, unter der Belege angehängt werden. */
export const RECEIPT_LOCK_ID = BELEGE_LOCK_KEY;

/** Ein Signaturschlüssel mit seinem entschlüsselten privaten Teil (nur im Speicher). */
export interface SigningKeyRef {
  keyId: KeyId;
  privateKey: string;
}

/**
 * Liefert den Schlüssel, mit dem neue Belege signiert werden. Der Schreiber ruft `current()` vor
 * seiner Transaktion auf, nie unter der Sperre. `refresh()` (falls vorhanden) ruft er nach einem
 * Schlüsselwechsel auf und wenn der gelieferte Schlüssel nicht mehr der aktive der Kette ist.
 */
export interface ReceiptKeys {
  current(): Promise<SigningKeyRef>;
  refresh?(): Promise<void> | void;
}

/**
 * Hält den Signaturschlüssel im Speicher: `load` läuft beim ersten Bedarf einmal (z. B. aus der
 * Datenbank lesen und entschlüsseln) und danach erst wieder nach `refresh()`. Schlägt `load` fehl,
 * wird beim nächsten Aufruf neu geladen.
 */
export function cachedReceiptKeys(
  load: () => Promise<SigningKeyRef>,
): ReceiptKeys & { refresh(): Promise<void> } {
  let cached: Promise<SigningKeyRef> | undefined;
  const get = (): Promise<SigningKeyRef> => {
    if (cached === undefined) {
      const loading = load();
      cached = loading;
      loading.catch(() => {
        if (cached === loading) cached = undefined;
      });
    }
    return cached;
  };
  return {
    current: get,
    refresh: async () => {
      cached = undefined;
      await get();
    },
  };
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
 * Baut den Schreiber. Der Signaturschlüssel kommt vor der Transaktion aus `keys.current()`. Jedes
 * Anhängen läuft dann in einer Transaktion mit `pg_advisory_xact_lock(RECEIPT_LOCK_ID)`: Kopf
 * lesen, Körper bauen (`buildReceipt`), hashen, signieren, einfügen, danach Ereignis
 * `beleg.created` über `repo.events.append`, wenn der Beleg zu einer Unterhaltung gehört.
 *
 * Sperr-Reihenfolge (immer gleich): erst die Beleg-Sperre, dann die Zeile der Unterhaltung (in
 * `events.append`). Wer selbst eine Transaktion offen hält, in der er schon `events.append` oder
 * eine andere Änderung an der Unterhaltung gemacht hat, ruft das Tor (und damit den Schreiber)
 * erst nach dem Bestätigen auf, nicht in derselben oder einer anderen Verbindung davor.
 *
 * Zusagen: Auch bei gleichzeitigen Schreibern (web und worker) bleibt die Kette lückenlos und
 * unverzweigt. Belege enthalten nie Inhalte von Nachrichten. Ihre Spalten (`seq`, `action_id`,
 * `action`, `actor`, `conversation_id`) stammen aus dem signierten Körper.
 */
export function createReceiptWriter(db: Database, keys: ReceiptKeys): ReceiptChainWriter {
  return {
    appendStart: (input) =>
      append(db, input.time, async (tx, chain) => {
        if (chain.head !== undefined) {
          throw new PaiBotError("einrichtung_fertig", { text: t("belege.kette.start_vorhanden") });
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

    appendKeyChange: async (input) => {
      const ref = await append(db, input.time, async (tx, chain) => {
        const active = requireStarted(chain);
        const previousKeyId = input.previous?.keyId ?? active;
        if (previousKeyId !== active) {
          throw new PaiBotError("intern", { text: t("belege.schluessel.nicht_aktiv") });
        }
        if (input.next.keyId === active) {
          throw new PaiBotError("intern", { text: t("belege.schluessel.schon_aktiv") });
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
      });
      await keys.refresh?.();
      return ref;
    },

    appendDecision: (record: DecisionRecord) =>
      appendSigned(db, keys, record.time, {
        type: "decision",
        action: record.action,
        decision: record.decision,
        facts: record.facts,
        ...(record.context === undefined ? {} : { context: record.context }),
        ...(record.undo === undefined ? {} : { undo: record.undo }),
      }),

    appendResult: (record: ResultRecord) =>
      appendSigned(db, keys, record.time, {
        type: "result",
        action: record.action,
        result: record.result,
        ...(record.undo === undefined ? {} : { undo: record.undo }),
      }),

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

/** Der vorab geladene Schlüssel ist nicht (mehr) der aktive der Kette. */
class StaleKeyError extends Error {}

/**
 * Entscheidung oder Ergebnis anhängen: Schlüssel vor der Transaktion holen; ist er unter der Sperre
 * nicht der aktive (z. B. nach einem Schlüsselwechsel in einem anderen Prozess), einmal mit
 * `keys.refresh()` neu laden und noch einmal versuchen.
 */
async function appendSigned(
  db: Database,
  keys: ReceiptKeys,
  time: Date,
  draft: ReceiptDraft,
): Promise<ReceiptRef> {
  const attempt = async (key: SigningKeyRef) =>
    append(db, time, async (_tx, chain) => {
      if (key.keyId !== requireStarted(chain)) throw new StaleKeyError();
      return { draft, key };
    });
  try {
    return await attempt(await keys.current());
  } catch (error) {
    if (!(error instanceof StaleKeyError)) throw error;
    if (keys.refresh !== undefined) {
      await keys.refresh();
      try {
        return await attempt(await keys.current());
      } catch (retryError) {
        if (!(retryError instanceof StaleKeyError)) throw retryError;
      }
    }
    throw new PaiBotError("intern", { text: t("belege.schluessel.signierer_nicht_aktiv") });
  }
}

/**
 * Hängt einen Eintrag in einer eigenen Transaktion unter der Sperre `RECEIPT_LOCK_ID` an. Wird
 * `db` als Transaktion übergeben, entsteht ein Sicherungspunkt in ihr. Der Signaturschlüssel ist
 * vorher geladen; unter der Sperre wird nichts außerhalb der Transaktion geholt.
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
    throw new PaiBotError("einrichtung_offen", { text: t("belege.kette.ohne_start") });
  }
  return chain.activeKeyId;
}

async function requireStoredKey(tx: Tx, keyId: KeyId, publicKey: string): Promise<void> {
  const row = await tx.query.installationKeys.findFirst({
    where: (t, { eq }) => eq(t.id, keyId),
    columns: { publicKey: true },
  });
  if (row === undefined || row.publicKey !== publicKey) {
    throw new PaiBotError("intern", { text: t("belege.schluessel.nicht_gespeichert") });
  }
}

/**
 * Hängt `beleg.created` über den Datenzugriff (`repo.events.append`) an die Ereignisse der
 * Unterhaltung an; dort werden die Nummer vergeben und die Zuhörer geweckt. `append` läuft in
 * einem eigenen Sicherungspunkt. Gibt es die Unterhaltung nicht (mehr), bleibt der Beleg ohne
 * Ereignis bestehen; jeder andere Fehler bricht das Anhängen ab (dann gibt es auch keinen Beleg).
 *
 * Sperr-Reihenfolge: erst die Beleg-Sperre, dann die Zeile der Unterhaltung. Wer selbst eine
 * Transaktion mit `events.append` offen hält, ruft das Tor deshalb nicht auf einer anderen
 * Verbindung auf, bevor er bestätigt hat.
 */
async function announce(
  tx: Tx,
  body: ReceiptBody,
  conversationId: ConversationId,
  target: Record<string, unknown>,
): Promise<void> {
  if (body.type !== "decision" && body.type !== "result") return;
  const runId = isId("run", target.runId) ? target.runId : undefined;
  const messageId = isId("message", target.messageId) ? target.messageId : undefined;
  try {
    await repo.events.append(tx, {
      conversationId,
      type: "beleg.created",
      data: {
        belegId: body.id,
        action: body.action.type,
        ...(messageId === undefined ? {} : { messageId }),
      },
      ...(runId === undefined ? {} : { runId }),
    });
  } catch (error) {
    if (!(isPaiBotError(error) && error.code === "nicht_gefunden")) throw error;
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
