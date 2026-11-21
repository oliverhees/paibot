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
import { PROVIDER_TEMPLATES } from "@paibot/llm";
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
  const vorlage = PROVIDER_TEMPLATES.eurouter;
  return {
    templateKey: "eurouter",
    name: vorlage.name,
    baseUrl: vorlage.baseUrl,
    region: vorlage.region,
  };
}

/** Ergebnis der Prüfung von `APP_URL` beim Start in Produktion. */
export interface AppUrlBefund {
  /** Grund, aus dem der Start abbricht. */
  fehler?: string;
  /** Hinweis fürs Log; der Start geht weiter. */
  warnungen: string[];
}

function istLoopback(host: string): boolean {
  return (
    host === "localhost" || host.endsWith(".localhost") || host === "::1" || /^127\./.test(host)
  );
}

function istEigenesNetz(host: string): boolean {
  return (
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^f[cd][0-9a-f]{0,2}:/.test(host) ||
    !host.includes(".") ||
    /\.(local|lan|home\.arpa|internal)$/.test(host)
  );
}

/**
 * Prüft `APP_URL` für den Betrieb. Abbruch, wenn sie fehlt, keine http(s)-Adresse ist oder eine
 * öffentliche Adresse über `http://` nennt (dann gingen Passwort und Sitzung unverschlüsselt durchs
 * Netz). Erlaubt: `https://…`, `http://` nur für den eigenen Rechner (`localhost`, `127.…`, `::1`).
 * Warnung (Start geht weiter): `http://` im eigenen Netz (private Adressen, Namen ohne Punkt oder
 * mit `.local`, `.lan`, `.home.arpa`, `.internal`) und Pfad oder Abfrage in der Adresse.
 */
export function pruefeAppUrl(env: Env): AppUrlBefund {
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
    const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (istLoopback(host)) return { warnungen };
    if (istEigenesNetz(host)) {
      warnungen.push(
        "APP_URL nutzt http:// im eigenen Netz: Passwort und Sitzung gehen dort unverschlüsselt über die Leitung, und Cookies laufen ohne Secure. Für den Zugang von außen https über den Proxy einrichten.",
      );
      return { warnungen };
    }
    return {
      fehler:
        "APP_URL nutzt http:// für eine öffentliche Adresse. So gingen Passwort und Sitzung unverschlüsselt durchs Netz. Richte https über den Proxy ein (z. B. Coolify) und setze APP_URL=https://….",
      warnungen,
    };
  }
  return { warnungen };
}

/** Hinweis, wenn PaiBot in Produktion `X-Forwarded-For` nicht nutzt (`TRUST_PROXY` nicht `1`). */
export function proxyWarnung(env: Env): string | undefined {
  if (hinterProxy(env)) return undefined;
  return "TRUST_PROXY ist nicht 1: Die Limits je Adresse (Anmelden, Einrichtung) können die Adressen nicht unterscheiden; es gilt nur die gemeinsame Bremse für alle. Hinter einem Proxy (Coolify, Caddy, nginx) TRUST_PROXY=1 setzen und den Port der App nie direkt freigeben.";
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
