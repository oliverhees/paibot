/**
 * PaiBot – Tests: Unterhaltung als Datei sichern. Route über den Rahmen (Sitzung, Prüfzeichen,
 * Tor, Belege, Kopfzeilen der Datei), Inhalt ohne Kennungen und Schlüssel, Vermerke für
 * abgebrochene, fehlgeschlagene und ersetzte Antworten, Dateiname.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { repo } from "@paibot/db";
import { type ConversationId, ID_PREFIX, newId } from "@paibot/shared/ids";
import type { Message } from "@paibot/shared/objekte";
import { describe, expect, it, vi } from "vitest";
import { dateinameAus } from "../api/client";
import { Keksdose, TEST_PASSWORT, TEST_SCHLUESSEL } from "../zugang/testing";
import {
  exportDateiname,
  sichererInhalt,
  unterhaltungAlsMarkdown,
  unterhaltungExportieren,
} from "./export";
import {
  belegeDer,
  dateiAnfrage,
  eingerichtet,
  ketteGueltig,
  neueUnterhaltung,
  type Umgebung,
} from "./testing";

vi.setConfig({ testTimeout: 60_000 });

async function mitVerlauf(e: Umgebung): Promise<ConversationId> {
  const id = (await neueUnterhaltung(e, "Gartenplan für März")) as ConversationId;
  const [bot] = await repo.bots.list(e.u.db);
  const frage = await repo.messages.insert(e.u.db, {
    conversationId: id,
    role: "user",
    content: "Wann säe ich Tomaten?",
  });
  for (const [text, status] of [
    ["Ab Mitte März.", "succeeded"],
    ["Ab Ende Februar auf der Fensterbank.", "cancelled"],
  ] as const) {
    const lauf = await repo.runs.create(e.u.db, {
      conversationId: id,
      triggerMessageId: frage.id,
      botId: bot?.id as never,
    });
    await repo.runs.markRunning(e.u.db, lauf.id);
    await repo.messages.insert(e.u.db, {
      conversationId: id,
      role: "assistant",
      content: text,
      runId: lauf.id,
      status: status === "succeeded" ? "complete" : "cancelled",
    });
    await repo.runs.finish(e.u.db, lauf.id, { status });
  }
  return id;
}

function exportieren(e: Umgebung, id: string, dose = e.dose, pruefzeichen?: false) {
  const h = e.u.handler("unterhaltungExport", unterhaltungExportieren);
  return dateiAnfrage(e.u, h, `/api/unterhaltungen/${id}/export`, {
    dose,
    params: { id },
    ...(pruefzeichen === false ? { pruefzeichen } : {}),
  });
}

describe("POST /api/unterhaltungen/:id/export", () => {
  it("ohne Sitzung 401, ohne Prüfzeichen 403, unbekannte Unterhaltung 404", async () => {
    const e = await eingerichtet();
    const id = await mitVerlauf(e);
    expect((await exportieren(e, id, new Keksdose())).status).toBe(401);
    expect((await exportieren(e, id, e.dose, false)).status).toBe(403);
    const fremd = await exportieren(e, newId("conversation"));
    expect(fremd.status).toBe(404);
    // Das Tor hat abgelehnt (V-01) und das belegt.
    const belege = await belegeDer(e.u, "unterhaltung.exportieren");
    expect(belege.map((b) => b.body.type)).toEqual(["decision", "result"]);
    const [entscheidung] = belege;
    expect(entscheidung?.body.type === "decision" && entscheidung.body.decision.outcome).toBe(
      "deny",
    );
    expect((await exportieren(e, "kaputt")).status).toBe(404);
  });

  it("liefert eine Markdown-Datei mit Belegen und ändert keine Daten", async () => {
    const e = await eingerichtet();
    const id = await mitVerlauf(e);
    const nachrichtenVorher = await repo.messages.listForConversation(e.u.db, id as never);
    const antwort = await exportieren(e, id);
    expect(antwort.status).toBe(200);
    expect(antwort.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(antwort.headers.get("x-content-type-options")).toBe("nosniff");
    const name = dateinameAus(antwort.headers.get("content-disposition"));
    expect(name).toMatch(/^paibot-gartenplan-fuer-maerz-\d{4}-\d{2}-\d{2}\.md$/);
    expect(antwort.headers.get("x-pb-nachrichten")).toBe("3");
    const inhalt = await antwort.text();
    expect(inhalt.startsWith("# Gartenplan für März\n")).toBe(true);
    expect(inhalt).toContain("Unterhaltung mit Pai");
    expect(inhalt).toContain("## Du · ");
    expect(inhalt).toContain("## Pai · ");
    expect(inhalt).toContain("Wann säe ich Tomaten?");
    expect(inhalt).toContain("> Frühere Fassung 1 von 2 – neu erzeugt.");
    expect(inhalt).toContain("> Fassung 2 von 2");
    expect(inhalt).toContain("> Abgebrochen – der Text bis hierhin.");
    expect(inhalt).toContain("persönliche Inhalte");
    // Keine internen Kennungen, keine Geheimnisse.
    for (const prefix of Object.values(ID_PREFIX)) {
      expect(inhalt, prefix).not.toMatch(new RegExp(`\\b${prefix}_[0-9a-z]{26}\\b`));
    }
    expect(inhalt).not.toContain(TEST_SCHLUESSEL);
    expect(inhalt).not.toContain(TEST_PASSWORT);
    // Belege: Entscheidung und Ergebnis „ok“, Kette gültig, die Kopfzeilen nennen sie.
    const belege = await belegeDer(e.u, "unterhaltung.exportieren");
    expect(belege.map((b) => b.body.type)).toEqual(["decision", "result"]);
    const [entscheidung, ergebnis] = belege;
    expect(antwort.headers.get("x-pb-beleg-entscheidung")).toBe(
      `${entscheidung?.id} ${entscheidung?.seq}`,
    );
    expect(antwort.headers.get("x-pb-beleg-ergebnis")).toBe(`${ergebnis?.id} ${ergebnis?.seq}`);
    expect(ergebnis?.body.type === "result" && ergebnis.body.result.status).toBe("ok");
    expect(entscheidung?.body.type === "decision" && entscheidung.body.action.target).toEqual({
      conversationId: id,
    });
    expect(await ketteGueltig(e.u)).toBe(true);
    expect(await repo.messages.listForConversation(e.u.db, id as never)).toEqual(nachrichtenVorher);
  });

  it("Not-Aus an: Sichern geht weiter (Aktion des Besitzers, kein Bot)", async () => {
    const e = await eingerichtet();
    const id = await mitVerlauf(e);
    await repo.settings.update(e.u.db, { killSwitch: true });
    const antwort = await exportieren(e, id);
    expect(antwort.status).toBe(200);
    expect(await antwort.text()).toContain("Wann säe ich Tomaten?");
    const [, ergebnis] = await belegeDer(e.u, "unterhaltung.exportieren");
    expect(ergebnis?.body.type === "result" && ergebnis.body.result.status).toBe("ok");
  });

  it("leere Unterhaltung: Datei mit Titel und Hinweis", async () => {
    const e = await eingerichtet();
    const id = await neueUnterhaltung(e, "Noch leer");
    const antwort = await exportieren(e, id);
    expect(antwort.status).toBe(200);
    const inhalt = await antwort.text();
    expect(inhalt).toContain("# Noch leer");
    expect(inhalt).toContain("Diese Unterhaltung hat noch keine Nachricht.");
    expect(antwort.headers.get("x-pb-nachrichten")).toBe("0");
  });
});

function nachricht(teil: Partial<Message> & Pick<Message, "role" | "content">): Message {
  return {
    id: newId("message"),
    conversationId: newId("conversation"),
    status: "complete",
    createdAt: "2026-11-20T13:31:00.000Z",
    ...teil,
  } as Message;
}

describe("Markdown der Datei", () => {
  const basis = {
    titel: "Titel\nmit Umbruch",
    botName: "Kai",
    angelegt: "2026-11-20T13:30:00.000Z",
    laeufe: [],
    modelle: {},
    zeitzone: "Europe/Berlin",
    jetzt: new Date("2026-11-21T09:00:00.000Z"),
  };

  it("Kopf in einer Zeile, Zeiten in der Zeitzone, Fehler gekennzeichnet", () => {
    const md = unterhaltungAlsMarkdown({
      ...basis,
      nachrichten: [
        nachricht({ role: "user", content: "Hallo" }),
        nachricht({
          role: "assistant",
          content: "Teil",
          status: "failed",
          errorCode: "limit_erreicht",
        }),
        nachricht({ role: "system", content: "geheime Anweisung" }),
      ],
    });
    expect(md.split("\n")[0]).toBe("# Titel mit Umbruch");
    expect(md).toContain("Gesichert am 21.11.2026 um 10:00 Uhr (Europe/Berlin)");
    expect(md).toContain("## Du · 20.11.2026, 14:31 Uhr");
    expect(md).toContain("> Fehlgeschlagen: ");
    expect(md).not.toContain("geheime Anweisung");
    expect(md).toContain("Nachrichten: 2");
  });

  it("Lauf ohne Antwort steht unter seiner Nachricht", () => {
    const frage = nachricht({ role: "user", content: "Frage" });
    const md = unterhaltungAlsMarkdown({
      ...basis,
      nachrichten: [frage],
      laeufe: [
        {
          id: newId("run"),
          conversationId: frage.conversationId,
          triggerMessageId: frage.id,
          botId: newId("bot"),
          status: "denied",
          errorCode: "abgelehnt",
          createdAt: frage.createdAt,
        } as never,
      ],
    });
    expect(md).toContain("> Kai: Fehlgeschlagen: ");
  });

  it("HTML, Bilder, Skript-Links und Steuerzeichen aus Antworten: als Text sichtbar, nie wirksam", () => {
    const boese = [
      "Vorher <script>alert(1)</script> und <img src=x onerror=alert(2)>",
      "![Pixel](https://tracker.example/p.png) [Klick](javascript:alert(3)) [D]( data:text/html,x)",
      "Rechnung\u202Efdp.exe\u2066 mit\u200B unsichtbar\u0007 Glocke\u001b[31m",
      "<details open><summary>x</summary></details>",
      "Code: `<b>bleibt</b>` und ``a`<i>`b``",
      "```html",
      "<div>im Block bleibt alles</div>",
      "```",
      "danach <u>wieder entschärft</u>",
    ].join("\n");
    const md = unterhaltungAlsMarkdown({
      ...basis,
      titel: "Titel <img src=x>\u202E",
      nachrichten: [nachricht({ role: "assistant", content: boese })],
    });
    // Kein einziges „<“ außerhalb von Code ohne Backslash davor.
    const ohneCode = md.replace(/```[\s\S]*?```/g, "").replace(/``[^`]*``|`[^`]*`/g, "");
    expect(ohneCode).not.toMatch(/(^|[^\\])</m);
    expect(md).toContain("Vorher \\<script>alert(1)\\</script>");
    expect(md).toContain("!\\[Pixel](https://tracker.example/p.png)");
    expect(md).toContain("[Klick](\\javascript:alert(3))");
    expect(md).toContain("[D](\\data:text/html,x)");
    const versteckt = [...md].filter((z) => {
      const c = z.codePointAt(0) ?? 0;
      const steuer = (c < 0x20 && z !== "\n") || c === 0x7f;
      const richtung = (c >= 0x200b && c <= 0x200f) || (c >= 0x202a && c <= 0x202e);
      return steuer || richtung || (c >= 0x2060 && c <= 0x2069);
    });
    expect(versteckt).toEqual([]);
    expect(md).toContain("Rechnungfdp.exe mit unsichtbar Glocke[31m");
    expect(md).toContain("`<b>bleibt</b>`");
    expect(md).toContain("``a`<i>`b``");
    expect(md).toContain("<div>im Block bleibt alles</div>");
    expect(md).toContain("danach \\<u>wieder entschärft\\</u>");
    expect(md.split("\n")[0]).toBe("# Titel \\<img src=x>");
  });

  it("gewöhnlicher Text bleibt unverändert", () => {
    expect(
      sichererInhalt(
        "Gartenplan für März:\n- Tomaten **früh**\n- 3 > 2 & [Link](https://paibot.de)",
      ),
    ).toBe("Gartenplan für März:\n- Tomaten **früh**\n- 3 > 2 & [Link](https://paibot.de)");
  });

  it("Dateiname nur aus sicheren Zeichen", () => {
    expect(exportDateiname("Größe & Maße: Ölfass/Übersicht", "2026-11-21")).toBe(
      "paibot-groesse-masse-oelfass-uebersicht-2026-11-21.md",
    );
    expect(exportDateiname("../../etc/passwd", "2026-11-21")).toBe(
      "paibot-etc-passwd-2026-11-21.md",
    );
    expect(exportDateiname("😀", "2026-11-21")).toBe("paibot-unterhaltung-2026-11-21.md");
    expect(exportDateiname("x".repeat(300), "2026-11-21").length).toBeLessThanOrEqual(128);
  });
});
