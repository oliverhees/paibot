/**
 * PaiBot – Tests der Ansicht mit Schritten: vorläufiger Text nur im Schritt und nie in der Antwort,
 * Zwischentexte sind keine Antwort, das letzte Ende eines Schritts gilt, feste Antworten, Neuladen
 * mitten im Lauf, Lauf-Ende mitten im Schritt, Zustand der Aufrufe, Phase und Herkunft je Schritt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import {
  type ConversationEvent,
  type ConversationEventType,
  EVENT_DATA,
} from "@paibot/shared/ereignisse";
import { newId } from "@paibot/shared/ids";
import type { Message, Run } from "@paibot/shared/objekte";
import { describe, expect, it } from "vitest";
import {
  ansichtAus,
  type ChatAnsicht,
  ereignisAnwenden,
  ereignisseAnwenden,
  leereAnsicht,
  nachfrageUebernehmen,
  neuErzeugbar,
  offeneNachfrage,
  schritteVon,
} from "./ansicht";
import { antwortHatText, avatarAufEreignis } from "./avatar";
import { fassungenVon } from "./fassungen";
import { herkunftKette } from "./schritte-anzeige";
import type { ChatVerlauf, WerkzeugAnzeige } from "./typen";
import { WERKZEUG_DOKU } from "./werkzeug-anzeige";

const conversationId = newId("conversation");
const KONTEXT = { modell: { name: "Beispiel-Modell A" } };

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
      time: new Date(Date.UTC(2026, 10, 22, 10, 0, seq)).toISOString(),
      type,
      data,
      ...(runId === undefined ? {} : { runId }),
    } as ConversationEvent;
  };
}

/** Ein Lauf mit Nachschlagen: Text vor dem Aufruf, Aufruf, Text der Antwort, Antwort. */
function nachschlagen(ev: ReturnType<typeof folge>) {
  const user = newId("message");
  const stepMsg = newId("message");
  const antwort = newId("message");
  const runId = newId("run");
  const aktion = newId("action");
  const liste = [
    ev("message.created", { messageId: user, role: "user", text: "Frage" }),
    ev("run.queued", { runId }, runId),
    ev("run.started", { runId }, runId),
    ev("draft.delta", { runId, step: 0, text: "VORHER-A" }, runId),
    ev("draft.delta", { runId, step: 0, text: "VORHER-B" }, runId),
    ev(
      "tool.requested",
      {
        runId,
        actionId: aktion,
        messageId: stepMsg,
        name: "doku_nachschlagen",
        source: "eingebaut",
        kind: "lesen",
        key: WERKZEUG_DOKU,
        step: 0,
      },
      runId,
    ),
    ev(
      "step.finished",
      { runId, step: 0, ending: "zwischentext", servedBy: { provider: "tensorix" } },
      runId,
    ),
    ev("tool.started", { runId, actionId: aktion }, runId),
    ev("tool.finished", { runId, actionId: aktion, status: "succeeded" }, runId),
    ev("draft.delta", { runId, step: 1, text: "ENTWURF-A" }, runId),
    ev("draft.delta", { runId, step: 1, text: "ENTWURF-B" }, runId),
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
        servedBy: { provider: "melious" },
      },
      runId,
    ),
  ];
  return { liste, user, stepMsg, antwort, runId, aktion };
}

/** Text der Antworten in der Ansicht (Rolle bot). */
function antwortTexte(a: ChatAnsicht): string[] {
  return a.eintraege.flatMap((e) => (e.art === "nachricht" && e.rolle === "bot" ? [e.text] : []));
}

/** Schritte in kurzer Form. */
function kurz(a: ChatAnsicht, runId: string) {
  return schritteVon(a, runId).map((x) => `${x.step}:${x.ende}:${x.text}`);
}

