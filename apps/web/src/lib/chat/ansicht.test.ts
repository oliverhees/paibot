/**
 * PaiBot – Tests des Zustands-Kerns der Chat-Ansicht: Glücksfall, Abbruch, Fehler, Ablehnung,
 * Nachholen mit Doppel und Neuladen mitten im Lauf.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import {
  type ConversationEvent,
  type ConversationEventType,
  EVENT_DATA,
} from "@paibot/shared/ereignisse";
import { newId } from "@paibot/shared/ids";
import type { Message, Run } from "@paibot/shared/objekte";
import { describe, expect, it } from "vitest";
import { vorgabeAus } from "../modelle/vorgabe";
import {
  abbruchAngefragt,
  ansichtAus,
  belegeMischen,
  belegZurAntwort,
  type ChatAnsicht,
  ereignisseAnwenden,
  gesendet,
  kopfModell,
  leereAnsicht,
  nachfrageUebernehmen,
  neuErzeugbar,
  neuErzeugt,
  offeneNachfragen,
  sendenGesperrt,
} from "./ansicht";
import { fassungenVon } from "./fassungen";
import type { ChatVerlauf } from "./typen";

const conversationId = newId("conversation");
const KONTEXT = { modell: { name: "Beispiel-Modell A", herkunft: "über EUrouter" } };

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

/** Ereignisse eines Laufs im Glücksfall, wie der Worker sie schreibt. */
function glueck(ev: ReturnType<typeof folge>, text = "Hallo! Wie kann ich helfen?") {
  const user = newId("message");
  const antwort = newId("message");
  const runId = newId("run");
  const belegE = newId("receipt");
  const belegR = newId("receipt");
  const teile = [text.slice(0, 7), text.slice(7)];
  const liste = [
    ev("message.created", { messageId: user, role: "user", text: "Hallo Pai" }),
    ev("run.queued", { runId }, runId),
    ev("run.started", { runId }, runId),
    ev("beleg.created", { belegId: belegE, action: "modell.anfragen" }, runId),
    ev("message.created", { messageId: antwort, role: "assistant", text: "" }, runId),
    ...teile.map((t) => ev("text.delta", { runId, messageId: antwort, text: t }, runId)),
    ev(
      "message.completed",
      {
        messageId: antwort,
        route: "direct",
        modelLabel: "Beispiel-Modell A",
        tokens: { input: 10, output: 5 },
      },
      runId,
    ),
    ev("beleg.created", { belegId: belegR, action: "modell.anfragen" }, runId),
  ];
  return { liste, user, antwort, runId, belegE, belegR };
}

function nachrichten(a: ChatAnsicht) {
  return a.eintraege.map((e) =>
    e.art === "nachricht" ? `${e.rolle}:${e.zustand}:${e.text}` : `ende:${e.ergebnis}:${e.code}`,
  );
}

describe("Glücksfall", () => {
  it("die Antwort entsteht Stück für Stück und wird fertig; der Lauf endet", () => {
    const ev = folge();
    const g = glueck(ev);
    let a = leereAnsicht();
    a = ereignisseAnwenden(a, g.liste.slice(0, 2), KONTEXT);
    expect(a.lauf).toEqual({ id: g.runId, phase: "wartet", abbruch: false });
    expect(sendenGesperrt(a)).toBe(true);
    a = ereignisseAnwenden(a, g.liste.slice(2, 6), KONTEXT);
    expect(a.lauf?.phase).toBe("schreibt");
    expect(nachrichten(a)).toEqual(["du:fertig:Hallo Pai", "bot:streamt:Hallo! "]);
    a = ereignisseAnwenden(a, g.liste.slice(6), KONTEXT);
    expect(nachrichten(a)).toEqual([
      "du:fertig:Hallo Pai",
      "bot:fertig:Hallo! Wie kann ich helfen?",
    ]);
    expect(a.lauf).toBeUndefined();
    expect(sendenGesperrt(a)).toBe(false);
    expect(a.fertigeAntwort).toBe(g.antwort);
    const antwort = a.eintraege[1];
    expect(antwort?.art === "nachricht" && antwort.route).toBe("direct");
    expect(antwort?.art === "nachricht" && antwort.modell).toEqual(KONTEXT.modell);
    expect(a.belege.map((b) => b.id)).toEqual([g.belegR, g.belegE]);
    expect(a.letzteSeq).toBe(g.liste.length);
  });

  it("vollständige Belege vom Server ersetzen die angekündigten; unter der Antwort steht das Ergebnis", () => {
    const ev = folge();
    const g = glueck(ev);
    let a = ereignisseAnwenden(leereAnsicht(), g.liste, KONTEXT);
    expect(belegZurAntwort(a.belege, g.runId)?.vollstaendig).toBe(false);
    a = belegeMischen(a, [
      {
        id: g.belegR,
        vollstaendig: true,
        seq: 8,
        art: "result",
        aktion: "modell.anfragen",
        zeit: "2026-11-21T10:00:00.000Z",
        runId: g.runId,
      },
      {
        id: g.belegE,
        vollstaendig: true,
        seq: 7,
        art: "decision",
        aktion: "modell.anfragen",
        zeit: "2026-11-21T10:00:00.000Z",
        runId: g.runId,
      },
    ]);
    expect(a.belege.map((b) => b.seq)).toEqual([8, 7]);
    expect(belegZurAntwort(a.belege, g.runId)?.id).toBe(g.belegR);
  });
});

