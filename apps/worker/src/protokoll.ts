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

/**
 * Ausgabe für Meldungen des Workers. Jede Meldung ist genau eine Zeile.
 *
 * Grundsatz: Der Worker loggt nur feste Texte und Kennungen (z. B. die ID eines Laufs). Fehler
 * fremder Herkunft (Datenbank, Netz, Anbieter) kommen nie als rohes Objekt ins Log, sondern nur über
 * `describeError`: Name, Code und ein geschwärzter, gekürzter Text; von Ursachen (`cause`) nur Name
 * und Code. Jede Zeile wird zusätzlich beim Schreiben bereinigt (`sanitizeLine`).
 */
export interface WorkerLog {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * Zeichen, die eine Zeile im Log umbrechen, überschreiben oder anders aussehen lassen könnten:
 * Steuerzeichen (auch ESC für Terminal-Befehle), Zeilen- und Absatztrenner (U+2028, U+2029) und
 * Zeichen für die Schreibrichtung.
 */
const UNSAFE_CHARS = /[\p{Cc}\u2028\u2029\u200e\u200f\u202a-\u202e\u2066-\u2069]+/gu;

function oneLine(message: string): string {
  return message
    .replace(UNSAFE_CHARS, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Was auch ohne Kenntnis der Umgebung nie im Log steht: Zugangsdaten in Adressen (`user:pass@`,
 * auch mit Sonderzeichen), Werte nach `Authorization`, `Bearer`/`Basic`/`Token`, nach Namen wie
 * `api_key`, `password`, `secret`, `token` und Schlüssel in der Form `sk-…`.
 */
const GENERIC_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/([a-z][a-z0-9+.-]*:\/\/)\S*@/gi, "$1***@"],
  [
    /\b((?:proxy-)?authorization|x-api-key|api[_-]?key|apikey|access[_-]?token|token|secret|password|passwort|pwd)(["']?\s*[:=]\s*["']?)(?:(?:bearer|basic|token)\s+)?[^\s"',;&}]+/gi,
    "$1$2***",
  ],
  [/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{4,}/gi, "$1 ***"],
  [/\bsk-[A-Za-z0-9_-]{8,}/g, "sk-***"],
];

/** Schreibt auf die Konsole, jede Zeile mit `LOG_PREFIX`, bereinigt mit `sanitizeLine`. */
export const consoleLog: WorkerLog = {
  info: (m) => console.log(`${LOG_PREFIX} ${sanitizeLine(m)}`),
  warn: (m) => console.warn(`${LOG_PREFIX} ${sanitizeLine(m)}`),
  error: (m) => console.error(`${LOG_PREFIX} ${sanitizeLine(m)}`),
};

/**
 * Letzte Sicherung für jede Zeile, auch für Texte, die nicht über `describeError` kommen: genau
 * eine Zeile ohne Steuerzeichen, allgemeine Muster für Zugangsdaten geschwärzt.
 */
export function sanitizeLine(message: string): string {
  let result = String(message);
  for (const [pattern, replacement] of GENERIC_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return oneLine(result);
}

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
      if (password) values.push(password, safeDecode(password));
    } catch {
      // Eine ungültige Adresse meldet die Prüfung der Umgebung.
    }
  }
  // Nur Werte ab vier Zeichen, damit kurze Werte nicht wahllos Text schwärzen.
  return [...new Set(values.filter((value) => value.length >= 4))].sort(
    (a, b) => b.length - a.length,
  );
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function escapeRegExp(char: string): string {
  return char.replace(/[\\^$.*+?()[\]{}|/-]/g, "\\$&");
}

/** Hex eines Bytes, Groß- und Kleinschreibung egal, als Teil eines Musters (`%2F` und `%2f`). */
function percentPattern(byte: number): string {
  return [...byte.toString(16).padStart(2, "0")]
    .map((digit) => (/[a-f]/.test(digit) ? `[${digit}${digit.toUpperCase()}]` : digit))
    .join("");
}

