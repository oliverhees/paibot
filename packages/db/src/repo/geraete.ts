/**
 * PaiBot – Zugriff auf bekannte Geräte. Vom Cookie eines Geräts steht nur der SHA-256 da. Ein
 * Widerruf beendet auch alle Sitzungen des Geräts.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import {
  type DeviceId,
  type DeviceKind,
  type DeviceRight,
  newId,
  type OwnerId,
  PaiBotError,
  sessionIdSchema,
} from "@paibot/shared";
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { Database } from "../client";
import { type GeraetWiderrufGrund, geraete, sessions } from "../schema";
import { standardFehler, uebersetzen } from "./fehler";

/** Höchstens so viele gültige Geräte je Besitzer; ein weiteres widerruft das älteste. */
export const MAX_GERAETE = 10;

/** Widerrufene und abgelaufene Einträge bleiben so lange stehen, dann fallen sie weg. */
export const AUFBEWAHREN_TAGE = 30;

/**
 * So weit zurück sieht ein neues Gerät, welche Geräte entfernt, verdrängt oder alle zusammen
 * abgemeldet wurden. So bleibt das auch sichtbar, wenn danach kein anderes Gerät mehr gilt.
 */
export const RUECKBLICK_TAGE = 7;

/** Widerrufe, die die übrigen Geräte im Hinweis sehen (nicht: selbst abgemeldet, Passwort neu). */
const SICHTBARE_GRUENDE = ["entfernt", "verdraengt", "alle"] as const;

const TAG_MS = 24 * 60 * 60 * 1000;
const MAX_NAME = 200;

export interface GeraetCreate {
  /** SHA-256 der Kennung aus dem Cookie als 64 Hex-Zeichen. */
  tokenHash: string;
  ownerId: OwnerId;
  kind: DeviceKind;
  /** Browser-Kennung (gekürzt); die Anzeige macht daraus eine grobe Angabe. */
  name?: string;
  expiresAt: Date;
  now?: Date;
  /** Kennung vorgeben (sonst neu), etwa weil sie schon im Beleg steht. */
  id?: DeviceId;
}

export interface GeraetEintrag {
  id: DeviceId;
  ownerId: OwnerId;
  kind: DeviceKind;
  name?: string;
  rights: DeviceRight;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt?: string;
  revokeReason?: GeraetWiderrufGrund;
}

function pruefeHash(tokenHash: string): void {
  if (!sessionIdSchema.safeParse(tokenHash).success) {
    throw new PaiBotError("eingabe_ungueltig", {
      felder: [{ feld: "tokenHash", code: "format" }],
    });
  }
}

function eintrag(row: typeof geraete.$inferSelect): GeraetEintrag {
  return {
    id: row.id,
    ownerId: row.ownerId,
    kind: row.kind,
    ...(row.name === null ? {} : { name: row.name }),
    rights: row.rights,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    ...(row.revokedAt === null ? {} : { revokedAt: row.revokedAt.toISOString() }),
    ...(row.revokeReason === null ? {} : { revokeReason: row.revokeReason }),
  };
}

/** Bedingung „gilt“: nicht widerrufen und nicht abgelaufen. */
function aktiv(now: Date) {
  return and(isNull(geraete.revokedAt), gt(geraete.expiresAt, now));
}

async function revokeIds(
  db: Database,
  ids: DeviceId[],
  now: Date,
  grund: GeraetWiderrufGrund,
): Promise<number> {
  const rows = await db
    .update(geraete)
    .set({ revokedAt: now, revokeReason: grund })
    .where(and(inArray(geraete.id, ids), isNull(geraete.revokedAt)))
    .returning({ id: geraete.id });
  await db.delete(sessions).where(inArray(sessions.deviceId, ids));
  return rows.length;
}

/**
 * Legt ein Gerät an. Danach gelten höchstens `MAX_GERAETE` Geräte des Besitzers (ältere werden
 * widerrufen), und Einträge, die seit `AUFBEWAHREN_TAGE` widerrufen oder abgelaufen sind, fallen weg.
 */
