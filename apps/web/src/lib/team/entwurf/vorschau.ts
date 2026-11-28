/**
 * PaiBot – was die Vorschau eines Team-Entwurfs vor dem Anlegen mit dem Inhalt macht: abgewählte
 * Bots weglassen, geänderte Anweisungen einsetzen, das Ergebnis prüfen und seinen Abdruck rechnen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import type { EntwurfAuswahlBot } from "@paibot/ui";
import { entwurfAbdruck, pruefeEntwurf, type TeamEntwurf } from "./format";

/**
 * Der Inhalt, der angelegt wird: der geprüfte Entwurf mit genau zwei Änderungen aus der Vorschau –
 * abgewählte Bots fehlen, geänderte Anweisungen stehen im neuen Wortlaut. Alles andere bleibt Feld
 * für Feld, wie es war; darum geht hier der ganze Inhalt durch und nicht die Anzeige-Form, die
 * etwa die Ausgabegrenze je Bot nicht zeigt.
 *
 * Die Reihenfolge ist die des Entwurfs, nicht die der Auswahl: Der Abdruck soll sich nur ändern,
 * wenn der Besitzer etwas geändert hat.
 */
export function inhaltMitAuswahl(
  inhalt: TeamEntwurf,
  bots: readonly EntwurfAuswahlBot[],
): TeamEntwurf {
  const gewaehlt = new Map(bots.map((b) => [b.name, b.anweisung]));
  return {
    ...inhalt,
    bots: inhalt.bots
      .filter((b) => gewaehlt.has(b.name))
      .map((b) => ({ ...b, anweisung: gewaehlt.get(b.name) ?? b.anweisung })),
  };
}

/** Geprüft und mit Abdruck, oder die Stelle, an der es nicht passt. */
export type VorschauErgebnis =
  | { ok: true; inhalt: TeamEntwurf; abdruck: string }
  | { ok: false; stelle: string };

/**
 * Prüft den Inhalt der Vorschau und rechnet seinen Abdruck. Beides läuft im Browser mit demselben
 * Format wie auf dem Server (nur Web Crypto, kein Netz): Der Abdruck gehört damit zu genau dem
 * Inhalt, den der Besitzer gesehen hat, und der Server lehnt jede Abweichung ab.
 */
export async function geprueftMitAbdruck(inhalt: TeamEntwurf): Promise<VorschauErgebnis> {
  const geprueft = await pruefeEntwurf(inhalt);
  if (!geprueft.ok) return { ok: false, stelle: geprueft.fehler[0]?.pfad ?? "" };
  return { ok: true, inhalt: geprueft.entwurf, abdruck: await entwurfAbdruck(geprueft.entwurf) };
}

/**
 * Welcher Entwurf auf der Seite steht – oder `undefined` für die Vorlagen-Liste.
 *
 * Ein **offener** Entwurf gewinnt immer: Es gibt nichts, was man an seiner Stelle zeigen könnte,
 * und wer gerade einen erstellt hat, will ihn sehen. Ist keiner offen, steht der letzte da, damit
 * „Rückgängig“ erreichbar bleibt.
 *
 * `uebersprungen` ist die Kennung des geschlossenen Entwurfs, den „Entwurf wieder öffnen“ gerade
 * beiseitegeschoben hat. Die Kennung statt eines Schalters: Ein Schalter bliebe stehen und
 * verdeckte auch alles, was danach entsteht – genau das ging zweimal schief, erst beim Erstellen
 * des neuen Entwurfs und dann beim Anlegen des Teams.
 */
export function entwurfDerSeite<T extends { id: string; stand: string }>(
  entwuerfe: readonly T[],
  uebersprungen?: string,
): T | undefined {
  const offen = entwuerfe.find((e) => e.stand === "offen");
  if (offen !== undefined) return offen;
  const letzter = entwuerfe[0];
  return letzter?.id === uebersprungen ? undefined : letzter;
}
