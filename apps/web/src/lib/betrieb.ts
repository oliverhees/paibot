/**
 * PaiBot – Prüfungen beim Start der App: Pflicht-Einstellungen in Produktion, dann Datenbank
 * vorbereiten (Migrationen, App-Rolle, Stand und Rechte).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import path from "node:path";
import { CryptoError, loadMasterSecret } from "@paibot/crypto";
import { prepareDatabase, type StartLog } from "@paibot/db/migrate";
import { t } from "@paibot/shared/texte";

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

/**
 * Prüft die Pflicht-Einstellungen für den Betrieb und liefert verständliche Fehler (nie mit den
 * Werten selbst): `PAIBOT_SECRET` (32 Byte Base64, kein Platzhalter, erkennbar zufällig),
 * `DATABASE_URL` und – falls
 * gesetzt – `DATABASE_MIGRATION_URL` mit einem Passwort ab 24 Zeichen, das kein Platzhalter ist.
 */
export function checkProductionEnv(env: Env): string[] {
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

  for (const name of ["DATABASE_URL", "DATABASE_MIGRATION_URL"] as const) {
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
    if (password === "") errors.push(`${name} enthält kein Passwort.`);
    else if (isPlaceholder(password)) {
      errors.push(`Das Passwort in ${name} ist ein Platzhalter. Setze ein zufälliges Passwort.`);
    } else if (password.length < MIN_DB_PASSWORD_LENGTH) {
      errors.push(
        `Das Passwort in ${name} ist zu kurz (mindestens ${MIN_DB_PASSWORD_LENGTH} Zeichen).`,
      );
    }
  }
  return errors;
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
 * Läuft einmal beim Start des Servers. In Produktion (`NODE_ENV=production`) bricht ein Fehler
 * den Start ab (Exit-Code 1); in der Entwicklung bleibt es bei Meldungen. Ohne `DATABASE_URL`
 * startet die Entwicklung ohne Datenbank. Danach steht `DATABASE_MIGRATION_URL` nicht mehr in
 * `process.env`.
 */
export async function prepareStart(env: NodeJS.ProcessEnv, options: StartOptions = {}) {
  const log = options.log ?? consoleLog;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const production = env.NODE_ENV === "production";

  if (production) {
    const errors = checkProductionEnv(env);
    if (errors.length > 0) {
      for (const message of errors) log.error(message);
      log.error("Start abgebrochen: Einstellungen unvollständig.");
      exit(1);
      return;
    }
  } else if (!env.DATABASE_URL) {
    log.warn("DATABASE_URL fehlt – Migrationen übersprungen.");
    return;
  }

  const migrationsFolder =
    env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), "../../packages/db/drizzle");
  const result = await prepareDatabase({
    env,
    migrationsFolder,
    production,
    log,
    ...(options.attempts === undefined ? {} : { attempts: options.attempts }),
    ...(options.delayMs === undefined ? {} : { delayMs: options.delayMs }),
  });
  delete env.DATABASE_MIGRATION_URL;

  if (!result.ok) {
    log.error(result.message);
    if (production) {
      log.error("Start abgebrochen.");
      exit(1);
    }
  }
}
