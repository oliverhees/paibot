/**
 * PaiBot – Tests der reinen Teile des Lauf-Kontexts: Tagesbeginn in der Zeitzone, Verlauf mit
 * Obergrenze, Weg zur Datenschleuse ohne Rückfall.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { randomBytes } from "node:crypto";
import { contextDigest, deriveKey, loadMasterSecret } from "@paibot/crypto";
import type { TurnMessage } from "@paibot/shared/motor";
import type { Message } from "@paibot/shared/objekte";
import { describe, expect, it } from "vitest";
import {
  buildHistory,
  buildHistoryWithRuns,
  chooseRoute,
  REQUEST_DIGEST_PREFIX,
  requestChars,
  requestDigest,
  startOfDay,
} from "./kontext";

function msg(change: Partial<Message> & Pick<Message, "role" | "content">): Message {
  return { status: "complete", ...change } as Message;
}

function message(role: Message["role"], content: string, status: Message["status"] = "complete") {
  return { role, content, status } as Message;
}

describe("startOfDay", () => {
  it("Mitternacht in der Zeitzone", () => {
    const now = new Date("2026-11-20T23:30:00.000Z");
    expect(startOfDay(now, "Europe/Berlin").toISOString()).toBe("2026-11-20T23:00:00.000Z");
    expect(startOfDay(now, "UTC").toISOString()).toBe("2026-11-20T00:00:00.000Z");
    expect(startOfDay(new Date("2026-07-01T12:00:00.000Z"), "Europe/Berlin").toISOString()).toBe(
      "2026-06-30T22:00:00.000Z",
    );
  });
});

describe("buildHistory", () => {
  it("nur Nachrichten der Person und fertige oder abgebrochene Antworten mit Text", () => {
    const history = buildHistory(
      [
        message("system", "intern"),
        message("user", "a"),
        message("assistant", "kaputt", "failed"),
        message("assistant", "", "complete"),
        message("assistant", "halb", "cancelled"),
        message("assistant", "läuft", "streaming"),
        message("user", "b"),
      ],
      1000,
    );
    expect(history).toEqual([
      { role: "user", text: "a" },
      { role: "assistant", text: "halb" },
      { role: "user", text: "b" },
    ]);
  });

  it("je Nachricht nur die neueste brauchbare Fassung einer neu erzeugten Antwort", () => {
    const history = buildHistory(
      [
        message("user", "Frage 1"),
        message("assistant", "Fassung 1"),
        message("assistant", "Fassung 2"),
        message("user", "Frage 2"),
        message("assistant", "alt"),
        message("assistant", "neu, aber fehlgeschlagen", "failed"),
        message("user", "Frage 3"),
      ],
      1000,
    );
    expect(history).toEqual([
      { role: "user", text: "Frage 1" },
      { role: "assistant", text: "Fassung 2" },
      { role: "user", text: "Frage 2" },
      { role: "assistant", text: "alt" },
      { role: "user", text: "Frage 3" },
    ]);
  });

  it("schneidet Älteres bei der Zeichen-Grenze ab, die neueste Nachricht bleibt immer", () => {
    const list = [
      message("user", "1".repeat(5)),
      message("user", "2".repeat(5)),
      message("user", "3".repeat(5)),
    ];
    expect(buildHistory(list, 10).map((m) => m.role === "user" && m.text)).toEqual([
      "22222",
      "33333",
    ]);
    expect(buildHistory(list, 1).map((m) => m.role === "user" && m.text)).toEqual(["33333"]);
    expect(requestChars("abc", buildHistory(list, 100))).toBe(18);
  });
});

describe("chooseRoute", () => {
  const up = { installed: true, reachable: true };
  const down = { installed: true, reachable: false };
  it("Unterhaltung vor Standard; an ohne erreichbare Schleuse bleibt schleuse, nie direkt", () => {
    expect(chooseRoute({ schleuseMode: "on" }, { schleuseModeDefault: "off" }, up)).toEqual({
      mode: "on",
      route: "schleuse",
      schleuseReachable: true,
    });
    expect(chooseRoute({}, { schleuseModeDefault: "on" }, down)).toEqual({
      mode: "on",
      route: "schleuse",
      schleuseReachable: false,
    });
    expect(
      chooseRoute({}, { schleuseModeDefault: "on" }, { installed: false, reachable: true }),
    ).toMatchObject({ route: "schleuse", schleuseReachable: false });
    expect(chooseRoute({ schleuseMode: "off" }, { schleuseModeDefault: "on" }, up)).toMatchObject({
      mode: "off",
      route: "direct",
    });
  });
});

const contextKey = deriveKey(
  loadMasterSecret({ PAIBOT_SECRET: randomBytes(32).toString("base64") }),
  "context-v1",
);

describe("Abdruck und Zeichen der Anfrage mit Werkzeugen", () => {
  const history: TurnMessage[] = [{ role: "user", text: "Hallo" }];
  const base = { system: "Anweisung", history, modelId: "mod_1", route: "direct" as const };
  const tool = {
    name: "test_lesen",
    description: "Liest.",
    inputSchema: { type: "object" },
    toolDigest: `sha256:${"a".repeat(64)}`,
  };
  const steps: TurnMessage[] = [
    ...history,
    {
      role: "assistant",
      text: "",
      toolCalls: [{ callId: "c1", name: "test_lesen", input: { q: "x" } }],
    },
    {
      role: "tool",
      results: [{ callId: "c1", name: "test_lesen", status: "ok", output: { inhalt: 1 } }],
    },
  ];

  // Gegenprobe: Werkzeug-Liste nicht im Abdruck → gleicher Abdruck, rot.
  it("andere Beschreibung eines angebotenen Werkzeugs → anderer requestDigest", () => {
    const a = requestDigest(contextKey, { ...base, tools: [tool] });
    const b = requestDigest(contextKey, {
      ...base,
      tools: [{ ...tool, description: "Liest anders." }],
    });
    expect(a).not.toBe(b);
  });

  it("andere Hülle im Verlauf des Laufs → anderer requestDigest", () => {
    const changed: TurnMessage[] = [
      ...steps.slice(0, 2),
      {
        role: "tool",
        results: [{ callId: "c1", name: "test_lesen", status: "ok", output: { inhalt: 2 } }],
      },
    ];
    expect(requestDigest(contextKey, { ...base, history: steps })).not.toBe(
      requestDigest(contextKey, { ...base, history: changed }),
    );
  });

  // Gegenprobe: Vorsatz v2 auch ohne Werkzeuge → rot.
  it("ohne Werkzeuge und ohne Schritte: Abdruck gleich wie bisher (v1)", () => {
    const expected = contextDigest(
      contextKey,
      `pb-anfrage/v1\n${JSON.stringify({ history, modelId: "mod_1", route: "direct", system: "Anweisung" })}`,
    );
    expect(REQUEST_DIGEST_PREFIX).toBe("pb-anfrage/v1\n");
    expect(requestDigest(contextKey, base)).toBe(expected);
    expect(requestDigest(contextKey, { ...base, tools: [] })).toBe(expected);
    expect(requestDigest(contextKey, { ...base, tools: [tool] })).not.toBe(expected);
  });

  // Gegenprobe: Werkzeug-Liste und Hüllen nicht zählen → rot.
  it("requestChars zählt Werkzeug-Liste, Aufrufe und Hüllen mit", () => {
    const plain = requestChars("Anweisung", history);
    expect(plain).toBe("Anweisung".length + "Hallo".length);
    const withSteps = requestChars("Anweisung", steps);
    expect(withSteps).toBe(
      plain +
        JSON.stringify({ callId: "c1", name: "test_lesen", input: { q: "x" } }).length +
        JSON.stringify({ callId: "c1", name: "test_lesen", status: "ok", output: { inhalt: 1 } })
          .length,
    );
    const spec = { name: tool.name, description: tool.description, inputSchema: tool.inputSchema };
    expect(requestChars("Anweisung", history, [spec])).toBe(
      plain + spec.name.length + spec.description.length + JSON.stringify(spec.inputSchema).length,
    );
  });

  // Gegenprobe: currentAnswers ohne Filter auf step → Zwischentext im Verlauf, rot.
  it("currentAnswers zählt nur End-Antworten (step leer); Läufe der End-Antworten im Verlauf", () => {
    const runA = "lau_a" as never;
    const runB = "lau_b" as never;
    const messages = [
      msg({ role: "user", content: "Frage" }),
      msg({ role: "assistant", content: "Antwort A", runId: runA }),
      msg({ role: "assistant", content: "Zwischentext B", runId: runB, step: 0 }),
    ];
    const { history: built, runIds } = buildHistoryWithRuns(messages, 10_000);
    expect(built).toEqual([
      { role: "user", text: "Frage" },
      { role: "assistant", text: "Antwort A" },
    ]);
    expect(runIds).toEqual([runA]);
  });
});