describe("vorläufiger Text", () => {
  it("die Ereignisse sind gültig, wie der Worker sie schreibt", () => {
    const g = nachschlagen(folge());
    for (const e of g.liste)
      expect(EVENT_DATA[e.type].safeParse(e.data).success, e.type).toBe(true);
  });

  // Gegenprobe: `draft.delta` an die Nachricht des Laufs hängen → „ENTWURF“ steht in der Antwort.
  it("draft.delta erscheint nur im Schritt, nie in der Antwort, auch nicht nach dem Ende des Schritts", () => {
    const g = nachschlagen(folge());
    let a = leereAnsicht();
    for (const e of g.liste) {
      a = ereignisAnwenden(a, e, KONTEXT);
      expect(JSON.stringify(a.eintraege), `nach ${e.type}`).not.toMatch(/ENTWURF|VORHER/);
    }
    expect(antwortTexte(a)).toEqual(["Die Antwort."]);
  });

  it("der Text läuft im Schritt mit und bleibt bis zur Antwort stehen", () => {
    const g = nachschlagen(folge());
    // bis nach dem zweiten Stück des Entwurfs und dem Ende des Schritts
    const a = ereignisseAnwenden(leereAnsicht(), g.liste.slice(0, 12), KONTEXT);
    expect(kurz(a, g.runId)).toEqual([
      "0:zwischentext:VORHER-AVORHER-B",
      "1:antwort:ENTWURF-AENTWURF-B",
    ]);
    expect(antwortTexte(a)).toEqual([]);
    // Mit der fertigen Antwort ist der vorläufige Text des Antwort-Schritts weg.
    const fertig = ereignisseAnwenden(a, g.liste.slice(12), KONTEXT);
    expect(kurz(fertig, g.runId)).toEqual(["0:zwischentext:VORHER-AVORHER-B"]);
    expect(antwortTexte(fertig)).toEqual(["Die Antwort."]);
  });

  it("ein Lauf ohne Werkzeuge bekommt keinen Schritt, auch wenn er das Ende seiner Antwort meldet", () => {
    const ev = folge();
    const runId = newId("run");
    const antwort = newId("message");
    const liste = [
      ev("run.queued", { runId }, runId),
      ev("message.created", { messageId: antwort, role: "assistant", text: "" }, runId),
      ev("text.delta", { runId, messageId: antwort, text: "Hallo" }, runId),
      ev("step.finished", { runId, step: 0, ending: "antwort" }, runId),
      ev(
        "message.completed",
        {
          messageId: antwort,
          route: "direct",
          modelLabel: "Beispiel-Modell A",
          tokens: { input: 1, output: 1 },
        },
        runId,
      ),
    ];
    const a = ereignisseAnwenden(leereAnsicht(), liste, KONTEXT);
    expect(a.schritte).toEqual([]);
    expect(antwortTexte(a)).toEqual(["Hallo"]);
  });

  it("unbekannte Ereignis-Arten ändern die Ansicht nicht (es gibt keinen Denk-Text)", () => {
    const g = nachschlagen(folge());
    const a = ereignisseAnwenden(leereAnsicht(), g.liste.slice(0, 6), KONTEXT);
    const fremd = {
      conversationId,
      seq: a.letzteSeq + 1,
      time: "2026-11-22T10:10:00.000Z",
      type: "denk.text",
      data: { runId: g.runId, text: "GEDANKE" },
      runId: g.runId,
    } as unknown as ConversationEvent;
    const danach = ereignisAnwenden(a, fremd, KONTEXT);
    expect(JSON.stringify({ ...danach, letzteSeq: 0 })).toBe(
      JSON.stringify({ ...a, letzteSeq: 0 }),
    );
    expect(JSON.stringify(danach)).not.toContain("GEDANKE");
  });
});

/** Nachricht in einem Lesestand. */
function msg(teil: Partial<Message> & Pick<Message, "role" | "content">): Message {
  return {
    id: newId("message"),
    conversationId,
    status: "complete",
    createdAt: "2026-11-22T10:00:00.000Z",
    ...teil,
  } as Message;
}

function lauf(id: string, status: Run["status"], teil: Partial<Run> = {}): Run {
  return {
    id,
    conversationId,
    triggerMessageId: newId("message"),
    botId: newId("bot"),
    status,
    createdAt: "2026-11-22T10:00:00.000Z",
    ...teil,
  } as Run;
}

function verlaufMit(teil: Partial<ChatVerlauf>): ChatVerlauf {
  return {
    unterhaltung: { id: conversationId, titel: "Beispiel", schleuse: "off" },
    nachrichten: [],
    laeufe: [],
    ereignisse: [],
    letzteSeq: 0,
    belege: [],
    modelle: {},
    ...teil,
  };
}