/**
 * Muster für einen geheimen Wert in allen Formen, in denen er in einem Fehlertext auftauchen kann:
 * wörtlich, %-kodiert (auch klein geschrieben oder nur teilweise), als base64url (`-` und `_`
 * statt `+` und `/`), mit oder ohne `=` am Ende, mit Zeilenumbrüchen dazwischen (mehrzeilige
 * Werte).
 */
function secretPattern(secret: string): string {
  const plain = safeDecode(secret).replace(/=+$/, "");
  const parts: string[] = [];
  for (const char of plain) {
    if (/\s/.test(char)) {
      parts.push("\\s+");
      continue;
    }
    const options = [escapeRegExp(char)];
    if (char === "+") options.push("-");
    if (char === "/") options.push("_");
    const bytes = Buffer.from(char, "utf8");
    options.push([...bytes].map((byte) => `%${percentPattern(byte)}`).join(""));
    if (char === "+") options.push(`%${percentPattern(0x2d)}`);
    parts.push(`(?:${options.join("|")})`);
  }
  return `${parts.join("")}(?:=|%3[dD])*`;
}

/** Ersetzt Zugangsdaten in Adressen und alle bekannten Geheimnisse (in allen Formen) durch `***`. */
export function redact(text: string, secrets: readonly string[]): string {
  let result = String(text);
  const usable = secrets.filter((secret) => secret.length >= 4);
  if (usable.length > 0) {
    // Längere Werte zuerst, damit ein kürzerer nicht einen Teil eines längeren übrig lässt.
    const sorted = [...usable].sort((a, b) => b.length - a.length);
    result = result.replace(new RegExp(sorted.map(secretPattern).join("|"), "g"), "***");
  }
  for (const [pattern, replacement] of GENERIC_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

const MAX_ERROR_TEXT = 300;
const MAX_CAUSES = 3;
const KENNUNG = /^[A-Za-z0-9_.-]{1,60}$/;

/** Name und Code eines Fehlers als feste Kennungen; alles andere wird verworfen. */
function headOf(error: unknown): string {
  if (error === null || typeof error !== "object") return typeof error;
  const record = error as { name?: unknown; code?: unknown };
  const name = typeof record.name === "string" && KENNUNG.test(record.name) ? record.name : "Error";
  const code =
    typeof record.code === "string" && KENNUNG.test(record.code)
      ? record.code
      : typeof record.code === "number" && Number.isInteger(record.code)
        ? String(record.code)
        : "";
  return code === "" ? name : `${name} (${code})`;
}

/**
 * Kurze Beschreibung eines Fehlers für das Log: Name und Code (nur wenn sie wie Kennungen aussehen),
 * der Text geschwärzt (zuerst die Geheimnisse, dann eine Zeile daraus) und gekürzt, dazu Name und
 * Code der Ursachen (`cause`, höchstens drei), nie deren Texte oder weitere Felder.
 */
export function describeError(error: unknown, secrets: readonly string[]): string {
  if (error === null || typeof error !== "object") {
    return oneLine(redact(String(error), secrets)).slice(0, 120);
  }
  // Auch einfache Objekte mit `message` (so melden manche Bibliotheken Fehler) werden wie ein
  // Fehler beschrieben, statt als „[object Object]“.
  const head = headOf(error);
  const raw = (error as { message?: unknown }).message;
  const text = typeof raw === "string" ? oneLine(redact(raw, secrets)) : "";
  const short = text.length > MAX_ERROR_TEXT ? `${text.slice(0, MAX_ERROR_TEXT)} …` : text;
  const causes: string[] = [];
  let current: unknown = (error as { cause?: unknown }).cause;
  for (let i = 0; i < MAX_CAUSES && current !== undefined && current !== null; i++) {
    causes.push(headOf(current));
    current = typeof current === "object" ? (current as { cause?: unknown }).cause : undefined;
  }
  const described = short === "" ? head : `${head}: ${short}`;
  return causes.length === 0 ? described : `${described} [Ursache: ${causes.join(" ← ")}]`;
}
