/**
 * PaiBot – Adresse einer App prüfen: aus der eingegebenen Adresse die Fakten für das Tor rechnen
 * (Vorbedingung `app_adresse_erlaubt`), noch vor jeder Verbindung. In die Fakten, den Ursprung und
 * den Abdruck geht nie ein Benutzer-Teil, ein Abfrage-Teil oder ein Anker: Die Adresse kann ein
 * Zugangsdatum tragen, und das steht in keinem Beleg.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { hashToken } from "@paibot/crypto";
import { pruefeAdresse } from "@paibot/mcp";
import { appTargetDigestInput, normalizedAppUrl } from "@paibot/shared/bindung";
import { PaiBotError } from "@paibot/shared/fehler";
import type { Sha256Digest } from "@paibot/shared/grundtypen";
import type { AppId } from "@paibot/shared/ids";
import { appOriginSchema } from "@paibot/shared/tor-fassung-3";
import { MAX_ADRESSE_ZEICHEN } from "./grenzen";

/** Die Prüfungen der Vorbedingung `app_adresse_erlaubt`, gerechnet aus der Eingabe. */
export interface AdressFakten {
  addressHttps: boolean;
  addressPublic: boolean;
  addressPort443: boolean;
  addressUserinfo: boolean;
  addressQuery: boolean;
  addressFragment: boolean;
}

/** Das geprüfte Ziel: Fakten, lesbarer Ursprung, Abdruck und die Adresse, die gespeichert wird. */
export interface GeprueftesZiel {
  fakten: AdressFakten;
  /**
   * `https://host` (mit Port, wenn er nicht 443 ist), nie mit Pfad, Benutzer- oder Abfrage-Teil.
   * Beginnt immer mit `https://`, auch wenn `http` eingegeben wurde: Der Vertrag des Tors kennt
   * nur diese Form. Ob die Eingabe `http` war, steht allein im Fakt `addressHttps`; das Tor lehnt
   * sie dann ab, und nichts davon wird gespeichert oder abgerufen.
   */
  origin: string;
  /** Abdruck von Kennung und bereinigter Adresse (Fakt `targetDigest`). */
  digest: Sha256Digest;
  /** Adresse in der gespeicherten Form, ohne Benutzer-, Abfrage- und Anker-Teil. */
  url: string;
}

const BEFEHL_ANFANG =
  /^(?:npx|npm|pnpm|yarn|bunx|bun|uvx|uv|pipx|pip|python3?|node|deno|docker|podman|java|go|cargo|sh|bash|zsh|cmd|powershell)(?:\s|$)/i;

function ungueltig(): PaiBotError {
  return new PaiBotError("eingabe_ungueltig", { felder: [{ feld: "url", code: "ungueltig" }] });
}

function unzulaessig(): PaiBotError {
  return new PaiBotError("app_adresse_unzulaessig");
}

/**
 * Rechnet die Fakten aus der eingegebenen Adresse. Wirft `app_befehl_nicht_erlaubt`, wenn ein
 * Befehl statt einer Adresse eingefügt wurde, `eingabe_ungueltig` bei leerer oder nicht lesbarer
 * Eingabe und `app_adresse_unzulaessig`, wenn sich gar kein Ursprung bilden lässt (andere Art von
 * Adresse als `http` und `https`). Alles andere liefert Fakten, über die das Tor entscheidet: Ein
 * verletztes Merkmal (`http`, IP-Adresse, Port, Benutzer-Teil …) lehnt das Tor mit einem Beleg ab.
 */
export function zielAus(roh: string, appId: AppId): GeprueftesZiel {
  const eingabe = roh.trim();
  if (eingabe === "" || eingabe.length > MAX_ADRESSE_ZEICHEN) throw ungueltig();
  if (BEFEHL_ANFANG.test(eingabe) || (!eingabe.includes("://") && /\s/.test(eingabe))) {
    throw new PaiBotError("app_befehl_nicht_erlaubt");
  }
  // Steuer-, Format- und Leerzeichen mitten in der Adresse: `new URL` entfernt Tab und Zeilenumbruch
  // still (aus `https://a.te<LF>st/mcp` würde `https://a.test/mcp`) und kodiert Leerzeichen. Die
  // Adresse, die der Besitzer eingibt, muss die sein, die gespeichert wird.
  if (/[\p{Cc}\p{Cf}\s]/u.test(eingabe)) throw ungueltig();
  let url: URL;
  try {
    url = new URL(eingabe);
  } catch {
    throw ungueltig();
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.hostname === "") {
    throw unzulaessig();
  }
  const https = url.protocol === "https:";
  const ohneAnker = url.href.split("#")[0] ?? "";
  // Ein Probe-Ziel nur aus dem Namen: Es sagt, ob der Name öffentlich aussieht (keine IP-Adresse,
  // kein interner Name), unabhängig von Protokoll, Port und Zusätzen der Eingabe.
  const probe = pruefeAdresse(`https://${url.hostname}/`);
  const oeffentlich =
    probe.ok ||
    (probe.grund !== "ip_adresse" &&
      probe.grund !== "interner_name" &&
      probe.grund !== "ungueltig");
  // Immer `https://`, auch bei eingegebenem `http`: Das Schema des Tors lässt nur diese Form zu. Das
  // echte Schema steht im Fakt `addressHttps`, über den das Tor `http` ablehnt.
  const origin = `https://${url.host}`;
  if (!appOriginSchema.safeParse(origin).success) throw unzulaessig();
  let bereinigt: string;
  try {
    bereinigt = normalizedAppUrl(`https://${url.hostname}${url.pathname}`);
  } catch {
    throw unzulaessig();
  }
  return {
    fakten: {
      addressHttps: https,
      addressPublic: oeffentlich,
      addressPort443: url.port === "" ? https : url.port === "443",
      addressUserinfo: url.username !== "" || url.password !== "",
      addressQuery: ohneAnker.includes("?"),
      addressFragment: url.href.includes("#"),
    },
    origin,
    digest: `sha256:${hashToken(appTargetDigestInput(appId, bereinigt))}` as Sha256Digest,
    url: bereinigt,
  };
}