describe("Zwischentexte sind keine Antwort", () => {
  // Gegenprobe: Zwischentext als `AnsichtNachricht` bzw. `fassungenVon` über alle Einträge → „Fassung 1 von 3“.
  it("keine Fassung, nicht neu erzeugbar; der Lauf mit nur einem Zwischentext gilt als ohne Antwort beendet", () => {
    const runA = newId("run");
    const runB = newId("run");
    const frage1 = msg({ role: "user", content: "Frage 1" });
    const frage2 = msg({ role: "user", content: "Frage 2" });
    const antwort = msg({ role: "assistant", content: "Antwort A", runId: runA, route: "direct" });
    const verlauf = verlaufMit({
      nachrichten: [
        frage1,
        msg({ role: "assistant", content: "ZWISCHEN-0", runId: runA, step: 0 }),
        msg({ role: "assistant", content: "ZWISCHEN-1", runId: runA, step: 1 }),
        antwort,
        frage2,
        msg({
          role: "assistant",
          content: "ZWISCHEN-B",
          runId: runB,
          step: 0,
          status: "cancelled",
        }),
      ],
      laeufe: [
        lauf(runB, "failed", { errorCode: "unterbrochen", triggerMessageId: frage2.id }),
        lauf(runA, "succeeded", { triggerMessageId: frage1.id }),
      ],
    });
    const a = ansichtAus(verlauf, KONTEXT);
    expect(JSON.stringify(a.eintraege)).not.toContain("ZWISCHEN");
    const bot = a.eintraege.flatMap((x) => (x.art === "nachricht" && x.rolle === "bot" ? [x] : []));
    expect(bot).toHaveLength(1);
    const f = fassungenVon(
      a.eintraege.map((x) =>
        x.art === "nachricht" ? { id: x.id, rolle: x.rolle } : { id: `ende-${x.runId}` },
      ),
    );
    expect(f.get(antwort.id)).toMatchObject({ nr: 1, von: 1 });
    // Frage 2 ist die letzte Nachricht: nichts zum Neu-Erzeugen; der Lauf B zeigt seinen Hinweis.
    expect(neuErzeugbar(a)).toBeUndefined();
    expect(a.eintraege.at(-1)).toMatchObject({ art: "lauf-ende", runId: runB });
    // Die Zwischentexte stehen als Schritte da.
    expect(kurz(a, runA)).toEqual(["0:zwischentext:ZWISCHEN-0", "1:zwischentext:ZWISCHEN-1"]);
    expect(kurz(a, runB)).toEqual(["0:abgebrochen:ZWISCHEN-B"]);
  });

  it("die letzte Antwort bleibt neu erzeugbar, auch wenn ein späterer Lauf nur Schritte hatte", () => {
    const runA = newId("run");
    const frage = msg({ role: "user", content: "Frage" });
    const antwort = msg({ role: "assistant", content: "Antwort", runId: runA, route: "direct" });
    const a = ansichtAus(
      verlaufMit({
        nachrichten: [
          frage,
          msg({ role: "assistant", content: "ZW", runId: runA, step: 0 }),
          antwort,
        ],
        laeufe: [lauf(runA, "succeeded", { triggerMessageId: frage.id })],
      }),
      KONTEXT,
    );
    expect(neuErzeugbar(a)?.id).toBe(antwort.id);
  });
});