describe("Antwort der Route und Strom in beliebiger Reihenfolge", () => {
  it("die Antwort der Route zeigt Nachricht und Lauf sofort; der Strom legt nichts doppelt an", () => {
    const ev = folge();
    const g = glueck(ev);
    let a = gesendet(leereAnsicht(), {
      messageId: g.user,
      runId: g.runId,
      text: "Hallo Pai",
      zeit: "2026-11-21T10:00:00.000Z",
    });
    expect(a.lauf?.phase).toBe("wartet");
    a = ereignisseAnwenden(a, g.liste, KONTEXT);
    expect(nachrichten(a)).toEqual([
      "du:fertig:Hallo Pai",
      "bot:fertig:Hallo! Wie kann ich helfen?",
    ]);
  });

  it("kam der Strom schneller, belebt die späte Antwort der Route den Lauf nicht wieder", () => {
    const ev = folge();
    const g = glueck(ev);
    let a = ereignisseAnwenden(leereAnsicht(), g.liste, KONTEXT);
    a = gesendet(a, { messageId: g.user, runId: g.runId, text: "Hallo Pai", zeit: "x" });
    expect(a.lauf).toBeUndefined();
    expect(a.eintraege.length).toBe(2);
  });
});

describe("Abbruch, Fehler, Ablehnung", () => {
  it("Abbruch mitten im Strom: der Teiltext bleibt, gekennzeichnet", () => {
    const ev = folge();
    const g = glueck(ev);
    let a = ereignisseAnwenden(leereAnsicht(), g.liste.slice(0, 6), KONTEXT);
    a = abbruchAngefragt(a);
    expect(a.lauf?.abbruch).toBe(true);
    a = ereignisseAnwenden(a, [
      ev(
        "run.cancelled",
        { runId: g.runId, code: "unterbrochen", text: "Die Antwort wurde unterbrochen." },
        g.runId,
      ),
    ]);
    expect(nachrichten(a)).toEqual(["du:fertig:Hallo Pai", "bot:abgebrochen:Hallo! "]);
    expect(a.lauf).toBeUndefined();
  });

  it("Abbruch vor dem ersten Wort: Hinweis statt leerer Blase", () => {
    const ev = folge();
    const g = glueck(ev);
    let a = ereignisseAnwenden(leereAnsicht(), g.liste.slice(0, 5), KONTEXT);
    a = ereignisseAnwenden(a, [
      ev(
        "run.cancelled",
        { runId: g.runId, code: "unterbrochen", text: "Die Antwort wurde unterbrochen." },
        g.runId,
      ),
    ]);
    expect(nachrichten(a)).toEqual(["du:fertig:Hallo Pai", "ende:abgebrochen:unterbrochen"]);
  });

  it("Fehler des Anbieters: Code und Text am Hinweis, Senden wieder frei", () => {
    const ev = folge();
    const g = glueck(ev);
    let a = ereignisseAnwenden(leereAnsicht(), g.liste.slice(0, 4), KONTEXT);
    a = ereignisseAnwenden(a, [
      ev(
        "run.failed",
        {
          runId: g.runId,
          code: "anbieter_nicht_erreichbar",
          text: "Der Anbieter des Modells ist nicht erreichbar.",
        },
        g.runId,
      ),
    ]);
    expect(nachrichten(a)).toEqual([
      "du:fertig:Hallo Pai",
      "ende:fehlgeschlagen:anbieter_nicht_erreichbar",
    ]);
    const ende = a.eintraege[1];
    expect(ende?.art === "lauf-ende" && ende.text).toBe(
      "Der Anbieter des Modells ist nicht erreichbar.",
    );
    expect(sendenGesperrt(a)).toBe(false);
  });

  it("Fehler nach einem Teil der Antwort: Teiltext bleibt, als Fehler markiert", () => {
    const ev = folge();
    const g = glueck(ev);
    let a = ereignisseAnwenden(leereAnsicht(), g.liste.slice(0, 6), KONTEXT);
    a = ereignisseAnwenden(a, [
      ev(
        "run.failed",
        { runId: g.runId, code: "limit_erreicht", text: "Ein Limit ist erreicht." },
        g.runId,
      ),
    ]);
    expect(nachrichten(a)).toEqual(["du:fertig:Hallo Pai", "bot:fehler:Hallo! "]);
  });

  it("Ablehnung durch das Tor mit Datenschleuse: Grund und Zustand „nicht bereit“", () => {
    const ev = folge();
    const g = glueck(ev);
    let a = ereignisseAnwenden(leereAnsicht(), g.liste.slice(0, 3), KONTEXT);
    a = ereignisseAnwenden(a, [
      ev(
        "schleuse.blockiert",
        { runId: g.runId, reason: "Die Datenschleuse ist nicht erreichbar." },
        g.runId,
      ),
      ev(
        "run.denied",
        { runId: g.runId, code: "abgelehnt", text: "Das Tor hat die Aktion abgelehnt." },
        g.runId,
      ),
    ]);
    expect(nachrichten(a)).toEqual(["du:fertig:Hallo Pai", "ende:abgelehnt:abgelehnt"]);
    const ende = a.eintraege[1];
    expect(ende?.art === "lauf-ende" && ende.schleuseGrund).toBe(
      "Die Datenschleuse ist nicht erreichbar.",
    );
    expect(a.schleuseBlockiert).toBe(true);
    // Ein neuer Lauf setzt den Zustand zurück.
    const neu = newId("run");
    a = ereignisseAnwenden(a, [ev("run.queued", { runId: neu }, neu)]);
    expect(a.schleuseBlockiert).toBe(false);
  });
});

