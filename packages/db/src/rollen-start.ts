/**
 * PaiBot – Datenbank beim Start vorbereiten: Migrationen mit der Migrations-Rolle, App-Rolle
 * einrichten, Stand und Rechte der App-Verbindung prüfen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import postgres from "postgres";
import { runMigrations } from "./migrate";
import {
  checkAppRole,
  checkMigrationState,
  credentialsOf,
  type MigrationState,
  ROLE_ISSUE_TEXT,
  type RoleCheck,
} from "./rollen";

/** Variable, die den Betrieb mit zu vielen Rechten ausdrücklich erlaubt (nur für den Übergang). */
export const ALLOW_PRIVILEGED_DB_ENV = "PAIBOT_ALLOW_PRIVILEGED_DB";

/** Ausgabe für Meldungen beim Start. */
export interface StartLog {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface DatabaseStartOptions {
  env: Readonly<Record<string, string | undefined>>;
  migrationsFolder: string;
  /** In Produktion führen zu viele Rechte zum Abbruch (außer `PAIBOT_ALLOW_PRIVILEGED_DB=1`). */
  production: boolean;
  attempts?: number;
  delayMs?: number;
  log?: StartLog;
}

/** Ergebnis der Vorbereitung. Bei `ok: false` soll der Start abbrechen. */
export type DatabaseStartResult =
  | { ok: true; role: RoleCheck; state: MigrationState; separateRoles: boolean }
  | {
      ok: false;
      reason:
        | "keine_datenbank"
        | "migration_fehlgeschlagen"
        | "nicht_auf_stand"
        | "zu_viele_rechte";
      message: string;
    };

const HILFE = "Anleitung: docs/installation.md, Abschnitt „Rollen der Datenbank“.";

const consoleLog: StartLog = {
  info: (m) => console.log(`[paibot] ${m}`),
  warn: (m) => console.warn(`[paibot] ${m}`),
  error: (m) => console.error(`[paibot] ${m}`),
};

/**
 * Bereitet die Datenbank beim Start vor:
 *
 * 1. Migrationen mit `DATABASE_MIGRATION_URL` (fehlt sie: mit `DATABASE_URL`), mit Wiederholversuchen.
 *    Sind die Rollen getrennt, wird danach die App-Rolle aus `DATABASE_URL` eingerichtet.
 * 2. Mit `DATABASE_URL`: Stand der Migrationen prüfen (sonst „Datenbank nicht auf Stand“).
 * 3. Mit `DATABASE_URL`: Rechte prüfen. Zu viele Rechte: Warnung; in Produktion Abbruch, außer
 *    `PAIBOT_ALLOW_PRIVILEGED_DB=1`.
 *
 * Meldungen nennen nie Passwörter oder Adressen, nur Rollen-Namen.
 */
export async function prepareDatabase(options: DatabaseStartOptions): Promise<DatabaseStartResult> {
  const log = options.log ?? consoleLog;
  const appUrl = options.env.DATABASE_URL;
  if (appUrl === undefined || appUrl === "") {
    return { ok: false, reason: "keine_datenbank", message: "DATABASE_URL fehlt." };
  }
  const migrationUrl = nonEmpty(options.env.DATABASE_MIGRATION_URL) ?? appUrl;
  const separateRoles = safeUser(migrationUrl) !== safeUser(appUrl);
  const attempts = options.attempts ?? 5;
  const delayMs = options.delayMs ?? 3000;

  let migrated = false;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      // Auch mit nur einer Rolle: dann legt `prepareAppRole` nur das Schema der Warteschlange an.
      const result = await runMigrations(migrationUrl, options.migrationsFolder, { appUrl });
      log.info("Datenbank-Migrationen angewendet.");
      if (result.appRole?.created) {
        log.info(`App-Rolle ${result.appRole.role} angelegt.`);
      }
      if (result.appRole) log.info(`Rechte der App-Rolle ${result.appRole.role} gesetzt.`);
      migrated = true;
      break;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      log.error(`Migration fehlgeschlagen (Versuch ${attempt}/${attempts}): ${reason}`);
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const sql = postgres(appUrl, {
    max: 1,
    connect_timeout: 5,
    onnotice: () => undefined,
    connection: { application_name: "paibot-start" },
  });
  try {
    let state: MigrationState;
    let role: RoleCheck;
    try {
      state = await checkMigrationState(sql, options.migrationsFolder);
      role = await checkAppRole(sql);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        reason: migrated ? "nicht_auf_stand" : "migration_fehlgeschlagen",
        message: `Datenbank nicht auf Stand: Prüfung mit DATABASE_URL fehlgeschlagen (${reason}).`,
      };
    }

    if (state.status !== "aktuell") {
      return {
        ok: false,
        reason: "nicht_auf_stand",
        message:
          state.status === "neuer"
            ? `Datenbank nicht auf Stand: Sie ist neuer als diese Version von PaiBot (${state.applied} angewendet, ${state.expected} bekannt). Spiele die passende Version ein.`
            : `Datenbank nicht auf Stand: ${state.applied} von ${state.expected} Migrationen angewendet. Prüfe die Meldungen der Migration und DATABASE_MIGRATION_URL.`,
      };
    }

    if (role.status === "zu_viele_rechte") {
      const gruende = role.issues.map((issue) => ROLE_ISSUE_TEXT[issue]).join(", ");
      const text = `Die App verbindet sich als Rolle ${role.role} mit zu vielen Rechten (${gruende}). So lassen sich Schutz-Trigger der Belege abschalten. Lege eine eigene App-Rolle an: DATABASE_MIGRATION_URL auf die bisherige Adresse, DATABASE_URL auf die App-Rolle. ${HILFE}`;
      const allowed = options.env[ALLOW_PRIVILEGED_DB_ENV] === "1";
      if (options.production && !allowed) {
        return {
          ok: false,
          reason: "zu_viele_rechte",
          message: `${text} Nur für den Übergang: ${ALLOW_PRIVILEGED_DB_ENV}=1 erlaubt den Start trotzdem.`,
        };
      }
      log.warn(`WARNUNG: ${text}`);
    } else if (!separateRoles) {
      log.warn(
        "DATABASE_MIGRATION_URL fehlt: Migrationen liefen mit DATABASE_URL. Rechte der App-Rolle wurden nicht gesetzt.",
      );
    }
    return { ok: true, role, state, separateRoles };
  } finally {
    await sql.end({ timeout: 2 });
  }
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value === "" ? undefined : value;
}

function safeUser(url: string): string {
  try {
    return credentialsOf(url).user;
  } catch {
    return url;
  }
}