describe("das letzte Ende eines Schritts gilt", () => {
  // Gegenprobe: erstes `step.finished` werten → der Schritt bliebe „zwischentext“.
  it("ein altes Ereignis „verworfen“ nach „zwischentext“ wird fehlerfrei verarbeitet", () => {
    const ev = folge();
    const g = nachschlagen(ev);
    const ende = ev("step.finished", { runId: g.runId, step: 0, ending: "verworfen" }, g.runId);
    const a = ereignisseAnwenden(leereAnsicht(), [...g.liste.slice(0, 9), ende], KONTEXT);
    expect(kurz(a, g.runId)).toEqual(["0:verworfen:VORHER-AVORHER-B"]);
    expect(antwortTexte(a)).toEqual([]);
  });

  it("ohne „verworfen“ steht ein Schritt vor einem Aufruf nie als verworfen da", () => {
    const g = nachschlagen(folge());
    const a = ereignisseAnwenden(leereAnsicht(), g.liste, KONTEXT);
    expect(schritteVon(a, g.runId).some((x) => x.ende === "verworfen")).toBe(false);
  });

  it("ein abgebrochener Schritt bleibt abgebrochen", () => {
    const ev = folge();
    const g = nachschlagen(ev);
    const lesestand = verlaufMit({
      nachrichten: [
        msg({ role: "assistant", content: "TEIL", runId: g.runId, step: 0, status: "cancelled" }),
      ],
      laeufe: [],
      aktiverLauf: lauf(g.runId, "running"),
    });
    const spaet = ev("step.finished", { runId: g.runId, step: 0, ending: "zwischentext" }, g.runId);
    const a = ereignisAnwenden(ansichtAus(lesestand, KONTEXT), spaet, KONTEXT);
    expect(kurz(a, g.runId)).toEqual(["0:abgebrochen:TEIL"]);
  });
});

describe("feste Antworten", () => {
  const WORTLAUT = "Dazu steht nichts in der Doku dieser Version.";

  // Gegenprobe: den Hinweis aus dem Wortlaut der Antwort ableiten → auch die Antwort des Modells trüge ihn.
  it("aus dem Lesestand: nur `origin = fest` bekommt die Kennzeichnung, ein Text mit gleichem Wortlaut nicht", () => {
    const runA = newId("run");
    const runB = newId("run");
    const a = ansichtAus(
      verlaufMit({
        nachrichten: [
          msg({ role: "user", content: "Frage" }),
          msg({
            role: "assistant",
            content: WORTLAUT,
            runId: runA,
            origin: "fest",
            route: "direct",
          }),
          msg({
            role: "assistant",
            content: WORTLAUT,
            runId: runB,
            origin: "modell",
            route: "direct",
          }),
          msg({ role: "assistant", content: WORTLAUT, runId: runB, route: "direct" }),
        ],
      }),
      KONTEXT,
    );
    const bot = a.eintraege.flatMap((x) => (x.art === "nachricht" && x.rolle === "bot" ? [x] : []));
    expect(bot.map((x) => x.herkunft)).toEqual(["fest", undefined, undefined]);
  });

  it("live: nach dem Ende der Antwort eines Laufs mit Schritten ist die Herkunft offen und wird nachgefragt", () => {
    const g = nachschlagen(folge());
    const a = ereignisseAnwenden(leereAnsicht(), g.liste, KONTEXT);
    const antwort = a.eintraege.find((e) => e.art === "nachricht" && e.id === g.antwort);
    expect(antwort).toMatchObject({ herkunftOffen: true });
    expect(antwort).not.toHaveProperty("herkunft");
    const frage = offeneNachfrage(a);
    expect(frage?.runId).toBe(g.runId);
    // Der Server nennt die Antwort als fest: Kennzeichnung da, nichts mehr offen.
    const fest = nachfrageUebernehmen(a, g.runId, {
      werkzeuge: [],
      feste: [g.antwort],
    });
    const festAntwort = fest.eintraege.find((e) => e.art === "nachricht" && e.id === g.antwort);
    expect(festAntwort).toMatchObject({ herkunft: "fest" });
    expect(festAntwort).not.toHaveProperty("herkunftOffen");
    // Nennt er sie nicht, bleibt sie ohne Kennzeichnung und nichts ist mehr offen.
    const modell = nachfrageUebernehmen(a, g.runId, { werkzeuge: [], feste: [] });
    const modellAntwort = modell.eintraege.find((e) => e.art === "nachricht" && e.id === g.antwort);
    expect(modellAntwort).not.toHaveProperty("herkunft");
    expect(modellAntwort).not.toHaveProperty("herkunftOffen");
  });

  it("ein Lauf ohne Schritte fragt nie nach", () => {
    const ev = folge();
    const runId = newId("run");
    const antwort = newId("message");
    const liste = [
      ev("run.queued", { runId }, runId),
      ev("message.created", { messageId: antwort, role: "assistant", text: "" }, runId),
      ev("text.delta", { runId, messageId: antwort, text: "Hallo" }, runId),
      ev(
        "message.completed",
        {
          messageId: antwort,
          route: "direct",
          modelLabel: "Beispiel-Modell A",
          tokens: { input: 1, output: 1 },
        },
        runId,
      ),
    ];
    const a = ereignisseAnwenden(leereAnsicht(), liste, KONTEXT);
    expect(offeneNachfrage(a)).toBeUndefined();
  });
});

