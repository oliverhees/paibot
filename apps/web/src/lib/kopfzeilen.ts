/**
 * PaiBot – Sicherheits-Kopfzeilen der Antworten und Adresse des Clients hinter einem Proxy.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

/** Eine Kopfzeile in der Form, die `next.config.ts` und die Middleware erwarten. */
export interface Kopfzeile {
  key: string;
  value: string;
}

export interface KopfzeilenOptionen {
  /** `true` im Entwicklungs-Server (Hot-Reload braucht lockerere Regeln), sonst `false`. */
  entwicklung: boolean;
  /**
   * Nonce der Anfrage (siehe `neueNonce`). Mit Nonce gilt die strenge Fassung ohne
   * `'unsafe-inline'` für Skripte; sie setzt die Middleware pro Anfrage. Ohne Nonce
   * entsteht die statische Fassung für `next.config.ts`.
   */
  nonce?: string;
  /**
   * Läuft die App über https (`APP_URL`)? Nur dann geht HSTS mit; ohne Angabe gilt die bisherige
   * Regel (HSTS außerhalb der Entwicklung).
   */
  https?: boolean;
}

/** Eine Nonce besteht aus Base64-Zeichen; alles andere könnte die Regel verändern. */
const NONCE_MUSTER = /^[A-Za-z0-9+/_-]{16,}={0,2}$/;

/** Neue Zufalls-Nonce (128 Bit, Base64) für genau eine Anfrage. Läuft auch in der Edge-Laufzeit. */
export function neueNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

/** Wert der Content-Security-Policy. Die App lädt nichts von fremden Servern. */
export function contentSecurityPolicy({ entwicklung, nonce }: KopfzeilenOptionen): string {
  if (nonce !== undefined && !NONCE_MUSTER.test(nonce)) {
    throw new Error("Ungültige Nonce für die Content-Security-Policy.");
  }
  const skripte = ["'self'"];
  const stile = ["'self'"];
  if (entwicklung) {
    // Entwicklung: React braucht eval für Fehler-Stapel, Next streamt Inline-Skripte und -Stile.
    skripte.push("'unsafe-inline'", "'unsafe-eval'");
    stile.push("'unsafe-inline'");
  } else if (nonce) {
    skripte.push(`'nonce-${nonce}'`, "'strict-dynamic'");
    stile.push(`'nonce-${nonce}'`);
  } else {
    // Statische Fassung: Next fügt Start-Skripte inline ein, deren Nonce hier nicht bekannt ist.
    skripte.push("'unsafe-inline'");
  }
  const regeln: [string, string][] = [
    ["default-src", "'self'"],
    ["script-src", skripte.join(" ")],
    ["style-src", stile.join(" ")],
    // Die Oberfläche setzt Größen und Farben als style-Attribut; das lässt sich nicht mit Nonce erlauben.
    ["style-src-attr", "'unsafe-inline'"],
    ["img-src", "'self'"],
    ["font-src", "'self'"],
    ["connect-src", "'self'"],
    ["media-src", "'self'"],
    ["manifest-src", "'self'"],
    ["frame-src", "'none'"],
    ["frame-ancestors", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["object-src", "'none'"],
  ];
  return regeln.map(([name, wert]) => `${name} ${wert}`).join("; ");
}

/** Browser-Funktionen, die PaiBot nicht braucht, bleiben für die Seite und alle Rahmen aus. */
const ABGESCHALTETE_FUNKTIONEN = [
  "accelerometer",
  "autoplay",
  "browsing-topics",
  "camera",
  "display-capture",
  "geolocation",
  "gyroscope",
  "hid",
  "magnetometer",
  "microphone",
  "midi",
  "payment",
  "serial",
  "usb",
  "xr-spatial-tracking",
];

/** Alle Sicherheits-Kopfzeilen für eine Antwort. */
export function sicherheitsKopfzeilen(optionen: KopfzeilenOptionen): Kopfzeile[] {
  const zeilen: Kopfzeile[] = [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(optionen) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "no-referrer" },
    {
      key: "Permissions-Policy",
      value: ABGESCHALTETE_FUNKTIONEN.map((name) => `${name}=()`).join(", "),
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  ];
  // Nur ausgeliefert, wenn die Seite über https kam; über http ignorieren Browser die Zeile.
  if (!optionen.entwicklung && optionen.https !== false) {
    zeilen.push({ key: "Strict-Transport-Security", value: "max-age=31536000" });
  }
  return zeilen;
}

/**
 * Bündel für die Middleware: frische Nonce, die Kopfzeilen der Antwort und der Wert, den die
 * Middleware zusätzlich als Anfrage-Kopfzeile `Content-Security-Policy` und `x-nonce` weitergibt,
 * damit Next die Nonce an seine Skripte schreibt.
 */
export function kopfzeilenMitNonce(
  entwicklung: boolean,
  https?: boolean,
): {
  nonce: string;
  kopfzeilen: Kopfzeile[];
  csp: string;
} {
  const nonce = neueNonce();
  const kopfzeilen = sicherheitsKopfzeilen({
    entwicklung,
    nonce,
    ...(https === undefined ? {} : { https }),
  });
  const csp = kopfzeilen.find((z) => z.key === "Content-Security-Policy")?.value ?? "";
  return { nonce, kopfzeilen, csp };
}

/** `TRUST_PROXY` gilt nur bei genau `1`; jeder andere Wert (auch `true`) heißt: nicht vertrauen. */
export function vertrautProxy(wert: string | undefined): boolean {
  return wert === "1";
}

function alsAdresse(roh: string): string | undefined {
  let text = roh.trim().toLowerCase();
  if (text.startsWith("[")) {
    const ende = text.indexOf("]");
    if (ende < 0) return undefined;
    text = text.slice(1, ende);
  } else if (/^\d{1,3}(\.\d{1,3}){3}:\d{1,5}$/.test(text)) {
    text = text.slice(0, text.lastIndexOf(":"));
  }
  if (text.startsWith("::ffff:") && text.includes(".")) text = text.slice(7);
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(text)) {
    const teile = text.split(".").map(Number);
    return teile.every((teil) => teil <= 255) ? teile.join(".") : undefined;
  }
  if (text.length < 2 || text.length > 45 || !/^[0-9a-f:.]+$/.test(text) || !text.includes(":")) {
    return undefined;
  }
  try {
    new URL(`http://[${text}]/`);
  } catch {
    return undefined;
  }
  return text;
}

