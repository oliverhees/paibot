/**
 * PaiBot – Log des Workers: eine Zeile je Ereignis mit festem Präfix, Geheimnisse geschwärzt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

/** Präfix jeder Zeile im Log des Workers. */
export const LOG_PREFIX = "[paibot-worker]";

/** Ausgabe für Meldungen des Workers. Jede Meldung ist genau eine Zeile. */
export interface WorkerLog {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

function oneLine(message: string): string {
  return message.replace(/\s*[\r\n]+\s*/g, " ").trim();
}

/** Schreibt auf die Konsole, jede Zeile mit `LOG_PREFIX`. */
export const consoleLog: WorkerLog = {
  info: (m) => console.log(`${LOG_PREFIX} ${oneLine(m)}`),
  warn: (m) => console.warn(`${LOG_PREFIX} ${oneLine(m)}`),
  error: (m) => console.error(`${LOG_PREFIX} ${oneLine(m)}`),
};

type Env = Readonly<Record<string, string | undefined>>;

const SECRET_VARIABLES = ["PAIBOT_SECRET", "SCHLEUSE_KEY", "FAKE_PROVIDER_CONTROL_KEY"] as const;
const URL_VARIABLES = ["DATABASE_URL", "DATABASE_MIGRATION_URL"] as const;

/** Werte aus der Umgebung, die nie im Log stehen dürfen (Schlüssel und Datenbank-Passwörter). */
export function secretsOf(env: Env): string[] {
  const values: string[] = [];
  for (const name of SECRET_VARIABLES) {
    const value = env[name]?.trim();
    if (value) values.push(value);
  }
  for (const name of URL_VARIABLES) {
    const value = env[name];
    if (!value) continue;
    try {
      const password = new URL(value).password;
      if (password) values.push(password, decodeURIComponent(password));
    } catch {
      // Eine ungültige Adresse meldet die Prüfung der Umgebung.
    }
  }
  // Nur Werte ab vier Zeichen, damit kurze Werte nicht wahllos Text schwärzen.
  return [...new Set(values.filter((value) => value.length >= 4))].sort(
    (a, b) => b.length - a.length,
  );
}

/** Ersetzt Zugangsdaten in Adressen und alle bekannten Geheimnisse durch `***`. */
export function redact(text: string, secrets: readonly string[]): string {
  let result = text.replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]*@/gi, "$1***@");
  for (const secret of secrets) result = result.split(secret).join("***");
  return result;
}

const MAX_ERROR_TEXT = 300;

/**
 * Kurze Beschreibung eines Fehlers für das Log: Name, Code (falls vorhanden) und Text, geschwärzt
 * und gekürzt.
 */
export function describeError(error: unknown, secrets: readonly string[]): string {
  if (!(error instanceof Error)) return redact(oneLine(String(error)), secrets).slice(0, 120);
  const code = (error as { code?: unknown }).code;
  const head = typeof code === "string" && code !== "" ? `${error.name} (${code})` : error.name;
  const text = redact(oneLine(error.message), secrets);
  const short = text.length > MAX_ERROR_TEXT ? `${text.slice(0, MAX_ERROR_TEXT)} …` : text;
  return short === "" ? head : `${head}: ${short}`;
}