describe("Neuladen mitten im Lauf zeigt dasselbe wie live", () => {
  /**
   * Der Lesestand nach dem Ereignis `k` einer Folge: gespeichert ist, was der Worker in einer
   * Transaktion schreibt (Zwischentext mit seinem Ende, Antwort mit ihren Ereignissen); die
   * Ereignisse des aktiven Laufs gehören dazu.
   */
  function lesestandNach(g: ReturnType<typeof nachschlagen>, k: number): ChatVerlauf {
    const bis = g.liste.slice(0, k);
    const hat = (typ: string) => bis.some((e) => e.type === typ);
    const zwischen = bis.some(
      (e) => e.type === "step.finished" && e.data.ending === "zwischentext",
    );
    const antwortFertig = bis.some((e) => e.type === "message.completed");
    const nachrichten: Message[] = [msg({ id: g.user, role: "user", content: "Frage" } as never)];
    if (zwischen) {
      nachrichten.push(
        msg({
          id: g.stepMsg,
          role: "assistant",
          content: "VORHER-AVORHER-B",
          runId: g.runId,
          step: 0,
          servedBy: { provider: "tensorix" },
        } as never),
      );
    }
    if (antwortFertig) {
      nachrichten.push(
        msg({
          id: g.antwort,
          role: "assistant",
          content: "Die Antwort.",
          runId: g.runId,
          route: "direct",
        } as never),
      );
    }
    const ereignisse = bis.filter((e) => e.type !== "message.created" || e.data.role !== "user");
    // Der gespeicherte Aufruf des Schritts, wie der Server ihn liest.
    const werkzeuge: WerkzeugAnzeige[] = zwischen
      ? [
          {
            actionId: g.aktion,
            runId: g.runId,
            step: 0,
            position: 0,
            key: WERKZEUG_DOKU,
            name: "doku_nachschlagen",
            status: hat("tool.finished") ? "fertig" : "laeuft",
          },
        ]
      : [];
    return verlaufMit({
      nachrichten,
      ...(werkzeuge.length === 0 ? {} : { werkzeuge }),
      aktiverLauf: hat("run.queued") && !antwortFertig ? lauf(g.runId, "running") : undefined,
      laeufe: antwortFertig ? [lauf(g.runId, "succeeded")] : [],
      ereignisse: hat("run.queued") && !antwortFertig ? ereignisse.slice(0) : [],
      letzteSeq: bis.at(-1)?.seq ?? 0,
    });
  }

  // Gegenprobe: im Nachladen `draft.delta` auch bei gespeicherten Schritten anhängen → Text doppelt, rot.
  it("an jeder Grenze einer Transaktion: Schritte und Antworten wie live, jeder Text genau einmal", () => {
    const g = nachschlagen(folge());
    // Grenzen: nach `run.queued`, jedem `draft.delta`, nach dem Ende von Schritt 0 samt Aufruf, nach
    // `tool.finished`, nach dem Ende von Schritt 1 und nach `message.completed`.
    const grenzen = [2, 4, 5, 7, 9, 10, 11, 12, 15];
    for (const k of grenzen) {
      const live = ereignisseAnwenden(leereAnsicht(), g.liste.slice(0, k), KONTEXT);
      const neu = ansichtAus(lesestandNach(g, k), KONTEXT);
      expect(kurz(neu, g.runId), `Schritte nach ${k}`).toEqual(kurz(live, g.runId));
      expect(antwortTexte(neu), `Antwort nach ${k}`).toEqual(antwortTexte(live));
      expect(
        schritteVon(neu, g.runId).flatMap((x) => x.werkzeuge.map((w) => w.status)),
        `Aufrufe nach ${k}`,
      ).toEqual(schritteVon(live, g.runId).flatMap((x) => x.werkzeuge.map((w) => w.status)));
      const text = JSON.stringify(neu.schritte);
      expect(text.split("VORHER-A").length - 1, `Text einmal nach ${k}`).toBeLessThanOrEqual(1);
    }
  });

  it("zwischen dem Ende des Antwort-Schritts und der fertigen Antwort bleibt der vorläufige Text", () => {
    const g = nachschlagen(folge());
    const a = ansichtAus(lesestandNach(g, 12), KONTEXT);
    expect(kurz(a, g.runId)).toContain("1:antwort:ENTWURF-AENTWURF-B");
    expect(antwortTexte(a)).toEqual([]);
  });
});

