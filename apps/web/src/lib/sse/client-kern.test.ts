/**
 * PaiBot – Tests des Ereignis-Stroms im Browser ohne DOM: Reihenfolge, Doppel, fremde und kaputte
 * Daten, Zustände, eigenes Neuverbinden mit letzter Nummer, Aufräumen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { type ConversationEvent, encodeEvent } from "@paibot/shared/ereignisse";
import { type ConversationId, newId } from "@paibot/shared/ids";
import { describe, expect, it } from "vitest";
import {
  annehmen,
  type EreignisQuelle,
  ereignisUrl,
  GESCHLOSSEN,
  naechsterZustand,
  standardWarten,
  type VerbindungsZustand,
  verbindeEreignisse,
} from "./client-kern";

const cid = newId("conversation");

function ereignis(seq: number, conversationId: ConversationId = cid): ConversationEvent {
  return {
    conversationId,
    seq,
    time: "2026-11-20T10:00:00.000Z",
    type: "run.queued",
    data: { runId: newId("run") },
  } as ConversationEvent;
}

class FakeQuelle implements EreignisQuelle {
  readyState = 0;
  onopen: ((e: Event) => unknown) | null = null;
  onerror: ((e: Event) => unknown) | null = null;
  geschlossen = false;
  readonly hoerer = new Map<string, ((e: MessageEvent) => void)[]>();
  constructor(readonly url: string) {}
  addEventListener(typ: string, fn: (e: MessageEvent) => void): void {
    this.hoerer.set(typ, [...(this.hoerer.get(typ) ?? []), fn]);
  }
  close(): void {
    this.geschlossen = true;
    this.readyState = GESCHLOSSEN;
  }
  oeffnen(): void {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }
  senden(e: ConversationEvent | string, typ = "run.queued"): void {
    const data = typeof e === "string" ? e : encodeEvent(e);
    for (const fn of this.hoerer.get(typ) ?? []) fn({ data } as MessageEvent);
  }
  /** Browser überbrückt selbst (CONNECTING) oder gibt auf (CLOSED). */
  fehler(endgueltig: boolean): void {
    this.readyState = endgueltig ? GESCHLOSSEN : 0;
    this.onerror?.(new Event("error"));
  }
}

function fakeUhr() {
  const geplant = new Map<number, { fn: () => void; ms: number }>();
  let naechste = 1;
  return {
    geplant,
    setTimeout(fn: () => void, ms: number) {
      geplant.set(naechste, { fn, ms });
      return naechste++;
    },
    clearTimeout(h: unknown) {
      geplant.delete(h as number);
    },
    ablaufen() {
      const alle = [...geplant.entries()];
      geplant.clear();
      for (const [, { fn }] of alle) fn();
    },
  };
}

function aufbauen(nachSeq?: number, maxVersuche = 3) {
  const quellen: FakeQuelle[] = [];
  const empfangen: number[] = [];
  const zustaende: VerbindungsZustand[] = [];
  const uhr = fakeUhr();
  const verbindung = verbindeEreignisse({
    conversationId: cid,
    nachSeq,
    onEvent: (e) => empfangen.push(e.seq),
    onZustand: (z) => zustaende.push(z),
    erzeugen: (url) => {
      const q = new FakeQuelle(url);
      quellen.push(q);
      return q;
    },
    uhr,
    maxVersuche,
  });
  const aktuell = () => {
    const q = quellen.at(-1);
    if (!q) throw new Error("keine Quelle");
    return q;
  };
  return { quellen, empfangen, zustaende, uhr, verbindung, aktuell };
}

describe("annehmen (reiner Kern)", () => {
  it("nimmt aufsteigende Nummern an, auch mit Lücken; Doppel und ältere nicht", () => {
    let kern = { conversationId: cid, letzteSeq: 0 };
    const angenommen: number[] = [];
    for (const seq of [1, 2, 2, 1, 5, 4, 6]) {
      const r = annehmen(kern, encodeEvent(ereignis(seq)));
      kern = r.kern;
      if (r.ereignis) angenommen.push(r.ereignis.seq);
    }
    expect(angenommen).toEqual([1, 2, 5, 6]);
    expect(kern.letzteSeq).toBe(6);
  });

  it("verwirft kaputte Daten, fremde Unterhaltungen und Nicht-Text", () => {
    const kern = { conversationId: cid, letzteSeq: 0 };
    expect(annehmen(kern, "{kaputt").ereignis).toBeUndefined();
    expect(annehmen(kern, JSON.stringify({ seq: 1 })).ereignis).toBeUndefined();
    expect(
      annehmen(kern, encodeEvent(ereignis(1, newId("conversation")))).ereignis,
    ).toBeUndefined();
    expect(annehmen(kern, 7).ereignis).toBeUndefined();
    expect(annehmen(kern, "x").kern).toBe(kern);
  });

  it("Zustandswechsel", () => {
    expect(naechsterZustand("verbindet_neu", "geoeffnet")).toBe("verbunden");
    expect(naechsterZustand("verbunden", "unterbrochen")).toBe("verbindet_neu");
    expect(naechsterZustand("verbindet_neu", "aufgegeben")).toBe("getrennt");
    expect(naechsterZustand("getrennt", "neuer_versuch")).toBe("verbindet_neu");
    expect(naechsterZustand("verbunden", "geschlossen")).toBe("getrennt");
  });

  it("Adresse und Wartezeiten", () => {
    expect(ereignisUrl(cid)).toBe(`/api/unterhaltungen/${cid}/ereignisse`);
    expect(ereignisUrl(cid, 7)).toBe(`/api/unterhaltungen/${cid}/ereignisse?nach=7`);
    expect(standardWarten(1)).toBe(2750);
    expect(standardWarten(2)).toBe(5500);
    expect(standardWarten(20)).toBe(30_000);
  });
});

