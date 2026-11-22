/**
 * PaiBot – Tests: Verlauf, Lese-Route, Fassungen, „neu erzeugen“ und Datei sehen nur Nachrichten
 * der Person und End-Antworten. Die Unterhaltungen enthalten Zwischentexte eines Laufs mit
 * Werkzeugen (`step` gesetzt), wie die Lauf-Steuerung sie schreibt, ohne dass ein Werkzeug läuft.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { repo } from "@paibot/db";
import type { ConversationId } from "@paibot/shared/ids";
import type { Message } from "@paibot/shared/objekte";
import { describe, expect, it, vi } from "vitest";
import { anfrage } from "../zugang/testing";
import { antwortNeuErzeugen, nachrichtenLesen } from "./aktionen";
import { ansichtAus, neuErzeugbar } from "./ansicht";
import { unterhaltungExportieren } from "./export";
import { fassungenVon } from "./fassungen";
import { ladeVerlauf } from "./laden";
import {
  belegeDer,
  dateiAnfrage,
  eingerichtet,
  type LaufPlan,
  mitZwischentexten,
  type Umgebung,
} from "./testing";
import type { ChatVerlauf } from "./typen";

vi.setConfig({ testTimeout: 60_000 });

/** Frage 1 mit Lauf A (zwei Zwischentexte und End-Antwort), Frage 2 mit Lauf B (nur ein Zwischentext). */
function zweiFragen(endeB: LaufPlan["ende"] = "cancelled"): LaufPlan[] {
  return [
    {
      frage: "Frage 1",
      zwischentexte: [{ text: "ZWISCHEN-A0" }, { text: "ZWISCHEN-A1", status: "failed" }],
      antwort: "Antwort A",
      ende: "succeeded",
    },
    {
      frage: "Frage 2",
      zwischentexte: [{ text: "ZWISCHEN-B0", status: "cancelled" }],
      ende: endeB,
    },
  ];
}

async function verlaufVon(e: Umgebung, id: ConversationId): Promise<ChatVerlauf> {
  const v = await ladeVerlauf(e.u.db, id);
  if (v === undefined) throw new Error("kein Verlauf");
  return v;
}

/** Nachrichten wie die Ansicht sie zeigt: Rolle und Text. */
function texte(v: ChatVerlauf) {
  return ansichtAus(v).eintraege.map((x) =>
    x.art === "nachricht" ? `${x.rolle}:${x.text}` : `ende:${x.ergebnis}`,
  );
}

function neu(e: Umgebung, id: string, antwortId: string) {
  const h = e.u.handler("antwortNeuErzeugen", antwortNeuErzeugen(e.schlange));
  return anfrage(e.u, h, "POST", `/api/unterhaltungen/${id}/antworten/${antwortId}/neu`, {
    dose: e.dose,
    params: { id, antwortId },
  });
}

async function entscheidung(e: Umgebung) {
  const belege = await belegeDer(e.u, "antwort.neu_erzeugen");
  const d = belege.filter((b) => b.body.type === "decision").at(-1);
  return d?.body.type === "decision" ? d.body : undefined;
}

function exportieren(e: Umgebung, id: string) {
  const h = e.u.handler("unterhaltungExport", unterhaltungExportieren);
  return dateiAnfrage(e.u, h, `/api/unterhaltungen/${id}/export`, {
    dose: e.dose,
    params: { id },
  });
}