describe("der Lauf endet mitten im Schritt", () => {
  // Gegenprobe: `schritteAbbrechen` nicht aufrufen → der Schritt bliebe „läuft“.
  it.each([
    ["run.failed", "anbieter_nicht_erreichbar"],
    ["run.cancelled", "unterbrochen"],
    ["run.denied", "limit_erreicht"],
  ] as const)(
    "%s: vorläufiger Text wird abgebrochen, Aufrufe enden, nie in der Antwort",
    (art, code) => {
      const ev = folge();
      const g = nachschlagen(ev);
      // mitten im Text von Schritt 1: Aufruf ist fertig, der zweite Schritt schreibt noch
      const bis = g.liste.slice(0, 10);
      const ende = ev(art, { runId: g.runId, code, text: "Ende" }, g.runId);
      const a = ereignisAnwenden(ereignisseAnwenden(leereAnsicht(), bis, KONTEXT), ende, KONTEXT);
      expect(kurz(a, g.runId)).toEqual([
        "0:zwischentext:VORHER-AVORHER-B",
        "1:abgebrochen:ENTWURF-A",
      ]);
      expect(a.lauf).toBeUndefined();
      expect(JSON.stringify(a.eintraege)).not.toMatch(/ENTWURF|VORHER/);
    },
  );

  it("ein Aufruf, der noch lief, gilt als abgebrochen", () => {
    const ev = folge();
    const g = nachschlagen(ev);
    const ende = ev(
      "run.cancelled",
      { runId: g.runId, code: "unterbrochen", text: "Stopp" },
      g.runId,
    );
    const a = ereignisAnwenden(
      ereignisseAnwenden(leereAnsicht(), g.liste.slice(0, 8), KONTEXT),
      ende,
      KONTEXT,
    );
    expect(schritteVon(a, g.runId).flatMap((x) => x.werkzeuge.map((w) => w.status))).toEqual([
      "abgebrochen",
    ]);
  });

  it("nach einem Absturz (Lauf unterbrochen): der gespeicherte Schritt ist abgebrochen, ohne Antwort", () => {
    const runId = newId("run");
    const frage = msg({ role: "user", content: "Frage" });
    const a = ansichtAus(
      verlaufMit({
        nachrichten: [
          frage,
          msg({ role: "assistant", content: "TEIL", runId, step: 0, status: "failed" }),
        ],
        laeufe: [lauf(runId, "failed", { errorCode: "unterbrochen", triggerMessageId: frage.id })],
      }),
      KONTEXT,
    );
    expect(kurz(a, runId)).toEqual(["0:abgebrochen:TEIL"]);
    expect(antwortTexte(a)).toEqual([]);
  });

  // Gegenprobe: Teiltext als `AnsichtNachricht` mit Zustand `abgebrochen` → die Antwort davor wäre nicht mehr die letzte.
  it("Stopp: der Teiltext ist keine neue Fassung; die ältere Antwort bleibt die gültige", () => {
    const runA = newId("run");
    const runB = newId("run");
    const frage = msg({ role: "user", content: "Frage" });
    const antwort = msg({ role: "assistant", content: "Antwort", runId: runA, route: "direct" });
    const a = ansichtAus(
      verlaufMit({
        nachrichten: [
          frage,
          antwort,
          msg({
            role: "assistant",
            content: "TEILTEXT",
            runId: runB,
            step: 0,
            status: "cancelled",
          }),
        ],
        laeufe: [
          lauf(runB, "cancelled", { errorCode: "unterbrochen", triggerMessageId: frage.id }),
          lauf(runA, "succeeded", { triggerMessageId: frage.id }),
        ],
      }),
      KONTEXT,
    );
    const f = fassungenVon(
      a.eintraege.map((x) =>
        x.art === "nachricht" ? { id: x.id, rolle: x.rolle } : { id: `ende-${x.runId}` },
      ),
    );
    expect(f.get(antwort.id)).toMatchObject({ nr: 1, von: 1 });
    expect(kurz(a, runB)).toEqual(["0:abgebrochen:TEILTEXT"]);
    expect(JSON.stringify(a.eintraege)).not.toContain("TEILTEXT");
  });
});