describe("Nachholen nach Verbindungsabbruch", () => {
  it("doppelte und alte Ereignisse ändern nichts; nichts fehlt", () => {
    const ev = folge();
    const g = glueck(ev, "Eins zwei drei vier");
    const einmal = ereignisseAnwenden(leereAnsicht(), g.liste, KONTEXT);
    // Strom bricht nach Ereignis 6 ab, das Nachholen beginnt etwas zu früh (ab 4).
    let a = ereignisseAnwenden(leereAnsicht(), g.liste.slice(0, 6), KONTEXT);
    a = ereignisseAnwenden(a, g.liste.slice(3), KONTEXT);
    expect(nachrichten(a)).toEqual(nachrichten(einmal));
    expect(a.belege).toEqual(einmal.belege);
    expect(a.letzteSeq).toBe(einmal.letzteSeq);
    // Ein Ereignis zweimal hintereinander:
    const doppelt = ereignisseAnwenden(einmal, [g.liste[6] as ConversationEvent], KONTEXT);
    expect(doppelt).toBe(einmal);
  });
});

describe("Kennzeichen „fremder Inhalt“ in der Ansicht", () => {
  const msg = (teil: Partial<Message> & Pick<Message, "id" | "role" | "content" | "status">) =>
    ({ conversationId, createdAt: "2026-11-21T10:00:00.000Z", ...teil }) as Message;

  // Gegenprobe: `fremd` in `ausNachricht` nicht setzen → die Antwort aus einer App zeigt ihre Links wie jede andere.
  it("eine Antwort mit `untrusted` bekommt `fremd`, alles andere nicht", () => {
    const verlauf: ChatVerlauf = {
      unterhaltung: { id: conversationId, titel: "Test", schleuse: "off" },
      nachrichten: [
        msg({ id: newId("message"), role: "user", content: "Frage", status: "complete" }),
        msg({
          id: newId("message"),
          role: "assistant",
          content: "mit App",
          status: "complete",
          untrusted: true,
        }),
        msg({ id: newId("message"), role: "assistant", content: "ohne", status: "complete" }),
      ],
      laeufe: [],
      ereignisse: [],
      letzteSeq: 0,
      belege: [],
      modelle: {},
    };
    const a = ansichtAus(verlauf, KONTEXT);
    const eintraege = a.eintraege.filter((e) => e.art === "nachricht");
    expect(eintraege.map((e) => [e.text, e.fremd === true])).toEqual([
      ["Frage", false],
      ["mit App", true],
      ["ohne", false],
    ]);
  });
});

describe("Nachfrage zum Lauf: Kennzeichen „fremder Inhalt“", () => {
  // Gegenprobe: `fremde` in `nachfrageUebernehmen` nicht auswerten → die frisch fertige Antwort bleibt anklickbar.
  it("übernimmt `fremd` für die genannten Antworten des Laufs, ohne die anderen anzufassen", () => {
    const a0 = leereAnsicht();
    const mitAntworten: ChatAnsicht = {
      ...a0,
      eintraege: [
        {
          art: "nachricht",
          id: "msg_a",
          rolle: "bot",
          text: "mit App",
          zeit: "2026-11-21T10:00:00.000Z",
          zustand: "fertig",
          runId: "run_1",
          herkunftOffen: true,
        },
        {
          art: "nachricht",
          id: "msg_b",
          rolle: "bot",
          text: "ohne",
          zeit: "2026-11-21T10:00:01.000Z",
          zustand: "fertig",
          runId: "run_1",
          herkunftOffen: true,
        },
      ],
    };
    const danach = nachfrageUebernehmen(mitAntworten, "run_1", {
      werkzeuge: [],
      feste: [],
      fremde: ["msg_a"],
    });
    const fremd = danach.eintraege.map((e) => (e.art === "nachricht" ? e.fremd === true : false));
    expect(fremd).toEqual([true, false]);
  });
});

describe("Links in Antworten, bevor das Kennzeichen „fremder Inhalt“ feststeht", () => {
  // Gegenprobe: `herkunftOffen` nur bei Läufen mit Schritten setzen → die Nachfrage bleibt leer (Lücke wie vorher).
  it("ein Lauf ohne Schritte mit einem Markdown-Link in der Antwort fragt nach, bis der Lesestand es sagt", () => {
    const ev = folge();
    const g = glueck(ev, "Hier: [Klick](https://sammler.example/x?k=1)");
    const a = ereignisseAnwenden(leereAnsicht(), g.liste, KONTEXT);
    expect(offeneNachfragen(a).map((n) => n.runId)).toEqual([g.runId]);
    const antwort = a.eintraege.find((e) => e.art === "nachricht" && e.id === g.antwort);
    expect(antwort).toMatchObject({ zustand: "fertig", herkunftOffen: true });
    // Der Lesestand nennt die Antwort „fremd“: Erst dann gilt das Kennzeichen, die Nachfrage ist erledigt.
    const danach = nachfrageUebernehmen(a, g.runId, {
      werkzeuge: [],
      feste: [],
      fremde: [g.antwort],
    });
    expect(offeneNachfragen(danach)).toEqual([]);
    expect(danach.eintraege.find((e) => e.art === "nachricht" && e.id === g.antwort)).toMatchObject(
      { fremd: true },
    );
  });
});

