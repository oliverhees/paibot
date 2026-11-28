/**
 * PaiBot – Prüfungen beim Start: Pflicht-Einstellungen in Produktion; Rolle `migrate` (Migrationen,
 * App-Rolle, danach Ende), Rolle `web` (nur Stand und Rechte prüfen; migriert nur in der
 * Entwicklung).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import path from "node:path";
import { CryptoError, loadMasterSecret } from "@paibot/crypto";
import { createDb, repo } from "@paibot/db";
import {
  checkDatabase,
  type DatabaseStartResult,
  prepareDatabase,
  type StartLog,
} from "@paibot/db/migrate";
import { prepareQueue } from "@paibot/jobs";
import { t } from "@paibot/shared/texte";
import { proxyWarnung, pruefeAppUrl } from "./umgebung";

type Env = Readonly<Record<string, string | undefined>>;

/** Mindestlänge für Datenbank-Passwörter in Produktion. */
export const MIN_DB_PASSWORD_LENGTH = 24;

/** Bekannte Platzhalter, die nie als echtes Geheimnis gelten. */
export const PLACEHOLDERS: readonly string[] = [
  "bitte-ein-langes-zufaelliges-passwort",
  "bitte-erzeugen",
  "changeme",
  "change-me",
  "password",
  "passwort",
  "paibot",
  "postgres",
  "secret",
];

function isPlaceholder(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return PLACEHOLDERS.includes(normalized) || normalized.startsWith("<");
}

/** Rolle des Prozesses im Image (`PAIBOT_ROLE`). Der Worker hat seinen eigenen Einstieg. */
export type StartRole = "web" | "migrate";

/** Prüft `PAIBOT_SECRET` (32 Byte Base64, kein Platzhalter, erkennbar zufällig). */
function checkSecret(env: Env): string[] {
  const errors: string[] = [];
  const secret = env.PAIBOT_SECRET;
  if (secret === undefined || secret.trim() === "") {
    errors.push("PAIBOT_SECRET fehlt. Erzeuge es mit: openssl rand -base64 32");
  } else if (isPlaceholder(secret)) {
    errors.push(
      "PAIBOT_SECRET ist noch der Platzhalter aus der Vorlage. Erzeuge einen echten Wert.",
    );
  } else {
    try {
      loadMasterSecret(env);
    } catch (error) {
      if (!(error instanceof CryptoError)) throw error;
      errors.push(
        error.reason === "geheimnis_schwach"
          ? t("krypto.geheimnis_schwach")
          : "PAIBOT_SECRET hat die falsche Form: verlangt sind genau 32 Byte als Base64 (openssl rand -base64 32).",
      );
    }
  }

  return errors;
}

/**
 * Prüft die Pflicht-Einstellungen für den Betrieb und liefert verständliche Fehler (nie mit den
 * Werten selbst): `PAIBOT_SECRET` und `APP_URL` (nur Rolle `web`, siehe `pruefeAppUrl`) und
 * `DATABASE_URL` mit einem Passwort ab 24 Zeichen, das kein Platzhalter ist.
 *
 * - Rolle `web`: `DATABASE_MIGRATION_URL` darf nicht gesetzt sein; die Zugangsdaten der
 *   Migrations-Rolle gehören nur zum Dienst `migrate`.
 * - Rolle `migrate`: `DATABASE_MIGRATION_URL` ist Pflicht (gleiche Regeln für das Passwort) und
 *   nutzt eine andere Rolle mit einem anderen Passwort als `DATABASE_URL`. `DATABASE_WORKER_URL`
 *   ist hier freiwillig (fehlt sie, warnt der Migrations-Schritt); ist sie gesetzt, gelten dieselben
 *   Regeln und ein eigenes Passwort.
 */
