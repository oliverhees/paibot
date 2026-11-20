/**
 * PaiBot – Vertrags-Tests für beide Motoren: AI-SDK-Motor gegen den Test-Anbieter und Test-Motor.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { createFakeProvider } from "@paibot/fake-provider";
import type { MotorEvent, ToolSpec, TurnInput } from "@paibot/shared/motor";
import { createAiSdkMotor } from "./motor-aisdk";
import { createFakeMotor, type MotorContractCase, motorContractTests } from "./testing";
import { resolveTestModel } from "./testing/test-umgebung";

const API_KEY = `sk-test-${"v".repeat(24)}`;

const NOTIZ: ToolSpec = {
  name: "notiz_suchen",
  description: "Sucht eine Notiz.",
  inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
};

function turn(model: TurnInput["model"], testCase?: MotorContractCase): TurnInput {
  return {
    system: "Du bist ein Test-Bot.",
    history: [{ role: "user", text: "Sag etwas." }],
    model,
    limits: { maxOutputTokens: 256, timeoutMs: 10_000 },
    ...(testCase === "werkzeug_wunsch" ? { tools: [NOTIZ] } : {}),
  };
}

motorContractTests("AI-SDK-Motor", async (testCase: MotorContractCase) => {
  const provider = createFakeProvider({ apiKey: API_KEY });
  const { baseUrl } = await provider.start({ port: 0 });
  provider.configure({ reply: "Hallo, das ist eine Antwort aus dem Test.", chunkChars: 4 });
  let key = API_KEY;
  if (testCase === "abbruch") {
    provider.configure({ reply: "x".repeat(400), chunkChars: 2, chunkDelayMs: 40 });
  }
  if (testCase === "schluessel_ungueltig") key = `sk-falsch-${"f".repeat(24)}`;
  if (testCase === "anbieter_nicht_erreichbar") provider.failNext({ kind: "status", status: 503 });
  if (testCase === "limit_erreicht") provider.failNext({ kind: "status", status: 429 });
  if (testCase === "werkzeug_wunsch") {
    provider.configure({
      reply: "",
      toolCall: { id: "call_v1", name: NOTIZ.name, arguments: { text: "Einkauf" } },
    });
  }
  const model = await resolveTestModel({ baseUrl, apiKey: key });
  return {
    motor: createAiSdkMotor(),
    input: turn(model, testCase),
    cleanup: () => provider.stop(),
    providerRequests: () => provider.requests.length,
  };
});

const FAKE_SCRIPTS: Record<
  MotorContractCase,
  ReadonlyArray<MotorEvent | { type: "pause"; ms: number } | { type: "bis-abbruch" }>
> = {
  antwort: [
    { type: "text-delta", text: "Hallo, " },
    { type: "pause", ms: 5 },
    { type: "text-delta", text: "Welt." },
    { type: "finish", finishReason: "stop", usage: { input: 12, output: 3 } },
  ],
  abbruch: [{ type: "text-delta", text: "Ich fange an" }, { type: "bis-abbruch" }],
  schluessel_ungueltig: [{ type: "error", code: "schluessel_ungueltig", retryable: false }],
  anbieter_nicht_erreichbar: [
    { type: "error", code: "anbieter_nicht_erreichbar", retryable: true },
  ],
  limit_erreicht: [{ type: "error", code: "limit_erreicht", retryable: true }],
  faehigkeiten: [],
  werkzeug_wunsch: [
    { type: "tool-call", callId: "call_f1", name: "notiz_suchen", input: { text: "Einkauf" } },
    { type: "finish", finishReason: "tool-calls", usage: { input: 9, output: 4 } },
  ],
};

motorContractTests("Test-Motor", async (testCase) => ({
  motor: createFakeMotor(FAKE_SCRIPTS[testCase]),
  input: turn({} as TurnInput["model"], testCase),
}));
