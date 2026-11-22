/**
 * PaiBot – Render-Tests der Chat-Ansicht mit Schritten über react-dom/server: Werkzeug-Zeile,
 * eingeklappter Zwischenschritt, vorläufiger Text außerhalb der Blase, feste Antwort mit Hinweis,
 * Knopf „Schritte“ und Abbruch mitten im Schritt. Fremder Text bleibt Text.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { newId } from "@paibot/shared/ids";
import type { Message, Run } from "@paibot/shared/objekte";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  BelegKurz,
  ChatBereitschaft,
  ChatVerlauf,
  WerkzeugAnzeige,
} from "../../../lib/chat/typen";
import { WERKZEUG_DOKU } from "../../../lib/chat/werkzeug-anzeige";
import { ChatSeite } from "./ChatSeite";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  usePathname: () => "/",
}));

const BEREIT: ChatBereitschaft = {
  botName: "Pai",
  botFarbe: "limette",
  modell: { name: "Beispiel-Modell A" },
  schluessel: true,
  schleuseInstalliert: false,
  schleuseStandard: "off",
  zeitzone: "Europe/Berlin",
  belegeGesamt: 0,
};

const conversationId = newId("conversation");

function msg(m: Partial<Message> & Pick<Message, "role" | "content">): Message {
  return {
    id: newId("message"),
    conversationId,
    status: "complete",
    createdAt: "2026-11-22T13:31:00.000Z",
    ...m,
  } as Message;
}

function verlauf(teil: Partial<ChatVerlauf> = {}): ChatVerlauf {
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

function seite(v: ChatVerlauf, schritteAnfangs = true): string {
  return renderToStaticMarkup(h(ChatSeite, { bereitschaft: BEREIT, verlauf: v, schritteAnfangs }));
}

const runId = newId("run");
const FRAGE = msg({ role: "user", content: "Wie stelle ich das Tagesbudget ein?" });

const BELEG_ENTSCHEIDUNG: BelegKurz = {
  id: newId("receipt"),
  vollstaendig: true,
  seq: 40,
  art: "decision",
  aktion: "werkzeug.aufrufen",
  zeit: "2026-11-22T13:31:01.000Z",
  runId,
  entscheidung: { outcome: "allow", regeln: [{ id: "R-010", version: 1 }], grund: "erlaubt" },
};
const BELEG_ERGEBNIS: BelegKurz = {
  ...BELEG_ENTSCHEIDUNG,
  id: newId("receipt"),
  seq: 41,
  art: "result",
  ergebnis: { status: "ok" },
};

function aufruf(teil: Partial<WerkzeugAnzeige> = {}): WerkzeugAnzeige {
  return {
    actionId: newId("action"),
    runId,
    step: 0,
    position: 0,
    key: WERKZEUG_DOKU,
    name: "doku_nachschlagen",
    status: "fertig",
    eingabeKurz: "Tagesbudget einstellen",
    quellen: [
      { seite: "einstellungen.md", anker: "tagesbudget", titel: "Tagesbudget" },
      { seite: "bot.md", anker: "grenze", titel: "Ausgabegrenze" },
    ],
    entscheidungBelegId: BELEG_ENTSCHEIDUNG.id,
    belegId: BELEG_ERGEBNIS.id,
    ...teil,
  };
}

/** Lesestand eines Laufs mit Nachschlagen und Antwort. */
function mitNachschlagen(
  antwort: Partial<Message> = {},
  zwischen = "VORHER Das Budget findest du wohl bei den Einstellungen.",
): ChatVerlauf {
  return verlauf({
    nachrichten: [
      FRAGE,
      msg({
        role: "assistant",
        content: zwischen,
        runId: runId as never,
        step: 0,
        servedBy: { provider: "tensorix" },
      }),
      msg({
        role: "assistant",
        content: "Das Tagesbudget stellst du in den Einstellungen ein.",
        runId: runId as never,
        route: "direct",
        servedBy: { provider: "melious" },
        ...antwort,
      }),
    ],
    laeufe: [
      {
        id: runId,
        status: "succeeded",
        triggerMessageId: FRAGE.id,
        createdAt: "2026-11-22T13:31:00.000Z",
      } as Run,
    ],
    werkzeuge: [aufruf()],
    belege: [BELEG_ENTSCHEIDUNG, BELEG_ERGEBNIS],
  });
}

