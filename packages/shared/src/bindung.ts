/**
 * PaiBot – Bindungen und Abdrücke: Zusatzdaten für verschlüsselte Werte, Abdruck des Ziels einer
 * Modell-Anfrage, der Argumente eines Werkzeug-Aufrufs und des Inhalts einer Regel. Hier steht nur,
 * WAS gebunden bzw. gehasht wird; das Rechnen geschieht in den Paketen mit Krypto.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { KeyId, ProviderId } from "./id";

/** Erste Zeile der Zusatzdaten (AAD) eines verschlüsselten Werts im Format `v2`. */
export const SECRET_AAD_PREFIX = "pb-geheimnis/v2";

/**
 * Woran ein verschlüsselter Wert gebunden ist: Tabelle, Datensatz und Zweck, dazu ein Zusatz, der
 * das Ziel festhält. Wird eines davon geändert, lässt sich der Wert nicht mehr entschlüsseln.
 *
 * - Anbieter-Schlüssel: Tabelle `providers`, ID des Anbieters, Zweck `api_key`, Zusatz = die
 *   normalisierte Basis-URL (`normalizedBaseUrl`, z. B. `https://api.eurouter.ai/v1`). Ein anderer
 *   Host, Port oder Pfad macht den Schlüssel unbrauchbar.
 * - Zweiter Schlüssel eines Anbieters (nur zum Lesen von Einstellungen des Kontos): wie der
 *   Anbieter-Schlüssel, aber Zweck `management_key`; beide Werte lassen sich nicht vertauschen.
 * - Signaturschlüssel: Tabelle `installation_keys`, ID des Schlüssels, Zweck `private_key`,
 *   Zusatz = öffentlicher Schlüssel (base64url).
 */
export type SecretBinding =
  | { table: "providers"; id: ProviderId; purpose: "api_key" | "management_key"; extra: string }
  | { table: "installation_keys"; id: KeyId; purpose: "private_key"; extra: string };

/**
 * Zusatzdaten (AAD) für AES-GCM im Format `v2` als Text; verschlüsselt werden ihre UTF-8-Bytes.
 * Fünf Zeilen, getrennt mit `\n`, ohne Zeilenumbruch am Ende:
 * `pb-geheimnis/v2`, Tabelle, Datensatz-ID, Zweck, Zusatz.
 */
export function secretAad(binding: SecretBinding): string {
  for (const part of [binding.table, binding.id, binding.purpose, binding.extra]) {
    if (part.length === 0 || part.includes("\n")) throw new TypeError("Ungültige Bindung");
  }
  return [SECRET_AAD_PREFIX, binding.table, binding.id, binding.purpose, binding.extra].join("\n");
}

/** Origin einer Basis-URL, z. B. `https://api.eurouter.ai` für `https://api.eurouter.ai/v1`. */
export function targetOrigin(baseUrl: string): string {
  return new URL(baseUrl).origin;
}

/**
 * Einheitliche Form einer Basis-URL, an die Schlüssel und Ziel-Abdruck gebunden sind: Schema, Host
 * und Port (wie `URL` sie normalisiert: klein geschrieben, Standard-Port weggelassen, IDN als
 * Punycode) und der Pfad ohne Schrägstriche am Ende, z. B. `https://api.eurouter.ai/v1` für
 * `HTTPS://API.EuRouter.ai:443/v1/`. Groß- und Kleinschreibung im Pfad bleibt erhalten.
 *
 * Wirft `TypeError` bei allem, was keine Basis-URL ist: kein `http`/`https`, Zugangsdaten
 * (`user:pass@`), Abfrage (`?`) oder Anker (`#`), auch leer. Solche Adressen lehnt schon die
 * Eingabe ab; eine gespeicherte Adresse dieser Art bekommt nie einen Schlüssel.
 */
export function normalizedBaseUrl(baseUrl: string): string {
  if (typeof baseUrl !== "string" || baseUrl.includes("?") || baseUrl.includes("#")) {
    throw new TypeError("Ungültige Basis-URL");
  }
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new TypeError("Ungültige Basis-URL");
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username !== "" ||
    url.password !== "" ||
    url.hostname === ""
  ) {
    throw new TypeError("Ungültige Basis-URL");
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

/**
 * Bindung des Schlüssels eines Anbieters an seinen Datensatz und seine ganze Basis-URL
 * (`normalizedBaseUrl`). Ändert sich die Adresse, passt der gespeicherte Schlüssel nicht mehr; er
 * muss neu eingetragen oder bewusst umgebunden werden. Wirft `TypeError` bei einer ungültigen
 * Basis-URL.
 */
export function providerSecretBinding(providerId: ProviderId, baseUrl: string): SecretBinding {
  return {
    table: "providers",
    id: providerId,
    purpose: "api_key",
    extra: normalizedBaseUrl(baseUrl),
  };
}

/**
 * Bindung des zweiten Schlüssels eines Anbieters (nur zum Lesen der Routing-Regeln): wie
 * `providerSecretBinding`, aber mit eigenem Zweck. Ein Wert des einen Schlüssels lässt sich nicht
 * als der andere entschlüsseln.
 */
export function providerManagementKeyBinding(
  providerId: ProviderId,
  baseUrl: string,
): SecretBinding {
  return {
    table: "providers",
    id: providerId,
    purpose: "management_key",
    extra: normalizedBaseUrl(baseUrl),
  };
}

/** Bindung des privaten Signaturschlüssels an seinen Datensatz und seinen öffentlichen Teil. */
export function signingKeySecretBinding(keyId: KeyId, publicKey: string): SecretBinding {
  return { table: "installation_keys", id: keyId, purpose: "private_key", extra: publicKey };
}

/** Präfix vor dem Abdruck des Ziels einer Modell-Anfrage. */
export const TARGET_DIGEST_PREFIX = "pb-ziel/v1\n";

/**
 * Text, über den der Abdruck des Ziels gebildet wird: `TARGET_DIGEST_PREFIX`, danach das
 * kanonische JSON von `{ baseUrl, providerId }` (Schlüssel sortiert, ohne Leerzeichen). Die
 * Basis-URL geht in der Form von `normalizedBaseUrl` ein, also genauso wie in der Bindung des
 * Schlüssels. Abdruck = `sha256:` + Hex klein von SHA-256 über die UTF-8-Bytes dieses Texts.
 * Wirft `TypeError` bei einer ungültigen Basis-URL.
 */
export function targetDigestInput(providerId: ProviderId, baseUrl: string): string {
  return `${TARGET_DIGEST_PREFIX}${JSON.stringify({ baseUrl: normalizedBaseUrl(baseUrl), providerId })}`;
}

/**
 * Präfix vor dem Abdruck der Argumente eines Werkzeug-Aufrufs. Abdruck =
 * `hmac-sha256:` + Hex klein von HMAC-SHA-256 mit dem Schlüssel `context-v1` über die UTF-8-Bytes
 * von `TOOL_ARGS_DIGEST_PREFIX` + kanonisches JSON der Argumente. Die Argumente selbst stehen nie
 * im Beleg.
 */
export const TOOL_ARGS_DIGEST_PREFIX = "pb-werkzeug/v1\n";

/**
 * Präfix vor der Prüfsumme einer Regel. Prüfsumme = `sha256:` + Hex klein von SHA-256 über die
 * UTF-8-Bytes von `RULE_HASH_PREFIX` + kanonisches JSON von `ruleContent(regel)`.
 */
export const RULE_HASH_PREFIX = "pb-regel/v1\n";
