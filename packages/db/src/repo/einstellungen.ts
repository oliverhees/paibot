/**
 * PaiBot – Zugriff auf die Einstellungen (genau eine Zeile).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import {
  type BotId,
  type InstallationId,
  type Locale,
  PaiBotError,
  type SchleuseMode,
  type Settings,
  type Sha256Digest,
} from "@paibot/shared";
import { and, eq, isNull, notExists, sql } from "drizzle-orm";
import type { Database } from "../client";
import { owner, settings } from "../schema";
import { toSettings } from "./abbildung";
import { standardFehler, uebersetzen } from "./fehler";

const ZEILE = "singleton";

/** Felder, die sich ändern lassen. `null` entfernt eine Grenze bzw. den Standard-Bot. */
export interface SettingsPatch {
  locale?: Locale;
  timezone?: string;
  schleuseModeDefault?: SchleuseMode;
  maxHops?: number;
  dailyTokenBudget?: number | null;
  historyTokenLimit?: number | null;
  killSwitch?: boolean;
  defaultBotId?: BotId | null;
  installationId?: InstallationId;
}

export interface SetupCompletion {
  installationId: InstallationId;
  schleuseModeDefault?: SchleuseMode;
  timezone?: string;
  defaultBotId?: BotId;
  now?: Date;
}

/** Die Einstellungen, oder `undefined`, solange die Einrichtung noch keine Zeile angelegt hat. */
export async function get(db: Database): Promise<Settings | undefined> {
  const [row] = await db.select().from(settings).where(eq(settings.id, ZEILE));
  return row === undefined ? undefined : toSettings(row);
}

/** Legt die Zeile mit den Standardwerten an, falls sie fehlt, und gibt sie zurück. */
export async function ensure(db: Database): Promise<Settings> {
  await db.insert(settings).values({ id: ZEILE }).onConflictDoNothing();
  const vorhanden = await get(db);
  if (vorhanden === undefined) throw new PaiBotError("intern");
  return vorhanden;
}

/** Ändert Einstellungen; legt die Zeile bei Bedarf an. Nicht genannte Felder bleiben. */
export async function update(db: Database, patch: SettingsPatch): Promise<Settings> {
  const felder = { ...patch, updatedAt: sql`pg_catalog.now()` };
  const [row] = await uebersetzen(
    () =>
      db
        .insert(settings)
        .values({ id: ZEILE, ...patch })
        .onConflictDoUpdate({ target: settings.id, set: felder })
        .returning(),
    standardFehler,
  );
  if (row === undefined) throw new PaiBotError("intern");
  return toSettings(row);
}

/**
 * Schließt die Einrichtung ab: setzt die Installations-ID, den Zeitpunkt und optional Standard-Bot,
 * Modus der Datenschleuse und Zeitzone. Läuft nur einmal; danach `einrichtung_fertig`.
 */
export async function completeSetup(db: Database, input: SetupCompletion): Promise<Settings> {
  const zeitpunkt = input.now ?? new Date();
  const felder = {
    installationId: input.installationId,
    setupCompletedAt: zeitpunkt,
    ...(input.schleuseModeDefault === undefined
      ? {}
      : { schleuseModeDefault: input.schleuseModeDefault }),
    ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
    ...(input.defaultBotId === undefined ? {} : { defaultBotId: input.defaultBotId }),
    // Der Einrichtungs-Code gilt nur bis hier.
    setupCodeHash: null,
    setupCodeCreatedAt: null,
  };
  const [row] = await uebersetzen(
    () =>
      db
        .insert(settings)
        .values({ id: ZEILE, ...felder })
        .onConflictDoUpdate({
          target: settings.id,
          set: { ...felder, updatedAt: sql`pg_catalog.now()` },
          setWhere: isNull(settings.setupCompletedAt),
        })
        .returning(),
    standardFehler,
  );
  if (row === undefined) throw new PaiBotError("einrichtung_fertig");
  return toSettings(row);
}

/** Ist die Einrichtung abgeschlossen? */
export async function isSetupComplete(db: Database): Promise<boolean> {
  return (await get(db))?.setupCompletedAt !== undefined;
}

/** Gespeicherter Prüfwert des Einrichtungs-Codes. */
export interface StoredSetupCode {
  hash: Sha256Digest;
  createdAt: Date;
}

/**
 * Speichert den Prüfwert eines neuen Einrichtungs-Codes (nie den Code) und ersetzt einen früheren.
 * Geht nur, solange es keinen Besitzer gibt und die Einrichtung nicht abgeschlossen ist; sonst
 * `false`, und es ändert sich nichts. Die Datenbank prüft dasselbe (CHECK und Trigger).
 */
export async function setSetupCode(
  db: Database,
  input: { hash: Sha256Digest; now?: Date },
): Promise<boolean> {
  const felder = { setupCodeHash: input.hash, setupCodeCreatedAt: input.now ?? new Date() };
  const keinBesitzer = notExists(db.select({ one: sql`1` }).from(owner));
  return db.transaction(async (tx) => {
    const [vorhanden] = await tx.select({ one: sql`1` }).from(owner).limit(1);
    if (vorhanden !== undefined) return false;
    const rows = await uebersetzen(
      () =>
        tx
          .insert(settings)
          .values({ id: ZEILE, ...felder })
          .onConflictDoUpdate({
            target: settings.id,
            set: { ...felder, updatedAt: sql`pg_catalog.now()` },
            setWhere: and(isNull(settings.setupCompletedAt), keinBesitzer),
          })
          .returning({ id: settings.id }),
      standardFehler,
    );
    return rows.length === 1;
  });
}

/** Der gespeicherte Prüfwert des Einrichtungs-Codes, oder `undefined`, wenn keiner gilt. */
export async function getSetupCode(db: Database): Promise<StoredSetupCode | undefined> {
  const [row] = await db
    .select({ hash: settings.setupCodeHash, createdAt: settings.setupCodeCreatedAt })
    .from(settings)
    .where(eq(settings.id, ZEILE));
  if (row?.hash == null || row.createdAt == null) return undefined;
  return { hash: row.hash, createdAt: row.createdAt };
}

/** Löscht den Prüfwert des Einrichtungs-Codes (z. B. nach zu vielen Fehlversuchen). */
export async function clearSetupCode(db: Database): Promise<void> {
  await db
    .update(settings)
    .set({ setupCodeHash: null, setupCodeCreatedAt: null, updatedAt: sql`pg_catalog.now()` })
    .where(eq(settings.id, ZEILE));
}