export async function create(db: Database, input: GeraetCreate): Promise<GeraetEintrag> {
  pruefeHash(input.tokenHash);
  const now = input.now ?? new Date();
  const [row] = await uebersetzen(
    () =>
      db
        .insert(geraete)
        .values({
          id: input.id ?? newId("device"),
          ownerId: input.ownerId,
          tokenHash: input.tokenHash,
          kind: input.kind,
          name: input.name === undefined ? null : input.name.slice(0, MAX_NAME),
          createdAt: now,
          lastSeenAt: now,
          expiresAt: input.expiresAt,
        })
        .returning(),
    standardFehler,
  );
  if (row === undefined) throw new PaiBotError("intern");
  const gueltige = await db
    .select({ id: geraete.id })
    .from(geraete)
    .where(and(eq(geraete.ownerId, input.ownerId), aktiv(now)))
    .orderBy(desc(geraete.createdAt), desc(geraete.id));
  const zuViele = gueltige
    .map((g) => g.id)
    .filter((id) => id !== row.id)
    .slice(MAX_GERAETE - 1);
  if (zuViele.length > 0) await revokeIds(db, zuViele, now, "verdraengt");
  const grenze = new Date(now.getTime() - AUFBEWAHREN_TAGE * TAG_MS);
  await db
    .delete(geraete)
    .where(
      and(
        eq(geraete.ownerId, input.ownerId),
        or(
          and(isNotNull(geraete.revokedAt), lt(geraete.revokedAt, grenze)),
          lt(geraete.expiresAt, grenze),
        ),
      ),
    );
  return eintrag(row);
}

/** Das gültige Gerät zum Hash eines Cookies, sonst `undefined`. */
export async function findByToken(
  db: Database,
  tokenHash: string,
  options: { now?: Date } = {},
): Promise<GeraetEintrag | undefined> {
  if (!sessionIdSchema.safeParse(tokenHash).success) return undefined;
  const now = options.now ?? new Date();
  const [row] = await db
    .select()
    .from(geraete)
    .where(and(eq(geraete.tokenHash, tokenHash), aktiv(now)));
  return row === undefined ? undefined : eintrag(row);
}

/** Ein Gerät des Besitzers, auch widerrufen; sonst `undefined`. */
export async function get(
  db: Database,
  ownerId: OwnerId,
  id: string,
): Promise<GeraetEintrag | undefined> {
  const [row] = await db
    .select()
    .from(geraete)
    .where(and(eq(geraete.id, id as DeviceId), eq(geraete.ownerId, ownerId)));
  return row === undefined ? undefined : eintrag(row);
}

/** Die gültigen Geräte des Besitzers, zuletzt gesehene zuerst. */
export async function list(
  db: Database,
  ownerId: OwnerId,
  options: { now?: Date } = {},
): Promise<GeraetEintrag[]> {
  const now = options.now ?? new Date();
  const rows = await db
    .select()
    .from(geraete)
    .where(and(eq(geraete.ownerId, ownerId), aktiv(now)))
    .orderBy(desc(geraete.lastSeenAt), asc(geraete.id));
  return rows.map(eintrag);
}

/** Merkt die Benutzung und verlängert die Gültigkeit (bei jeder Anmeldung mit dem Gerät). */
export async function renew(
  db: Database,
  id: DeviceId,
  input: { now: Date; expiresAt: Date },
): Promise<boolean> {
  const rows = await db
    .update(geraete)
    .set({ lastSeenAt: input.now, expiresAt: input.expiresAt })
    .where(and(eq(geraete.id, id), aktiv(input.now)))
    .returning({ id: geraete.id });
  return rows.length > 0;
}

/**
 * Widerruft ein Gerät des Besitzers und beendet seine Sitzungen. `true`, wenn es galt. Grund
 * (Standard `entfernt`): `abgemeldet` beim Abmelden auf dem Gerät selbst.
 */
