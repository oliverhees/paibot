/**
 * PaiBot – Tests der Nahtstellen eines Laufs und der Fakten-Funktionen (je genau eine Funktion).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { existsSync, readFileSync } from "node:fs";
import { repo } from "@paibot/db";
import { createTestDb } from "@paibot/db/testing";
import { createReceiptWriter, verifyChain } from "@paibot/receipts";
import { type ActionId, newId, type RunId } from "@paibot/shared/ids";
import type { Run } from "@paibot/shared/objekte";
import { t } from "@paibot/shared/texte";
import { describe, expect, it } from "vitest";
import { createFakeMotor } from "../testing/fake-motor";
import { setupRun } from "../testing/lauf-umgebung";
import { createTestTools } from "../testing/werkzeuge";
import { DOKU_TOOL_KEY } from "../werkzeuge/doku/werkzeug";
import { createToolRegistry } from "../werkzeuge/register";
import * as nahtstellen from "./nahtstellen";
import {
  type AufrufErgebnis,
  addiereToken,
  ausgabeGrenze,
  kappeToken,
  kettenStand,
  laufAusloeser,
  MAX_REPORTED_TOKENS,
  nachAufrufen,
  schrittFakten,
  tokensHeute,
  untrustedInput,
  werkzeugeFuerLauf,
} from "./nahtstellen";

const run = { id: newId("run") } as unknown as Run;

describe("Nahtstellen", () => {
  it("es gibt genau je eine Funktion werkzeugeFuerLauf, kettenStand, untrustedInput, nachFrage, nachAufrufen", () => {
    for (const name of [
      "werkzeugeFuerLauf",
      "kettenStand",
      "untrustedInput",
      "nachFrage",
      "nachAufrufen",
    ]) {
      expect(typeof (nahtstellen as Record<string, unknown>)[name]).toBe("function");
    }
    // Keine andere Quelle der Lauf-Steuerung definiert sie (Gegenprobe: zweite Definition → rot).
    const dir = new URL(".", import.meta.url);
    for (const file of ["schleife.ts", "aufruf.ts", "kontext.ts", "ausfuehren.ts"]) {
      if (!existsSync(new URL(file, dir))) continue;
      const text = readFileSync(new URL(file, dir), "utf8");
      expect(text).not.toMatch(
        /function (werkzeugeFuerLauf|kettenStand|untrustedInput|nachFrage|nachAufrufen|laufAusloeser|schrittFakten)\b/,
      );
    }
  });

  it("werkzeugeFuerLauf liefert in dieser Fassung das Register; kettenStand ist 0/0/0", async () => {
    const registry = await createToolRegistry(createTestTools().tools);
    expect(werkzeugeFuerLauf(run, registry)).toBe(registry.tools);
    expect(kettenStand(run)).toEqual({ schritte: 0, aufrufe: 0, token: 0 });
    expect(kettenStand(run)).not.toBe(kettenStand(run));
  });

  it("nachAufrufen liefert immer „weiter“, laufAusloeser chat", () => {
    expect(nachAufrufen([])).toEqual({ art: "weiter" });
    expect(nachAufrufen([{ status: "ok" }, { status: "abgelehnt", code: "abgelehnt" }])).toEqual({
      art: "weiter",
    });
    expect(laufAusloeser(run)).toBe("chat");
  });
});

describe("untrustedInput", () => {
  const tools = {
    createWriter: createReceiptWriter,
    verify: (entries: Parameters<typeof verifyChain>[0], options: object) =>
      verifyChain(entries, options as Parameters<typeof verifyChain>[1]),
  };

  /** Ein Lauf mit einer Zeile tool_calls im gewünschten Zustand (über die Repo-Wege). */
  async function scenario() {
    const { db } = await createTestDb();
    const env = await setupRun(db, tools, {
      providerBaseUrl: "http://127.0.0.1:9/v1",
      providerKey: `sk-test-${"p".repeat(24)}`,
      motor: createFakeMotor([]),
    });
    let step = 0;
    const addCall = async (
      runId: RunId,
      input: { foreign: boolean; untrusted: boolean; status: "requested" | "cancelled" },
    ) => {
      const message = await repo.messages.insert(db, {
        conversationId: env.conversationId,
        role: "assistant",
        status: "complete",
        runId,
        step,
      });
      const actionId = newId("action") as ActionId;
      await repo.toolCalls.create(db, {
        actionId,
        conversationId: env.conversationId,
        runId,
        messageId: message.id,
        position: 0,
        callId: "c1",
        name: "test_fremd",
        source: "eingebaut",
        kind: "lesen",
        input: {},
        argsDigest: `hmac-sha256:${"0".repeat(64)}` as never,
        toolKey: "eingebaut/test_fremd",
        toolDigest: `sha256:${"0".repeat(64)}` as never,
        reach: "intern",
        foreignContent: input.foreign,
        step: step++,
        untrustedInput: input.untrusted,
      });
      if (input.status === "cancelled") await repo.toolCalls.cancel(db, actionId, { output: null });
      return actionId;
    };
    return { db, env, addCall };
  }

  it("nichts davon: false; requested/cancelled mit foreign_content: false", async () => {
    const { db, env, addCall } = await scenario();
    const { runId } = await env.queueMessage("a");
    expect(await untrustedInput(db, { runId, historyRunIds: [] })).toBe(false);
    await addCall(runId, { foreign: true, untrusted: false, status: "requested" });
    await addCall(runId, { foreign: true, untrusted: false, status: "cancelled" });
    expect(await untrustedInput(db, { runId, historyRunIds: [] })).toBe(false);
  });

  it("Lauf im gesendeten Verlauf mit Aufruf untrusted_input = true: true; fällt er heraus, false", async () => {
    const { db, env, addCall } = await scenario();
    const earlier = newId("run") as RunId;
    const { runId: first } = await env.queueMessage("a");
    await addCall(first, { foreign: false, untrusted: true, status: "requested" });
    await repo.runs.markRunning(db, first);
    await repo.runs.finish(db, first, { status: "succeeded" });
    const { runId } = await env.queueMessage("b");
    expect(await untrustedInput(db, { runId, historyRunIds: [first] })).toBe(true);
    expect(await untrustedInput(db, { runId, historyRunIds: [earlier] })).toBe(false);
    // Gegenprobe (Quelle über die Nachricht statt über run_id): ohne die Lauf-Kennung im Verlauf false.
    expect(await untrustedInput(db, { runId, historyRunIds: [] })).toBe(false);
  });
});

