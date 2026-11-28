/**
 * PaiBot – Render-Tests der Chat-Ansicht über react-dom/server: leerer Start mit Beispielen, kein
 * Modell, Verlauf mit Zeile unter der Antwort, laufende Antwort, Hinweise und Arbeitsfläche.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { readFileSync } from "node:fs";
import { newId } from "@paibot/shared/ids";
import type { Message, Run } from "@paibot/shared/objekte";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { BelegKurz, ChatBereitschaft, ChatVerlauf } from "../../../lib/chat/typen";
import { BelegeFlaeche } from "./BelegeFlaeche";
import { ChatSeite } from "./ChatSeite";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  usePathname: () => "/",
}));

const BEREIT: ChatBereitschaft = {
  botName: "Pai",
  botFarbe: "limette",
  pausiert: false,
  modell: { name: "Beispiel-Modell A", herkunft: "über EUrouter" },
  schluessel: true,
  schleuseInstalliert: false,
  schleuseStandard: "off",
  zeitzone: "Europe/Berlin",
  belegeGesamt: 23,
};

const conversationId = newId("conversation");

function verlauf(teil: Partial<ChatVerlauf> = {}): ChatVerlauf {
  return {
    unterhaltung: { id: conversationId, titel: "Absage an Frau Beispiel", schleuse: "off" },
    nachrichten: [],
    laeufe: [],
    ereignisse: [],
    letzteSeq: 0,
    belege: [],
    modelle: {},
    ...teil,
  };
}

function msg(m: Partial<Message> & Pick<Message, "role" | "content" | "status">): Message {
  return {
    id: newId("message"),
    conversationId,
    createdAt: "2026-11-21T13:31:00.000Z",
    ...m,
  } as Message;
}

describe("Chat-Ansicht", () => {
  it("leerer Start (Begrüßung ab Werk): Gruß, sechs Anfänge als Knöpfe, Modell, kein alter Satz", () => {
    const aus = renderToStaticMarkup(h(ChatSeite, { bereitschaft: BEREIT }));
    expect(aus).toMatch(/Ich bin Pai/);
    expect(aus).toContain('data-fassung="begruessung"');
    expect(aus).not.toContain("Frag deinen Bot etwas");
    expect(aus).not.toContain("Deine Unterhaltungen bleiben auf deinem Server");
    expect(aus).toContain("Beispiel-Modell A");
    expect(aus).toContain("über EUrouter");
    expect(aus).not.toContain(">EU<");
    for (const label of [
      "Freundliche Terminabsage",
      "Text kürzer und klarer",
      "Meine Woche planen",
      "Aufgaben sortieren",
      "Einfach erklärt bekommen",
      "Für und Wider abwägen",
    ]) {
      expect(aus).toMatch(new RegExp(`<button[^>]*>[^]*?${label}`));
    }
    expect(aus).toContain('role="switch"');
    expect(aus).toContain("Die Datenschleuse ist auf diesem Server nicht eingerichtet.");
    expect(aus).toContain('href="/datenschleuse"');
    expect(aus).toContain("Pai handelt nur mit Beleg");
  });

  it("die gewählte Fassung bestimmt den Startbereich schon im ersten Bild", () => {
    const stille = renderToStaticMarkup(h(ChatSeite, { bereitschaft: BEREIT, fassung: "stille" }));
    expect(stille).toContain('data-fassung="stille"');
    expect(stille).toContain("Womit fangen wir an?");
    expect(stille).not.toContain("Ich bin Pai");
    const brett = renderToStaticMarkup(
      h(ChatSeite, { bereitschaft: BEREIT, fassung: "startbrett" }),
    );
    expect(brett).toContain("So arbeitet Pai");
    expect(brett).toContain("23");
    expect(brett).toContain("in der Kette");
    // ohne Zahl keine Zeile, nie eine geschätzte
    const ohneZahl = { ...BEREIT } as Partial<ChatBereitschaft>;
    delete ohneZahl.belegeGesamt;
    const ohne = renderToStaticMarkup(
      h(ChatSeite, { bereitschaft: ohneZahl as ChatBereitschaft, fassung: "startbrett" }),
    );
    expect(ohne).not.toContain("in der Kette");
  });

  it("ohne Modell: klarer Weg zu „Modell und Anbieter“, Eingabe gesperrt", () => {
    const { modell: _ohne, ...rest } = BEREIT;
    const aus = renderToStaticMarkup(
      h(ChatSeite, { bereitschaft: { ...rest, schluessel: false } }),
    );
    expect(aus).toContain("Pai hat noch kein Modell");
    expect(aus).toContain('href="/modelle"');
    expect(aus).not.toContain("Frag deinen Bot etwas");
    expect(aus).toMatch(/<textarea[^>]*disabled/);
  });

  it("ohne Schlüssel: eigener Hinweis", () => {
    const aus = renderToStaticMarkup(
      h(ChatSeite, { bereitschaft: { ...BEREIT, schluessel: false } }),
    );
    expect(aus).toContain("Für das Modell fehlt der Schlüssel");
  });

  it("Verlauf: Antwort als Markdown ohne HTML, Zeile mit Beleg, Weg und Modell", () => {
    const runId = newId("run");
    const beleg: BelegKurz = {
      id: newId("receipt"),
      vollstaendig: true,
      seq: 142,
      art: "result",
      aktion: "modell.anfragen",
      zeit: "2026-11-21T13:31:05.000Z",
      runId,
      akteur: "bot",
      ergebnis: { status: "ok" },
    };
    const aus = renderToStaticMarkup(
      h(ChatSeite, {
        bereitschaft: BEREIT,
        verlauf: verlauf({
          nachrichten: [
            msg({ role: "user", content: "Hallo <b>Pai</b>", status: "complete" }),
            msg({
              role: "assistant",
              content: "Gern.\n\n```\nHallo Frau Beispiel\n```\n\n<img src=x onerror=alert(1)>",
              status: "complete",
              runId: runId as never,
              route: "schleuse",
              modelId: "mod_a" as never,
            }),
          ],
          belege: [beleg],
          modelle: { mod_a: { name: "Beispiel-Modell A", herkunft: "über EUrouter" } },
        }),
      }),
    );
    expect(aus).toContain("Hallo &lt;b&gt;Pai&lt;/b&gt;");
    expect(aus).not.toContain("<img");
    expect(aus).not.toContain("onerror");
    expect(aus).toContain("Kopieren");
    expect(aus).toContain("B-0142");
    expect(aus).toContain("geschützt über die Datenschleuse");
    expect(aus).not.toMatch(/\d+ (Angaben )?maskiert/);
    expect(aus).toContain("Beispiel-Modell A");
    expect(aus).toContain("14:31");
  });

  it("laufende Antwort nach dem Neuladen: Stopp statt Senden, Text bis jetzt, Hinweis zum Beleg", () => {
    const runId = newId("run");
    const antwort = newId("message");
    const user = newId("message");
    const aus = renderToStaticMarkup(
      h(ChatSeite, {
        bereitschaft: BEREIT,
        verlauf: verlauf({
          nachrichten: [
            msg({ id: user as never, role: "user", content: "Zähl bitte", status: "complete" }),
            msg({
              id: antwort as never,
              role: "assistant",
              content: "",
              status: "streaming",
              runId: runId as never,
            }),
          ],
          aktiverLauf: { id: runId, status: "running" } as Run,
          ereignisse: [
            {
              conversationId,
              seq: 4,
              time: "2026-11-21T13:31:01.000Z",
              runId,
              type: "run.queued",
              data: { runId },
            },
            {
              conversationId,
              seq: 5,
              time: "2026-11-21T13:31:02.000Z",
              runId,
              type: "text.delta",
              data: { runId, messageId: antwort, text: "Eins zwei" },
            },
          ] as ChatVerlauf["ereignisse"],
          letzteSeq: 5,
        }),
      }),
    );
    expect(aus).toContain("Eins zwei");
    expect(aus).toContain('aria-label="Stopp"');
    expect(aus).not.toContain('aria-label="Senden"');
    expect(aus).toContain("Beleg folgt, sobald die Antwort fertig ist.");
    expect(aus).toContain('aria-busy="true"');
  });

  it("leere Antwortblase im Lauf sagt „denkt nach“, nicht „schreibt“", () => {
    const runId = newId("run");
    const antwort = newId("message");
    const user = newId("message");
    const aus = renderToStaticMarkup(
      h(ChatSeite, {
        bereitschaft: BEREIT,
        verlauf: verlauf({
          nachrichten: [
            msg({ id: user as never, role: "user", content: "Zähl bitte", status: "complete" }),
            msg({
              id: antwort as never,
              role: "assistant",
              content: "",
              status: "streaming",
              runId: runId as never,
            }),
          ],
          aktiverLauf: { id: runId, status: "running" } as Run,
        }),
      }),
    );
    expect(aus).toContain("Pai denkt nach …");
    expect(aus).not.toContain("Pai schreibt …");
  });

  it("Knöpfe unter der Antwort: jeder trägt einen eigenen Namen für Bildschirmleser", () => {
    const user = newId("message");
    const aus = renderToStaticMarkup(
      h(ChatSeite, {
        bereitschaft: {
          ...BEREIT,
          modellId: "mod_a",
          waehlbar: [
            { id: "mod_a", name: "Beispiel-Modell A", herkunft: "über EUrouter" },
            { id: "mod_b", name: "Beispiel-Modell B", herkunft: "über EUrouter" },
          ],
        },
        verlauf: verlauf({
          nachrichten: [
            msg({ id: user as never, role: "user", content: "Hallo", status: "complete" }),
            msg({ role: "assistant", content: "Erste Fassung.", status: "complete" }),
            msg({ role: "assistant", content: "Zweite Fassung.", status: "complete" }),
          ],
        }),
      }),
    );
    const namen = [...aus.matchAll(/<button[^>]*aria-label="([^"]*)"/g)].map((m) => m[1]);
    expect(namen).toContain("Zur vorigen Fassung der Antwort");
    expect(namen).toContain("Zur nächsten Fassung der Antwort");
    expect(namen).toContain("Neu erzeugen: weitere Möglichkeiten");
    expect(namen).not.toContain("Antwort neu erzeugen");
    expect(new Set(namen).size).toBe(namen.length);
    // der sichtbare Knopf heißt weiter „Neu erzeugen“; kein Pfeil trägt denselben Namen
    expect(namen).not.toContain("Neu erzeugen");
  });

  it("abgelehnter Lauf: Grund, Ausweg und Link zur passenden Seite, nie ein roher Fehler", () => {
    const user = newId("message");
    const aus = renderToStaticMarkup(
      h(ChatSeite, {
        bereitschaft: BEREIT,
        verlauf: verlauf({
          nachrichten: [
            msg({ id: user as never, role: "user", content: "Hallo", status: "complete" }),
          ],
          laeufe: [
            {
              id: newId("run"),
              status: "failed",
              errorCode: "schluessel_ungueltig",
              triggerMessageId: user,
              createdAt: "2026-11-21T13:31:00.000Z",
            } as Run,
          ],
        }),
      }),
    );
    expect(aus).toContain("Keine Antwort");
    expect(aus).toContain("Der Anbieter hat den Schlüssel nicht angenommen.");
    expect(aus).toContain("Trag einen gültigen Schlüssel ein.");
    expect(aus).toContain('href="/modelle"');
  });

  it("abgelehnt wegen Tagesbudget: Ausweg und Link zu den Grenzen, auch nach dem Neuladen", () => {
    const user = newId("message");
    const runId = newId("run");
    const beleg: BelegKurz = {
      id: newId("receipt"),
      vollstaendig: true,
      seq: 7,
      art: "decision",
      aktion: "modell.anfragen",
      zeit: "2026-11-21T13:31:05.000Z",
      runId,
      akteur: "bot",
      entscheidung: {
        outcome: "deny",
        regeln: [],
        grund: "Das Tor hat die Aktion abgelehnt. Grenze nicht eingehalten: G-04 „Tagesbudget“.",
      },
    };
    const aus = renderToStaticMarkup(
      h(ChatSeite, {
        bereitschaft: BEREIT,
        verlauf: verlauf({
          nachrichten: [
            msg({ id: user as never, role: "user", content: "Hallo", status: "complete" }),
          ],
          laeufe: [
            {
              id: runId,
              status: "denied",
              errorCode: "abgelehnt",
              triggerMessageId: user,
              createdAt: "2026-11-21T13:31:00.000Z",
            } as Run,
          ],
          belege: [beleg],
        }),
      }),
    );
    expect(aus).toContain("Das Tagesbudget ist für heute aufgebraucht.");
    expect(aus).toContain("Einstellungen › Grenzen");
    expect(aus).toContain('href="/einstellungen/grenzen"');
  });

  it("kein Inline-Skript und kein unsicheres HTML", () => {
    const aus = renderToStaticMarkup(h(ChatSeite, { bereitschaft: BEREIT, verlauf: verlauf() }));
    expect(aus).not.toMatch(/<script|dangerouslySetInnerHTML/);
  });
});

describe("Arbeitsfläche „Belege“", () => {
  const runId = newId("run");
  const entscheidung: BelegKurz = {
    id: newId("receipt"),
    vollstaendig: true,
    seq: 141,
    art: "decision",
    aktion: "modell.anfragen",
    zeit: "2026-11-21T13:31:04.000Z",
    runId,
    akteur: "bot",
    entscheidung: { outcome: "allow", regeln: [{ id: "R-002", version: 1 }], grund: "Erlaubt." },
  };
  const ergebnis: BelegKurz = {
    ...entscheidung,
    id: newId("receipt"),
    seq: 142,
    art: "result",
    entscheidung: undefined as never,
    ergebnis: { status: "ok" },
  };
  delete (ergebnis as Partial<BelegKurz>).entscheidung;

  it("Liste neuester oben mit Art, Zeit und Kennung", () => {
    const aus = renderToStaticMarkup(
      h(BelegeFlaeche, {
        belege: [ergebnis, entscheidung],
        zeitzone: "Europe/Berlin",
        botName: "Pai",
        onOeffnen: () => undefined,
      }),
    );
    expect(aus.indexOf("B-0142")).toBeLessThan(aus.indexOf("B-0141"));
    expect(aus).toContain("Modell angefragt");
    expect(aus).toContain("Pai (Bot) · Ergebnis");
    expect(aus).toContain("14:31");
  });

  it("Ergebnis zeigt auch Entscheidung und Regeln der Aktion; Link zur Seite des Belegs; kein Prüfen-Knopf", () => {
    const aus = renderToStaticMarkup(
      h(BelegeFlaeche, {
        belege: [ergebnis, entscheidung],
        zeitzone: "Europe/Berlin",
        botName: "Pai",
        offen: ergebnis.id,
        onOeffnen: () => undefined,
      }),
    );
    expect(aus).toContain("Beleg B-0142");
    expect(aus).toContain("erlaubt");
    expect(aus).toContain("R-002 „Bot darf antworten“");
    expect(aus).toContain("ausgeführt");
    expect(aus).toContain(`href="/belege/${ergebnis.id}"`);
    expect(aus).not.toMatch(/>Prüfen</);
  });

  it("leer", () => {
    const aus = renderToStaticMarkup(
      h(BelegeFlaeche, {
        belege: [],
        zeitzone: "Europe/Berlin",
        botName: "Pai",
        onOeffnen: () => undefined,
      }),
    );
    expect(aus).toContain("Noch keine Belege in dieser Unterhaltung.");
  });
});

describe("Avatar im Chat", () => {
  const folgt = (aus: string) => (aus.match(/data-folgt="1"/g) ?? []).length;

  it("nur der große Avatar im Startbereich folgt dem Zeiger, in jeder Fassung genau einer", () => {
    for (const fassung of ["begruessung", "startbrett", "stille"] as const) {
      const aus = renderToStaticMarkup(h(ChatSeite, { bereitschaft: BEREIT, fassung }));
      expect(folgt(aus), fassung).toBe(1);
    }
  });

  it("im Verlauf folgt kein Avatar dem Zeiger: weder im Kopf noch neben den Antworten", () => {
    const aus = renderToStaticMarkup(
      h(ChatSeite, {
        bereitschaft: BEREIT,
        verlauf: verlauf({
          nachrichten: [
            msg({ role: "user", content: "Hallo", status: "complete" }),
            msg({ role: "assistant", content: "Hallo!", status: "complete" }),
          ],
        }),
      }),
    );
    expect(aus).toContain('data-zustand="ruhig"');
    expect(folgt(aus)).toBe(0);
  });

  it("die Seite gibt das Kennzeichen „fremde Quelle“ an die Markdown-Anzeige weiter", () => {
    const quelle = readFileSync(new URL("./ChatSeite.tsx", import.meta.url), "utf8");
    // Auch solange die Antwort streamt oder das Kennzeichen noch aussteht, sind Links nur Text.
    expect(quelle).toContain("fremd={linksNurText(n)}");
  });
});
