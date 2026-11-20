/**
 * PaiBot – Grenzen des Ereignis-Stroms: Zeiten, Puffer und Anzahl gleichzeitiger Ströme.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { SSE_HEARTBEAT_MS } from "@paibot/shared/ereignisse";

/** Feste Werte des Ereignis-Stroms. */
export const STROM_GRENZEN = Object.freeze({
  /** Abstand des Herzschlags; dabei wird auch die Sitzung neu geprüft. */
  herzschlagMs: SSE_HEARTBEAT_MS,
  /** Nach dieser Zeit endet ein Strom; der Browser verbindet sich mit `Last-Event-ID` neu. */
  lebensdauerMs: 15 * 60 * 1000,
  /** So viele Ereignisse liest ein Strom auf einmal aus der Datenbank. */
  stapel: 200,
  /** Pufferobergrenze je Strom in Byte; ist sie erreicht, liest der Strom nicht weiter nach. */
  pufferBytes: 64 * 1024,
  /** So viele Herzschläge in Folge darf der Puffer voll sein, dann wird der Strom getrennt. */
  blockiertePulse: 4,
  /** Höchstens so viele offene Ströme je Sitzung. */
  jeSitzung: 10,
  /** Höchstens so viele offene Ströme im ganzen Prozess. */
  gesamt: 20,
  /** Wartezeit in Sekunden, die eine Ablehnung wegen zu vieler Ströme nennt. */
  wartenSekunden: 5,
});

/** Zählt offene Ströme je Sitzung und insgesamt. */
export interface StromZaehler {
  /** Belegt einen Platz; gibt die Freigabe zurück (mehrfach aufrufbar) oder `undefined`, wenn voll. */
  belegen(sitzung: string): (() => void) | undefined;
  /** Offene Ströme insgesamt oder einer Sitzung. */
  offen(sitzung?: string): number;
}

export function createStromZaehler(
  grenzen: { jeSitzung: number; gesamt: number } = STROM_GRENZEN,
): StromZaehler {
  const jeSitzung = new Map<string, number>();
  let gesamt = 0;
  return {
    belegen(sitzung) {
      const bisher = jeSitzung.get(sitzung) ?? 0;
      if (bisher >= grenzen.jeSitzung || gesamt >= grenzen.gesamt) return undefined;
      jeSitzung.set(sitzung, bisher + 1);
      gesamt += 1;
      let frei = false;
      return () => {
        if (frei) return;
        frei = true;
        gesamt -= 1;
        const rest = (jeSitzung.get(sitzung) ?? 1) - 1;
        if (rest <= 0) jeSitzung.delete(sitzung);
        else jeSitzung.set(sitzung, rest);
      };
    },
    offen(sitzung) {
      return sitzung === undefined ? gesamt : (jeSitzung.get(sitzung) ?? 0);
    },
  };
}