describe("Neuladen", () => {
  function msg(
    teil: Partial<Message> & Pick<Message, "id" | "role" | "content" | "status">,
  ): Message {
    return { conversationId, createdAt: "2026-11-21T10:00:00.000Z", ...teil } as Message;
  }

  it("mitten im Lauf: Text bis jetzt aus den Ereignissen, danach geht es live weiter", () => {
    const ev = folge();
    const g = glueck(ev, "Erst das, dann mehr");
    const bisJetzt = g.liste.slice(0, 6); // bis zum ersten Stück
    const verlauf: ChatVerlauf = {
      unterhaltung: { id: conversationId, titel: "Test", schleuse: "off" },
      nachrichten: [
        msg({ id: g.user as never, role: "user", content: "Hallo Pai", status: "complete" }),
        msg({
          id: g.antwort as never,
          role: "assistant",
          content: "",
          status: "streaming",
          runId: g.runId as never,
        }),
      ],
      laeufe: [],
      aktiverLauf: { id: g.runId, status: "running", conversationId } as Run,
      ereignisse: bisJetzt.slice(1),
      letzteSeq: 6,
      belege: [],
      modelle: {},
    };
    let a = ansichtAus(verlauf, KONTEXT);
    expect(nachrichten(a)).toEqual(["du:fertig:Hallo Pai", "bot:streamt:Erst da"]);
    expect(a.lauf?.phase).toBe("schreibt");
    expect(a.letzteSeq).toBe(6);
    a = ereignisseAnwenden(a, g.liste.slice(6), KONTEXT);
    expect(nachrichten(a)).toEqual(["du:fertig:Hallo Pai", "bot:fertig:Erst das, dann mehr"]);
    expect(a.lauf).toBeUndefined();
  });

  function verlaufMit(
    g: ReturnType<typeof glueck>,
    antwort: Pick<Message, "content" | "status">,
    ereignisse: ConversationEvent[],
  ): ChatVerlauf {
    return {
      unterhaltung: { id: conversationId, titel: "Test", schleuse: "off" },
      nachrichten: [
        msg({ id: g.user as never, role: "user", content: "Hallo Pai", status: "complete" }),
        msg({ id: g.antwort as never, role: "assistant", runId: g.runId as never, ...antwort }),
      ],
      laeufe: [],
      aktiverLauf: { id: g.runId, status: "running", conversationId } as Run,
      ereignisse,
      letzteSeq: ereignisse.at(-1)?.seq ?? 0,
      belege: [],
      modelle: {},
    };
  }

  it("Antwort gespeichert, Lauf noch offen: der Text steht einmal da, nicht doppelt", () => {
    const ev = folge();
    const g = glueck(ev, "Erst das, dann mehr");
    const bisFertig = g.liste.slice(1, 8); // run.queued … message.completed
    const a = ansichtAus(
      verlaufMit(g, { content: "Erst das, dann mehr", status: "complete" }, bisFertig),
      KONTEXT,
    );
    expect(nachrichten(a)).toEqual(["du:fertig:Hallo Pai", "bot:fertig:Erst das, dann mehr"]);
    expect(a.letzteSeq).toBe(8);
    // Kommt der Strom danach mit alten Nummern wieder (Wiederverbinden), ändert das nichts.
    const nochmal = ereignisseAnwenden(a, g.liste, KONTEXT);
    expect(nachrichten(nochmal)).toEqual(nachrichten(a));
  });

  it("Teiltext schon als abgebrochen gespeichert, Ende des Laufs folgt: Text einmal", () => {
    const ev = folge();
    const g = glueck(ev, "Erst das, dann mehr");
    const bisStueck = g.liste.slice(1, 7); // run.queued … beide Stücke
    let a = ansichtAus(
      verlaufMit(g, { content: "Erst das, dann mehr", status: "cancelled" }, bisStueck),
      KONTEXT,
    );
    expect(nachrichten(a)).toEqual(["du:fertig:Hallo Pai", "bot:abgebrochen:Erst das, dann mehr"]);
    expect(a.lauf?.id).toBe(g.runId);
    a = ereignisseAnwenden(a, [
      ev("run.cancelled", { runId: g.runId, code: "unterbrochen", text: "Abgebrochen." }, g.runId),
    ]);
    expect(nachrichten(a)).toEqual(["du:fertig:Hallo Pai", "bot:abgebrochen:Erst das, dann mehr"]);
    expect(a.lauf).toBeUndefined();
  });

  it("streamende Antwort: der Text kommt allein aus den Ereignissen, auch wenn schon Text gespeichert wäre", () => {
    const ev = folge();
    const g = glueck(ev, "Erst das, dann mehr");
    const a = ansichtAus(
      verlaufMit(g, { content: "Erst da", status: "streaming" }, g.liste.slice(1, 6)),
      KONTEXT,
    );
    expect(nachrichten(a)).toEqual(["du:fertig:Hallo Pai", "bot:streamt:Erst da"]);
  });

  it("Stücke nach dem Abschluss einer Nachricht ändern ihren Text nicht", () => {
    const ev = folge();
    const g = glueck(ev, "Erst das, dann mehr");
    const a = ereignisseAnwenden(leereAnsicht(), g.liste, KONTEXT);
    const spaet = ev("text.delta", { runId: g.runId, messageId: g.antwort, text: "!!" }, g.runId);
    expect(nachrichten(ereignisseAnwenden(a, [spaet]))).toEqual(nachrichten(a));
  });

  it("beendete Läufe ohne Antwort stehen hinter ihrer Nachricht", () => {
    const erste = newId("message");
    const zweite = newId("message");
    const antwort = newId("message");
    const abgelehnt = newId("run");
    const ok = newId("run");
    const verlauf: ChatVerlauf = {
      unterhaltung: { id: conversationId, titel: "Test", schleuse: "off" },
      nachrichten: [
        msg({ id: erste as never, role: "user", content: "Eins", status: "complete" }),
        msg({ id: zweite as never, role: "user", content: "Zwei", status: "complete" }),
        msg({
          id: antwort as never,
          role: "assistant",
          content: "Antwort",
          status: "complete",
          runId: ok as never,
          modelId: "mod_x" as never,
          route: "schleuse",
        }),
      ],
      laeufe: [
        {
          id: ok,
          status: "succeeded",
          triggerMessageId: zweite,
          createdAt: "2026-11-21T10:01:00.000Z",
        } as Run,
        {
          id: abgelehnt,
          status: "denied",
          errorCode: "abgelehnt",
          triggerMessageId: erste,
          createdAt: "2026-11-21T10:00:00.000Z",
        } as Run,
      ],
      ereignisse: [],
      letzteSeq: 12,
      belege: [],
      modelle: {
        mod_x: { name: "Beispiel-Modell B", herkunft: "Beispiel · lokal laut deiner Einstellung" },
      },
    };
    const a = ansichtAus(verlauf);
    expect(nachrichten(a)).toEqual([
      "du:fertig:Eins",
      "ende:abgelehnt:abgelehnt",
      "du:fertig:Zwei",
      "bot:fertig:Antwort",
    ]);
    const bot = a.eintraege[3];
    expect(bot?.art === "nachricht" && bot.modell).toEqual({
      name: "Beispiel-Modell B",
      herkunft: "Beispiel · lokal laut deiner Einstellung",
    });
    expect(a.lauf).toBeUndefined();
    expect(a.letzteSeq).toBe(12);
    // Späte Ereignisse eines beendeten Laufs aus dem Lesestand werden übersprungen.
    expect(
      ereignisseAnwenden(a, [
        {
          conversationId,
          seq: 12,
          time: "x",
          type: "run.queued",
          data: { runId: abgelehnt },
        } as ConversationEvent,
      ]),
    ).toBe(a);
  });
});

