/**
 * PaiBot – Tests: Zugriff auf Aufträge (anlegen mit Epoche und Wurzel, Stand auf erlaubten Wegen,
 * Zähler, Zuschläge, Zählung je Mitglied, ein aktiver Lauf je Auftragsbaum).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import { type BotId, type ConversationId, newId } from "@paibot/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { BelegKette } from "../apps-testhilfe";
import type { Database } from "../client";
import { createTestDb } from "../testing";
import {
  AUFTRAG_TRANSITIONS,
  type AuftragStatus,
  anlegen,
  auftraegeAnMitglied,
  baum,
  belasten,
  bitteZaehlen,
  canTransition,
  get,
  offeneKinder,
  rueckfrageZaehlen,
  statusSetzen,
  zuschlaege,
  zuschlagAnhaengen,
} from "./auftraege";
import { StatuswechselError } from "./fehler";
import { bots, conversations, messages, runs, settings } from "./index";
import { mitCode } from "./testhilfe";

describe("auftraege", () => {
  let db: Database;
  let kette: BelegKette;
  let pai: BotId;
  let mitglied: BotId;
  let chat: ConversationId;

  beforeEach(async () => {
    ({ db } = await createTestDb());
    kette = new BelegKette(db);
    pai = (await bots.create(db, { name: "Pai", avatarShape: "blatt", color: "blau" })).id;
    mitglied = (await bots.create(db, { name: "Ideen", avatarShape: "blatt", color: "pink" })).id;
    await settings.ensure(db);
    chat = (await conversations.create(db, { botId: pai, title: "U" })).id;
  });

  const nachrichtErlaubt = () =>
    kette.entscheidung({
      type: "nachricht.senden",
      target: { conversationId: chat, messageId: newId("message") },
      facts: { credential: "sitzung" },
    });

  const uebergabeErlaubt = (an: BotId) =>
    kette.entscheidung({
      type: "auftrag.uebergeben",
      actor: `bot:${pai}`,
      target: { conversationId: chat, toBotId: an },
      facts: {},
    });

  async function wurzel() {
    return anlegen(db, {
      art: "wurzel",
      conversationId: chat,
      botId: pai,
      geber: "besitzer",
      zettel: "Mach einen Plan.",
      actionId: await nachrichtErlaubt(),
    });
  }

  async function laufZu(auftrag: { id: string; rootId: string; conversationId: string }) {
    const m = await messages.insert(db, { conversationId: chat, role: "user", content: "los" });
    const lauf = await runs.create(db, {
      conversationId: auftrag.conversationId as ConversationId,
      triggerMessageId: m.id,
      botId: pai,
      auftrag: { id: auftrag.id as never, rootId: auftrag.rootId as never, untrustedInput: false },
    });
    return runs.markRunning(db, lauf.id);
  }

  it("die Übergangstabelle stimmt mit dem Trigger überein (gefragt ist nur der Anfang)", () => {
    expect(AUFTRAG_TRANSITIONS.gefragt).toEqual([]);
    expect(canTransition("wurzel", "fertig", "arbeitet")).toBe(true);
    expect(canTransition("uebergabe", "fertig", "arbeitet")).toBe(false);
    expect(canTransition("wurzel", "gefragt", "fertig")).toBe(false);
  });

  it("legt eine Wurzel mit eigener Kennung als Wurzel und der aktuellen Epoche an", async () => {
    const w = await wurzel();
    expect(w).toMatchObject({ status: "gefragt", rootId: w.id, notausEpoche: 0, belastet: false });
    const kind = await anlegen(db, {
      art: "uebergabe",
      parentAuftragId: w.id,
      conversationId: chat,
      botId: mitglied,
      geber: `bot:${pai}`,
      actionId: await uebergabeErlaubt(mitglied),
    });
    expect(kind.rootId).toBe(w.id);
    expect((await baum(db, w.id)).map((a) => a.id)).toEqual([w.id, kind.id]);
    expect(await offeneKinder(db, w.id)).toBe(1);
  });

  it("ohne Entscheidung: abgelehnt; dieselbe Entscheidung zweimal: Eingabe ungültig", async () => {
    await expect(
      anlegen(db, {
        art: "wurzel",
        conversationId: chat,
        botId: pai,
        geber: "besitzer",
        actionId: newId("action"),
      }),
    ).rejects.toEqual(mitCode("abgelehnt"));
    const actionId = await nachrichtErlaubt();
    const eingabe = {
      art: "wurzel" as const,
      conversationId: chat,
      botId: pai,
      geber: "besitzer" as const,
      actionId,
    };
    await anlegen(db, eingabe);
    await expect(anlegen(db, eingabe)).rejects.toEqual(mitCode("eingabe_ungueltig"));
  });

  it("wechselt den Stand nur auf erlaubten Wegen und setzt Ende und Grund", async () => {
    const w = await wurzel();
    await expect(statusSetzen(db, w.id, { von: "gefragt", nach: "fertig" })).rejects.toBeInstanceOf(
      StatuswechselError,
    );
    await laufZu(w);
    await statusSetzen(db, w.id, { von: "gefragt", nach: "arbeitet" });
    // Falscher bisheriger Stand: kein Wechsel.
    await expect(
      statusSetzen(db, w.id, { von: "gefragt", nach: "abgebrochen" }),
    ).rejects.toBeInstanceOf(StatuswechselError);
    const ende = await statusSetzen(db, w.id, {
      von: "arbeitet",
      nach: "abgebrochen",
      grund: "besitzer_uebernimmt",
    });
    expect(ende).toMatchObject({ status: "abgebrochen", endGrund: "besitzer_uebernimmt" });
    expect(ende.finishedAt).toBeInstanceOf(Date);
    await expect(
      statusSetzen(db, newId("auftrag"), { von: "gefragt", nach: "abgelehnt" }),
    ).rejects.toEqual(mitCode("nicht_gefunden"));
  });

  it("jeder Weg der Tabelle ist auch in der Datenbank erlaubt, jeder andere nicht", async () => {
    // Stichprobe der verbotenen Wege: aus Endzuständen (außer fertig der Wurzel) führt nichts.
    const stati = Object.keys(AUFTRAG_TRANSITIONS) as AuftragStatus[];
    for (const von of ["abgelehnt", "abgebrochen", "gescheitert"] as const) {
      for (const nach of stati) expect(canTransition("wurzel", von, nach)).toBe(false);
    }
  });

  it("Zähler steigen, belastet bleibt", async () => {
    const w = await wurzel();
    expect(await rueckfrageZaehlen(db, w.id)).toBe(1);
    expect(await rueckfrageZaehlen(db, w.id)).toBe(2);
    expect(await bitteZaehlen(db, w.id)).toBe(1);
    await belasten(db, w.id);
    await belasten(db, w.id);
    expect(await get(db, w.id)).toMatchObject({ rueckfragen: 2, bitten: 1, belastet: true });
  });

  it("Zuschläge: fünf Mal 10 000 Token, der sechste erreicht die Grenze", async () => {
    const w = await wurzel();
    const erlaubt = () =>
      kette.entscheidung({
        type: "auftrag.budget_erhoehen",
        target: { conversationId: chat, auftragId: w.id },
        facts: {},
      });
    for (let i = 1; i <= 5; i++) {
      expect(await zuschlagAnhaengen(db, w.id, await erlaubt())).toEqual({ nr: i, tokens: 10000 });
    }
    await expect(zuschlagAnhaengen(db, w.id, await erlaubt())).rejects.toEqual(
      mitCode("limit_erreicht"),
    );
    expect(await zuschlaege(db, w.id)).toEqual({ anzahl: 5, tokens: 50000 });
    await expect(zuschlagAnhaengen(db, w.id, newId("action"))).rejects.toEqual(
      mitCode("abgelehnt"),
    );
  });

  it("zählt Übergaben und Rückgaben eines Gebers an ein Mitglied, ohne Bitten", async () => {
    const w = await wurzel();
    await anlegen(db, {
      art: "uebergabe",
      parentAuftragId: w.id,
      conversationId: chat,
      botId: mitglied,
      geber: `bot:${pai}`,
      actionId: await uebergabeErlaubt(mitglied),
    });
    await anlegen(db, {
      art: "rueckgabe",
      parentAuftragId: w.id,
      conversationId: chat,
      botId: mitglied,
      geber: `bot:${pai}`,
      actionId: await uebergabeErlaubt(mitglied),
    });
    expect(
      await auftraegeAnMitglied(db, { rootId: w.id, botId: mitglied, geber: `bot:${pai}` }),
    ).toBe(2);
    expect(
      await auftraegeAnMitglied(db, { rootId: w.id, botId: mitglied, geber: "besitzer" }),
    ).toBe(0);
  });

  it("ein zweiter aktiver Lauf im selben Auftragsbaum ist `lauf_aktiv`", async () => {
    const w = await wurzel();
    const chat2 = (await conversations.create(db, { botId: mitglied, title: "U2" })).id;
    const kind = await anlegen(db, {
      art: "uebergabe",
      parentAuftragId: w.id,
      conversationId: chat2,
      botId: mitglied,
      geber: `bot:${pai}`,
      actionId: await uebergabeErlaubt(mitglied),
    });
    await laufZu(w);
    const m = await messages.insert(db, { conversationId: chat2, role: "user", content: "los" });
    await expect(
      runs.create(db, {
        conversationId: chat2,
        triggerMessageId: m.id,
        botId: mitglied,
        auftrag: { id: kind.id, rootId: w.id, untrustedInput: false },
      }),
    ).rejects.toEqual(mitCode("lauf_aktiv"));
  });

  it("Nachrichten tragen Autor, Auftrag und Bezug", async () => {
    const w = await wurzel();
    const frage = await messages.insert(db, {
      conversationId: chat,
      role: "assistant",
      content: "Welche Farbe?",
      botId: pai,
      auftragId: w.id,
    });
    const antwort = await messages.insert(db, {
      conversationId: chat,
      role: "user",
      content: "Blau",
      origin: "vorschlag",
      frageBezug: frage.id,
    });
    // Im Vertrag hat `vorschlag` noch kein Wort: die Nachricht erscheint ohne Herkunft.
    expect(antwort.origin).toBeUndefined();
  });
});
