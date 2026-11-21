/**
 * PaiBot – Passwort-Prüfung mit begrenzter Gleichzeitigkeit und gleicher Dauer, auch wenn es noch
 * keinen Besitzer gibt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { hashPassword, newToken, verifyPassword } from "@paibot/crypto";
import { PASSWORD_HASH_CONCURRENCY } from "@paibot/shared/konstanten";

/** Lässt höchstens `max` Aufgaben gleichzeitig laufen; weitere warten der Reihe nach. */
export function erstelleBegrenzer(max: number) {
  let laufend = 0;
  const warteschlange: (() => void)[] = [];
  const statistik = { hoechstens: 0 };

  async function ausfuehren<T>(aufgabe: () => Promise<T>): Promise<T> {
    if (laufend >= max) await new Promise<void>((weiter) => warteschlange.push(weiter));
    laufend += 1;
    statistik.hoechstens = Math.max(statistik.hoechstens, laufend);
    try {
      return await aufgabe();
    } finally {
      laufend -= 1;
      warteschlange.shift()?.();
    }
  }
  return { ausfuehren, statistik, laufend: () => laufend };
}

const SCHLUESSEL = Symbol.for("paibot.web.passwort-begrenzer");
type Halter = { [SCHLUESSEL]?: ReturnType<typeof erstelleBegrenzer> };

/** Der Begrenzer des Prozesses für alle Passwort-Rechnungen (scrypt, je etwa 32 MiB). */
export function passwortBegrenzer() {
  const halter = globalThis as Halter;
  halter[SCHLUESSEL] ??= erstelleBegrenzer(PASSWORD_HASH_CONCURRENCY);
  return halter[SCHLUESSEL];
}

let ersatzHash: Promise<string> | undefined;

/** Hash eines zufälligen Passworts; dagegen wird geprüft, wenn es keinen Besitzer gibt. */
function ersatz(): Promise<string> {
  ersatzHash ??= hashPassword(newToken(32));
  return ersatzHash;
}

/**
 * Prüft ein Passwort gegen den gespeicherten Hash. Fehlt der Hash (noch kein Besitzer), wird gegen
 * einen Ersatz gerechnet: gleiche Arbeit, Ergebnis immer `false`. Ein ungültiger Hash zählt als falsch.
 */
export async function pruefePasswort(
  passwort: string,
  gespeichert: string | undefined,
): Promise<boolean> {
  const hash = gespeichert ?? (await ersatz());
  return passwortBegrenzer().ausfuehren(async () => {
    try {
      const passt = await verifyPassword(passwort, hash);
      return passt && gespeichert !== undefined;
    } catch {
      return false;
    }
  });
}

/** Neuen Passwort-Hash berechnen, ebenfalls über den Begrenzer. */
export function neuerPasswortHash(passwort: string): Promise<string> {
  return passwortBegrenzer().ausfuehren(() => hashPassword(passwort));
}
