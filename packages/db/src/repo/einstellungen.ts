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
} from "@paibot/shared";
import { eq, isNull, sql } from "drizzle-orm";
import type { Database } from "../client";
import { settings } from "../schema";
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
