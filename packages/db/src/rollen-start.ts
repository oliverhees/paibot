/**
 * PaiBot – Datenbank beim Start vorbereiten: Migrations-Schritt mit der Migrations-Rolle (App-Rolle
 * einrichten) und Prüfung von Stand und Rechten der App-Verbindung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import postgres from "postgres";
import { appConnectionOptions } from "./client";
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

/** Ergebnis des Migrations-Schritts. */
export type MigrationStepResult =
  | { ok: true; separateRoles: boolean }
  | { ok: false; reason: "keine_datenbank" | "migration_fehlgeschlagen"; message: string };

/**
 * Migrations-Schritt (Dienst `migrate`, in der Entwicklung auch die Web-App): Migrationen mit
 * `DATABASE_MIGRATION_URL` (fehlt sie: mit `DATABASE_URL`), mit Wiederholversuchen. Sind die Rollen
 * getrennt, wird danach unter derselben Sperre die App-Rolle aus `DATABASE_URL` eingerichtet
 * (anlegen, Rechte, Einstellungen zurücksetzen, Passwort neu setzen).
 */
export async function migrateDatabase(
  options: Omit<DatabaseStartOptions, "production">,
): Promise<MigrationStepResult> {
  const log = options.log ?? consoleLog;
  const appUrl = nonEmpty(options.env.DATABASE_URL);
  if (appUrl === undefined) {
    return { ok: false, reason: "keine_datenbank", message: "DATABASE_URL fehlt." };
  }
  const migrationUrl = nonEmpty(options.env.DATABASE_MIGRATION_URL) ?? appUrl;
  const separateRoles = safeUser(migrationUrl) !== safeUser(appUrl);
  const attempts = options.attempts ?? 5;
  const delayMs = options.delayMs ?? 3000;

  let lastReason = "";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      // Auch mit nur einer Rolle: dann legt `prepareAppRole` nur das Schema der Warteschlange an.
      const result = await runMigrations(migrationUrl, options.migrationsFolder, { appUrl });
      log.info("Datenbank-Migrationen angewendet.");
      if (result.appRole?.created) {
        log.info(`App-Rolle ${result.appRole.role} angelegt.`);
      }
      if (result.appRole) log.info(`Rechte der App-Rolle ${result.appRole.role} gesetzt.`);
      return { ok: true, separateRoles };
    } catch (error) {
      lastReason = error instanceof Error ? error.message : String(error);
      log.error(`Migration fehlgeschlagen (Versuch ${attempt}/${attempts}): ${lastReason}`);
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return {
    ok: false,
    reason: "migration_fehlgeschlagen",
    message: `Migration fehlgeschlagen: ${lastReason}`,
  };
}

/**
 * Prüft mit `DATABASE_URL` (nur der App-Rolle), ob die Datenbank auf Stand ist und die Rolle nicht
 * zu viel darf. Migriert nie. Zu viele Rechte: Warnung; in Produktion Abbruch, außer
 * `PAIBOT_ALLOW_PRIVILEGED_DB=1`. `attempts` und `delayMs` gelten für das Warten auf die Datenbank.
 */
export async function checkDatabase(options: DatabaseStartOptions): Promise<DatabaseStartResult> {
  return check(options, { migrated: false, separateRoles: true });
}

/**
 * Bereitet die Datenbank vor: Migrations-Schritt (`migrateDatabase`), danach Prüfung mit
 * `DATABASE_URL` wie `checkDatabase`. Meldungen nennen nie Passwörter oder Adressen, nur
 * Rollen-Namen.
 */
export async function prepareDatabase(options: DatabaseStartOptions): Promise<DatabaseStartResult> {
  const migration = await migrateDatabase(options);
  if (!migration.ok && migration.reason === "keine_datenbank") return migration;
  return check(
    { ...options, attempts: 1 },
    { migrated: migration.ok, separateRoles: migration.ok ? migration.separateRoles : true },
  );
}

async function check(
  options: DatabaseStartOptions,
  context: { migrated: boolean; separateRoles: boolean },
): Promise<DatabaseStartResult> {
  const log = options.log ?? consoleLog;
  const appUrl = nonEmpty(options.env.DATABASE_URL);
  if (appUrl === undefined) {
    return { ok: false, reason: "keine_datenbank", message: "DATABASE_URL fehlt." };
  }
  const attempts = options.attempts ?? 5;
  const delayMs = options.delayMs ?? 3000;
  const sql = postgres(appUrl, {
    max: 1,
    connect_timeout: 5,
    onnotice: () => undefined,
    connection: appConnectionOptions("paibot-start"),
  });
  try {
    let state: MigrationState | undefined;
    let role: RoleCheck | undefined;
    let lastReason = "";
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        state = await checkMigrationState(sql, options.migrationsFolder);
        role = await checkAppRole(sql);
        break;
      } catch (error) {
        lastReason = error instanceof Error ? error.message : String(error);
        if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    if (state === undefined || role === undefined) {
      return {
        ok: false,
        reason: context.migrated ? "nicht_auf_stand" : "migration_fehlgeschlagen",
        message: `Datenbank nicht auf Stand: Prüfung mit DATABASE_URL fehlgeschlagen (${lastReason}).`,
      };
    }

    if (state.status !== "aktuell") {
      return {
        ok: false,
        reason: "nicht_auf_stand",
        message:
          state.status === "neuer"
            ? `Datenbank nicht auf Stand: Sie ist neuer als diese Version von PaiBot (${state.applied} angewendet, ${state.expected} bekannt). Spiele die passende Version ein.`
            : `Datenbank nicht auf Stand: ${state.applied} von ${state.expected} Migrationen angewendet. Prüfe die Meldungen des Migrations-Schritts (Dienst migrate) und DATABASE_MIGRATION_URL.`,
      };
    }

    if (role.status === "zu_viele_rechte") {
      const gruende = role.issues.map((issue) => ROLE_ISSUE_TEXT[issue]).join(", ");
      const text = `Die App verbindet sich als Rolle ${role.role} mit zu vielen Rechten oder falsch eingestellt (${gruende}). So lassen sich Schutz-Trigger der Belege abschalten oder Abfragen umlenken. Starte den Migrations-Schritt (Dienst migrate) erneut; er setzt Rechte und Einstellungen der App-Rolle zurück. Ohne eigene App-Rolle: DATABASE_MIGRATION_URL auf die bisherige Adresse, DATABASE_URL auf die App-Rolle. ${HILFE}`;
      const allowed = options.env[ALLOW_PRIVILEGED_DB_ENV] === "1";
      if (options.production && !allowed) {
        return {
          ok: false,
          reason: "zu_viele_rechte",
          message: `${text} Nur für den Übergang: ${ALLOW_PRIVILEGED_DB_ENV}=1 erlaubt den Start trotzdem.`,
        };
      }
      log.warn(`WARNUNG: ${text}`);
    } else if (!context.separateRoles) {
      log.warn(
        "DATABASE_MIGRATION_URL fehlt: Migrationen liefen mit DATABASE_URL. Rechte der App-Rolle wurden nicht gesetzt.",
      );
    }
    return { ok: true, role, state, separateRoles: context.separateRoles };
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