export interface ClientAdresseEingabe {
  /** Wert der Kopfzeile `X-Forwarded-For` (leer oder `null`, wenn sie fehlt). */
  weiterleitung: string | null | undefined;
  /** Ergebnis von `vertrautProxy(process.env.TRUST_PROXY)`. */
  vertrauteProxy: boolean;
  /** Adresse der direkten Verbindung, falls die Laufzeit sie kennt. */
  direkt?: string | undefined;
}

/** Wird verwendet, wenn weder eine vertrauenswürdige noch eine direkte Adresse bekannt ist. */
export const UNBEKANNTE_ADRESSE = "unbekannt";

/**
 * Adresse des Clients für Begrenzungen. `X-Forwarded-For` zählt nur, wenn `TRUST_PROXY=1`
 * ausdrücklich eingeschaltet ist, und dann nur der **rechte** Eintrag: den hängt der eigene
 * Proxy an. Die linken Einträge kann der Client frei wählen. Fehlt der Eintrag oder ist er
 * keine Adresse, gilt die direkte Verbindung; so landen alle in einem gemeinsamen Zähler,
 * statt sich durch eine gefälschte Kopfzeile aus der Begrenzung zu stehlen.
 */
export function clientAdresse({
  weiterleitung,
  vertrauteProxy,
  direkt,
}: ClientAdresseEingabe): string {
  const direkteAdresse = (direkt ? alsAdresse(direkt) : undefined) ?? UNBEKANNTE_ADRESSE;
  if (!vertrauteProxy || !weiterleitung) return direkteAdresse;
  const eintraege = weiterleitung.split(",");
  const rechts = eintraege[eintraege.length - 1] ?? "";
  return alsAdresse(rechts) ?? direkteAdresse;
}
