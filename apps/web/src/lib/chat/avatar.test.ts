/**
 * PaiBot – Tests des Avatars im Chat: der Zustand folgt den Ereignissen des Lauf-Stroms, nie
 * ohne Ereignis, mit Abbruch, Fehler, Not-Aus, „fertig“ nur kurz und aufgeräumtem Zeitgeber.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { ConversationEvent, ConversationEventType } from "@paibot/shared/ereignisse";
import { newId } from "@paibot/shared/ids";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ChatAnsicht, ereignisAnwenden, gesendet, leereAnsicht } from "./ansicht";
import {
  AvatarMerker,
  avatarAufEreignis,
  avatarWort,
  chatAvatarZustand,
  FERTIG_MS,
  STAUNEN_AB_TOKEN,
} from "./avatar";

const conversationId = newId("conversation");

function folge() {
  let seq = 0;
  return function ev<T extends ConversationEventType>(
    type: T,
    data: Extract<ConversationEvent, { type: T }>["data"],
    runId?: string,
  ): ConversationEvent {
    seq += 1;
    return {
      conversationId,
      seq,
      time: new Date(Date.UTC(2026, 10, 21, 10, 0, seq)).toISOString(),
      type,
      data,
      ...(runId === undefined ? {} : { runId }),
    } as ConversationEvent;
  };
}

/** Wie die Chat-Seite: Ereignisse in die Ansicht, ihre Aktionen in den Merker. */
class Fahrt {
  ansicht: ChatAnsicht = leereAnsicht();
  eingabe = "";
  notAus = false;
  ausdruecke: string[] = [];
  stuecke: number[] = [];
  merker: AvatarMerker;
  constructor(uhr: ConstructorParameters<typeof AvatarMerker>[1]) {
    this.merker = new AvatarMerker(() => undefined, uhr);
  }
  ereignis(e: ConversationEvent) {
    this.ansicht = ereignisAnwenden(this.ansicht, e);
    const a = avatarAufEreignis(e);
    this.merker.anwenden(a);
    if (a.ausdruck) this.ausdruecke.push(a.ausdruck);
    if (a.textStueck) this.stuecke.push(a.textStueck);
    return this.zustand();
  }
  zustand() {
    return chatAvatarZustand(this.ansicht, this.merker.merkmale, {
      notAus: this.notAus,
      eingabe: this.eingabe,
    });
  }
}

const falscheUhr = {
  setze: (fn: () => void, ms: number) => setTimeout(fn, ms),
  loesche: (z: unknown) => clearTimeout(z as ReturnType<typeof setTimeout>),
};

afterEach(() => {
  vi.useRealTimers();
});

function lauf() {
  const ev = folge();
  return {
    ev,
    runId: newId("run"),
    antwort: newId("message"),
    nutzer: newId("message"),
  };
}