describe("Verlauf und Lese-Route", () => {
  it("ladeVerlauf: nur Nachrichten der Person und End-Antworten", async () => {
    const e = await eingerichtet();
    const { id, laeufe } = await mitZwischentexten(e, { laeufe: zweiFragen() });
    // Die Zwischentexte stehen in der Datenbank, nur der Lesestand zeigt sie nicht.
    const alle = await repo.messages.listForConversation(e.u.db, id);
    expect(alle.filter((m) => m.step !== undefined)).toHaveLength(3);

    const v = await verlaufVon(e, id);
    expect(v.nachrichten.map((m) => m.content)).toEqual(["Frage 1", "Antwort A", "Frage 2"]);
    expect(v.nachrichten.some((m) => m.step !== undefined)).toBe(false);
    // Die Läufe bleiben unverändert (beide, neueste zuerst).
    expect(v.laeufe.map((l) => l.id)).toEqual([laeufe[1]?.runId, laeufe[0]?.runId]);
  });

  it("Ansicht aus dem Lesestand: eine Antwort, Lauf B ohne Antwort als Hinweis", async () => {
    const e = await eingerichtet();
    const { id, laeufe } = await mitZwischentexten(e, { laeufe: zweiFragen() });
    const a = ansichtAus(await verlaufVon(e, id));
    expect(a.eintraege.filter((x) => x.art === "nachricht" && x.rolle === "bot")).toHaveLength(1);
    expect(texte(await verlaufVon(e, id))).toEqual([
      "du:Frage 1",
      "bot:Antwort A",
      "du:Frage 2",
      "ende:abgebrochen",
    ]);
    expect(a.eintraege.at(-1)).toMatchObject({
      art: "lauf-ende",
      ergebnis: "abgebrochen",
      runId: laeufe[1]?.runId,
    });
    expect(JSON.stringify(a.eintraege)).not.toContain("ZWISCHEN");
  });

  it("ladeVerlauf mit Schritten: auch die Zwischentexte; die Ansicht trennt sie von den Antworten", async () => {
    const e = await eingerichtet();
    const { id } = await mitZwischentexten(e, { laeufe: zweiFragen() });
    const v = await ladeVerlauf(e.u.db, id, { mitSchritten: true });
    expect(v?.nachrichten.map((m) => m.content)).toEqual([
      "Frage 1",
      "ZWISCHEN-A0",
      "ZWISCHEN-A1",
      "Antwort A",
      "Frage 2",
      "ZWISCHEN-B0",
    ]);
    if (v === undefined) throw new Error("kein Verlauf");
    // Die Ansicht zeigt weiter nur die Antworten.
    expect(texte(v)).toEqual(["du:Frage 1", "bot:Antwort A", "du:Frage 2", "ende:abgebrochen"]);
    expect(JSON.stringify(ansichtAus(v).eintraege)).not.toContain("ZWISCHEN");
    // Ohne die Option liest der Lesestand weiter nur End-Antworten (Datei, Suche und alle anderen).
    const ohne = await verlaufVon(e, id);
    expect(ohne.nachrichten.map((m) => m.content)).toEqual(["Frage 1", "Antwort A", "Frage 2"]);
  });

  it("GET /api/unterhaltungen/:id/nachrichten liefert die Zwischentexte mit `step`", async () => {
    const e = await eingerichtet();
    const { id } = await mitZwischentexten(e, { laeufe: zweiFragen() });
    const h = e.u.handler("nachrichten", nachrichtenLesen);
    const r = await anfrage(e.u, h, "GET", `/api/unterhaltungen/${id}/nachrichten`, {
      dose: e.dose,
      params: { id },
    });
    expect(r.status).toBe(200);
    const daten = r.body.daten as ChatVerlauf;
    expect(daten.nachrichten.map((m: Message) => m.content)).toEqual([
      "Frage 1",
      "ZWISCHEN-A0",
      "ZWISCHEN-A1",
      "Antwort A",
      "Frage 2",
      "ZWISCHEN-B0",
    ]);
    expect(daten.nachrichten.filter((m: Message) => m.step !== undefined)).toHaveLength(3);
    expect(daten.laeufe).toHaveLength(2);
  });
});

