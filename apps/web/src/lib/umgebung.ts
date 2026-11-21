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
