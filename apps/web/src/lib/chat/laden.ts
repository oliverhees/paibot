/**
 * PaiBot – Lesen für den Chat auf dem Server: Unterhaltungen der Seitenleiste, Verlauf einer
 * Unterhaltung in einem Lesestand (samt laufender Antwort), Belege in kurzer Form, Bereitschaft.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { type Database, repo } from "@paibot/db";
import type { ReceiptEntry } from "@paibot/shared/belege";
import type { ConversationEvent } from "@paibot/shared/ereignisse";
import type { ConversationId, ModelId } from "@paibot/shared/ids";
import type { Conversation, Settings } from "@paibot/shared/objekte";
import { t } from "@paibot/shared/texte";
import type {
  BelegKurz,
  ChatBereitschaft,
  ChatVerlauf,
  ModellInfo,
  ModellWahl,
  UnterhaltungInfo,
  UnterhaltungKurz,
} from "./typen";

/** So viele Unterhaltungen zeigt die Seitenleiste. */
export const UNTERHALTUNGEN_GRENZE = 100;
/** So viele Belege zeigt die Arbeitsfläche je Unterhaltung. */
export const BELEGE_GRENZE = 200;
/** So viele beendete Läufe werden auf Hinweise ohne Antwort geprüft. */
export const LAEUFE_GRENZE = 50;
/** Fenster beim Rückwärtssuchen nach dem Anfang des aktiven Laufs. */
const FENSTER = 500;

const LESESTAND = { isolationLevel: "repeatable read", accessMode: "read only" } as const;

/** Unterhaltungen des Standard-Bots, zuletzt benutzte bzw. neueste zuerst. */
export async function ladeUnterhaltungen(db: Database): Promise<UnterhaltungKurz[]> {
  const settings = await repo.settings.get(db);
  const botId = settings?.defaultBotId;
  if (botId === undefined) return [];
  const liste = await repo.conversations.list(db, { botId, limit: UNTERHALTUNGEN_GRENZE });
  return liste
    .map((u) => ({ id: u.id, titel: u.title, zuletzt: u.lastMessageAt ?? u.createdAt }))
    .sort((a, b) => (a.zuletzt < b.zuletzt ? 1 : a.zuletzt > b.zuletzt ? -1 : 0));
}

/** Modus der Datenschleuse, der für die Unterhaltung gilt. */
export function schleuseVon(
  u: Conversation,
  settings: Settings | undefined,
): UnterhaltungInfo["schleuse"] {
  return u.schleuseMode ?? settings?.schleuseModeDefault ?? "off";
}

export function unterhaltungInfo(
  u: Conversation,
  settings: Settings | undefined,
): UnterhaltungInfo {
  return { id: u.id, titel: u.title, schleuse: schleuseVon(u, settings) };
}

/** Beleg in kurzer Form (nur Entscheidung und Ergebnis haben eine Aktion). */
export function belegKurz(eintrag: ReceiptEntry): BelegKurz | undefined {
  const body = eintrag.body;
  if (body.type !== "decision" && body.type !== "result") return undefined;
  const ziel = body.action.target as Record<string, unknown>;
  const runId = typeof ziel.runId === "string" ? ziel.runId : undefined;
  const messageId = typeof ziel.messageId === "string" ? ziel.messageId : undefined;
  const kurz: BelegKurz = {
    id: eintrag.id,
    vollstaendig: true,
    seq: eintrag.seq,
    art: body.type,
    aktion: body.action.type,
    zeit: body.time,
    akteur: body.action.actor === "besitzer" ? "besitzer" : "bot",
    ...(runId === undefined ? {} : { runId }),
    ...(messageId === undefined ? {} : { messageId }),
  };
  if (body.type === "decision") {
    kurz.entscheidung = {
      outcome: body.decision.outcome,
      regeln: body.decision.rules.map((r) => ({ id: r.id, version: r.version })),
      grund: body.decision.reason,
    };
  } else {
    kurz.ergebnis = {
      status: body.result.status,
      ...(body.result.code === undefined ? {} : { code: body.result.code }),
    };
  }
  return kurz;
}

/** Belege der Unterhaltung, neueste zuerst. */
export async function ladeBelege(db: Database, id: ConversationId): Promise<BelegKurz[]> {
  const seite = await repo.belege.listPage(db, { conversationId: id, limit: BELEGE_GRENZE });
  return seite.items.map(belegKurz).filter((b): b is BelegKurz => b !== undefined);
}

/**
 * Ereignisse des aktiven Laufs ab seinem `run.queued`. Gesucht wird rückwärts in Fenstern ab der
 * letzten Nummer; meist liegt der Anfang im ersten Fenster.
 */