describe("Zeile zu einem Werkzeug aus einer App", () => {
  const appAufruf = (teil: Partial<WerkzeugAnzeige> = {}) =>
    aufruf({
      key: "mcp/aufgaben/liste.heute",
      name: "mcp-aufgaben__liste_heute",
      eingabeKurz: undefined,
      quellen: undefined,
      ...teil,
    });
  const mitApp = (appNamen?: Record<string, string>) =>
    renderToStaticMarkup(
      h(ChatSeite, {
        bereitschaft: { ...BEREIT, ...(appNamen === undefined ? {} : { appNamen }) },
        verlauf: {
          ...mitNachschlagen(),
          werkzeuge: [appAufruf()],
        },
        schritteAnfangs: true,
      }),
    );

  // Gegenprobe: `app` nicht durchreichen → rot.
  it("nennt App und Werkzeug als Text; ohne bekannten Namen steht der Kurzname da", () => {
    const html = mitApp({ aufgaben: "Meine Aufgaben" });
    expect(html).toContain("Werkzeug aus der App");
    expect(html).toContain('data-herkunft="app"');
    expect(html).toContain("Meine Aufgaben");
    expect(html).toContain("liste.heute");
    expect(html).not.toContain("mcp-aufgaben__liste_heute");
    const ohne = mitApp();
    expect(ohne).toContain("aufgaben");
    expect(ohne).not.toContain("Meine Aufgaben");
  });

  // Gegenprobe: den Namen als Markdown oder HTML einsetzen → rot.
  it("ein feindlicher Name der App bleibt Text: kein Link, kein Element", () => {
    const html = mitApp({
      aufgaben:
        '[klick](https://boese.example/x) <script>alert(1)</script> <a href="https://boese.example">a</a>',
    });
    expect(html).not.toContain("<script");
    expect(html).not.toContain('href="https://boese.example');
    expect(html).not.toMatch(/<a [^>]*boese/);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("[klick](https://boese.example/x)");
  });
});

