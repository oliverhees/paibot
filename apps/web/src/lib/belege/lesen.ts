/**
 * PaiBot – Belege und Regeln lesen (nur Server): Liste mit Blättern, Beleg mit Umfeld, Schlüssel-
 * Belege, Kette in Stücken im Format des Exports, Regel-Fassungen zum Nachrechnen. Nur Lesen, nie
 * Inhalte von Unterhaltungen (die stehen nicht in Belegen).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { type Database, repo } from "@paibot/db";
import { currentAnchor } from "@paibot/receipts";
import type { RuleVersion } from "@paibot/receipts/pruefen";
import type {
  ChainAnchor,
  PublicKeyInfo,
  ReceiptEntry,
  ReceiptExportHeader,
} from "@paibot/shared/belege";
import {
  RECEIPT_CHAIN_PAGE,
  type ReceiptChainQuery,
  type ReceiptListQuery,
} from "@paibot/shared/eingaben";
import { PaiBotError } from "@paibot/shared/fehler";
import { isId } from "@paibot/shared/ids";
import { STANDARD_RULE_VERSIONS } from "@paibot/shared/tor";
import type { RegelDaten } from "./pruefung";

/** Größtes Stück der Kette je Anfrage. */
export const KETTE_STUECK_MAX = RECEIPT_CHAIN_PAGE.max;
/** Standardgröße eines Stücks. */
export const KETTE_STUECK = RECEIPT_CHAIN_PAGE.default;
/** So weit sucht die Detail-Ansicht nach dem zugehörigen Entscheidungs- bzw. Ergebnis-Beleg. */
export const PARTNER_FENSTER = 500;

export interface BelegeSeite {
  items: ReceiptEntry[];
  nextBefore?: number;
}

/** Eine Seite der Liste, neueste zuerst. */
export async function belegeSeite(db: Database, query: ReceiptListQuery): Promise<BelegeSeite> {
  return repo.belege.listPage(db, {
    limit: query.limit,
    ...(query.before === undefined ? {} : { before: query.before }),
    ...(query.action === undefined ? {} : { action: query.action }),
    ...(query.conversationId === undefined ? {} : { conversationId: query.conversationId }),
  });
}

export interface BelegUmfeld {
  beleg: ReceiptEntry;
  vorgaenger?: ReceiptEntry;
  nachfolger?: ReceiptEntry;
  /** Zugehöriger Beleg derselben Aktion (Entscheidung ↔ Ergebnis). */
  partner?: { id: string; seq: number; art: "decision" | "result" };
}

function aktionVon(entry: ReceiptEntry): string | undefined {
  const body = entry.body as unknown as { action?: { actionId?: unknown } } | undefined;
  const id = body?.action?.actionId;
  return typeof id === "string" ? id : undefined;
}

/** Beleg mit Vorgänger, Nachfolger und zugehörigem Beleg; `nicht_gefunden` bei unbekannter Kennung. */
export async function belegMitUmfeld(db: Database, id: string): Promise<BelegUmfeld> {
  if (!isId("receipt", id)) throw new PaiBotError("nicht_gefunden");
  const beleg = await repo.belege.get(db, id);
  if (beleg === undefined) throw new PaiBotError("nicht_gefunden");
  const [vorgaenger, nachfolger] = await Promise.all([
    beleg.seq > 1 ? repo.belege.getBySeq(db, beleg.seq - 1) : Promise.resolve(undefined),
    repo.belege.getBySeq(db, beleg.seq + 1),
  ]);
  const umfeld: BelegUmfeld = { beleg };
  if (vorgaenger !== undefined) umfeld.vorgaenger = vorgaenger;
  if (nachfolger !== undefined) umfeld.nachfolger = nachfolger;

  const aktion = aktionVon(beleg);
  const typ = beleg.body.type;
  if (aktion !== undefined && (typ === "decision" || typ === "result")) {
    const fenster =
      typ === "decision"
        ? await repo.belege.listFrom(db, { fromSeq: beleg.seq + 1, limit: PARTNER_FENSTER })
        : await repo.belege.listFrom(db, {
            fromSeq: Math.max(1, beleg.seq - PARTNER_FENSTER),
            limit: Math.min(PARTNER_FENSTER, beleg.seq - 1),
          });
    const gesucht = typ === "decision" ? "result" : "decision";
    const partner = fenster.find((e) => e.body.type === gesucht && aktionVon(e) === aktion);
    if (partner !== undefined) {
      umfeld.partner = { id: partner.id, seq: partner.seq, art: gesucht };
    }
  }
  return umfeld;
}

