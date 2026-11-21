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

import type { ConversationEvent, ConversationEventType } from "@paibot/shared/ereignisse";
import { newId } from "@paibot/shared/ids";
import type { Message, Run } from "@paibot/shared/objekte";
import { describe, expect, it } from "vitest";
import {
  abbruchAngefragt,
  ansichtAus,
  belegeMischen,
  belegZurAntwort,
  type ChatAnsicht,
  ereignisseAnwenden,
  gesendet,
  leereAnsicht,
  sendenGesperrt,
} from "./ansicht";
import type { ChatVerlauf } from "./typen";

const conversationId = newId("conversation");
const KONTEXT = { modell: { name: "Beispiel-Modell A", region: "eu" as const } };

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
      modelle: { mod_x: { name: "Beispiel-Modell B", region: "local" } },
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
      region: "local",
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