async function laufEreignisse(
  db: Database,
  id: ConversationId,
  runId: string,
  bis: number,
): Promise<ConversationEvent[]> {
  let gesammelt: ConversationEvent[] = [];
  let oben = bis;
  while (oben > 0) {
    const unten = Math.max(0, oben - FENSTER);
    const fenster = await repo.events.listSince(db, id, { afterSeq: unten, limit: oben - unten });
    gesammelt = [...fenster.filter((e) => e.seq <= oben), ...gesammelt];
    const start = gesammelt.findIndex((e) => e.type === "run.queued" && e.data.runId === runId);
    if (start >= 0) return gesammelt.slice(start);
    oben = unten;
  }
  return gesammelt.filter((e) => e.runId === runId);
}

/**
 * Verlauf einer Unterhaltung in einem einzigen Lesestand: Nachrichten, Läufe, Ereignisse des
 * aktiven Laufs, letzte Nummer und Belege passen so zusammen; was danach kommt, liefert der
 * Ereignis-Strom ab `letzteSeq`. `undefined`, wenn es die Unterhaltung nicht gibt.
 */
export async function ladeVerlauf(
  db: Database,
  id: ConversationId,
): Promise<ChatVerlauf | undefined> {
  return db.transaction(async (tx) => {
    const unterhaltung = await repo.conversations.get(tx, id);
    if (unterhaltung === undefined) return undefined;
    const settings = await repo.settings.get(tx);
    const letzteSeq = await repo.events.lastSeq(tx, id);
    const nachrichten = await repo.messages.listForConversation(tx, id);
    const alleLaeufe = await repo.runs.listForConversation(tx, id, { limit: LAEUFE_GRENZE });
    const aktiverLauf = await repo.runs.getActive(tx, id);
    const ereignisse =
      aktiverLauf === undefined ? [] : await laufEreignisse(tx, id, aktiverLauf.id, letzteSeq);
    const belege = await ladeBelege(tx, id);

    const modellIds = new Set(
      nachrichten.map((m) => m.modelId).filter((m): m is ModelId => m !== undefined),
    );
    const modelle: Record<string, ModellInfo> = {};
    for (const modelId of modellIds) {
      const info = await modellInfo(tx, modelId);
      if (info) modelle[modelId] = info;
    }
    return {
      unterhaltung: unterhaltungInfo(unterhaltung, settings),
      nachrichten,
      laeufe: alleLaeufe.filter((l) => l.id !== aktiverLauf?.id),
      ...(aktiverLauf === undefined ? {} : { aktiverLauf }),
      ereignisse,
      letzteSeq,
      belege,
      modelle,
    };
  }, LESESTAND);
}

/** Name und Herkunft eines Modells (Herkunft = Region seines Anbieters). */
export async function modellInfo(db: Database, modelId: ModelId): Promise<ModellInfo | undefined> {
  const modell = await repo.models.get(db, modelId);
  if (modell === undefined) return undefined;
  const anbieter = await repo.providers.get(db, modell.providerId);
  return { name: modell.displayName, region: anbieter?.region ?? "eu" };
}

/** Kann der Bot antworten? Modell, Schlüssel, Datenschleuse und Zeitzone für die Oberfläche. */
export async function ladeBereitschaft(
  db: Database,
  schleuseInstalliert: boolean,
): Promise<ChatBereitschaft> {
  const settings = await repo.settings.get(db);
  const bot = await repo.bots.getDefault(db);
  let modell: ModellInfo | undefined;
  let schluessel = false;
  if (bot?.modelId !== undefined) {
    const m = await repo.models.get(db, bot.modelId);
    if (m !== undefined) {
      const anbieter = await repo.providers.get(db, m.providerId);
      modell = { name: m.displayName, region: anbieter?.region ?? "eu" };
      schluessel = anbieter?.keySet === true || anbieter?.region === "local";
    }
  }
  const anbieter = new Map((await repo.providers.list(db)).map((p) => [p.id, p]));
  const waehlbar: ModellWahl[] = [];
  for (const m of await repo.models.list(db, { enabledOnly: true })) {
    const p = anbieter.get(m.providerId);
    if (p === undefined || !p.enabled || !(p.keySet || p.region === "local")) continue;
    waehlbar.push({ id: m.id, name: m.displayName, region: p.region });
  }
  return {
    ...(bot?.modelId === undefined ? {} : { modellId: bot.modelId }),
    waehlbar,
    botName: bot?.name ?? t("einrichtung.bot.vorschlag"),
    botFarbe: bot?.color ?? "limette",
    ...(modell === undefined ? {} : { modell }),
    schluessel,
    schleuseInstalliert,
    schleuseStandard: settings?.schleuseModeDefault ?? "off",
    zeitzone: settings?.timezone ?? "Europe/Berlin",
  };
}