describe("Neu erzeugen", () => {
  function msg(
    teil: Partial<Message> & Pick<Message, "id" | "role" | "content" | "status">,
  ): Message {
    return { conversationId, createdAt: "2026-11-21T10:00:00.000Z", ...teil } as Message;
  }

  /** Erste Antwort fertig, dann ein zweiter Lauf zur selben Nachricht (wie die Route ihn anlegt). */
  function zweiFassungen() {
    const ev = folge();
    const g = glueck(ev, "Erste Fassung");
    const runId = newId("run");
    const neu = newId("message");
    const liste = [
      ev("run.queued", { runId }, runId),
      ev("run.started", { runId }, runId),
      ev("message.created", { messageId: neu, role: "assistant", text: "" }, runId),
      ev("text.delta", { runId, messageId: neu, text: "Zweite " }, runId),
      ev("text.delta", { runId, messageId: neu, text: "Fassung" }, runId),
      ev(
        "message.completed",
        {
          messageId: neu,
          route: "direct",
          modelLabel: "Beispiel-Modell B",
          tokens: { input: 1, output: 1 },
        },
        runId,
      ),
    ];
    return { ev, g, runId, neu, liste };
  }

  it("live: die neue Fassung kommt hinter die alte, die alte bleibt unverändert", () => {
    const { g, runId, liste } = zweiFassungen();
    let a = ereignisseAnwenden(leereAnsicht(), g.liste, KONTEXT);
    expect(neuErzeugbar(a)?.id).toBe(g.antwort);
    a = neuErzeugt(a, { runId });
    expect(sendenGesperrt(a)).toBe(true);
    a = ereignisseAnwenden(a, liste, KONTEXT);
    expect(nachrichten(a)).toEqual([
      "du:fertig:Hallo Pai",
      "bot:fertig:Erste Fassung",
      "bot:fertig:Zweite Fassung",
    ]);
    expect(a.lauf).toBeUndefined();
    // Nur die neueste lässt sich wieder neu erzeugen.
    expect(neuErzeugbar(a)?.text).toBe("Zweite Fassung");
    // Die Antwort der Route kam zu spät: der Lauf bleibt beendet.
    expect(neuErzeugt(a, { runId }).lauf).toBeUndefined();
  });

  it("Neuladen mitten im neuen Lauf: alte Fassung fertig, neue aus den Ereignissen", () => {
    const { g, runId, neu, liste } = zweiFassungen();
    const verlauf: ChatVerlauf = {
      unterhaltung: { id: conversationId, titel: "Test", schleuse: "off" },
      nachrichten: [
        msg({ id: g.user as never, role: "user", content: "Hallo Pai", status: "complete" }),
        msg({
          id: g.antwort as never,
          role: "assistant",
          content: "Erste Fassung",
          status: "complete",
          runId: g.runId as never,
        }),
        msg({
          id: neu as never,
          role: "assistant",
          content: "",
          status: "streaming",
          runId: runId as never,
        }),
      ],
      laeufe: [{ id: g.runId, status: "succeeded", triggerMessageId: g.user } as Run],
      aktiverLauf: { id: runId, status: "running", conversationId } as Run,
      ereignisse: liste.slice(0, 4),
      letzteSeq: liste[3]?.seq ?? 0,
      belege: [],
      modelle: {},
    };
    let a = ansichtAus(verlauf, KONTEXT);
    expect(nachrichten(a)).toEqual([
      "du:fertig:Hallo Pai",
      "bot:fertig:Erste Fassung",
      "bot:streamt:Zweite ",
    ]);
    expect(neuErzeugbar(a)).toBeUndefined();
    a = ereignisseAnwenden(a, liste, KONTEXT);
    expect(nachrichten(a)).toEqual([
      "du:fertig:Hallo Pai",
      "bot:fertig:Erste Fassung",
      "bot:fertig:Zweite Fassung",
    ]);
  });

  it("Neuladen zwischen Speichern und Ende des neuen Laufs: kein Text doppelt", () => {
    const { g, runId, neu, liste } = zweiFassungen();
    const verlauf: ChatVerlauf = {
      unterhaltung: { id: conversationId, titel: "Test", schleuse: "off" },
      nachrichten: [
        msg({ id: g.user as never, role: "user", content: "Hallo Pai", status: "complete" }),
        msg({
          id: g.antwort as never,
          role: "assistant",
          content: "Erste Fassung",
          status: "complete",
          runId: g.runId as never,
        }),
        msg({
          id: neu as never,
          role: "assistant",
          content: "Zweite Fassung",
          status: "complete",
          runId: runId as never,
        }),
      ],
      laeufe: [],
      aktiverLauf: { id: runId, status: "running", conversationId } as Run,
      ereignisse: liste,
      letzteSeq: liste.at(-1)?.seq ?? 0,
      belege: [],
      modelle: {},
    };
    const a = ansichtAus(verlauf, KONTEXT);
    expect(nachrichten(a)).toEqual([
      "du:fertig:Hallo Pai",
      "bot:fertig:Erste Fassung",
      "bot:fertig:Zweite Fassung",
    ]);
    expect(nachrichten(ereignisseAnwenden(a, [...g.liste, ...liste], KONTEXT))).toEqual(
      nachrichten(a),
    );
  });

  it("neuer Lauf abgelehnt (z. B. Tagesbudget): Hinweis hinter der alten Fassung, die bleibt neu erzeugbar", () => {
    const { g } = zweiFassungen();
    const abgelehnt = newId("run");
    const verlauf: ChatVerlauf = {
      unterhaltung: { id: conversationId, titel: "Test", schleuse: "off" },
      nachrichten: [
        msg({ id: g.user as never, role: "user", content: "Hallo Pai", status: "complete" }),
        msg({
          id: g.antwort as never,
          role: "assistant",
          content: "Erste Fassung",
          status: "complete",
          runId: g.runId as never,
        }),
      ],
      laeufe: [
        {
          id: abgelehnt,
          status: "denied",
          errorCode: "limit_erreicht",
          triggerMessageId: g.user,
          createdAt: "2026-11-21T10:05:00.000Z",
        } as Run,
        {
          id: g.runId,
          status: "succeeded",
          triggerMessageId: g.user,
          createdAt: "2026-11-21T10:00:00.000Z",
        } as Run,
      ],
      ereignisse: [],
      letzteSeq: 20,
      belege: [],
      modelle: {},
    };
    const a = ansichtAus(verlauf);
    expect(nachrichten(a)).toEqual([
      "du:fertig:Hallo Pai",
      "bot:fertig:Erste Fassung",
      "ende:abgelehnt:limit_erreicht",
    ]);
    expect(neuErzeugbar(a)?.id).toBe(g.antwort);
  });
});

