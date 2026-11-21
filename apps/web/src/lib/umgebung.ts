/**
 * PaiBot – Einstellungen der Web-App aus der Umgebung: Adresse der App, Proxy, abgeleitete Schlüssel
 * und der Anbieter, den die Einrichtung verbindet.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { type DerivedKey, deriveKey, loadMasterSecret } from "@paibot/crypto";
import { classifyIpAddress, isIpAddress, PROVIDER_TEMPLATES } from "@paibot/llm";
import type { ProviderTemplateKey, Region } from "@paibot/shared/objekte";
import { t } from "@paibot/shared/texte";
import { vertrautProxy } from "./kopfzeilen";

type Env = Readonly<Record<string, string | undefined>>;

/** Schlüssel, die die Web-App aus `PAIBOT_SECRET` ableitet. */
export interface Schluessel {
  sitzung: DerivedKey<"session-v1">;
  geheimnisse: DerivedKey<"secrets-v1">;
  belege: DerivedKey<"keys-v1">;
}

/** Anbieter, den die Einrichtung mit dem eingegebenen Schlüssel verbindet. */
export interface EinrichtungsAnbieter {
  templateKey: ProviderTemplateKey;
  name: string;
  baseUrl: string;
  region: Region;
}

/** Name der Umgebungsvariable für einen anderen Anbieter in der Einrichtung (Tests, eigene Dienste). */
export const EINRICHTUNG_ANBIETER_ENV = "PAIBOT_EINRICHTUNG_ANBIETER_URL";

/**
 * Nur für Tests und Doku-Bilder: Adresse im eigenen Rechner oder Netz, unter der die Vorlagen
 * (EUrouter, Mistral) stattdessen erreicht werden, z. B. der Test-Anbieter. Eine Adresse außerhalb
 * des eigenen Netzes wird nicht angenommen.
 */
export const VORLAGEN_TESTADRESSE_ENV = "PAIBOT_VORLAGEN_TESTADRESSE";

/** Vorlagen, die die Auswahl anbietet. */
export type VorlagenSchluessel = keyof typeof PROVIDER_TEMPLATES;

/**
 * Anbieter einer Vorlage: Name, Adresse und Ort aus `PROVIDER_TEMPLATES`. Mit
 * `PAIBOT_VORLAGEN_TESTADRESSE` (nur lokal) zeigt die Vorlage auf diese Adresse, Ort `local`.
 */
export function vorlageAnbieter(schluessel: VorlagenSchluessel, env: Env): EinrichtungsAnbieter {
  const vorlage = PROVIDER_TEMPLATES[schluessel];
  const test = env[VORLAGEN_TESTADRESSE_ENV]?.trim();
  if (test) {
    try {
      const url = new URL(test);
      const host = url.hostname.replace(/^\[|\]$/g, "");
      const lokal =
        host === "localhost" || (isIpAddress(host) && classifyIpAddress(host) === "privat");
      if (lokal) {
        return {
          templateKey: schluessel,
          name: vorlage.name,
          baseUrl: url.href.replace(/\/+$/, ""),
          region: "local",
        };
      }
    } catch {
      // Ungültige Angabe: die echte Vorlage.
    }
  }
  return {
    templateKey: schluessel,
    name: vorlage.name,
    baseUrl: vorlage.baseUrl,
    region: vorlage.region,
  };
}

/**
 * Origin der App aus `APP_URL`, z. B. `https://paibot.example.de`. `undefined`, wenn die Variable
 * fehlt oder keine http(s)-Adresse ist; verändernde Anfragen werden dann abgelehnt.
 */
