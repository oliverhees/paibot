/**
 * PaiBot – lädt den Prüfer `@paibot/receipts/pruefen` erst beim Prüfen in den Browser und stellt
 * fest, ob der Browser Ed25519 in Web Crypto kann. Der Prüfer bringt Zod mit; Zod läuft hier ohne
 * Code-Auswertung (`jitless`), damit die strenge Content-Security-Policy nichts melden muss.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { ChainAnchor } from "@paibot/shared/belege";
import type { Pruefer } from "./pruefung";

export interface PrueferImBrowser {
  pruefer: Pruefer;
  /** Liest einen Anker aus Text; wirft bei ungültigem Text. */
  ankerLesen(text: string): ChainAnchor;
}

let geladen: Promise<PrueferImBrowser> | undefined;

/** Lädt den Prüfer einmal (eigener Teil des Bündels, erst bei Bedarf). */
export function prueferLaden(): Promise<PrueferImBrowser> {
  geladen ??= (async () => {
    // Zod ohne Code-Auswertung, bevor der Prüfer seine Schemas baut (dasselbe Modul wie im Rahmen).
    await import("../ohne-auswertung");
    const [pruefer, belege] = await Promise.all([
      import("@paibot/receipts/pruefen"),
      import("@paibot/shared/belege"),
    ]);
    return { pruefer, ankerLesen: (text: string) => belege.parseAnchor(text) };
  })();
  geladen.catch(() => {
    geladen = undefined;
  });
  return geladen;
}

/** Öffentlicher Schlüssel aus dem ersten Prüfbeispiel von RFC 8032 (nur für den Test der Fähigkeit). */
const BEISPIEL_SCHLUESSEL = "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";

let faehig: Promise<boolean> | undefined;

/** Kann dieser Browser selbst prüfen (Web Crypto mit Ed25519 und SHA-256)? */
export function kannImBrowserPruefen(): Promise<boolean> {
  faehig ??= (async () => {
    const subtle = globalThis.crypto?.subtle;
    if (subtle === undefined) return false;
    try {
      const roh = new Uint8Array(
        BEISPIEL_SCHLUESSEL.match(/../g)?.map((h) => parseInt(h, 16)) ?? [],
      );
      await subtle.importKey("raw", roh, { name: "Ed25519" }, false, ["verify"]);
      await subtle.digest("SHA-256", roh);
      return true;
    } catch {
      return false;
    }
  })();
  return faehig;
}