describe("Fassungen", () => {
  it("Antworten zwischen zwei Nachrichten der Person sind Fassungen; Hinweise trennen nicht", () => {
    const f = fassungenVon([
      { id: "u1", rolle: "du" },
      { id: "a1", rolle: "bot" },
      { id: "h" },
      { id: "a2", rolle: "bot" },
      { id: "u2", rolle: "du" },
      { id: "b1", rolle: "bot" },
    ]);
    expect(f.get("a1")).toEqual({ nr: 1, von: 2, alle: ["a1", "a2"] });
    expect(f.get("a2")).toMatchObject({ nr: 2, von: 2 });
    expect(f.get("b1")).toMatchObject({ nr: 1, von: 1 });
    expect(f.has("u1")).toBe(false);
  });
});

describe("Herkunft der Antwort", () => {
  it("message.completed übernimmt den Anbieter laut Antwort; ohne Modell kein angenommenes EU", () => {
    const ev = folge();
    const g = glueck(ev);
    const fertig = g.liste.map((e) =>
      e.type === "message.completed"
        ? { ...e, data: { ...e.data, servedBy: { provider: "beispiel-nord", model: "b/m" } } }
        : e,
    ) as typeof g.liste;
    const a = ereignisseAnwenden(leereAnsicht(), fertig, {});
    const antwort = a.eintraege[1];
    expect(antwort?.art === "nachricht" && antwort.servedBy).toEqual({
      provider: "beispiel-nord",
      model: "b/m",
    });
    // Ohne bekanntes Modell: nur der Name, keine Region und kein „EU“.
    expect(antwort?.art === "nachricht" && antwort.modell).toEqual({ name: "Beispiel-Modell A" });
  });
});