export function appOrigin(env: Env): string | undefined {
  const wert = env.APP_URL?.trim();
  if (!wert) return undefined;
  try {
    const url = new URL(wert);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

/** Läuft die App über https? Dann gelten `Secure` und die Cookie-Namen mit `__Host-`. */
export function istHttps(env: Env): boolean {
  return appOrigin(env)?.startsWith("https://") ?? false;
}

/** Steht die App hinter einem eigenen Proxy (`TRUST_PROXY=1`)? */
export function hinterProxy(env: Env): boolean {
  return vertrautProxy(env.TRUST_PROXY);
}

/** Leitet die Schlüssel der Web-App aus `PAIBOT_SECRET` ab; wirft ohne gültiges Geheimnis. */
export function schluesselAus(env: Env): Schluessel {
  const master = loadMasterSecret(env);
  return {
    sitzung: deriveKey(master, "session-v1"),
    geheimnisse: deriveKey(master, "secrets-v1"),
    belege: deriveKey(master, "keys-v1"),
  };
}

const SCHLUESSEL_CACHE = Symbol.for("paibot.web.schluessel");
type Halter = { [SCHLUESSEL_CACHE]?: { geheimnis: string; schluessel: Schluessel } };

/** Wie `schluesselAus(process.env)`, aber je Prozess nur einmal abgeleitet. */
export function prozessSchluessel(): Schluessel {
  const geheimnis = process.env.PAIBOT_SECRET ?? "";
  const halter = globalThis as Halter;
  const vorhanden = halter[SCHLUESSEL_CACHE];
  if (vorhanden && vorhanden.geheimnis === geheimnis) return vorhanden.schluessel;
  const schluessel = schluesselAus(process.env);
  halter[SCHLUESSEL_CACHE] = { geheimnis, schluessel };
  return schluessel;
}

function istLokal(url: URL): boolean {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  return (
    url.protocol === "http:" ||
    host === "localhost" ||
    host === "::1" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

/**
 * Anbieter der Einrichtung: EUrouter. Mit `PAIBOT_EINRICHTUNG_ANBIETER_URL` verbindet die
 * Einrichtung stattdessen einen eigenen OpenAI-kompatiblen Dienst (zum Beispiel den Test-Anbieter);
 * eine Adresse über http oder im eigenen Netz gilt dann als Region `local`. Als Name steht ein
 * Anzeigename („Lokaler Anbieter“ bzw. „Eigener Anbieter“), nicht Host und Port; die Adresse zeigt
 * die Seite Modell und Anbieter getrennt.
 */
export function einrichtungsAnbieter(env: Env): EinrichtungsAnbieter {
  const eigene = env[EINRICHTUNG_ANBIETER_ENV]?.trim();
  if (eigene) {
    try {
      const url = new URL(eigene);
      const lokal = istLokal(url);
      return {
        templateKey: "eigener",
        name: lokal ? t("modelle.anbieter.name.lokal") : t("modelle.anbieter.name.eigener"),
        baseUrl: url.href.replace(/\/+$/, ""),
        region: lokal ? "local" : "eu",
      };
    } catch {
      // Ungültige Angabe: EUrouter wie ohne Variable.
    }
  }
  return vorlageAnbieter("eurouter", env);
}

/** Ergebnis der Prüfung von `APP_URL` beim Start in Produktion. */
export interface AppUrlPruefung {
  /** Grund, aus dem der Start abbricht. */
  fehler?: string;
  /** Hinweis fürs Log; der Start geht weiter. */
  warnungen: string[];
}

type Bereich = "rechner" | "netz" | "oeffentlich";

/** IPv4 in Schreibweise a.b.c.d (so normalisiert `URL` jede IPv4), sonst `undefined`. */
function ipv4(host: string): number[] | undefined {
  const teile = host.split(".");
  if (teile.length !== 4 || !teile.every((t) => /^\d{1,3}$/.test(t))) return undefined;
  const zahlen = teile.map(Number);
  return zahlen.every((z) => z <= 255) ? zahlen : undefined;
}

function bereichIpv4([a = 0, b = 0]: number[]): Bereich {
  if (a === 127) return "rechner";
  if (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127)
  ) {
    return "netz";
  }
  return "oeffentlich";
}

/** IPv6 (ohne Klammern) in acht Gruppen zu 16 Bit, sonst `undefined`. */
function ipv6(host: string): number[] | undefined {
  if (!host.includes(":") || !/^[0-9a-f:.]+$/.test(host)) return undefined;
  let text = host;
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (v4?.[1] !== undefined) {
    const z = ipv4(v4[1]);
    if (z === undefined) return undefined;
    const [a = 0, b = 0, c = 0, d = 0] = z;
    text = `${text.slice(0, -v4[1].length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const doppelt = text.split("::");
  if (doppelt.length > 2) return undefined;
  const links = doppelt[0] === "" ? [] : (doppelt[0] ?? "").split(":");
  const rechts = doppelt.length === 2 && doppelt[1] !== "" ? (doppelt[1] ?? "").split(":") : [];
  const fehlt = 8 - links.length - rechts.length;
  if (doppelt.length === 1 ? fehlt !== 0 : fehlt < 1) return undefined;
  const gruppen = [...links, ...Array(doppelt.length === 2 ? fehlt : 0).fill("0"), ...rechts];
  if (!gruppen.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return undefined;
  return gruppen.map((g) => Number.parseInt(g, 16));
}

function bereichIpv6(g: number[]): Bereich {
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = g;
  if (g.slice(0, 7).every((x) => x === 0) && g7 === 1) return "rechner";
  // IPv4 in IPv6 (::ffff:a.b.c.d): wie die IPv4-Adresse.
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
    return bereichIpv4([g6 >> 8, g6 & 0xff, g7 >> 8, g7 & 0xff]);
  }
  if ((g0 & 0xfe00) === 0xfc00 || (g0 & 0xffc0) === 0xfe80) return "netz";
  return "oeffentlich";
}

/**
 * Wohin zeigt der Host einer Adresse? Zuerst als IP-Adresse (IPv4, IPv6, IPv4 in IPv6), dann als
 * Name: `localhost` und `*.localhost` sind der eigene Rechner; Namen ohne Punkt und mit den Endungen
 * `.local`, `.lan`, `.home.arpa`, `.internal` das eigene Netz; alle anderen Namen öffentlich, auch
 * wenn sie mit Ziffern beginnen wie eine Adresse.
 */
export function hostBereich(roh: string): Bereich {
  const host = roh
    .replace(/^\[|\]$/g, "")
    .toLowerCase()
    .replace(/\.$/, "");
  const v4 = ipv4(host);
  if (v4 !== undefined) return bereichIpv4(v4);
  if (host.includes(":")) {
    const v6 = ipv6(host);
    return v6 === undefined ? "oeffentlich" : bereichIpv6(v6);
  }
  if (host === "localhost" || host.endsWith(".localhost")) return "rechner";
  if (!host.includes(".") || /\.(local|lan|home\.arpa|internal)$/.test(host)) return "netz";
  return "oeffentlich";
}

/**
 * Prüft `APP_URL` für den Betrieb. Abbruch, wenn sie fehlt, keine http(s)-Adresse ist oder eine
 * öffentliche Adresse über `http://` nennt (dann gingen Passwort und Sitzung unverschlüsselt durchs
 * Netz). Erlaubt: `https://…`, `http://` nur für den eigenen Rechner (`localhost`, `127.…`, `::1`).
 * Warnung (Start geht weiter): `http://` im eigenen Netz (private Adressen, Namen ohne Punkt oder
 * mit `.local`, `.lan`, `.home.arpa`, `.internal`) und Pfad oder Abfrage in der Adresse.
 */
export function pruefeAppUrl(env: Env): AppUrlPruefung {
  const warnungen: string[] = [];
  const wert = env.APP_URL?.trim();
  const beispiel = "z. B. APP_URL=https://paibot.example.de";
  if (!wert) {
    return {
      fehler: `APP_URL fehlt. Setze die Adresse, unter der du PaiBot im Browser öffnest (${beispiel}).`,
      warnungen,
    };
  }
  let url: URL;
  try {
    url = new URL(wert);
  } catch {
    return { fehler: `APP_URL ist keine gültige Adresse (${beispiel}).`, warnungen };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { fehler: `APP_URL muss mit https:// beginnen (${beispiel}).`, warnungen };
  }
  if (url.username !== "" || url.password !== "") {
    return { fehler: "APP_URL darf keinen Benutzer und kein Passwort enthalten.", warnungen };
  }
  if ((url.pathname !== "/" && url.pathname !== "") || url.search !== "" || url.hash !== "") {
    warnungen.push(
      `APP_URL enthält einen Pfad oder eine Abfrage; PaiBot nutzt nur ${url.origin}. Trage genau diese Adresse ein.`,
    );
  }
  if (url.protocol === "http:") {
    const bereich = hostBereich(url.hostname);
    if (bereich === "rechner") return { warnungen };
    if (bereich === "netz") {
      warnungen.push(
        "APP_URL nutzt http:// im eigenen Netz: Passwort und Sitzung gehen dort unverschlüsselt über die Leitung, und Cookies laufen ohne Secure. Für den Zugang von außen https über den Proxy einrichten.",
      );
      return { warnungen };
    }
    return {
      fehler:
        "APP_URL nutzt http:// für eine öffentliche Adresse. So gingen Passwort und Sitzung unverschlüsselt durchs Netz. Richte https über einen Reverse-Proxy mit Zertifikat ein und setze APP_URL=https://….",
      warnungen,
    };
  }
  return { warnungen };
}

/** Hinweis, wenn PaiBot in Produktion `X-Forwarded-For` nicht nutzt (`TRUST_PROXY` nicht `1`). */
export function proxyWarnung(env: Env): string | undefined {
  if (hinterProxy(env)) return undefined;
  return "TRUST_PROXY ist nicht 1: Die Limits je Adresse (Anmelden, Einrichtung) können die Adressen nicht unterscheiden; es gilt nur die gemeinsame Bremse für alle. Hinter einem Reverse-Proxy TRUST_PROXY=1 setzen und den Port der App nie direkt freigeben.";
}

/**
 * Passt der Host einer Anfrage nicht zu `APP_URL`? Dann scheitern Anmelden und Einrichtung mit
 * „herkunft_falsch“; die Web-App schreibt einmal einen Hinweis ins Log. Ohne `APP_URL` oder ohne
 * Host: `false`.
 */
export function hostPasstNicht(host: string | null, origin: string | undefined): boolean {
  if (!host || origin === undefined) return false;
  try {
    return new URL(origin).host !== host.trim().toLowerCase();
  } catch {
    return false;
  }
}