describe("Aufrufe: Zustand und Phase", () => {
  // Gegenprobe: den Zustand „fertig“ schon bei `tool.started` setzen → der erste Fall wird rot.
  it("der Zustand kommt nur aus `tool.finished`, nie aus der Reihenfolge der Ereignisse", () => {
    const g = nachschlagen(folge());
    const status = (k: number) =>
      schritteVon(
        ereignisseAnwenden(leereAnsicht(), g.liste.slice(0, k), KONTEXT),
        g.runId,
      ).flatMap((x) => x.werkzeuge.map((w) => w.status));
    expect(status(6)).toEqual(["laeuft"]);
    expect(status(8)).toEqual(["laeuft"]);
    expect(status(9)).toEqual(["fertig"]);
  });

  it.each([
    ["failed", "fehlgeschlagen"],
    ["denied", "abgelehnt"],
    ["cancelled", "abgebrochen"],
  ] as const)("tool.finished %s ergibt %s", (art, wort) => {
    const ev = folge();
    const g = nachschlagen(ev);
    const ende = ev(
      "tool.finished",
      { runId: g.runId, actionId: g.aktion, status: art, code: "intern" },
      g.runId,
    );
    const a = ereignisseAnwenden(leereAnsicht(), [...g.liste.slice(0, 8), ende], KONTEXT);
    const w = schritteVon(a, g.runId).flatMap((x) => x.werkzeuge)[0];
    expect(w).toMatchObject({ status: wort, code: "intern", key: WERKZEUG_DOKU });
  });

  // Gegenprobe: die Phase während des Aufrufs auf „schreibt“ lassen → der erste Fall wird rot.
  it("Phase: schlägt nach zwischen Start und Ende des Aufrufs, danach wieder schreibt", () => {
    const g = nachschlagen(folge());
    const phase = (k: number) =>
      ereignisseAnwenden(leereAnsicht(), g.liste.slice(0, k), KONTEXT).lauf?.phase;
    expect(phase(8)).toBe("schlaegt_nach");
    expect(phase(9)).toBe("schreibt");
    expect(phase(10)).toBe("schreibt");
    expect(phase(3)).toBe("schreibt");
  });

  it("der Avatar schreibt, sobald vorläufiger Text kommt; draft.delta bewegt den Mund", () => {
    const g = nachschlagen(folge());
    const ohne = ereignisseAnwenden(leereAnsicht(), g.liste.slice(0, 3), KONTEXT);
    expect(antwortHatText(ohne)).toBe(false);
    const mit = ereignisseAnwenden(leereAnsicht(), g.liste.slice(0, 4), KONTEXT);
    expect(antwortHatText(mit)).toBe(true);
    const e = g.liste[3] as ConversationEvent;
    expect(avatarAufEreignis(e)).toEqual({ textStueck: "VORHER-A".length });
  });
});

