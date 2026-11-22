/**
 * PaiBot – Vertragstest der Nahtstellen: Jede Nahtstelle wird einmal ersetzt, und die
 * Schritt-Schleife folgt dem Ersatz. So ist belegt, dass die Schleife die Werte nur aus diesen
 * Funktionen nimmt und eine spätere Fassung genau dort ansetzen kann.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { repo } from "@paibot/db";
import { createTestDb } from "@paibot/db/testing";
import { createReceiptWriter, verifyChain } from "@paibot/receipts";
import type { MotorEvent } from "@paibot/shared/motor";
import { t } from "@paibot/shared/texte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeMotor, type FakeMotorStep } from "../testing/fake-motor";
import { setupRun } from "../testing/lauf-umgebung";
import { createTestTools } from "../testing/werkzeuge";
import { createToolRegistry } from "../werkzeuge/register";
import { executeRun } from "./ausfuehren";
import type * as Nahtstellen from "./nahtstellen";

const ersatz = vi.hoisted(() => ({}) as Partial<typeof Nahtstellen>);
vi.mock("./nahtstellen", async (original) => {
  const echt = await original<typeof Nahtstellen>();
  const weiter = <K extends keyof typeof Nahtstellen>(name: K) =>
    ((...args: unknown[]) =>
      ((ersatz[name] ?? echt[name]) as (...a: unknown[]) => unknown)(
        ...args,
      )) as (typeof Nahtstellen)[K];
  return {
    ...echt,
    werkzeugeFuerLauf: weiter("werkzeugeFuerLauf"),
    kettenStand: weiter("kettenStand"),
    untrustedInput: weiter("untrustedInput"),
    nachFrage: weiter("nachFrage"),
    nachAufrufen: weiter("nachAufrufen"),
    laufAusloeser: weiter("laufAusloeser"),
  };
});

afterEach(() => {
  for (const key of Object.keys(ersatz)) delete ersatz[key as keyof typeof ersatz];
});

const RECEIPT_TOOLS = {
  createWriter: createReceiptWriter,
  verify: (entries: Parameters<typeof verifyChain>[0], options: object) =>
    verifyChain(entries, options as Parameters<typeof verifyChain>[1]),
};
const finish = (finishReason = "stop"): MotorEvent => ({
  type: "finish",
  finishReason,
  usage: { input: 10, output: 5 },
});
const aufruf: FakeMotorStep = {
  type: "tool-call",
  callId: "c1",
  name: "test_lesen",
  input: { q: "x" },
};

async function lauf(erster: FakeMotorStep[]) {
  const { db } = await createTestDb();
  const motor = createFakeMotor((_i, turn) =>
    turn === 0 ? erster : [{ type: "text-delta", text: "Fertig." }, finish()],
  );
  const env = await setupRun(db, RECEIPT_TOOLS, {
    providerBaseUrl: "http://127.0.0.1:9/v1",
    providerKey: `sk-test-${"p".repeat(24)}`,
    motor,
  });
  env.deps.tools = await createToolRegistry(createTestTools({ allowedByR010: "test_lesen" }).tools);
  const { runId } = await env.queueMessage("Frage");
  const outcome = await executeRun(runId, env.deps, new AbortController().signal);
  const decisions = (await env.receipts()).flatMap((e) =>
    e.body.type === "decision"
      ? [{ type: e.body.action.type, facts: e.body.facts as Record<string, unknown> }]
      : [],
  );
  return { env, runId, outcome, motor, decisions };
}

// Gegenprobe je Fall: den Wert in der Schleife fest statt über die Nahtstelle → der Fall wird rot.
describe("jede Nahtstelle einmal ersetzt", () => {
  it("werkzeugeFuerLauf: leere Liste → keine Werkzeuge angeboten, Text live wie ohne Werkzeuge", async () => {
    ersatz.werkzeugeFuerLauf = () => [];
    const { env, motor } = await lauf([{ type: "text-delta", text: "Hallo." }, finish()]);
    expect(motor.calls[0]?.tools).toBeUndefined();
    expect((await env.events()).some((e) => e.type === "text.delta")).toBe(true);
  });

  it("kettenStand: Zähler zu Beginn → runTokens des ersten Schritts", async () => {
    ersatz.kettenStand = () => ({ schritte: 0, aufrufe: 3, token: 123 });
    const { decisions } = await lauf([aufruf, finish("tool-calls")]);
    expect(decisions.find((d) => d.type === "modell.anfragen")?.facts.runTokens).toBe(123);
    expect(decisions.find((d) => d.type === "werkzeug.aufrufen")?.facts.callsInRun).toBe(3);
  });

  it("untrustedInput: Ersatz true → Fakt an modell.anfragen und werkzeug.aufrufen", async () => {
    ersatz.untrustedInput = async () => true;
    const { decisions } = await lauf([aufruf, finish("tool-calls")]);
    expect(decisions.map((d) => d.facts.untrustedInput)).toEqual([true, true, true]);
  });

  it("nachFrage: wird bei „fragen“ des Tors gerufen", async () => {
    const echt = await vi.importActual<typeof Nahtstellen>("./nahtstellen");
    let gerufen = 0;
    ersatz.nachFrage = (denied) => {
      gerufen += 1;
      return echt.nachFrage(denied);
    };
    // test_schreiben fragt (R-005) und ist damit abgelehnt.
    await lauf([
      { type: "tool-call", callId: "c1", name: "test_schreiben", input: { q: "x" } },
      finish("tool-calls"),
    ]);
    expect(gerufen).toBe(1);
  });

  it("nachAufrufen: festes Ende → kein weiterer Modell-Schritt, End-Antwort fest", async () => {
    ersatz.nachAufrufen = () => ({ art: "fest", textKey: "lauf.schritte.antwort" });
    const { env, runId, motor } = await lauf([aufruf, finish("tool-calls")]);
    expect(motor.calls).toHaveLength(1);
    const end = (
      await repo.messages.listForConversation(env.db, env.conversationId, { limit: 20 })
    ).find((m) => m.runId === runId && m.step === undefined);
    expect(end).toMatchObject({ origin: "fest", content: t("lauf.schritte.antwort") });
  });

  it("laufAusloeser: Ersatz automation → Fakt trigger am Werkzeug-Aufruf", async () => {
    ersatz.laufAusloeser = () => "automation";
    const { decisions } = await lauf([aufruf, finish("tool-calls")]);
    expect(decisions.find((d) => d.type === "werkzeug.aufrufen")?.facts.trigger).toBe("automation");
  });
});