describe("Zustand folgt den Ereignissen", () => {
  it("ruhig ohne Ereignis, auch mit gesendeter Nachricht ohne Lauf-Ereignis nicht denkend", () => {
    const f = new Fahrt(falscheUhr);
    expect(f.zustand()).toBe("ruhig");
    // eine Nachricht allein (ohne Lauf) ist keine Arbeit
    f.ansicht = ereignisAnwenden(
      f.ansicht,
      folge()("message.created", { messageId: newId("message"), role: "user", text: "Hallo" }),
    );
    expect(f.zustand()).toBe("ruhig");
  });

  it("denkt nur zwischen Start und erstem Text, schreibt nur mit Text, endet mit fertig, dann ruhig", () => {
    vi.useFakeTimers();
    const f = new Fahrt(falscheUhr);
    const { ev, runId, antwort } = lauf();
    expect(f.ereignis(ev("run.queued", { runId }, runId))).toBe("denkt");
    expect(f.ereignis(ev("run.started", { runId }, runId))).toBe("denkt");
    // die leere Antwort ist angelegt, aber es ist noch kein Text da
    expect(
      f.ereignis(ev("message.created", { messageId: antwort, role: "assistant", text: "" }, runId)),
    ).toBe("denkt");
    expect(f.ereignis(ev("text.delta", { runId, messageId: antwort, text: "Hal" }, runId))).toBe(
      "schreibt",
    );
    expect(f.ereignis(ev("text.delta", { runId, messageId: antwort, text: "lo" }, runId))).toBe(
      "schreibt",
    );
    expect(f.stuecke).toEqual([3, 2]);
    expect(
      f.ereignis(
        ev(
          "message.completed",
          {
            messageId: antwort,
            route: "direct",
            modelLabel: "Beispiel-Modell A",
            tokens: { input: 5, output: 7 },
          },
          runId,
        ),
      ),
    ).toBe("fertig");
    vi.advanceTimersByTime(FERTIG_MS - 1);
    expect(f.zustand()).toBe("fertig");
    vi.advanceTimersByTime(2);
    expect(f.zustand()).toBe("ruhig");
    expect(f.ausdruecke).toEqual([]);
  });

  it("zeigt „schreibt“ nie ohne Text, auch wenn der Lauf schon läuft", () => {
    const f = new Fahrt(falscheUhr);
    const { ev, runId } = lauf();
    f.ereignis(ev("run.queued", { runId }, runId));
    expect(f.ereignis(ev("run.started", { runId }, runId))).not.toBe("schreibt");
  });

  it("bricht der Besitzer ab: einverstanden, danach ruhig, kein Fehler", () => {
    const f = new Fahrt(falscheUhr);
    const { ev, runId, antwort } = lauf();
    f.ereignis(ev("run.queued", { runId }, runId));
    f.ereignis(ev("message.created", { messageId: antwort, role: "assistant", text: "" }, runId));
    f.ereignis(ev("text.delta", { runId, messageId: antwort, text: "Ein Anfang" }, runId));
    const nach = f.ereignis(
      ev("run.cancelled", { runId, code: "unterbrochen", text: "Abgebrochen." }, runId),
    );
    expect(f.ausdruecke).toEqual(["einverstanden"]);
    expect(nach).toBe("ruhig");
    expect(f.merker.merkmale.fehler).toBe(false);
  });

  it("Fehler, Ablehnung und Sperre der Schleuse zeigen den Fehler; neuer Lauf oder Tippen hebt ihn auf", () => {
    for (const art of ["run.failed", "run.denied"] as const) {
      const f = new Fahrt(falscheUhr);
      const { ev, runId } = lauf();
      f.ereignis(ev("run.queued", { runId }, runId));
      expect(
        f.ereignis(ev(art, { runId, code: "intern", text: "Das hat nicht geklappt." }, runId)),
      ).toBe("fehler");
      f.eingabe = "Neu";
      f.merker.neuesAnfangen();
      expect(f.zustand()).toBe("hoert_zu");
    }
    const g = new Fahrt(falscheUhr);
    const { ev, runId } = lauf();
    g.ereignis(ev("run.queued", { runId }, runId));
    // die Schleuse meldet zuerst, das Ende des Laufs folgt
    g.ereignis(ev("schleuse.blockiert", { runId, reason: "Nicht bereit." }, runId));
    expect(g.merker.merkmale.fehler).toBe(true);
    expect(
      g.ereignis(ev("run.denied", { runId, code: "schleuse_blockiert", text: "Gestoppt." }, runId)),
    ).toBe("fehler");
    const zweiter = newId("run");
    expect(g.ereignis(ev("run.queued", { runId: zweiter }, zweiter))).toBe("denkt");
    expect(g.merker.merkmale.fehler).toBe(false);
  });

  it("Not-Aus zeigt „angehalten“ vor allem anderen; ein Lauf mit Code „angehalten“ löst keinen Ausdruck aus", () => {
    const f = new Fahrt(falscheUhr);
    const { ev, runId } = lauf();
    f.ereignis(ev("run.queued", { runId }, runId));
    f.notAus = true;
    expect(f.zustand()).toBe("angehalten");
    f.ereignis(ev("run.cancelled", { runId, code: "angehalten", text: "Angehalten." }, runId));
    expect(f.ausdruecke).toEqual([]);
    expect(f.zustand()).toBe("angehalten");
    f.notAus = false;
    expect(f.zustand()).toBe("ruhig");
  });

  it("Tippen im Feld: hört zu, aber Arbeit hat Vorrang", () => {
    const f = new Fahrt(falscheUhr);
    f.eingabe = "Hallo";
    expect(f.zustand()).toBe("hoert_zu");
    const { ev, runId } = lauf();
    f.ansicht = gesendet(f.ansicht, {
      messageId: newId("message"),
      runId,
      text: "Hallo",
      zeit: "2026-11-21T10:00:00.000Z",
    });
    expect(f.zustand()).toBe("denkt");
    void ev;
  });

  it("der Zustand „wartet auf dich“ wird von keinem Ereignis ausgelöst", () => {
    const f = new Fahrt(falscheUhr);
    const { ev, runId } = lauf();
    const gesehen = new Set<string>();
    gesehen.add(f.ereignis(ev("run.queued", { runId }, runId)));
    gesehen.add(
      f.ereignis(
        ev(
          "run.waiting",
          { runId, actionId: newId("action"), action: "nachricht.senden", text: "Darf ich?" },
          runId,
        ),
      ),
    );
    expect(gesehen.has("wartet")).toBe(false);
  });
});

