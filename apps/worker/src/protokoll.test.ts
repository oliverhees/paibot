/**
 * PaiBot – Tests: Schwärzen im Log des Workers mit gezielt bösen Werten.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  consoleLog,
  describeError,
  LOG_PREFIX,
  redact,
  sanitizeLine,
  secretsOf,
} from "./protokoll";

// Base64 mit `+`, `/` und `=`; wird bei jedem Lauf neu erzeugt.
function base64WithSpecials(): string {
  for (;;) {
    const value = randomBytes(32).toString("base64");
    if (value.includes("+") && value.includes("/")) return value;
  }
}

const SECRET = base64WithSpecials();
const RAW_PASSWORD = `p/a@ss:${randomBytes(6).toString("hex")}`;
const ENCODED_PASSWORD = encodeURIComponent(RAW_PASSWORD);
const SCHLEUSE_KEY = `sk-schleuse-${randomBytes(12).toString("hex")}`;
const env = {
  PAIBOT_SECRET: SECRET,
  DATABASE_URL: `postgres://paibot_app:${ENCODED_PASSWORD}@postgres:5432/paibot`,
  SCHLEUSE_KEY,
};
const secrets = secretsOf(env);
/** `%2F` → `%2f`: nur die Hex-Ziffern der Kodierung klein. */
const lowerHex = (value: string) => value.replace(/%[0-9A-F]{2}/g, (m) => m.toLowerCase());
const described = (message: string) => describeError(new Error(message), secrets);

