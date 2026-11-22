/**
 * PaiBot – Fehler beim Verbinden einer App: Alles, was beim Abruf oder beim Speichern schiefgeht,
 * wird zu einem `PaiBotError` mit festem Text. Der Text eines Servers, einer Bibliothek oder einer
 * Datenbank (der eine Zeile samt verschlüsseltem Token nennen könnte) erreicht nie eine Antwort,
 * einen Beleg oder das Protokoll.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { McpSchichtFehler } from "@paibot/mcp";
import { ERROR_CODES, isPaiBotError, PaiBotError } from "@paibot/shared/fehler";

/**
 * Macht aus einem beliebigen Fehler einen `PaiBotError` ohne fremden Text. Fehler der Schicht
 * behalten ihren Code, wenn es ihn im gemeinsamen Vertrag gibt (sonst `app_nicht_erreichbar`),
 * `PaiBotError` bleiben, wie sie sind, alles andere wird `intern`.
 */
export function fehlerOhneFremdtext(fehler: unknown): PaiBotError {
  if (isPaiBotError(fehler)) return fehler;
  if (fehler instanceof McpSchichtFehler) {
    // Die gespeicherten Namen sind kaputt: ein Fehler der Daten in PaiBot, nicht der App. Der Satz
    // der Schicht ist fest und nennt nichts vom Server.
    if (fehler.code === "namen_ungueltig")
      return new PaiBotError("intern", { text: fehler.message });
    const code = (ERROR_CODES as readonly string[]).includes(fehler.code)
      ? (fehler.code as (typeof ERROR_CODES)[number])
      : "app_nicht_erreichbar";
    return new PaiBotError(code);
  }
  if (fehler instanceof Error && fehler.name === "EgressBlockedError") {
    return new PaiBotError("app_adresse_unzulaessig");
  }
  return new PaiBotError("intern");
}

/**
 * Eine verletzte Prüfbedingung der Datenbank (`eingabe_ungueltig` am allgemeinen Feld „eingabe“)
 * gehört beim Anlegen einer App zur Adresse: Sie wird zum Feldfehler am Feld `feld`. Alles andere
 * bleibt, wie es ist.
 */
export function pruefbedingungAlsFeld(fehler: unknown, feld: string): unknown {
  if (
    isPaiBotError(fehler) &&
    fehler.code === "eingabe_ungueltig" &&
    fehler.felder?.length === 1 &&
    fehler.felder[0]?.feld === "eingabe"
  ) {
    return new PaiBotError("eingabe_ungueltig", { felder: [{ feld, code: "ungueltig" }] });
  }
  return fehler;
}
