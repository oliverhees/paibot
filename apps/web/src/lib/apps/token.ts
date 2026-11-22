/**
 * PaiBot – Zugangs-Token einer App: prüfen, verschlüsseln und für einen Abruf lesen. Der Token
 * wird an Datensatz, volle Adresse und Zweck gebunden verschlüsselt; ändert sich die Adresse,
 * lässt er sich nicht mehr lesen. Der Klartext verlässt dieses Modul nur als Rückgabe von
 * `tokenLesen` an den Abruf der Liste und steht nirgends sonst.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { decryptSecret, encryptSecret } from "@paibot/crypto";
import { appTokenBinding, secretAad } from "@paibot/shared/bindung";
import { PaiBotError } from "@paibot/shared/fehler";
import type { AppId } from "@paibot/shared/ids";
import type { ZugangsDienste } from "../zugang/dienste";

/** Längster Token, den die Web-App annimmt. */
export const MAX_TOKEN_ZEICHEN = 4096;

/** Sichtbare ASCII-Zeichen ohne Leerzeichen, so wie sie als `Authorization: Bearer …` gehen. */
const TOKEN_MUSTER = /^[\x21-\x7E]+$/;

/** Feldfehler am Feld „Token“; ohne den Wert zu nennen. */
export function tokenUngueltig(): PaiBotError {
  return new PaiBotError("eingabe_ungueltig", { felder: [{ feld: "token", code: "ungueltig" }] });
}

/** Prüft die Form des Tokens. Wirft `eingabe_ungueltig` am Feld „token“, nie mit dem Wert. */
export function tokenPruefen(token: string): void {
  if (token.length === 0 || token.length > MAX_TOKEN_ZEICHEN || !TOKEN_MUSTER.test(token)) {
    throw tokenUngueltig();
  }
}

/** Verschlüsselt den Token, gebunden an Kennung, volle Adresse und Zweck. */
export function tokenVerschluesseln(
  d: ZugangsDienste,
  appId: AppId,
  url: string,
  token: string,
): string {
  return encryptSecret(token, d.schluessel().geheimnisse, {
    aad: secretAad(appTokenBinding(appId, url)),
  });
}

/**
 * Liest den gespeicherten Token für einen Abruf. Passt die Bindung nicht (andere Adresse, anderer
 * Datensatz) oder ist der Wert beschädigt, endet es mit `app_zugang_ungueltig`, ohne den Grund
 * der Bibliothek weiterzugeben.
 */
export function tokenLesen(d: ZugangsDienste, appId: AppId, url: string, enc: string): string {
  try {
    return decryptSecret(enc, d.schluessel().geheimnisse, {
      aad: secretAad(appTokenBinding(appId, url)),
    });
  } catch {
    throw new PaiBotError("app_zugang_ungueltig");
  }
}
