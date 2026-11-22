/**
 * PaiBot – Tests der Lese-Route zu den Werkzeug-Aufrufen eines Laufs: Anmeldung, nur Läufe dieser
 * Unterhaltung, nur die Projektion (nie das Ergebnis im Ganzen, nie der Abdruck der Argumente) und
 * die Kennungen fester Antworten.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { repo } from "@paibot/db";
import { type ActionId, type ConversationId, newId, type RunId } from "@paibot/shared/ids";
import { describe, expect, it, vi } from "vitest";
import { anfrage, Keksdose } from "../zugang/testing";
import { laufWerkzeugeLesen } from "./aktionen";
import { eingerichtet, mitZwischentexten, neueUnterhaltung, type Umgebung } from "./testing";
import type { LaufWerkzeuge } from "./typen";

vi.setConfig({ testTimeout: 60_000 });

function lesen(e: Umgebung, id: string, laufId: string, dose = e.dose) {
  const h = e.u.handler("laufWerkzeuge", laufWerkzeugeLesen);
  return anfrage(e.u, h, "GET", `/api/unterhaltungen/${id}/laeufe/${laufId}/werkzeuge`, {
    dose,
    params: { id, laufId },
  });
}

/** Legt einen Aufruf zu einem Zwischentext an und bricht ihn ab (Zustand „abgebrochen“). */
async function aufrufAnlegen(
  e: Umgebung,
  id: ConversationId,
  runId: RunId,
  messageId: string,
): Promise<ActionId> {
  const actionId = newId("action") as ActionId;
  await repo.toolCalls.create(e.u.db, {
    actionId,
    conversationId: id,
    runId,
    messageId: messageId as never,
    position: 0,
    callId: "c1",
    name: "doku_nachschlagen",
    source: "eingebaut",
    kind: "lesen",
    input: { frage: "Tagesbudget einstellen" },
    argsDigest: `hmac-sha256:${"0".repeat(64)}` as never,
    toolKey: "eingebaut/doku.nachschlagen",
    toolDigest: `sha256:${"0".repeat(64)}` as never,
    reach: "intern",
    foreignContent: false,
    step: 0,
    untrustedInput: false,
  });
  await repo.toolCalls.cancel(e.u.db, actionId, { output: null });
  return actionId;
}

describe("GET /api/unterhaltungen/:id/laeufe/:laufId/werkzeuge", () => {
  // Gegenprobe: `output` mitsenden bzw. einen Lauf einer anderen Unterhaltung zulassen → rot.
  it("ohne Sitzung 401; fremder, unbekannter und ungültiger Lauf 404; sonst nur die Projektion", async () => {
    const e = await eingerichtet();
    const { id, laeufe } = await mitZwischentexten(e, {
      laeufe: [
        {
          frage: "Frage",
          zwischentexte: [{ text: "VORHER" }],
          antwort: "Antwort",
          ende: "succeeded",
        },
      ],
    });
    const lauf = laeufe[0];
    if (lauf === undefined) throw new Error("kein Lauf");
    const aktion = await aufrufAnlegen(e, id, lauf.runId, lauf.zwischentexte[0] as string);

    expect((await lesen(e, id, lauf.runId, new Keksdose())).status).toBe(401);

    // Lauf einer anderen Unterhaltung, unbekannter Lauf, ungültige Kennung
    const andere = await neueUnterhaltung(e, "Andere");
    expect((await lesen(e, andere, lauf.runId)).status).toBe(404);
    expect((await lesen(e, id, newId("run"))).status).toBe(404);
    expect((await lesen(e, id, "kein-lauf")).status).toBe(404);

    const r = await lesen(e, id, lauf.runId);
    expect(r.status).toBe(200);
    const daten = r.body.daten as LaufWerkzeuge;
    expect(daten.werkzeuge).toHaveLength(1);
    expect(daten.werkzeuge[0]).toMatchObject({
      actionId: aktion,
      runId: lauf.runId,
      step: 0,
      key: "eingebaut/doku.nachschlagen",
      status: "abgebrochen",
      eingabeKurz: "Tagesbudget einstellen",
    });
    const roh = JSON.stringify(r.body);
    expect(roh).not.toContain("argsDigest");
    expect(roh).not.toContain("hmac-sha256");
    expect(roh).not.toContain('"output"');
    expect(roh).not.toContain('"input"');
    expect(daten.feste).toEqual([]);
  });

  it("nennt die festen Antworten des Laufs, nicht die des Modells", async () => {
    const e = await eingerichtet();
    const { id, laeufe } = await mitZwischentexten(e, {
      laeufe: [{ frage: "Frage", zwischentexte: [{ text: "VORHER" }], ende: "failed" }],
    });
    const lauf = laeufe[0];
    if (lauf === undefined) throw new Error("kein Lauf");
    const fest = await repo.messages.insert(e.u.db, {
      conversationId: id,
      role: "assistant",
      content: "Grenze erreicht.",
      status: "complete",
      runId: lauf.runId,
      origin: "fest",
    });
    const daten = (await lesen(e, id, lauf.runId)).body.daten as LaufWerkzeuge;
    expect(daten.feste).toEqual([fest.id]);
  });
});