describe("Fassungen", () => {
  it("zählen nur End-Antworten: in der Ansicht und in der Datei", async () => {
    const e = await eingerichtet();
    const { id } = await mitZwischentexten(e, {
      laeufe: [
        {
          frage: "Frage",
          zwischentexte: [{ text: "ZWISCHEN-1" }],
          antwort: "Antwort A1",
          ende: "succeeded",
        },
        // neu erzeugt: derselbe Auslöser
        { zwischentexte: [{ text: "ZWISCHEN-2" }], antwort: "Antwort A2", ende: "succeeded" },
      ],
    });
    const a = ansichtAus(await verlaufVon(e, id));
    const bot = a.eintraege.flatMap((x) => (x.art === "nachricht" && x.rolle === "bot" ? [x] : []));
    const f = fassungenVon(
      a.eintraege.map((x) =>
        x.art === "nachricht" ? { id: x.id, rolle: x.rolle } : { id: `ende-${x.runId}` },
      ),
    );
    expect(bot).toHaveLength(2);
    expect(f.get(bot[0]?.id as string)).toMatchObject({ nr: 1, von: 2 });
    expect(f.get(bot[1]?.id as string)).toMatchObject({ nr: 2, von: 2 });
    expect(f.size).toBe(2);

    const antwort = await exportieren(e, id);
    expect(antwort.status).toBe(200);
    const inhalt = await antwort.text();
    expect(inhalt).toContain("> Frühere Fassung 1 von 2 – neu erzeugt.");
    expect(inhalt).toContain("> Fassung 2 von 2");
    expect(inhalt).not.toMatch(/von 3|von 4/);
    expect(inhalt).not.toContain("ZWISCHEN");
  });
});

describe("Neu erzeugen", () => {
  it("ein Zwischentext ist kein Ziel: 404, kein neuer Lauf, kein Beleg", async () => {
    const e = await eingerichtet();
    // Lauf 2 endet nur mit einem Zwischentext und ist die letzte Nachricht der Unterhaltung.
    const { id, laeufe } = await mitZwischentexten(e, {
      laeufe: [
        {
          frage: "Frage",
          zwischentexte: [{ text: "ZWISCHEN-1" }],
          antwort: "Antwort A1",
          ende: "succeeded",
        },
        { zwischentexte: [{ text: "ZWISCHEN-2", status: "failed" }], ende: "failed" },
      ],
    });
    const vorher = (await repo.runs.listForConversation(e.u.db, id, { limit: 10 })).length;
    for (const ziel of [laeufe[1]?.zwischentexte[0], laeufe[0]?.zwischentexte[0]]) {
      const r = await neu(e, id, ziel as string);
      expect(r.status).toBe(404);
      expect(r.body.fehler?.code).toBe("nicht_gefunden");
    }
    expect((await repo.runs.listForConversation(e.u.db, id, { limit: 10 })).length).toBe(vorher);
    expect(await belegeDer(e.u, "antwort.neu_erzeugen")).toEqual([]);
    expect(e.schlange.jobs).toEqual([]);
  });

  it("die letzte End-Antwort lässt sich neu erzeugen, auch wenn danach ein Lauf nur Zwischentext hatte", async () => {
    const e = await eingerichtet();
    const { id, laeufe } = await mitZwischentexten(e, {
      laeufe: [
        {
          frage: "Frage",
          zwischentexte: [{ text: "ZWISCHEN-1" }],
          antwort: "Antwort A1",
          ende: "succeeded",
        },
        { zwischentexte: [{ text: "ZWISCHEN-2", status: "failed" }], ende: "failed" },
      ],
    });
    const a1 = laeufe[0]?.antwortId as string;
    // Server und Seite stimmen überein: „Neu erzeugen“ gilt A1.
    expect(neuErzeugbar(ansichtAus(await verlaufVon(e, id)))?.id).toBe(a1);

    const r = await neu(e, id, a1);
    expect(r.status).toBe(202);
    const daten = r.body.daten as { runId: string; ersetzt: string; nachrichtId: string };
    expect(daten.ersetzt).toBe(a1);
    expect(daten.nachrichtId).toBe(laeufe[0]?.frageId);
    const lauf = await repo.runs.get(e.u.db, daten.runId as never);
    expect(lauf).toMatchObject({ status: "queued", triggerMessageId: laeufe[0]?.frageId });

    // Der neue Lauf endet mit eigenem Zwischentext und End-Antwort: nur zwei Fassungen.
    await repo.runs.markRunning(e.u.db, daten.runId as never);
    await repo.messages.insert(e.u.db, {
      conversationId: id,
      role: "assistant",
      content: "ZWISCHEN-3",
      runId: daten.runId as never,
      step: 0,
    });
    await repo.messages.insert(e.u.db, {
      conversationId: id,
      role: "assistant",
      content: "Antwort A2",
      runId: daten.runId as never,
    });
    await repo.runs.finish(e.u.db, daten.runId as never, { status: "succeeded" });
    const a = ansichtAus(await verlaufVon(e, id));
    const f = fassungenVon(
      a.eintraege.map((x) =>
        x.art === "nachricht" ? { id: x.id, rolle: x.rolle } : { id: `ende-${x.runId}` },
      ),
    );
    expect([...f.values()].map((x) => `${x.nr}/${x.von}`)).toEqual(["1/2", "2/2"]);
    expect(JSON.stringify(a.eintraege)).not.toContain("ZWISCHEN");
  });

  it("„letzte Antwort“ zählt nur End-Antworten: sechs Zwischentexte danach ändern nichts", async () => {
    const e = await eingerichtet();
    const { id, laeufe } = await mitZwischentexten(e, {
      laeufe: [
        { frage: "Frage", antwort: "Antwort A1", ende: "succeeded" },
        {
          zwischentexte: Array.from({ length: 6 }, (_, i) => ({
            text: `ZWISCHEN-${i}`,
            status: "cancelled" as const,
          })),
          ende: "cancelled",
        },
      ],
    });
    const a1 = laeufe[0]?.antwortId as string;
    const r = await neu(e, id, a1);
    expect(r.status).toBe(202);
    const d = await entscheidung(e);
    expect(d?.decision.outcome).toBe("allow");
    expect(d?.facts).toMatchObject({ answerIsLatest: true });
    expect(d?.decision.preconditions).toContainEqual({
      name: "antwort_ist_letzte",
      result: "ok",
    });
    // Die Sperre in der Transaktion hat die Antwort als letzte erkannt: der neue Lauf steht.
    const neuerLauf = await repo.runs.getActive(e.u.db, id);
    expect(neuerLauf?.triggerMessageId).toBe(laeufe[0]?.frageId);
  });
});