export interface SchluesselDaten {
  /** Start-Beleg und alle Schlüsselwechsel, älteste zuerst. */
  belege: ReceiptEntry[];
  /** Öffentliche Schlüssel aus der Datenbank, nur zur Anzeige und zum Vergleich. */
  schluessel: PublicKeyInfo[];
}

/** Belege, aus denen die Schlüssel der Kette folgen. */
export async function schluesselDaten(db: Database): Promise<SchluesselDaten> {
  const schluessel = await repo.installationKeys.listPublic(db);
  const start = await repo.belege.getBySeq(db, 1);
  const belege: ReceiptEntry[] = start === undefined ? [] : [start];
  // Schlüsselwechsel kann es nur geben, wenn es mehr als einen Schlüssel gibt.
  if (schluessel.length > 1) {
    let ab = 2;
    for (;;) {
      const stueck = await repo.belege.listFrom(db, { fromSeq: ab, limit: KETTE_STUECK_MAX });
      for (const e of stueck) if (e.body.type === "key_change") belege.push(e);
      const letzter = stueck[stueck.length - 1];
      if (letzter === undefined || stueck.length < KETTE_STUECK_MAX) break;
      ab = letzter.seq + 1;
    }
  }
  return { belege, schluessel };
}

/** Abfrage der Kette in Stücken (geprüft mit `receiptChainQuery` aus dem Routen-Vertrag). */
export type KettenAbfrage = ReceiptChainQuery;

/** Kopf der Kette wie die erste Zeile eines Exports. Der Anker darin ist nur zum Aufbewahren. */
export type KettenKopf = Omit<ReceiptExportHeader, "publicKeys"> & { publicKeys: PublicKeyInfo[] };

export interface KettenStueck {
  /** Nur im ersten Stück (`ab` = 1). */
  kopf?: KettenKopf;
  belege: ReceiptEntry[];
  /** Nummer des letzten Belegs beim Lesen (für den Fortschritt). */
  gesamt: number;
  /** `ab` für das nächste Stück; fehlt am Ende. */
  weiter?: number;
}

/** Ein Stück der Kette, älteste zuerst. */
export async function kettenStueck(
  db: Database,
  abfrage: KettenAbfrage,
  jetzt: Date,
): Promise<KettenStueck> {
  const kopfBeleg = await repo.belege.head(db);
  const gesamt = kopfBeleg?.seq ?? 0;
  const belege = await repo.belege.listFrom(db, { fromSeq: abfrage.ab, limit: abfrage.anzahl });
  const stueck: KettenStueck = { belege, gesamt };
  const letzter = belege[belege.length - 1];
  if (letzter !== undefined && belege.length === abfrage.anzahl && letzter.seq < gesamt) {
    stueck.weiter = letzter.seq + 1;
  }
  if (abfrage.ab === 1) {
    const anker = await currentAnchor(db, jetzt);
    if (anker !== undefined) {
      stueck.kopf = {
        format: "pb-belege",
        v: 1,
        installationId: anker.installationId,
        publicKeys: await repo.installationKeys.listPublic(db),
        anchor: anker,
      };
    }
  }
  return stueck;
}

/** Alle Belege der Kette, stückweise gelesen. */
export async function* ganzeKette(db: Database): AsyncGenerator<ReceiptEntry> {
  let ab = 1;
  for (;;) {
    const stueck = await repo.belege.listFrom(db, { fromSeq: ab, limit: KETTE_STUECK_MAX });
    yield* stueck;
    const letzter = stueck[stueck.length - 1];
    if (letzter === undefined || stueck.length < KETTE_STUECK_MAX) return;
    ab = letzter.seq + 1;
  }
}

/** Aktueller Anker oder `undefined` bei leerer Kette. */
export async function aktuellerAnker(db: Database, jetzt: Date): Promise<ChainAnchor | undefined> {
  return currentAnchor(db, jetzt);
}

/**
 * Regeln zum Anzeigen und Nachrechnen: Stand, die gültigen Regeln und alle Fassungen der Regeln,
 * die es gibt oder gab (gültige plus Standard-Regeln), mit ihrer Nummer im Regel-Protokoll.
 */
export async function regelDaten(db: Database): Promise<RegelDaten> {
  const [stand, aktive] = await Promise.all([
    repo.rules.currentStand(db),
    repo.rules.listActive(db),
  ]);
  const ids = new Set<string>([
    ...aktive.map((r) => r.id),
    ...STANDARD_RULE_VERSIONS.map((r) => r.id),
  ]);
  const fassungen: RuleVersion[] = [];
  for (const id of ids) fassungen.push(...(await repo.rules.listVersions(db, id)));
  return { stand, aktive, fassungen };
}
