/**
 * PaiBot – Tests: Antwort neu erzeugen über den Rahmen. Sitzung, Prüfzeichen, Tor mit Belegen;
 * neuer Lauf zur selben Nachricht, alte Antwort unverändert; Ablehnung bei laufender Antwort,
 * bei einer Antwort, die nicht mehr die letzte ist, und beim Not-Aus; Limit.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { conversations, repo, teams } from "@paibot/db";
import { type ConversationId, type MessageId, newId } from "@paibot/shared/ids";
import { describe, expect, it, vi } from "vitest";
import { anfrage, Keksdose } from "../zugang/testing";
import { antwortNeuErzeugen, FADEN_OHNE_LAUF_AUSWEG, FADEN_OHNE_LAUF_TEXT } from "./aktionen";
import { belegeDer, eingerichtet, ketteGueltig, neueUnterhaltung, type Umgebung } from "./testing";

vi.setConfig({ testTimeout: 60_000 });

/** Unterhaltung mit Frage und fertiger Antwort (über die Route gesendet, Lauf beendet). */
async function mitAntwort(e: Umgebung) {
  const id = (await neueUnterhaltung(e, "Beispiel")) as ConversationId;
  const r = await anfrage(e.u, e.senden, "POST", `/api/unterhaltungen/${id}/nachrichten`, {
    dose: e.dose,
    params: { id },
    koerper: { text: "Wann säe ich Tomaten?", schleuse: "off" },
  });
  expect(r.status).toBe(202);
  const { runId, messageId } = r.body.daten as { runId: string; messageId: MessageId };
  await repo.runs.markRunning(e.u.db, runId as never);
  const antwort = await repo.messages.insert(e.u.db, {
    conversationId: id,
    role: "assistant",
    content: "Ab Mitte März.",
    runId: runId as never,
  });
  await repo.runs.finish(e.u.db, runId as never, { status: "succeeded" });
  return { id, frage: messageId, antwort: antwort.id, ersterLauf: runId };
}

function neu(e: Umgebung, id: string, antwortId: string, dose = e.dose) {
  const h = e.u.handler("antwortNeuErzeugen", antwortNeuErzeugen(e.schlange));
  return anfrage(e.u, h, "POST", `/api/unterhaltungen/${id}/antworten/${antwortId}/neu`, {
    dose,
    params: { id, antwortId },
  });
}

async function entscheidung(e: Umgebung) {
  const belege = await belegeDer(e.u, "antwort.neu_erzeugen");
  const d = belege.filter((b) => b.body.type === "decision").at(-1);
  return d?.body.type === "decision" ? d.body.decision : undefined;
}