describe("Nachfragen und Übernehmen", () => {
  function gelesen(g: ReturnType<typeof nachschlagen>, teil: Partial<WerkzeugAnzeige> = {}) {
    const w: WerkzeugAnzeige = {
      actionId: g.aktion,
      runId: g.runId,
      step: 0,
      position: 0,
      key: WERKZEUG_DOKU,
      name: "doku_nachschlagen",
      status: "fertig",
      quellen: [{ seite: "einstellungen.md", anker: "tagesbudget", titel: "Tagesbudget" }],
      eingabeKurz: "Tagesbudget einstellen",
      entscheidungBelegId: newId("receipt"),
      belegId: newId("receipt"),
      ...teil,
    };
    return { werkzeuge: [w], feste: [] as string[] };
  }

  it("ein Aufruf aus dem Strom wird nachgefragt, bis sein Zustand gelesen ist, dann nie mehr", () => {
    const g = nachschlagen(folge());
    const a = ereignisseAnwenden(leereAnsicht(), g.liste.slice(0, 9), KONTEXT);
    const frage = offeneNachfrage(a);
    expect(frage?.runId).toBe(g.runId);
    const danach = nachfrageUebernehmen(a, g.runId, gelesen(g));
    expect(offeneNachfrage(danach)).toBeUndefined();
    const w = schritteVon(danach, g.runId).flatMap((x) => x.werkzeuge)[0];
    expect(w).toMatchObject({
      status: "fertig",
      eingabeKurz: "Tagesbudget einstellen",
      quellen: [{ seite: "einstellungen.md", anker: "tagesbudget", titel: "Tagesbudget" }],
    });
  });

  it("ein gelesener Zustand „läuft“ überschreibt kein schon gemeldetes Ende und fragt nicht endlos", () => {
    const g = nachschlagen(folge());
    const a = ereignisseAnwenden(leereAnsicht(), g.liste.slice(0, 9), KONTEXT);
    const spaet = nachfrageUebernehmen(a, g.runId, gelesen(g, { status: "laeuft" }));
    const w = schritteVon(spaet, g.runId).flatMap((x) => x.werkzeuge)[0];
    expect(w?.status).toBe("fertig");
    // Der Schlüssel der Nachfrage ist derselbe wie vorher: Die Seite fragt kein zweites Mal.
    expect(offeneNachfrage(spaet)?.schluessel).toBe(offeneNachfrage(a)?.schluessel);
  });

  it("aus dem Lesestand: Aufrufe sind schon gelesen, es wird nichts nachgefragt", () => {
    const g = nachschlagen(folge());
    const w = gelesen(g).werkzeuge[0] as WerkzeugAnzeige;
    const a = ansichtAus(
      verlaufMit({
        nachrichten: [
          msg({ role: "user", content: "Frage" }),
          msg({
            id: g.stepMsg,
            role: "assistant",
            content: "VORHER",
            runId: g.runId,
            step: 0,
          } as never),
        ],
        laeufe: [lauf(g.runId, "succeeded")],
        werkzeuge: [w],
      }),
      KONTEXT,
    );
    expect(offeneNachfrage(a)).toBeUndefined();
    expect(schritteVon(a, g.runId).flatMap((x) => x.werkzeuge)[0]).toMatchObject({
      status: "fertig",
      belegId: w.belegId,
    });
  });
});

describe("Herkunft je Schritt unter der Antwort", () => {
  // Gegenprobe: nur den letzten Schritt zeigen → ein Eintrag statt zwei.
  it("alle Schritte der Kette, Unter-Anbieter je Schritt und abweichend gemeldetes Modell; nie „EU“", () => {
    const g = nachschlagen(folge());
    const a = ereignisseAnwenden(leereAnsicht(), g.liste, KONTEXT);
    const ev = folge();
    const mit = ereignisAnwenden(
      a,
      ev(
        "step.finished",
        { runId: g.runId, step: 0, ending: "zwischentext", modelReported: "glm-5.3-preview" },
        g.runId,
      ),
      KONTEXT,
    );
    const kette = herkunftKette(
      schritteVon(mit, g.runId),
      { modell: { name: "Beispiel-Modell A" }, servedBy: { provider: "melious" } },
      { name: "Beispiel-Modell A" },
      {
        abgerufen: "2026-11-22T00:00:00.000Z",
        eintraege: { tensorix: { name: "Tensorix" }, melious: { name: "Melious" } },
      } as never,
    );
    expect(kette).toHaveLength(2);
    expect(kette[0]).toMatchObject({ unterAnbieter: "Tensorix" });
    expect(kette[1]).toMatchObject({ unterAnbieter: "Melious" });
    expect(JSON.stringify(kette)).not.toMatch(/EU/);
  });

  it("ohne Schritte ist die Kette ein Eintrag (die Antwort selbst)", () => {
    const kette = herkunftKette([], { modell: { name: "M" } }, undefined, undefined);
    expect(kette).toHaveLength(1);
  });
});