describe("schrittFakten", () => {
  const settings = { maxStepsPerRun: 8, maxTokensPerRun: 60_000 };

  it("step, maxSteps, runTokens, stepTokenEstimate, maxRunTokens, toolCount, untrustedInput, trigger aus den Eingaben", () => {
    expect(
      schrittFakten({
        run,
        settings,
        step: 2,
        stand: { schritte: 2, aufrufe: 3, token: 1234 },
        inputChars: 401,
        ausgabe: 1000,
        toolCount: 3,
        untrustedInput: true,
      }),
    ).toEqual({
      step: 2,
      maxSteps: 8,
      runTokens: 1234,
      stepTokenEstimate: 101 + 1000,
      maxRunTokens: 60_000,
      toolCount: 3,
      untrustedInput: true,
      trigger: "chat",
    });
  });

  it("tokensToday = Wert vom Lauf-Anfang + runTokens", () => {
    expect(tokensHeute(500, { schritte: 1, aufrufe: 0, token: 250 })).toBe(750);
  });

  it("Zähler gekappt: je Feld 0 … 1 000 000 000, Summe ≤ Number.MAX_SAFE_INTEGER", () => {
    expect(kappeToken(2 ** 53)).toBe(MAX_REPORTED_TOKENS);
    expect(kappeToken(-5)).toBe(0);
    expect(kappeToken(Number.NaN)).toBe(0);
    expect(kappeToken(12.7)).toBe(12);
    expect(addiereToken(Number.MAX_SAFE_INTEGER, 10)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("Ausgabegrenze = min(bot.maxOutputTokens, max(Rest, 1000))", () => {
    expect(
      ausgabeGrenze({
        botMaxOutputTokens: 200_000,
        maxRunTokens: 60_000,
        runTokens: 0,
        inputChars: 4000,
      }),
    ).toBe(59_000);
    expect(
      ausgabeGrenze({
        botMaxOutputTokens: 2048,
        maxRunTokens: 60_000,
        runTokens: 0,
        inputChars: 4000,
      }),
    ).toBe(2048);
    expect(
      ausgabeGrenze({
        botMaxOutputTokens: 200_000,
        maxRunTokens: 60_000,
        runTokens: 59_900,
        inputChars: 400,
      }),
    ).toBe(1000);
  });
});

// Die Gegenprobe im Kommentar ist die Änderung, die den Fall rot machen muss.
describe("Nahtstelle 5 nach dem Nachschlagen in der Doku", () => {
  const STAND = "0.3.0-dev+0123456789ab";
  const fest = {
    art: "fest",
    textKey: "werkzeug.doku.nichts_gefunden",
    werte: { stand: "0.3.0-dev" },
  };
  const nichts: AufrufErgebnis = {
    status: "ok",
    toolKey: DOKU_TOOL_KEY,
    ausgefuehrt: true,
    doku: { stand: STAND, gefunden: 0 },
  };
  const treffer: AufrufErgebnis = { ...nichts, doku: { stand: STAND, gefunden: 2 } };
  const abgelehnt = (code: AufrufErgebnis["code"]): AufrufErgebnis => ({
    status: "abgelehnt",
    code,
    toolKey: DOKU_TOOL_KEY,
    ausgefuehrt: false,
  });
  const fehler = (code: AufrufErgebnis["code"]): AufrufErgebnis => ({
    status: "fehler",
    code,
    toolKey: DOKU_TOOL_KEY,
    ausgefuehrt: true,
  });

  it("ein ausgeführter Doku-Aufruf ohne Treffer: festes Ende mit dem Satz und der Version", () => {
    expect(nachAufrufen([nichts])).toEqual(fest);
  });

  it("zwei ausgeführte Doku-Aufrufe ohne Treffer: festes Ende", () => {
    expect(nachAufrufen([nichts, nichts])).toEqual(fest);
  });

  // Gegenprobe: nur prüfen, ob irgendein Aufruf nichts fand → hier festes Ende.
  it("einer findet etwas, einer nicht: weiter", () => {
    expect(nachAufrufen([nichts, treffer])).toEqual({ art: "weiter" });
    expect(nachAufrufen([treffer, nichts])).toEqual({ art: "weiter" });
  });

  it("abgelehnter Aufruf (V-13, V-14, G-17, Not-Aus) und einer ohne Treffer: festes Ende", () => {
    for (const code of [
      "werkzeug_eingabe_ungueltig",
      "zu_viele_aufrufe",
      "limit_erreicht",
      "angehalten",
    ] as const) {
      expect(nachAufrufen([abgelehnt(code), nichts]), code).toEqual(fest);
    }
  });

  // Gegenprobe: abgelehnte Aufrufe als „nichts gefunden“ zählen → hier festes Ende.
  it("nur abgelehnte Doku-Aufrufe: weiter", () => {
    expect(nachAufrufen([abgelehnt("werkzeug_eingabe_ungueltig")])).toEqual({ art: "weiter" });
    expect(nachAufrufen([abgelehnt("angehalten"), abgelehnt("zu_viele_aufrufe")])).toEqual({
      art: "weiter",
    });
  });

  it("Doku-Aufruf mit Werkzeug-Fehler oder Zeitgrenze: weiter", () => {
    expect(nachAufrufen([fehler("werkzeug_fehler")])).toEqual({ art: "weiter" });
    expect(nachAufrufen([fehler("werkzeug_zeitgrenze"), nichts])).toEqual({ art: "weiter" });
  });

  it("ohne Doku-Aufruf: weiter wie bisher", () => {
    const anderes: AufrufErgebnis = {
      status: "ok",
      toolKey: "eingebaut/test_lesen",
      ausgefuehrt: true,
    };
    expect(nachAufrufen([anderes])).toEqual({ art: "weiter" });
    expect(nachAufrufen([{ ...nichts, toolKey: "eingebaut/test_lesen" }])).toEqual({
      art: "weiter",
    });
  });

  it("der Satz bekommt die Version ohne Prüfsumme; der Schlüssel hat genau den Platzhalter stand", () => {
    expect(
      nachAufrufen([{ ...nichts, doku: { stand: "1.2.3+abcdefabcdef", gefunden: 0 } }]),
    ).toMatchObject({
      werte: { stand: "1.2.3" },
    });
    const satz = t("werkzeug.doku.nichts_gefunden", { stand: "1.2.3" });
    expect(satz).toContain("(1.2.3)");
    expect(satz).not.toContain("{");
  });
});