describe("Antwort nach dem Nachschlagen", () => {
  it("Werkzeug-Zeile mit Zustand in Worten, Quellen, Regel und Beleg; Zwischenschritt eingeklappt", () => {
    const aus = seite(mitNachschlagen());
    expect(aus).toContain("In der Doku nachschlagen");
    expect(aus).toContain("Status: ");
    expect(aus).toContain("fertig");
    expect(aus).toContain("2 Abschnitte");
    expect(aus).toContain("Tagesbudget einstellen");
    expect(aus).toContain("einstellungen.md");
    expect(aus).toContain("Bot liest in der Doku seiner Version");
    expect(aus).toContain("B-0041");
    // Der Text vor dem Aufruf steht nur im eingeklappten Zwischenschritt, nie in der Antwort.
    expect(aus).toContain("Zwischenschritt – vorläufig, nicht geprüft");
    expect(aus).toMatch(/aria-expanded="false"[^>]*aria-controls/);
    expect(aus).toMatch(/hidden=""[^>]*><p[^>]*>[^<]*<\/p><p[^>]*>VORHER/);
    // Die Antwort steht in der Blase, darunter Modell und Unter-Anbieter beider Schritte.
    expect(aus).toContain("Das Tagesbudget stellst du in den Einstellungen ein.");
    expect(aus).toContain("beantwortet von:");
    expect(aus).toContain("tensorix");
    expect(aus).toContain("melious");
    expect(aus).toContain("1 Werkzeug");
    expect(aus).not.toContain("Antwort von PaiBot, nicht vom Modell");
  });

  it("ohne Schritte im Verlauf sieht die Seite aus wie vorher: kein Baustein der Schritte", () => {
    const aus = seite(
      verlauf({
        nachrichten: [FRAGE, msg({ role: "assistant", content: "Antwort", route: "direct" })],
      }),
    );
    expect(aus).not.toContain("data-baustein");
    expect(aus).not.toContain("beantwortet von");
    expect(aus).not.toContain("Werkzeug");
  });

  // Gegenprobe: den Text des Zwischenschritts als Markdown/HTML rendern → das Tag erscheint unmaskiert.
  it("fremder Text bleibt Text: kein Tag, kein Bild, kein Link", () => {
    const aus = seite(
      mitNachschlagen(
        {},
        "<script>alert(1)</script><img src=x onerror=alert(1)> ![x](https://example.org/a.png) [a](javascript:alert(1))",
      ),
    );
    expect(aus).not.toContain("<script");
    expect(aus).not.toContain("<img");
    expect(aus).not.toMatch(/src="https/);
    expect(aus).not.toContain('href="javascript');
    expect(aus).toContain("&lt;script&gt;");
  });
});

describe("Knopf „Schritte“", () => {
  // Gegenprobe: den Hinweis an den Knopf hängen (`schritte && …`) → er verschwindet, rot.
  it("aus: Werkzeug-Zeile und eingeklappter Zwischenschritt weg; Hinweis auf feste Antworten bleibt", () => {
    const fest = mitNachschlagen({ origin: "fest" });
    const an = seite(fest, true);
    const aus = seite(fest, false);
    expect(an).toContain("In der Doku nachschlagen");
    expect(aus).not.toContain("In der Doku nachschlagen");
    expect(aus).not.toContain("Zwischenschritt – vorläufig");
    expect(aus).not.toContain("beantwortet von");
    expect(aus).toContain("Antwort von PaiBot, nicht vom Modell");
    expect(an).toContain("Antwort von PaiBot, nicht vom Modell");
  });

  it("aus: abgebrochener Text bleibt sichtbar", () => {
    const lauf = {
      id: runId,
      status: "cancelled",
      triggerMessageId: FRAGE.id,
      errorCode: "unterbrochen",
      createdAt: "2026-11-22T13:31:00.000Z",
    };
    const v = verlauf({
      nachrichten: [
        FRAGE,
        msg({
          role: "assistant",
          content: "TEILTEXT",
          runId: runId as never,
          step: 0,
          status: "cancelled",
        }),
      ],
      laeufe: [lauf as Run],
    });
    const aus = seite(v, false);
    expect(aus).toContain("TEILTEXT");
    expect(aus).toContain("abgebrochen – nicht geprüft");
  });
});

describe("feste Antworten", () => {
  const SATZ = "Du hast die Grenze für diese Antwort erreicht.";

  // Gegenprobe: den Hinweis per Textvergleich vergeben → auch die Antwort des Modells bekommt ihn.
  it("der Hinweis hängt nur an der Herkunft, nicht am Wortlaut; außerhalb des Textes der Blase", () => {
    const fest = seite(mitNachschlagen({ content: SATZ, origin: "fest" }));
    expect(fest.match(/Antwort von PaiBot, nicht vom Modell/g)).toHaveLength(1);
    expect(fest.match(/role="note"/g)?.length).toBeGreaterThanOrEqual(1);
    const modell = seite(mitNachschlagen({ content: SATZ, origin: "modell" }));
    expect(modell).toContain(SATZ);
    expect(modell).not.toContain("Antwort von PaiBot, nicht vom Modell");
    const ohne = seite(
      mitNachschlagen({
        content: `${SATZ} Antwort von PaiBot, nicht vom Modell`,
        origin: "modell",
      }),
    );
    // Steht der Wortlaut im Text des Modells, ist er nur Text in der Blase, kein Hinweis-Element.
    expect(ohne.match(/data-kennzeichnung="fest"/g) ?? []).toHaveLength(0);
  });
});

describe("laufender Lauf", () => {
  it("vorläufiger Text steht außerhalb der Blase mit Kennzeichnung; kein Platzhalter mehr", () => {
    const ereignis = (seq: number, type: string, data: unknown) => ({
      conversationId,
      seq,
      time: "2026-11-22T13:31:02.000Z",
      runId,
      type,
      data,
    });
    const v = verlauf({
      nachrichten: [FRAGE],
      aktiverLauf: { id: runId, status: "running" } as Run,
      ereignisse: [
        ereignis(2, "run.queued", { runId }),
        ereignis(3, "run.started", { runId }),
        ereignis(4, "draft.delta", { runId, step: 0, text: "ENTWURF-TEXT" }),
      ] as never,
      letzteSeq: 4,
    });
    const aus = seite(v);
    expect(aus).toContain('data-baustein="vorlaeufiger-text"');
    expect(aus).toContain("ENTWURF-TEXT");
    expect(aus).toContain("vorläufig, noch nicht geprüft");
    expect(aus).toContain("schreibt");
    // Nicht in einer Blase des Bots: keine Antwort mit diesem Text.
    expect(aus).not.toMatch(/<div[^>]*blaseBot[^>]*>[^<]*ENTWURF/);
    // Der Platzhalter „denkt nach …“ der Blase entfällt, sobald es etwas zu zeigen gibt.
    expect(aus).not.toContain("denkt nach …");
  });
});
