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
import type { BotId, ConversationId, MessageId, ModelId, RunId } from "@paibot/shared/ids";
import type { Conversation, Provider, Settings } from "@paibot/shared/objekte";
import { t } from "@paibot/shared/texte";
import { anbieterHerkunft, type UnterAnbieterListe } from "../modelle/herkunft";
import { type RegelVorgabe, vorgabeAus } from "../modelle/vorgabe";
import type {
  BelegKurz,
  ChatBereitschaft,
  ChatVerlauf,
  LaufWerkzeuge,
  ModellInfo,
  ModellWahl,
  UnterhaltungInfo,
  UnterhaltungKurz,
  WerkzeugAnzeige,
} from "./typen";
import { werkzeugeAnzeigen } from "./werkzeug-anzeige";

/** So viele Unterhaltungen zeigt die Seitenleiste. */
export const UNTERHALTUNGEN_GRENZE = 100;
/** So viele Belege zeigt die Arbeitsfläche je Unterhaltung. */
export const BELEGE_GRENZE = 200;
/** So viele beendete Läufe werden auf Hinweise ohne Antwort geprüft. */
export const LAEUFE_GRENZE = 50;
/** Fenster beim Rückwärtssuchen nach dem Anfang des aktiven Laufs. */
const FENSTER = 500;

const LESESTAND = { isolationLevel: "repeatable read", accessMode: "read only" } as const;

/**
 * Unterhaltungen aller Bots, zuletzt benutzte bzw. neueste zuerst, jede mit ihrem Bot. Die
 * Seitenleiste gruppiert sie danach; Fäden eines Teams gehören keinem Bot und bleiben draußen.
 */