describe("Vorgabe der Regel zur Zeit der Antwort", () => {
  const GEPRUEFT = new Date("2026-11-21T10:00:00.000Z");
  const MODELL = newId("model");
  const modellMit = (policy: object) => ({
    name: "Beispiel-Regel",
    herkunft: "über EUrouter",
    vorgabe: vorgabeAus(policy, GEPRUEFT, GEPRUEFT, "Europe/Berlin"),
  });

  function verlaufMit(
    antwort: Partial<Message>,
    modelle: ChatVerlauf["modelle"],
    ereignisse: ConversationEvent[] = [],
  ): ChatVerlauf {
    return {
      unterhaltung: { id: conversationId, titel: "Test", schleuse: "off" },
      nachrichten: [
        {
          id: newId("message"),
          conversationId,
          role: "assistant",
          content: "Gern.",
          status: "complete",
          route: "direct",
          createdAt: "2026-11-21T12:00:00.000Z",
          ...antwort,
        } as Message,
      ],
      laeufe: [],
      ereignisse,
      letzteSeq: 0,
      belege: [],
      modelle,
    };
  }
  const modellDerAntwort = (verlauf: ChatVerlauf, kontext = {}) => {
    const e = ansichtAus(verlauf, kontext).eintraege[0];
    return e?.art === "nachricht" ? e.modell : undefined;
  };

  it("die Vorgabe zählt nur, wenn ihre Prüfung vor der Antwort liegt und die Nachricht ihr Modell nennt", () => {
    const m = modellMit({ data_residency: "EU" });
    const spaeter = verlaufMit({ modelId: MODELL }, { [MODELL]: m });
    expect(modellDerAntwort(spaeter)?.vorgabe?.policy.data_residency).toBe("EU");
  });

  it("Gegenprobe: Prüfung nach der Antwort oder zur selben Zeit: nur der Name, keine Vorgabe", () => {
    const m = modellMit({ data_residency: "EU" });
    for (const createdAt of ["2026-11-21T09:59:59.000Z", "2026-11-21T10:00:00.000Z"]) {
      const modell = modellDerAntwort(verlaufMit({ modelId: MODELL, createdAt }, { [MODELL]: m }));
      expect(modell?.name).toBe("Beispiel-Regel");
      expect(modell?.herkunft).toBe("über EUrouter");
      expect(modell?.vorgabe).toBeUndefined();
    }
  });

  it("ohne Modell an der Nachricht gibt es keine Vorgabe, auch nicht vom Modell von heute", () => {
    const m = modellMit({ data_residency: "EU" });
    expect(modellDerAntwort(verlaufMit({}, { [MODELL]: m }), { modell: m })).toBeUndefined();
  });

  it("eine Antwort, die gerade fertig wird, bekommt vom Modell von heute den Namen, aber keine Vorgabe", () => {
    const ev = folge();
    const g = glueck(ev);
    const a = ereignisseAnwenden(leereAnsicht(), g.liste, {
      modell: modellMit({ data_residency: "EU" }),
    });
    const antwort = a.eintraege[1];
    const modell = antwort?.art === "nachricht" ? antwort.modell : undefined;
    expect(modell?.name).toBe("Beispiel-Modell A");
    expect(modell?.herkunft).toBe("über EUrouter");
    expect(modell?.vorgabe).toBeUndefined();
  });
});

describe("Chat-Kopf nach „Regel unbekannt“", () => {
  const ENDE_UM = new Date(Date.UTC(2026, 10, 21, 10, 0, 5));
  const modellGeprueft = (am: Date) => ({
    name: "Beispiel-Regel",
    herkunft: "über EUrouter",
    vorgabe: vorgabeAus({ data_residency: "EU" }, am, am, "Europe/Berlin"),
  });
  const mitEnde = (code: "regel_unbekannt" | "anbieter_nicht_erreichbar") => {
    const ev = folge();
    const g = glueck(ev);
    const a = ereignisseAnwenden(leereAnsicht(), g.liste.slice(0, 4), KONTEXT);
    return ereignisseAnwenden(a, [
      ev("run.failed", { runId: g.runId, code, text: "Das hat nicht geklappt." }, g.runId),
    ]);
  };

  it("die Marke verschwindet sofort, wenn ein Lauf danach mit „Regel unbekannt“ endet", () => {
    const a = mitEnde("regel_unbekannt");
    const vorher = modellGeprueft(new Date(ENDE_UM.getTime() - 3_600_000));
    expect(kopfModell(vorher, a.eintraege)?.vorgabe).toBeUndefined();
    expect(kopfModell(vorher, a.eintraege)?.name).toBe("Beispiel-Regel");
  });

  it("Gegenprobe: anderer Fehler, oder die Vorgabe wurde nach dem Fehler neu gelesen: die Marke bleibt", () => {
    const vorher = modellGeprueft(new Date(ENDE_UM.getTime() - 3_600_000));
    expect(
      kopfModell(vorher, mitEnde("anbieter_nicht_erreichbar").eintraege)?.vorgabe,
    ).toBeDefined();
    const nachher = modellGeprueft(new Date(ENDE_UM.getTime() + 3_600_000));
    expect(kopfModell(nachher, mitEnde("regel_unbekannt").eintraege)?.vorgabe).toBeDefined();
    expect(kopfModell(vorher, [])?.vorgabe).toBeDefined();
    expect(kopfModell(undefined, mitEnde("regel_unbekannt").eintraege)).toBeUndefined();
  });

  it("auch nach dem Neuladen: ein beendeter Lauf mit „Regel unbekannt“ im Verlauf", () => {
    const run = newId("run");
    const verlauf: ChatVerlauf = {
      unterhaltung: { id: conversationId, titel: "Test", schleuse: "off" },
      nachrichten: [],
      laeufe: [
        {
          id: run,
          conversationId,
          triggerMessageId: newId("message"),
          status: "failed",
          errorCode: "regel_unbekannt",
          createdAt: ENDE_UM.toISOString(),
          finishedAt: ENDE_UM.toISOString(),
        } as unknown as Run,
      ],
      ereignisse: [],
      letzteSeq: 0,
      belege: [],
      modelle: {},
    };
    const a = ansichtAus(verlauf, {});
    const vorher = modellGeprueft(new Date(ENDE_UM.getTime() - 3_600_000));
    expect(kopfModell(vorher, a.eintraege)?.vorgabe).toBeUndefined();
  });
});

