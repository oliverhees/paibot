/**
 * PaiBot – Antwort des Bots während des Stroms: Text-Stücke bündeln, Nachricht anlegen und als
 * Ereignisse `text.delta` schreiben.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { type Database, repo } from "@paibot/db";
import type { ConversationId, MessageId, RunId } from "@paibot/shared/ids";

/**
 * Fehler beim Schreiben in die Datenbank während eines Laufs. Er wird durch das Tor hindurch
 * weitergereicht und von `executeRun` als ursprünglicher Fehler geworfen.
 */
export class RunDatabaseError extends Error {
  constructor(cause: unknown) {
    super("Datenbank", { cause });
    this.name = "RunDatabaseError";
  }
}

/** Führt einen Schreibvorgang aus; jeder Fehler wird zu `RunDatabaseError`. */
export async function write<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw error instanceof RunDatabaseError ? error : new RunDatabaseError(error);
  }
}

export interface AnswerStream {
  /** Nimmt ein Text-Stück an; geschrieben wird gebündelt. */
  push(text: string): Promise<void>;
  /** Schreibt alles Gesammelte und wartet auf alle Schreibvorgänge. */
  flush(): Promise<void>;
  /** Die Nachricht des Bots, sobald sie angelegt ist. */
  readonly messageId: MessageId | undefined;
  /** Der ganze bisher angenommene Text. */
  readonly text: string;
  /** Legt die Nachricht an, falls noch nicht geschehen (Status `streaming`, Ereignis `message.created`). */
  ensureMessage(): Promise<MessageId>;
  dispose(): void;
}

/**
 * Sammelt Text-Stücke und schreibt sie als `text.delta`, sobald `flushChars` Zeichen beisammen
 * sind oder das erste gesammelte Stück `flushMs` alt ist. Die Nachricht des Bots entsteht mit dem
 * ersten geschriebenen Stück (`streaming`, leerer Text, Ereignis `message.created`). Alle
 * Schreibvorgänge laufen nacheinander, jeder in seiner eigenen kurzen Transaktion.
 */
export function createAnswerStream(input: {
  db: Database;
  conversationId: ConversationId;
  runId: RunId;
  flushMs: number;
  flushChars: number;
}): AnswerStream {
  const { db, conversationId, runId } = input;
  let buffer = "";
  let full = "";
  let messageId: MessageId | undefined;
  let creating: Promise<MessageId> | undefined;
  let chain: Promise<void> = Promise.resolve();
  let failure: unknown;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const ensureMessage = (): Promise<MessageId> => {
    creating ??= write(() =>
      repo.withTransaction(db, async (tx) => {
        const message = await repo.messages.insert(tx, {
          conversationId,
          role: "assistant",
          status: "streaming",
          runId,
        });
        await repo.events.append(tx, {
          conversationId,
          type: "message.created",
          data: { messageId: message.id, role: "assistant", text: "" },
          runId,
        });
        return message.id;
      }),
    ).then((id) => {
      messageId = id;
      return id;
    });
    return creating;
  };

  const enqueue = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (buffer === "") return;
    const text = buffer;
    buffer = "";
    chain = chain.then(async () => {
      if (failure !== undefined) return;
      try {
        const id = await ensureMessage();
        await write(() =>
          repo.events.append(db, {
            conversationId,
            type: "text.delta",
            data: { runId, messageId: id, text },
          }),
        );
      } catch (error) {
        failure = error;
      }
    });
  };

  const throwFailure = () => {
    if (failure !== undefined) throw failure;
  };

  return {
    async push(text) {
      throwFailure();
      if (text === "") return;
      buffer += text;
      full += text;
      if (buffer.length >= input.flushChars) {
        enqueue();
        return;
      }
      if (timer === undefined) {
        timer = setTimeout(enqueue, input.flushMs);
        timer.unref?.();
      }
    },
    async flush() {
      enqueue();
      await chain;
      throwFailure();
    },
    get messageId() {
      return messageId;
    },
    get text() {
      return full;
    },
    ensureMessage,
    dispose() {
      if (timer !== undefined) clearTimeout(timer);
    },
  };
}