export async function revoke(
  db: Database,
  ownerId: OwnerId,
  id: string,
  options: { now?: Date; grund?: "entfernt" | "abgemeldet" } = {},
): Promise<boolean> {
  const geraet = await get(db, ownerId, id);
  if (geraet === undefined) return false;
  return (
    (await revokeIds(db, [geraet.id], options.now ?? new Date(), options.grund ?? "entfernt")) > 0
  );
}

/**
 * Widerruft alle Geräte des Besitzers und beendet ihre Sitzungen. Gibt die Anzahl zurück. Grund
 * (Standard `alle`): `passwort` beim Wechsel des Passworts.
 */
export async function revokeAll(
  db: Database,
  ownerId: OwnerId,
  options: { now?: Date; grund?: "alle" | "passwort" } = {},
): Promise<number> {
  const offen = await db
    .select({ id: geraete.id })
    .from(geraete)
    .where(and(eq(geraete.ownerId, ownerId), isNull(geraete.revokedAt)));
  if (offen.length === 0) return 0;
  return revokeIds(
    db,
    offen.map((g) => g.id),
    options.now ?? new Date(),
    options.grund ?? "alle",
  );
}

/**
 * Neue Anmeldungen aus Sicht eines Geräts: die gültigen anderen Geräte des Besitzers, die nach dem
 * Stand dieses Geräts hinzugekommen sind (Stand = „Hinweis bestätigt bis“, sonst sein Anlegen),
 * neueste zuerst. Gilt das Gerät selbst nicht (mehr), ist die Liste leer.
 */
export async function neueSeit(
  db: Database,
  ownerId: OwnerId,
  deviceId: DeviceId,
  options: { now?: Date } = {},
): Promise<GeraetEintrag[]> {
  const now = options.now ?? new Date();
  const [selbst] = await db
    .select({ createdAt: geraete.createdAt, noticeSeenAt: geraete.noticeSeenAt })
    .from(geraete)
    .where(and(eq(geraete.id, deviceId), eq(geraete.ownerId, ownerId), aktiv(now)));
  if (selbst === undefined) return [];
  const stand =
    selbst.noticeSeenAt !== null && selbst.noticeSeenAt > selbst.createdAt
      ? selbst.noticeSeenAt
      : selbst.createdAt;
  const rows = await db
    .select()
    .from(geraete)
    .where(
      and(
        eq(geraete.ownerId, ownerId),
        ne(geraete.id, deviceId),
        gt(geraete.createdAt, stand),
        aktiv(now),
      ),
    )
    .orderBy(desc(geraete.createdAt), desc(geraete.id));
  return rows.map(eintrag);
}

/** Eine Änderung an den Geräten des Besitzers, wie der Hinweis sie zeigt. */
export interface GeraetAenderung {
  /** `neu`: Gerät angemeldet; sonst der Grund, aus dem es widerrufen wurde. */
  art: "neu" | (typeof SICHTBARE_GRUENDE)[number];
  /** Das betroffene Gerät (bei `alle`: eines der Geräte). */
  id: DeviceId;
  name?: string;
  /** Wann es geschah (Anlegen bzw. Widerruf). */
  zeit: string;
  /** Bei `alle`: wie viele Geräte zugleich abgemeldet wurden. */
  anzahl?: number;
}

/**
 * Was ein Gerät im Hinweis sieht, neueste zuerst:
 *
 * - neue Geräte wie bei `neueSeit`;
 * - andere Geräte, die entfernt, verdrängt oder mit „Alle Sitzungen beenden“ abgemeldet wurden,
 *   nach dem Stand dieses Geräts („Hinweis bestätigt bis“, sonst `RUECKBLICK_TAGE` vor seinem
 *   Anlegen). Ein neues Gerät sieht so auch, was geschah, als kein anderes Gerät mehr galt.
 *   Gleichzeitig mit „alle“ abgemeldete Geräte stehen als eine Zeile da.
 *
 * Gilt das Gerät selbst nicht (mehr), ist die Liste leer.
 */