/** Kein Teil eines Geheimnisses ab acht Zeichen darf übrig bleiben. */
function expectClean(text: string): void {
  const forms = [
    SECRET,
    SECRET.replace(/=+$/, ""),
    SECRET.replace(/\+/g, "-").replace(/\//g, "_"),
    RAW_PASSWORD,
    ENCODED_PASSWORD,
    lowerHex(ENCODED_PASSWORD),
    SCHLEUSE_KEY,
  ];
  for (const form of forms) expect(text, form).not.toContain(form.slice(0, 12));
}

afterEach(() => vi.restoreAllMocks());

describe("Schwärzen bekannter Geheimnisse", () => {
  it.each([
    ["wörtlich", SECRET],
    ["ohne = am Ende", SECRET.replace(/=+$/, "")],
    ["als base64url", SECRET.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")],
    ["%-kodiert", encodeURIComponent(SECRET)],
    ["%-kodiert, Hex klein", lowerHex(encodeURIComponent(SECRET))],
  ])("PAIBOT_SECRET %s", (_name, form) => {
    const text = described(`Geheimnis ${form} gesehen`);
    expectClean(text);
    expect(text).toContain("***");
  });

  it.each([
    ["roh", RAW_PASSWORD],
    ["%-kodiert", ENCODED_PASSWORD],
    ["%-kodiert, Hex klein", lowerHex(ENCODED_PASSWORD)],
    ["teilweise kodiert", RAW_PASSWORD.replace("@", "%40")],
  ])("Passwort der Datenbank %s", (_name, form) => {
    expectClean(described(`Anmeldung mit ${form} fehlgeschlagen`));
  });

  it("Adresse mit Zugangsdaten mit Sonderzeichen, auch roh in der Meldung", () => {
    const text = described(
      `verbinde postgres://paibot_app:${RAW_PASSWORD}@postgres:5432/paibot und https://u:x/y@z@fremd.example/v1`,
    );
    expectClean(text);
    expect(text).toContain("postgres://***@postgres:5432/paibot");
    expect(text).toContain("https://***@fremd.example/v1");
  });

  it("mehrzeiliger Wert und über Zeilen verteilt", () => {
    const pem = `-----BEGIN KEY-----\n${randomBytes(24).toString("base64")}\n-----END KEY-----`;
    const own = secretsOf({ SCHLEUSE_KEY: pem });
    const text = describeError(new Error(`Schlüssel:\n${pem}\nEnde`), own);
    expect(text).not.toContain(pem.split("\n")[1]?.slice(0, 12));
    expect(text).not.toMatch(/[\r\n]/);
  });
});

describe("Normale Texte", () => {
  it("bleiben unverändert", () => {
    const text = "Lauf run_06f8k2m9 gescheitert: Datenbank antwortet nicht (Timeout nach 5000 ms)";
    expect(redact(text, secrets)).toBe(text);
    expect(sanitizeLine(text)).toBe(text);
  });
});

describe("Schwärzen ohne Kenntnis der Umgebung", () => {
  it.each([
    ["Authorization: Bearer sk-abcdef0123456789", "sk-abcdef01"],
    ["authorization=Basic dXNlcjpnZWhlaW0=", "dXNlcjpn"],
    ['{"headers":{"Authorization":"Bearer abc.def.ghi-jkl"}}', "abc.def.ghi"],
    ["Proxy-Authorization: Basic Zm9vOmJhcg==", "Zm9vOmJh"],
    ["x-api-key: 1234567890abcdef", "1234567890"],
    ['{"api_key":"geheim-0123456789"}', "geheim-0123"],
    ["apiKey=wert-0123456789", "wert-0123"],
    ["password=hunter2-lang", "hunter2"],
    ["Schlüssel sk-proj-AbCdEf0123456789 abgelehnt", "AbCdEf0123"],
    ["bearer   lowercase-token-0123", "lowercase-token"],
  ])("%s", (message, leaked) => {
    expect(describeError(new Error(message), [])).not.toContain(leaked);
    expect(sanitizeLine(message)).not.toContain(leaked);
  });
});

describe("Log-Fälschung und Steuerzeichen", () => {
  it.each([
    ["Zeilenumbruch", "a\nb"],
    ["Wagenrücklauf", "a\rb"],
    ["U+2028", "a\u2028b"],
    ["U+2029", "a\u2029b"],
    ["NEL U+0085", "a\u0085b"],
    ["ESC-Folge", "a\u001b[2Jb"],
    ["Schreibrichtung", "a\u202eb"],
    ["NUL", "a\u0000b"],
  ])("%s wird entfernt", (_name, value) => {
    const text = described(`zeile1 ${value} ${LOG_PREFIX} gefälscht`);
    expect(text).not.toMatch(/[\p{Cc}\u2028\u2029\u202a-\u202e]/u);
  });

  it("die Konsole bekommt genau eine bereinigte Zeile, auch ohne describeError", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    consoleLog.warn(
      `Herzschlag ausgesetzt: connect postgres://u:${RAW_PASSWORD}@db\n${LOG_PREFIX} gefälscht\u2028\u001b[31m`,
    );
    const line = String(spy.mock.calls[0]?.[0]);
    expect(line.startsWith(`${LOG_PREFIX} Herzschlag ausgesetzt`)).toBe(true);
    expect(line).not.toMatch(/[\p{Cc}\u2028\u2029]/u);
    expect(line).not.toContain(RAW_PASSWORD);
  });
});

describe("Verschachtelte Fehler", () => {
  it("von Ursachen nur Name und Code, nie Texte oder Felder", () => {
    const inner = Object.assign(new Error(`innen ${SECRET} und ${SCHLEUSE_KEY}`), {
      code: "ECONNREFUSED",
      config: { headers: { authorization: `Bearer ${SCHLEUSE_KEY}` } },
    });
    const middle = new TypeError("fetch failed", { cause: inner });
    const outer = Object.assign(new Error("Abruf fehlgeschlagen", { cause: middle }), {
      response: { body: `geheim ${SECRET}` },
    });
    const text = describeError(outer, secrets);
    expectClean(text);
    expect(text).toBe("Error: Abruf fehlgeschlagen [Ursache: TypeError ← Error (ECONNREFUSED)]");
  });

  it("Name und Code nur, wenn sie wie Kennungen aussehen", () => {
    const sneaky = Object.assign(new Error("x"), { code: `E ${SECRET}` });
    sneaky.name = `Fehler\n${LOG_PREFIX} gefälscht`;
    const text = describeError(sneaky, secrets);
    expect(text).toBe("Error: x");
  });

  it("einfaches Objekt mit message: wie ein Fehler beschrieben, nie „[object Object]“", () => {
    const wieBibliothek = {
      code: "57P01",
      message: `Verbindung beendet ${SECRET}`,
      stack: `Error: x\n    at geheim (${SECRET})`,
      queue: "laeufe",
    };
    const text = describeError(wieBibliothek, secrets);
    expectClean(text);
    expect(text).toBe("Error (57P01): Verbindung beendet ***");
    expect(describeError({}, secrets)).toBe("Error");
    expect(describeError({ message: 42 }, secrets)).toBe("Error");
  });

  it("kein Fehler-Objekt: geschwärzt und gekürzt", () => {
    const text = describeError(`roh ${SECRET} ${"y".repeat(500)}`, secrets);
    expectClean(text);
    expect(text.length).toBeLessThanOrEqual(120);
  });
});
