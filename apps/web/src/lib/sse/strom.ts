/**
 * PaiBot – ein Ereignis-Strom für eine Unterhaltung: erst LISTEN, dann nachholen, dann live.
 *
 * Jeder Strom merkt sich die Nummer des zuletzt gesendeten Ereignisses und liest bei jeder Meldung
 * alle Ereignisse mit höherer Nummer aus der Datenbank. So entsteht keine Lücke (Meldungen ab dem
 * Start des LISTEN gehen nicht verloren) und kein Doppel (nur höhere Nummern werden gesendet).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { Database } from "@paibot/db";
import { events } from "@paibot/db/repo";
import type { ConversationId } from "@paibot/shared/ids";
import { formatEreignis, SSE_HEARTBEAT, SSE_PREAMBLE } from "./format";
import { STROM_GRENZEN } from "./grenzen";
import type { Verteiler } from "./verteiler";

/** Warum ein Strom endete. */
export type StromEnde = "client" | "lebensdauer" | "sitzung" | "rueckstau" | "fehler";

/** Zeitgeber; in Tests austauschbar. */
export interface Uhr {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const SYSTEM_UHR: Uhr = {
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface StromEinstellungen {
  herzschlagMs: number;
  lebensdauerMs: number;
  stapel: number;
  pufferBytes: number;
  blockiertePulse: number;
}

export interface StromOptionen extends Partial<StromEinstellungen> {
  db: Database;
  verteiler: Verteiler;
  conversationId: ConversationId;
  /** Nummer des zuletzt gesehenen Ereignisses; gesendet wird alles danach (0 = alles). */
  nachSeq: number;
  /** Abbruch durch den Client (z. B. `request.signal`). */
  signal?: AbortSignal;
  /** Wird bei jedem Herzschlag gerufen; `false` oder ein Fehler beendet den Strom. */
  pruefen?: () => Promise<boolean>;
  /** Wird genau einmal gerufen, wenn der Strom endet. */
  beiEnde?: (grund: StromEnde) => void;
  uhr?: Uhr;
}

const kodierer = new TextEncoder();

/**
 * Öffnet einen Strom. Das Versprechen erfüllt sich, sobald `LISTEN` aktiv ist; erst danach wird
 * nachgeholt. Schlägt `LISTEN` fehl, wird der Fehler weitergegeben und nichts bleibt offen
 * (`beiEnde` wird dann nicht gerufen).
 */
export async function oeffneStrom(optionen: StromOptionen): Promise<ReadableStream<Uint8Array>> {
  const e: StromEinstellungen = {
    herzschlagMs: optionen.herzschlagMs ?? STROM_GRENZEN.herzschlagMs,
    lebensdauerMs: optionen.lebensdauerMs ?? STROM_GRENZEN.lebensdauerMs,
    stapel: optionen.stapel ?? STROM_GRENZEN.stapel,
    pufferBytes: optionen.pufferBytes ?? STROM_GRENZEN.pufferBytes,
    blockiertePulse: optionen.blockiertePulse ?? STROM_GRENZEN.blockiertePulse,
  };
  const uhr = optionen.uhr ?? SYSTEM_UHR;
  const { db, conversationId, signal } = optionen;

  let steuerung: ReadableStreamDefaultController<Uint8Array> | undefined;
  let offen = true;
  let schmutzig = true;
  let pumptGerade = false;
  let pruefungLaeuft = false;
  let blockiert = 0;
  let letzte = optionen.nachSeq;
  let puls: unknown;
  let ablauf: unknown;

  // 1. LISTEN – bevor irgendetwas gelesen wird.
  const abmelden = await optionen.verteiler.abonnieren(conversationId, () => {
    schmutzig = true;
    void pumpen();
  });

  function senden(text: string): void {
    steuerung?.enqueue(kodierer.encode(text));
  }

  function platz(): boolean {
    return (steuerung?.desiredSize ?? 0) > 0;
  }

  function beenden(grund: StromEnde): void {
    if (!offen) return;
    offen = false;
    uhr.clearInterval(puls);
    uhr.clearTimeout(ablauf);
    signal?.removeEventListener("abort", beimAbbruch);
    void abmelden().catch(() => undefined);
    try {
      if (grund === "rueckstau") steuerung?.error(new Error("Client liest nicht"));
      else if (grund !== "client") steuerung?.close();
    } catch {
      // Strom war schon zu.
    }
    optionen.beiEnde?.(grund);
  }

  function beimAbbruch(): void {
    beenden("client");
  }

  // 2. und 3. Nachholen und live weiterreichen: immer alles nach der letzten Nummer.
  async function pumpen(): Promise<void> {
    if (pumptGerade || !offen || steuerung === undefined) return;
    pumptGerade = true;
    try {
      while (offen && schmutzig && platz()) {
        schmutzig = false;
        const neu = await events.listSince(db, conversationId, {
          afterSeq: letzte,
          limit: e.stapel,
        });
        for (const ereignis of neu) {
          if (!offen) return;
          if (ereignis.seq <= letzte) continue;
          senden(formatEreignis(ereignis));
          letzte = ereignis.seq;
        }
        if (neu.length >= e.stapel) schmutzig = true;
      }
    } catch {
      // Datenbank nicht erreichbar: Strom endet, der Browser setzt mit `Last-Event-ID` fort.
      beenden("fehler");
    } finally {
      pumptGerade = false;
    }
  }

  async function herzschlag(): Promise<void> {
    if (!offen) return;
    if (platz()) {
      blockiert = 0;
      senden(SSE_HEARTBEAT);
    } else {
      blockiert += 1;
      if (blockiert >= e.blockiertePulse) {
        beenden("rueckstau");
        return;
      }
    }
    if (optionen.pruefen === undefined || pruefungLaeuft) return;
    pruefungLaeuft = true;
    try {
      if (!(await optionen.pruefen())) beenden("sitzung");
    } catch {
      beenden("sitzung");
    } finally {
      pruefungLaeuft = false;
    }
  }

  const strom = new ReadableStream<Uint8Array>(
    {
      start(controller) {
        steuerung = controller;
        senden(SSE_PREAMBLE);
      },
      pull() {
        return pumpen();
      },
      cancel() {
        beenden("client");
      },
    },
    new ByteLengthQueuingStrategy({ highWaterMark: e.pufferBytes }),
  );

  puls = uhr.setInterval(() => void herzschlag(), e.herzschlagMs);
  ablauf = uhr.setTimeout(() => beenden("lebensdauer"), e.lebensdauerMs);
  if (signal?.aborted) beenden("client");
  else signal?.addEventListener("abort", beimAbbruch, { once: true });

  return strom;
}