describe("POST /api/unterhaltungen/:id/antworten/:antwortId/neu", () => {
  it("ohne Sitzung 401, ohne Prüfzeichen 403", async () => {
    const e = await eingerichtet();
    const { id, antwort } = await mitAntwort(e);
    expect((await neu(e, id, antwort, new Keksdose())).status).toBe(401);
    const h = e.u.handler("antwortNeuErzeugen", antwortNeuErzeugen(e.schlange));
    const ohne = await anfrage(
      e.u,
      h,
      "POST",
      `/api/unterhaltungen/${id}/antworten/${antwort}/neu`,
      {
        dose: e.dose,
        params: { id, antwortId: antwort },
        pruefzeichen: "",
      },
    );
    expect(ohne.status).toBe(403);
  });

  it("neuer Lauf zur selben Nachricht, alte Antwort bleibt, Belege, Kette gültig", async () => {
    const e = await eingerichtet();
    const { id, frage, antwort, ersterLauf } = await mitAntwort(e);
    const vorher = await repo.messages.get(e.u.db, antwort);
    const r = await neu(e, id, antwort);
    expect(r.status).toBe(202);
    const daten = r.body.daten as { runId: string; ersetzt: string; nachrichtId: string };
    expect(daten.ersetzt).toBe(antwort);
    expect(daten.nachrichtId).toBe(frage);
    const lauf = await repo.runs.get(e.u.db, daten.runId as never);
    expect(lauf).toMatchObject({ status: "queued", triggerMessageId: frage });
    expect(lauf?.id).not.toBe(ersterLauf);
    expect(e.schlange.jobs.at(-1)).toEqual({ runId: daten.runId, conversationId: id });
    // Die alte Antwort ist unverändert; es gibt keine neue Nachricht der Person.
    expect(await repo.messages.get(e.u.db, antwort)).toEqual(vorher);
    const alle = await repo.messages.listForConversation(e.u.db, id);
    expect(alle.map((m) => m.role)).toEqual(["user", "assistant"]);
    const ereignisse = await repo.events.listSince(e.u.db, id, { afterSeq: 0, limit: 100 });
    expect(ereignisse.filter((x) => x.type === "run.queued").at(-1)?.data).toEqual({
      runId: daten.runId,
    });
    const belege = await belegeDer(e.u, "antwort.neu_erzeugen");
    expect(belege.map((b) => b.body.type)).toEqual(["decision", "result"]);
    const [d, erg] = belege;
    expect(d?.body.type === "decision" && d.body.action.target).toEqual({
      conversationId: id,
      messageId: antwort,
    });
    expect(d?.body.type === "decision" && d.body.decision.outcome).toBe("allow");
    expect(erg?.body.type === "result" && erg.body.result.status).toBe("ok");
    expect(await ketteGueltig(e.u)).toBe(true);
  });

  // Gegenprobe: `keinLaufImFaden` aus `antwortNeuErzeugen` entfernen → der Fall endet anders (404 oder Lauf; rot).
  it("Faden: fester Hinweis, kein Lauf, keine Änderung", async () => {
    const e = await eingerichtet();
    const team = newId("team");
    const faden = newId("conversation") as ConversationId;
    await e.u.db.insert(teams).values({ id: team, name: "Studio" });
    await e.u.db
      .insert(conversations)
      .values({ id: faden, kind: "faden", teamId: team, title: "Ein Faden" });
    await repo.messages.insert(e.u.db, { conversationId: faden, role: "user", content: "Los" });
    // Eine Antwort in einem Faden nennt ihren Autor (Trigger `messages_bezuege`).
    const pai = await repo.bots.getDefault(e.u.db);
    const antwort = await repo.messages.insert(e.u.db, {
      conversationId: faden,
      role: "assistant",
      content: "Fertig.",
      ...(pai === undefined ? {} : { botId: pai.id }),
    });
    const r = await neu(e, faden, antwort.id);
    expect(r.status).toBe(403);
    expect(r.body.fehler).toMatchObject({
      code: "abgelehnt",
      text: FADEN_OHNE_LAUF_TEXT,
      ausweg: FADEN_OHNE_LAUF_AUSWEG,
    });
    expect(await repo.runs.getActive(e.u.db, faden)).toBeUndefined();
    expect(e.schlange.jobs).toEqual([]);
    expect(await belegeDer(e.u, "antwort.neu_erzeugen")).toEqual([]);
  });

  it("während eine Antwort läuft: abgelehnt (V-02), nichts entsteht", async () => {
    const e = await eingerichtet();
    const { id, antwort } = await mitAntwort(e);
    expect((await neu(e, id, antwort)).status).toBe(202);
    const laeufe = (await repo.runs.listForConversation(e.u.db, id, { limit: 10 })).length;
    const r = await neu(e, id, antwort);
    expect(r.status).toBe(409);
    expect(r.body.fehler?.code).toBe("lauf_aktiv");
    expect((await repo.runs.listForConversation(e.u.db, id, { limit: 10 })).length).toBe(laeufe);
    const d = await entscheidung(e);
    expect(d?.outcome).toBe("deny");
    expect(d?.preconditions).toContainEqual({ name: "kein_lauf_aktiv", result: "verletzt" });
  });

  it("nicht die letzte Antwort: abgelehnt (V-11)", async () => {
    const e = await eingerichtet();
    const { id, antwort } = await mitAntwort(e);
    await repo.messages.insert(e.u.db, { conversationId: id, role: "user", content: "Danke" });
    const r = await neu(e, id, antwort);
    expect(r.status).toBe(404);
    const d = await entscheidung(e);
    expect(d?.outcome).toBe("deny");
    expect(d?.preconditions).toContainEqual({ name: "antwort_ist_letzte", result: "verletzt" });
  });

  it("Not-Aus an: abgelehnt mit „angehalten“ und Ausweg (G-05), kein Lauf", async () => {
    const e = await eingerichtet();
    const { id, antwort } = await mitAntwort(e);
    await repo.settings.update(e.u.db, { killSwitch: true });
    const r = await neu(e, id, antwort);
    expect(r.status).toBe(409);
    expect(r.body.fehler).toMatchObject({ code: "angehalten", text: "Alle Bots sind angehalten." });
    expect(JSON.stringify(r.body.fehler)).toContain("Hebe den Not-Aus auf");
    expect(e.schlange.jobs).toHaveLength(1); // nur der Lauf der ersten Antwort
    expect(await repo.runs.getActive(e.u.db, id)).toBeUndefined();
    const d = await entscheidung(e);
    expect(d?.outcome).toBe("deny");
    expect(d?.limits).toContainEqual(
      expect.objectContaining({ name: "not_aus", result: "verletzt" }),
    );
  });

  it("unbekannte Antwort, Nachricht der Person oder fremde Kennung: 404 ohne Beleg", async () => {
    const e = await eingerichtet();
    const { id, frage } = await mitAntwort(e);
    for (const antwortId of [newId("message"), frage, "kaputt"]) {
      expect((await neu(e, id, antwortId)).status, antwortId).toBe(404);
    }
    expect(await belegeDer(e.u, "antwort.neu_erzeugen")).toEqual([]);
  });

  it("zählt auf das Limit der Nachrichten", async () => {
    const e = await eingerichtet();
    const { id, antwort } = await mitAntwort(e);
    let status = 0;
    for (let i = 0; i < 31; i++) status = (await neu(e, id, antwort)).status;
    expect(status).toBe(429);
  });
});