export async function aenderungenSeit(
  db: Database,
  ownerId: OwnerId,
  deviceId: DeviceId,
  options: { now?: Date } = {},
): Promise<GeraetAenderung[]> {
  const now = options.now ?? new Date();
  const [selbst] = await db
    .select({ createdAt: geraete.createdAt, noticeSeenAt: geraete.noticeSeenAt })
    .from(geraete)
    .where(and(eq(geraete.id, deviceId), eq(geraete.ownerId, ownerId), aktiv(now)));
  if (selbst === undefined) return [];
  const neu = await neueSeit(db, ownerId, deviceId, { now });
  const rueckblick = new Date(selbst.createdAt.getTime() - RUECKBLICK_TAGE * TAG_MS);
  const stand =
    selbst.noticeSeenAt !== null && selbst.noticeSeenAt > rueckblick
      ? selbst.noticeSeenAt
      : rueckblick;
  const widerrufen = await db
    .select()
    .from(geraete)
    .where(
      and(
        eq(geraete.ownerId, ownerId),
        ne(geraete.id, deviceId),
        isNotNull(geraete.revokedAt),
        gt(geraete.revokedAt, stand),
        inArray(geraete.revokeReason, [...SICHTBARE_GRUENDE]),
      ),
    )
    .orderBy(desc(geraete.revokedAt), desc(geraete.id));
  const ergebnis: GeraetAenderung[] = neu.map((g) => ({
    art: "neu",
    id: g.id,
    ...(g.name === undefined ? {} : { name: g.name }),
    zeit: g.createdAt,
  }));
  const alle = new Map<string, GeraetAenderung>();
  for (const row of widerrufen) {
    const zeit = (row.revokedAt as Date).toISOString();
    const art = row.revokeReason as (typeof SICHTBARE_GRUENDE)[number];
    if (art === "alle") {
      const bisher = alle.get(zeit);
      if (bisher !== undefined) {
        bisher.anzahl = (bisher.anzahl ?? 1) + 1;
        continue;
      }
      const zeile: GeraetAenderung = { art, id: row.id, zeit, anzahl: 1 };
      alle.set(zeit, zeile);
      ergebnis.push(zeile);
      continue;
    }
    ergebnis.push({ art, id: row.id, ...(row.name === null ? {} : { name: row.name }), zeit });
  }
  return ergebnis.sort((a, b) => b.zeit.localeCompare(a.zeit) || b.id.localeCompare(a.id));
}

/**
 * Merkt auf einem Gerät, dass der Besitzer neue Anmeldungen bis `bis` bestätigt hat. Der Stand geht
 * nie zurück. `true`, wenn das Gerät gilt.
 */
export async function hinweisBestaetigen(
  db: Database,
  ownerId: OwnerId,
  deviceId: DeviceId,
  input: { bis: Date; now?: Date },
): Promise<boolean> {
  const now = input.now ?? new Date();
  const rows = await db
    .update(geraete)
    .set({
      noticeSeenAt: sql`greatest(${geraete.noticeSeenAt}, ${input.bis.toISOString()}::timestamptz)`,
    })
    .where(and(eq(geraete.id, deviceId), eq(geraete.ownerId, ownerId), aktiv(now)))
    .returning({ id: geraete.id });
  return rows.length > 0;
}

/** Name und Art von Geräten des Besitzers (auch widerrufene), z. B. für die Anzeige von Belegen. */
export async function namen(
  db: Database,
  ownerId: OwnerId,
  ids: readonly string[],
): Promise<Map<DeviceId, { kind: DeviceKind; name?: string }>> {
  const ergebnis = new Map<DeviceId, { kind: DeviceKind; name?: string }>();
  if (ids.length === 0) return ergebnis;
  const rows = await db
    .select({ id: geraete.id, kind: geraete.kind, name: geraete.name })
    .from(geraete)
    .where(and(eq(geraete.ownerId, ownerId), inArray(geraete.id, [...ids] as DeviceId[])));
  for (const row of rows) {
    ergebnis.set(row.id, { kind: row.kind, ...(row.name === null ? {} : { name: row.name }) });
  }
  return ergebnis;
}