export async function ladeUnterhaltungen(db: Database): Promise<UnterhaltungKurz[]> {
  const liste = await repo.conversations.list(db, { limit: UNTERHALTUNGEN_GRENZE });
  return liste
    .filter((u) => u.botId !== undefined)
    .map((u) => ({
      id: u.id,
      titel: u.title,
      zuletzt: u.lastMessageAt ?? u.createdAt,
      ...(u.botId === undefined ? {} : { botId: u.botId }),
    }))
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
  return {
    id: u.id,
    titel: u.title,
    ...(u.botId === undefined ? {} : { botId: u.botId }),
    schleuse: schleuseVon(u, settings),
  };
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
 *
 * Die Nachrichten sind nur deine und die End-Antworten des Bots. Zwischentexte eines Laufs mit
 * Werkzeugen (`step` gesetzt) kommen nur mit `mitSchritten` dazu, samt den Werkzeug-Aufrufen ihrer
 * Schritte: Das ist die eine Stelle der Web-App, die sie liest (Seite und Lese-Route); die Ansicht
 * trennt sie von den Antworten. Datei und Suche lesen weiter nur End-Antworten.
 */
export async function ladeVerlauf(
  db: Database,
  id: ConversationId,
  optionen: { mitSchritten?: boolean } = {},
): Promise<ChatVerlauf | undefined> {
  const mitSchritten = optionen.mitSchritten === true;
  return db.transaction(async (tx) => {
    const unterhaltung = await repo.conversations.get(tx, id);
    if (unterhaltung === undefined) return undefined;
    const settings = await repo.settings.get(tx);
    const letzteSeq = await repo.events.lastSeq(tx, id);
    const nachrichten = await repo.messages.listForConversation(tx, id, {
      nurAntworten: !mitSchritten,
    });
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
    const werkzeuge = mitSchritten ? await ladeWerkzeuge(tx, nachrichten) : [];
    return {
      unterhaltung: unterhaltungInfo(unterhaltung, settings),
      nachrichten,
      laeufe: alleLaeufe.filter((l) => l.id !== aktiverLauf?.id),
      ...(aktiverLauf === undefined ? {} : { aktiverLauf }),
      ereignisse,
      letzteSeq,
      belege,
      modelle,
      ...(werkzeuge.length === 0 ? {} : { werkzeuge }),
    };
  }, LESESTAND);
}

/**
 * Werkzeug-Aufrufe der Zwischenschritte in `nachrichten` (ein Aufruf hängt immer an der Nachricht
 * seines Schritts), als Projektion für die Anzeige.
 */
async function ladeWerkzeuge(
  db: Database,
  nachrichten: readonly { id: string; step?: number }[],
): Promise<WerkzeugAnzeige[]> {
  const ids = nachrichten.filter((m) => m.step !== undefined).map((m) => m.id as MessageId);
  return werkzeugeAnzeigen(await repo.toolCalls.listForMessages(db, ids));
}

/** So viele letzte Antworten werden beim Lesen eines Laufs auf feste Antworten durchsucht. */
const FESTE_FENSTER = 100;

/**
 * Was die Anzeige zu einem Lauf nachfragt: seine Werkzeug-Aufrufe als Projektion und die
 * Kennungen seiner festen Antworten (Herkunft `fest`). `undefined`, wenn es den Lauf in dieser
 * Unterhaltung nicht gibt. Nie das Ergebnis im Ganzen, nie Texte von Abschnitten.
 */
export async function ladeLaufWerkzeuge(
  db: Database,
  id: ConversationId,
  runId: RunId,
): Promise<LaufWerkzeuge | undefined> {
  return db.transaction(async (tx) => {
    const lauf = await repo.runs.get(tx, runId);
    if (lauf === undefined || lauf.conversationId !== id) return undefined;
    const werkzeuge = werkzeugeAnzeigen(await repo.toolCalls.listForRun(tx, runId));
    const antworten = await repo.messages.listForConversation(tx, id, {
      limit: FESTE_FENSTER,
      nurAntworten: true,
    });
    const feste = antworten
      .filter((m) => m.runId === runId && m.origin === "fest")
      .map((m) => m.id);
    const fremde = antworten
      .filter((m) => m.runId === runId && m.untrusted === true)
      .map((m) => m.id);
    return { werkzeuge, feste, fremde };
  }, LESESTAND);
}

/** Name und Herkunft eines Modells (Herkunft = Region seines Anbieters). */
export async function modellInfo(db: Database, modelId: ModelId): Promise<ModellInfo | undefined> {
  const modell = await repo.models.get(db, modelId);
  if (modell === undefined) return undefined;
  const anbieter = await repo.providers.get(db, modell.providerId);
  return modellInfoVon(
    modell.displayName,
    anbieter,
    anbieter?.templateKey === "eurouter" ? await vorgabeVon(db, modelId) : undefined,
  );
}

/** Gelesene Vorgaben der Regel hinter einem Modell, falls es welche gibt. */
async function vorgabeVon(
  db: Database,
  modelId: ModelId,
  zeitzone?: string,
): Promise<RegelVorgabe | undefined> {
  const gespeichert = await repo.models.rulePolicyOf(db, modelId);
  if (gespeichert === undefined) return undefined;
  const zone = zeitzone ?? (await repo.settings.get(db))?.timezone ?? "Europe/Berlin";
  return vorgabeAus(gespeichert.policy, gespeichert.checkedAt, new Date(), zone);
}

/** Name und belegbare Herkunft; ohne Anbieter nur der Name (nie eine angenommene Region). */
function modellInfoVon(
  name: string,
  anbieter: Provider | undefined,
  vorgabe?: RegelVorgabe,
): ModellInfo {
  if (anbieter === undefined) return { name };
  const kurz = { name: anbieter.name, templateKey: anbieter.templateKey, region: anbieter.region };
  return {
    name,
    herkunft: anbieterHerkunft(kurz),
    anbieter: kurz,
    ...(vorgabe === undefined ? {} : { vorgabe }),
  };
}

/**
 * Kann der Bot antworten? Modell, Schlüssel, Pause, Datenschleuse und Zeitzone für die
 * Oberfläche. `botId` wählt den Bot; ohne Angabe ist es der Standard-Bot – er bleibt die Vorgabe
 * für eine neue Unterhaltung, aber nicht die einzige Wahl.
 */
export async function ladeBereitschaft(
  db: Database,
  schleuseInstalliert: boolean,
  unterAnbieter?: (anbieter: Provider) => Promise<UnterAnbieterListe | undefined>,
  botId?: BotId,
): Promise<ChatBereitschaft> {
  const settings = await repo.settings.get(db);
  const bot = botId === undefined ? await repo.bots.getDefault(db) : await repo.bots.get(db, botId);
  let modell: ModellInfo | undefined;
  let schluessel = false;
  if (bot?.modelId !== undefined) {
    const m = await repo.models.get(db, bot.modelId);
    if (m !== undefined) {
      const anbieter = await repo.providers.get(db, m.providerId);
      modell = modellInfoVon(
        m.displayName,
        anbieter,
        anbieter?.templateKey === "eurouter"
          ? await vorgabeVon(db, m.id as ModelId, settings?.timezone)
          : undefined,
      );
      schluessel = anbieter?.keySet === true || anbieter?.region === "local";
    }
  }
  const anbieter = new Map((await repo.providers.list(db)).map((p) => [p.id, p]));
  const waehlbar: ModellWahl[] = [];
  for (const m of await repo.models.list(db, { enabledOnly: true })) {
    const p = anbieter.get(m.providerId);
    if (p === undefined || !p.enabled || !(p.keySet || p.region === "local")) continue;
    waehlbar.push({
      id: m.id,
      ...modellInfoVon(m.displayName, p, await vorgabeVon(db, m.id as ModelId, settings?.timezone)),
    });
  }
  const eurouter = [...anbieter.values()].find((p) => p.templateKey === "eurouter");
  const liste =
    eurouter === undefined || unterAnbieter === undefined
      ? undefined
      : await unterAnbieter(eurouter);
  const belegeGesamt = (await repo.belege.head(db))?.seq ?? 0;
  const appNamen = Object.fromEntries(
    (await repo.apps.list(db)).map((app) => [app.shortName, app.name]),
  );
  return {
    ...(Object.keys(appNamen).length === 0 ? {} : { appNamen }),
    ...(bot?.modelId === undefined ? {} : { modellId: bot.modelId }),
    belegeGesamt,
    waehlbar,
    ...(bot === undefined ? {} : { botId: bot.id }),
    botName: bot?.name ?? t("einrichtung.bot.vorschlag"),
    botFarbe: bot?.color ?? "limette",
    pausiert: bot?.paused === true,
    ...(modell === undefined ? {} : { modell }),
    ...(liste === undefined ? {} : { unterAnbieter: liste }),
    schluessel,
    schleuseInstalliert,
    schleuseStandard: settings?.schleuseModeDefault ?? "off",
    zeitzone: settings?.timezone ?? "Europe/Berlin",
  };
}
