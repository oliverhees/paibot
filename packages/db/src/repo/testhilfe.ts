/**
 * PaiBot – Hilfen für die Tests der Zugriffsfunktionen: Beispiel-Bot, -Unterhaltung und -Nachricht anlegen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { BotId, ConversationId, MessageId } from "@paibot/shared";
import { expect } from "vitest";
import type { Database } from "../client";
import { bots, conversations, messages } from "../schema";
import { botRow, conversationRow, messageRow } from "../testdaten";
import * as laeufe from "./laeufe";
import * as nachrichten from "./nachrichten";
import * as suche from "./suche";
import * as konversationen from "./unterhaltungen";

/** Legt Bot, Unterhaltung und eine Nutzer-Nachricht an und gibt die Zeilen zurück. */
export async function beispiel(db: Database) {
  const [bot] = await db.insert(bots).values(botRow()).returning();
  if (bot === undefined) throw new Error("Bot fehlt");
  const [unterhaltung] = await db.insert(conversations).values(conversationRow(bot.id)).returning();
  if (unterhaltung === undefined) throw new Error("Unterhaltung fehlt");
  const [nachricht] = await db.insert(messages).values(messageRow(unterhaltung.id)).returning();
  if (nachricht === undefined) throw new Error("Nachricht fehlt");
  return { bot, unterhaltung, nachricht };
}

/** Ein Fehler mit diesem Code der Verträge. */
export function mitCode(code: string) {
  return expect.objectContaining({ code });
}

/**
 * Legt einen Lauf zu einer Nachricht der Person an, mit Zwischentexten (`step` 0, 1, …) und
 * optional einer End-Antwort, und beendet ihn. So sehen die Zeilen eines Laufs mit Werkzeugen aus.
 */
export async function laufMitZwischentexten(
  db: Database,
  eingabe: {
    conversationId: ConversationId;
    botId: BotId;
    triggerMessageId: MessageId;
    /** Text je Zwischentext; er bekommt die Kennung des Laufs angehängt, damit er eindeutig ist. */
    zwischentexte: readonly string[];
    antwort?: string;
    ende: "succeeded" | "cancelled";
  },
) {
  const lauf = await laeufe.create(db, {
    conversationId: eingabe.conversationId,
    triggerMessageId: eingabe.triggerMessageId,
    botId: eingabe.botId,
  });
  await laeufe.markRunning(db, lauf.id);
  for (const [step, text] of eingabe.zwischentexte.entries()) {
    await nachrichten.insert(db, {
      conversationId: eingabe.conversationId,
      role: "assistant",
      content: `${text} ${lauf.id.slice(-4)}-${step}`,
      runId: lauf.id,
      step,
    });
  }
  if (eingabe.antwort !== undefined) {
    await nachrichten.insert(db, {
      conversationId: eingabe.conversationId,
      role: "assistant",
      content: eingabe.antwort,
      runId: lauf.id,
    });
  }
  await laeufe.finish(db, lauf.id, { status: eingabe.ende });
  return lauf;
}

/**
 * Suchwort in einer Nachricht der Person, in zwei End-Antworten und in fünf Zwischentexten:
 * nur die drei ersten sind Treffer, auch beim Blättern. Läuft gegen PGlite (`suche.test.ts`) und gegen
 * echtes Postgres (`postgres.test.ts`).
 */
export async function pruefeZwischentexte(db: Database, botId: BotId) {
  const unterhaltung = (await konversationen.create(db, { botId, title: "Beet" })).id;
  const frage = await nachrichten.insert(db, {
    conversationId: unterhaltung,
    role: "user",
    content: "Suchwort in der Frage",
  });
  const lauf = (
    zwischentexte: string[],
    antwort: string | undefined,
    ende: "succeeded" | "cancelled",
  ) =>
    laufMitZwischentexten(db, {
      conversationId: unterhaltung,
      botId,
      triggerMessageId: frage.id,
      zwischentexte,
      ...(antwort === undefined ? {} : { antwort }),
      ende,
    });
  await lauf(
    ["Suchwort im Zwischentext", "Suchwort im Zwischentext", "Suchwort im Zwischentext"],
    "Suchwort in Antwort 1",
    "succeeded",
  );
  await lauf([], "Suchwort in Antwort 2", "succeeded");
  // Der neueste Lauf hat nur Zwischentexte; ohne Filter stünden sie in der Treffer-Liste ganz oben.
  await lauf(["Suchwort im Zwischentext", "Suchwort im Zwischentext"], undefined, "cancelled");

  const alle = await suche.messageHits(db, "suchwort", { limit: 10, offset: 0 });
  expect(alle.hits.map((h) => h.excerpt)).toEqual([
    "Suchwort in Antwort 2",
    "Suchwort in Antwort 1",
    "Suchwort in der Frage",
  ]);
  expect(alle.more).toBe(false);
  const eins = await suche.messageHits(db, "suchwort", { limit: 2, offset: 0 });
  const zwei = await suche.messageHits(db, "suchwort", { limit: 2, offset: 2 });
  expect(eins.hits).toHaveLength(2);
  expect(eins.more).toBe(true);
  expect(zwei.hits.map((h) => h.excerpt)).toEqual(["Suchwort in der Frage"]);
  expect(zwei.more).toBe(false);
  expect(await suche.messageHits(db, "zwischentext", { limit: 10, offset: 0 })).toEqual({
    hits: [],
    more: false,
  });
}