export function checkProductionEnv(env: Env, role: StartRole = "web"): string[] {
  const errors: string[] = [];
  const migration = env.DATABASE_MIGRATION_URL;
  if (role === "web" && migration !== undefined && migration !== "") {
    errors.push(
      "DATABASE_MIGRATION_URL ist beim Dienst web gesetzt. Die Zugangsdaten der Migrations-Rolle gehören nur zum Dienst migrate; entferne die Variable bei web.",
    );
  }
  if (role === "migrate" && (migration === undefined || migration === "")) {
    errors.push("DATABASE_MIGRATION_URL fehlt (Zugang der Migrations-Rolle).");
  }
  if (role === "web") {
    errors.push(...checkSecret(env));
    const appUrl = pruefeAppUrl(env).fehler;
    if (appUrl !== undefined) errors.push(appUrl);
  }
  const worker = env.DATABASE_WORKER_URL;
  const names: readonly string[] =
    role === "migrate"
      ? [
          "DATABASE_URL",
          "DATABASE_MIGRATION_URL",
          ...(worker === undefined || worker === "" ? [] : ["DATABASE_WORKER_URL"]),
        ]
      : ["DATABASE_URL"];
  const passwords = new Map<string, string>();
  for (const name of names) {
    const value = env[name];
    if (value === undefined || value === "") {
      if (name === "DATABASE_URL") errors.push("DATABASE_URL fehlt.");
      continue;
    }
    let password: string;
    try {
      password = decodeURIComponent(new URL(value).password);
    } catch {
      errors.push(`${name} ist keine gültige Adresse (postgres://benutzer:passwort@host:5432/db).`);
      continue;
    }
    passwords.set(name, password);
    if (password === "") errors.push(`${name} enthält kein Passwort.`);
    else if (isPlaceholder(password)) {
      errors.push(`Das Passwort in ${name} ist ein Platzhalter. Setze ein zufälliges Passwort.`);
    } else if (password.length < MIN_DB_PASSWORD_LENGTH) {
      errors.push(
        `Das Passwort in ${name} ist zu kurz (mindestens ${MIN_DB_PASSWORD_LENGTH} Zeichen).`,
      );
    }
  }
  const app = passwords.get("DATABASE_URL");
  if (app !== undefined && app !== "" && app === passwords.get("DATABASE_MIGRATION_URL")) {
    errors.push(
      "DATABASE_URL und DATABASE_MIGRATION_URL nutzen dasselbe Passwort. Die App-Rolle braucht ein eigenes (POSTGRES_APP_PASSWORD).",
    );
  }
  const workerPassword = passwords.get("DATABASE_WORKER_URL");
  if (
    workerPassword !== undefined &&
    workerPassword !== "" &&
    (workerPassword === app || workerPassword === passwords.get("DATABASE_MIGRATION_URL"))
  ) {
    errors.push(
      "DATABASE_WORKER_URL nutzt dasselbe Passwort wie eine andere Rolle. Die Worker-Rolle braucht ein eigenes (POSTGRES_WORKER_PASSWORD).",
    );
  }
  return errors;
}

/** Hinweise für den Betrieb, die den Start nicht abbrechen (Rolle `web`). */
export function productionWarnings(env: Env): string[] {
  const warnungen = [...pruefeAppUrl(env).warnungen];
  const proxy = proxyWarnung(env);
  if (proxy !== undefined) warnungen.push(proxy);
  return warnungen;
}

const consoleLog: StartLog = {
  info: (m) => console.log(`[paibot] ${m}`),
  warn: (m) => console.warn(`[paibot] ${m}`),
  error: (m) => console.error(`[paibot] ${m}`),
};

export interface StartOptions {
  log?: StartLog;
  /** Beendet den Prozess; in Tests ersetzbar. */
  exit?: (code: number) => never;
  attempts?: number;
  delayMs?: number;
}

/**
 * Richtet nach den Migrationen die Warteschlange mit der App-Rolle ein und gibt der Worker-Rolle
 * (falls eingerichtet) ihre Rechte darin. `true`, wenn es geklappt hat; ein Fehler steht im Log.
 */
async function warteschlangeEinrichten(
  appUrl: string,
  workerRole: string | undefined,
  log: StartLog,
): Promise<boolean> {
  try {
    await prepareQueue(appUrl, workerRole === undefined ? {} : { workerRole });
    log.info(
      workerRole === undefined
        ? "Warteschlange eingerichtet."
        : `Warteschlange eingerichtet, Rechte der Worker-Rolle ${workerRole} darin gesetzt.`,
    );
    return true;
  } catch (error) {
    const art = error instanceof Error ? `${error.name}: ${error.message}` : typeof error;
    log.error(`Warteschlange nicht eingerichtet (${art}).`);
    return false;
  }
}

/**
 * Verwirft einen Einrichtungs-Code, solange die Einrichtung offen ist. Ein Neustart von `web`
 * erzeugt keinen neuen Code, solange einer gilt; erst ein neuer Lauf von `migrate` (neue
 * Bereitstellung, oder von Hand, wenn der Code verloren ist) gibt Platz für einen neuen. Ein
 * Fehler hier bricht den Migrations-Schritt nicht ab, er steht nur im Log.
 */
async function einrichtungsCodeVerwerfen(url: string, log: StartLog): Promise<void> {
  const { db, sql } = createDb(url);
  try {
    if (await repo.settings.isSetupComplete(db)) return;
    if ((await repo.settings.getSetupCode(db)) === undefined) return;
    await repo.settings.clearSetupCode(db);
    log.info("Einrichtungs-Code verworfen; web erzeugt beim Start einen neuen.");
  } catch (error) {
    const art = error instanceof Error ? error.name : typeof error;
    log.warn(`Einrichtungs-Code nicht verworfen (${art}).`);
  } finally {
    await sql.end({ timeout: 2 });
  }
}