describe("Datei", () => {
  it("enthält keinen Zwischentext; Anzahl, Kopfzeile und Beleg stimmen überein", async () => {
    const e = await eingerichtet();
    const { id } = await mitZwischentexten(e, { laeufe: zweiFragen() });
    const antwort = await exportieren(e, id);
    expect(antwort.status).toBe(200);
    const inhalt = await antwort.text();
    expect(inhalt).not.toContain("ZWISCHEN");
    expect(inhalt).toContain("Antwort A");
    expect(inhalt).toContain("Nachrichten: 3");
    expect(antwort.headers.get("x-pb-nachrichten")).toBe("3");
    const [entscheidungsBeleg] = await belegeDer(e.u, "unterhaltung.exportieren");
    expect(
      entscheidungsBeleg?.body.type === "decision" && entscheidungsBeleg.body.facts,
    ).toMatchObject({ messages: 3 });
    // Lauf B wurde abgebrochen: wie bisher keine Zeile „Fehlgeschlagen“ unter Frage 2.
    expect(inhalt).not.toContain("Fehlgeschlagen");
  });

  it("ein Lauf ohne End-Antwort, der scheiterte, steht als Zeile unter seiner Frage", async () => {
    const e = await eingerichtet();
    const { id } = await mitZwischentexten(e, { laeufe: zweiFragen("failed") });
    const inhalt = await (await exportieren(e, id)).text();
    expect(inhalt).not.toContain("ZWISCHEN");
    expect(inhalt.match(/Fehlgeschlagen/g)).toHaveLength(1);
    expect(inhalt.indexOf("Frage 2")).toBeLessThan(inhalt.indexOf("Fehlgeschlagen"));
    expect(inhalt).toContain("Nachrichten: 3");
  });
});
