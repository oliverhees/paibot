/**
 * PaiBot – Vorläufiger Text eines Schritts mit Werkzeugen: Text-Stücke bündeln und als
 * `draft.delta` schreiben. Es entsteht dabei keine Nachricht; die Nachricht des Schritts schreibt
 * erst das Schritt-Ende.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { type Database, repo } from "@paibot/db";
import type { ConversationId, RunId } from "@paibot/shared/ids";
import { write } from "./strom";

export interface DraftStream {
  /** Nimmt ein Text-Stück an; geschrieben wird gebündelt. */
  push(text: string): Promise<void>;
  /** Schreibt alles Gesammelte und wartet auf alle Schreibvorgänge. */
  flush(): Promise<void>;
  /** Der ganze bisher angenommene Text dieses Schritts. */
  readonly text: string;
  dispose(): void;
}

/** In Stücke von höchstens `size` Zeichen teilen (nie mitten in einem Zeichen). */
export function pieces(text: string, size: number): string[] {
  const chars = Array.from(text);
  const out: string[] = [];
  const step = Math.max(1, Math.floor(size));
  for (let i = 0; i < chars.length; i += step) out.push(chars.slice(i, i + step).join(""));
  return out;
}

/**
 * Sammelt Text-Stücke eines Schritts und schreibt sie als `draft.delta { runId, step, text }`,
 * sobald `flushChars` Zeichen beisammen sind oder das erste gesammelte Stück `flushMs` alt ist;
 * jedes Ereignis trägt höchstens `flushChars` Zeichen. Alle Schreibvorgänge laufen nacheinander,
 * jeder in seiner eigenen kurzen Transaktion (Muster: `createAnswerStream`).
 */
export function createDraftStream(input: {
  db: Database;
  conversationId: ConversationId;
  runId: RunId;
  step: number;
  flushMs: number;
  flushChars: number;
}): DraftStream {
  const { db, conversationId, runId, step } = input;
  let buffer = "";
  let full = "";
  let chain: Promise<void> = Promise.resolve();
  let failure: unknown;
  let timer: ReturnType<typeof setTimeout> | undefined;

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
        for (const piece of pieces(text, input.flushChars)) {
          await write(() =>
            repo.events.append(db, {
              conversationId,
              type: "draft.delta",
              data: { runId, step, text: piece },
            }),
          );
        }
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
    get text() {
      return full;
    },
    dispose() {
      if (timer !== undefined) clearTimeout(timer);
    },
  };
}