/**
 * Hebt Sperren und Bremsen der Anmeldung auf. Ausweg, wenn der Besitzer sich nicht mehr anmelden
 * kann (z. B. während vieler fremder Fehlversuche): Migrations-Schritt erneut starten. Ein Fehler
 * hier bricht den Migrations-Schritt nicht ab.
 */
export async function anmeldeSperrenAufheben(url: string, log: StartLog): Promise<void> {
  const { db, sql } = createDb(url);
  try {
    const anzahl = await repo.rateLimit.deleteByPrefix(db, "anmelden:");
    if (anzahl > 0) log.info("Sperren der Anmeldung aufgehoben.");
  } catch (error) {
    const art = error instanceof Error ? error.name : typeof error;
    log.warn(`Sperren der Anmeldung nicht aufgehoben (${art}).`);
  } finally {
    await sql.end({ timeout: 2 });
  }
}

/**
 * Läuft einmal beim Start des Servers, je nach `PAIBOT_ROLE`:
 *
 * - `migrate` (eigener Einmal-Dienst): Migrationen mit `DATABASE_MIGRATION_URL`, App-Rolle aus
 *   `DATABASE_URL` und Worker-Rolle aus `DATABASE_WORKER_URL` einrichten, Rechte prüfen, die
 *   Warteschlange mit der App-Rolle einrichten (Rechte der Worker-Rolle darin); ist die Einrichtung noch offen, den bisherigen
 *   Einrichtungs-Code verwerfen (`web` erzeugt dann einen neuen) und Sperren der Anmeldung
 *   aufheben. Danach Ende mit Exit 0 (Fehler:
 *   Exit 1). Startet keinen Server.
 * - `web` (Standard): In Produktion wird nie migriert, nur mit `DATABASE_URL` geprüft, ob die
 *   Datenbank auf Stand ist und die Rolle nicht zu viel darf; ein Fehler bricht den Start ab
 *   (Exit 1). In der Entwicklung migriert die Web-App wie bisher selbst (bequem mit `pnpm dev`),
 *   Fehler bleiben Meldungen; ohne `DATABASE_URL` startet sie ohne Datenbank.
 */
export async function prepareStart(env: NodeJS.ProcessEnv, options: StartOptions = {}) {
  const log = options.log ?? consoleLog;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const production = env.NODE_ENV === "production";
  const role: StartRole = env.PAIBOT_ROLE === "migrate" ? "migrate" : "web";

  if (production || role === "migrate") {
    const errors = production ? checkProductionEnv(env, role) : [];
    if (role === "migrate" && !env.DATABASE_URL) errors.push("DATABASE_URL fehlt.");
    if (errors.length > 0) {
      for (const message of errors) log.error(message);
      log.error("Start abgebrochen: Einstellungen unvollständig.");
      exit(1);
      return;
    }
    if (production && role === "web") {
      for (const message of productionWarnings(env)) log.warn(message);
    }
  } else if (!env.DATABASE_URL) {
    log.warn("DATABASE_URL fehlt – Migrationen übersprungen.");
    return;
  }

  const migrationsFolder =
    env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), "../../packages/db/drizzle");
  const common = {
    env,
    migrationsFolder,
    production,
    log,
    ...(options.attempts === undefined ? {} : { attempts: options.attempts }),
    ...(options.delayMs === undefined ? {} : { delayMs: options.delayMs }),
  };

  if (role === "migrate") {
    const result = await prepareDatabase({ ...common, production: true });
    if (!result.ok) {
      log.error(result.message);
      log.error("Migrations-Schritt abgebrochen.");
      exit(1);
      return;
    }
    if (!(await warteschlangeEinrichten(env.DATABASE_URL ?? "", result.workerRole, log))) {
      log.error("Migrations-Schritt abgebrochen.");
      exit(1);
      return;
    }
    await einrichtungsCodeVerwerfen(env.DATABASE_URL ?? "", log);
    await anmeldeSperrenAufheben(env.DATABASE_URL ?? "", log);
    log.info("Migrations-Schritt fertig.");
    exit(0);
    return;
  }

  const result: DatabaseStartResult = production
    ? await checkDatabase(common)
    : await prepareDatabase(common);
  delete env.DATABASE_MIGRATION_URL;
  if (!result.ok) {
    log.error(result.message);
    if (production) {
      log.error("Start abgebrochen.");
      exit(1);
    }
    return;
  }
  // In der Entwicklung ist die Web-App auch der Migrations-Schritt.
  if (!production) await warteschlangeEinrichten(env.DATABASE_URL ?? "", result.workerRole, log);
}