describe("Zwischentexte eines Laufs mit Werkzeugen", () => {
  const ZEIT = "2026-11-21T10:00:00.000Z";

  function msg(teil: Partial<Message> & Pick<Message, "id" | "role" | "content">): Message {
    return { conversationId, createdAt: ZEIT, status: "complete", ...teil } as Message;
  }

  function lauf(id: string, trigger: string, status: Run["status"]): Run {
    return {
      id,
      conversationId,
      triggerMessageId: trigger,
      status,
      createdAt: ZEIT,
      finishedAt: ZEIT,
    } as Run;
  }

  it("Zwischentexte werden kein Eintrag und keine Antwort ihres Laufs", () => {
    const frage1 = newId("message");
    const frage2 = newId("message");
    const laufA = newId("run");
    const laufB = newId("run");
    const verlauf: ChatVerlauf = {
      unterhaltung: { id: conversationId, titel: "Test", schleuse: "off" },
      nachrichten: [
        msg({ id: frage1 as never, role: "user", content: "Frage 1" }),
        msg({
          id: newId("message") as never,
          role: "assistant",
          content: "ZWISCHEN-A0",
          runId: laufA as never,
          step: 0,
        }),
        msg({
          id: newId("message") as never,
          role: "assistant",
          content: "ZWISCHEN-A1",
          runId: laufA as never,
          step: 1,
          status: "failed",
        }),
        msg({
          id: newId("message") as never,
          role: "assistant",
          content: "Antwort A",
          runId: laufA as never,
        }),
        msg({ id: frage2 as never, role: "user", content: "Frage 2" }),
        msg({
          id: newId("message") as never,
          role: "assistant",
          content: "ZWISCHEN-B0",
          runId: laufB as never,
          step: 0,
          status: "cancelled",
        }),
      ],
      // neueste zuerst, wie der Lesestand sie liefert
      laeufe: [lauf(laufB, frage2, "cancelled"), lauf(laufA, frage1, "succeeded")],
      ereignisse: [],
      letzteSeq: 0,
      belege: [],
      modelle: {},
    };
    const a = ansichtAus(verlauf, KONTEXT);
    expect(nachrichten(a)).toEqual([
      "du:fertig:Frage 1",
      "bot:fertig:Antwort A",
      "du:fertig:Frage 2",
      "ende:abgebrochen:unterbrochen",
    ]);
    expect(JSON.stringify(a.eintraege)).not.toContain("ZWISCHEN");
    // Lauf B hat nur einen Zwischentext und gilt deshalb als ohne Antwort beendet.
    expect(a.eintraege.at(-1)).toMatchObject({ art: "lauf-ende", runId: laufB });
    // „Neu erzeugen“ bezieht sich auf keine Nachricht: Frage 2 ist die letzte Nachricht.
    expect(neuErzeugbar(a)).toBeUndefined();
  });

  it("Ereignisse der Schritte erzeugen keinen Eintrag", () => {
    const ev = folge();
    const runId = newId("run");
    const user = newId("message");
    const antwort = newId("message");
    const tool = newId("message");
    const aktion = newId("action");
    const liste = [
      ev("message.created", { messageId: user, role: "user", text: "Frage" }),
      ev("run.queued", { runId }, runId),
      ev("run.started", { runId }, runId),
      ev("beleg.created", { belegId: newId("receipt"), action: "modell.anfragen" }, runId),
      ev(
        "tool.requested",
        {
          runId,
          actionId: aktion,
          messageId: tool,
          name: "doku_nachschlagen",
          source: "eingebaut",
          kind: "lesen",
          key: "eingebaut/doku.nachschlagen",
          step: 0,
        },
        runId,
      ),
      ev("step.finished", { runId, step: 0, ending: "zwischentext" }, runId),
      ev("tool.started", { runId, actionId: aktion }, runId),
      ev("tool.finished", { runId, actionId: aktion, status: "succeeded" }, runId),
      ev("draft.delta", { runId, step: 1, text: "ENTWURF" }, runId),
      ev("step.finished", { runId, step: 1, ending: "antwort" }, runId),
      ev("message.created", { messageId: antwort, role: "assistant", text: "" }, runId),
      ev("text.delta", { runId, messageId: antwort, text: "Die Antwort." }, runId),
      ev(
        "message.completed",
        {
          messageId: antwort,
          route: "direct",
          modelLabel: "Beispiel-Modell A",
          tokens: { input: 10, output: 5 },
        },
        runId,
      ),
    ];
    // Die Daten sind gültig, der Test prüft also wirklich die Ereignisse, die der Worker schreibt.
    for (const e of liste) expect(EVENT_DATA[e.type].safeParse(e.data).success, e.type).toBe(true);
    const a = ereignisseAnwenden(leereAnsicht(), liste, KONTEXT);
    expect(nachrichten(a)).toEqual(["du:fertig:Frage", "bot:fertig:Die Antwort."]);
    expect(JSON.stringify(a.eintraege)).not.toContain("ENTWURF");
    expect(a.letzteSeq).toBe(liste.length);
  });
});