describe("Ausdrücke", () => {
  const tokens = (output: number) => ({ input: 1, output });
  const fertig = (output: number) => {
    const { ev, runId, antwort } = lauf();
    return avatarAufEreignis(
      ev(
        "message.completed",
        { messageId: antwort, route: "direct", modelLabel: "M", tokens: tokens(output) },
        runId,
      ),
    );
  };

  it("Staunen ab 1500 Ausgabe-Token, darunter nicht", () => {
    expect(fertig(STAUNEN_AB_TOKEN).ausdruck).toBe("staunen");
    expect(fertig(STAUNEN_AB_TOKEN - 1).ausdruck).toBeUndefined();
    expect(fertig(STAUNEN_AB_TOKEN - 1).fertig).toBe(true);
  });

  it("andere Ereignisse berühren den Avatar nicht", () => {
    const { ev } = lauf();
    expect(
      avatarAufEreignis(
        ev("beleg.created", { belegId: newId("receipt"), action: "modell.anfragen" }),
      ),
    ).toEqual({});
  });
});

describe("Merker und Zeitgeber", () => {
  it("räumt den Zeitgeber ab und meldet danach nichts mehr", () => {
    vi.useFakeTimers();
    const meldungen: boolean[] = [];
    const m = new AvatarMerker((x) => meldungen.push(x.fertig), falscheUhr);
    m.anwenden({ fertig: true });
    expect(vi.getTimerCount()).toBe(1);
    m.stop();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(FERTIG_MS * 2);
    expect(meldungen).toEqual([true]);
    m.anwenden({ fertig: true });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("zwei fertige Antworten hintereinander lassen nur einen Zeitgeber laufen", () => {
    vi.useFakeTimers();
    const m = new AvatarMerker(() => undefined, falscheUhr);
    m.anwenden({ fertig: true });
    vi.advanceTimersByTime(1000);
    m.anwenden({ fertig: true });
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(FERTIG_MS - 1);
    expect(m.merkmale.fertig).toBe(true);
    vi.advanceTimersByTime(2);
    expect(m.merkmale.fertig).toBe(false);
  });

  it("jeder Zustand hat ein Wort neben dem Avatar", () => {
    expect(avatarWort("ruhig")).toBe("chat.bot.bereit");
    expect(avatarWort("fertig")).toBe("chat.bot.fertig");
    expect(avatarWort("denkt")).toBe("chat.bot.denkt");
  });
});
