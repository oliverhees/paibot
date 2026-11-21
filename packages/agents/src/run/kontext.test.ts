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

import type { Message } from "@paibot/shared/objekte";
import { describe, expect, it } from "vitest";
import { buildHistory, chooseRoute, requestChars, startOfDay } from "./kontext";

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