describe("verbindeEreignisse", () => {
  it("meldet jedes Ereignis einmal und in Reihenfolge, Zustand verbunden", () => {
    const t = aufbauen();
    expect(t.verbindung.zustand).toBe("verbindet_neu");
    t.aktuell().oeffnen();
    for (const seq of [1, 2, 2, 3, 1]) t.aktuell().senden(ereignis(seq));
    expect(t.empfangen).toEqual([1, 2, 3]);
    expect(t.verbindung.letzteSeq).toBe(3);
    expect(t.zustaende).toEqual(["verbunden"]);
  });

  it("hört auf jeden Ereignis-Typ", () => {
    const t = aufbauen();
    const typen = [...t.aktuell().hoerer.keys()];
    expect(typen).toContain("text.delta");
    expect(typen).toContain("beleg.created");
    expect(typen).toContain("message.completed");
  });

  it("beginnt nach `nachSeq`", () => {
    const t = aufbauen(4);
    expect(t.aktuell().url).toContain("?nach=4");
    t.aktuell().oeffnen();
    t.aktuell().senden(ereignis(4));
    t.aktuell().senden(ereignis(5));
    expect(t.empfangen).toEqual([5]);
  });

  it("kurze Unterbrechung: der Browser verbindet selbst, Zustand verbindet neu, dann verbunden", () => {
    const t = aufbauen();
    t.aktuell().oeffnen();
    t.aktuell().senden(ereignis(1));
    t.aktuell().fehler(false);
    expect(t.verbindung.zustand).toBe("verbindet_neu");
    expect(t.quellen).toHaveLength(1);
    t.aktuell().oeffnen();
    t.aktuell().senden(ereignis(1)); // nachgeholtes Doppel
    t.aktuell().senden(ereignis(2));
    expect(t.empfangen).toEqual([1, 2]);
    expect(t.zustaende).toEqual(["verbunden", "verbindet_neu", "verbunden"]);
  });

  it("endgültiger Abbruch: neue Quelle ab der letzten Nummer nach der Wartezeit", () => {
    const t = aufbauen();
    t.aktuell().oeffnen();
    t.aktuell().senden(ereignis(1));
    t.aktuell().senden(ereignis(2));
    const alt = t.aktuell();
    alt.fehler(true);
    expect(alt.geschlossen).toBe(true);
    expect(t.verbindung.zustand).toBe("verbindet_neu");
    expect([...t.uhr.geplant.values()].map((g) => g.ms)).toEqual([2750]);
    t.uhr.ablaufen();
    expect(t.quellen).toHaveLength(2);
    expect(t.aktuell().url).toContain("?nach=2");
    // Späte Ereignisse der alten Quelle zählen nicht mehr.
    alt.onerror?.(new Event("error"));
    t.aktuell().oeffnen();
    t.aktuell().senden(ereignis(3));
    expect(t.empfangen).toEqual([1, 2, 3]);
    expect(t.verbindung.zustand).toBe("verbunden");
  });

  it("gibt nach zu vielen Fehlschlägen auf; `neuVerbinden` startet neu", () => {
    const t = aufbauen(undefined, 2);
    for (let i = 0; i < 3; i += 1) {
      t.aktuell().fehler(true);
      t.uhr.ablaufen();
    }
    expect(t.verbindung.zustand).toBe("getrennt");
    expect(t.uhr.geplant.size).toBe(0);
    const anzahl = t.quellen.length;
    t.verbindung.neuVerbinden();
    expect(t.quellen).toHaveLength(anzahl + 1);
    t.aktuell().oeffnen();
    expect(t.verbindung.zustand).toBe("verbunden");
  });

  it("schliessen räumt auf: Quelle zu, kein Zeitgeber, keine Meldungen mehr", () => {
    const t = aufbauen();
    t.aktuell().fehler(true);
    expect(t.uhr.geplant.size).toBe(1);
    t.verbindung.schliessen();
    expect(t.uhr.geplant.size).toBe(0);
    expect(t.verbindung.zustand).toBe("getrennt");
    const q = t.aktuell();
    expect(q.geschlossen).toBe(true);
    q.senden(ereignis(1));
    t.verbindung.neuVerbinden();
    expect(t.empfangen).toEqual([]);
    expect(t.quellen).toHaveLength(1);
  });
});
