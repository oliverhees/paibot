/**
 * PaiBot – prüft die Bot-Wahl der Startseite: `?bot=<Kennung>` öffnet eine neue Unterhaltung mit
 * diesem Bot, alles andere bleibt beim Standard-Bot.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import { newId } from "@paibot/shared/ids";
import { describe, expect, it } from "vitest";
import { neueUnterhaltungAdresse } from "../../lib/navigation";
import { gewaehlterBot } from "./page";

const botId = newId("bot");

describe("Startseite: welcher Bot antwortet", () => {
  // Gegenprobe: Gibt die Startseite `gewaehlterBot(...)` nicht an `ladeBereitschaft` weiter,
  // antwortet in „Neue Unterhaltung mit …“ wieder der Standard-Bot. Dann wird der Fall im
  // Browser-Test „Chat: der Hinweis auf die Pause steht über der Eingabe“ rot
  // (`scripts/bots-und-teams-browser.mjs`).
  it("nimmt die Kennung aus der Adresse, die die Seitenleiste baut", () => {
    const adresse = neueUnterhaltungAdresse(botId);
    const wert = new URL(adresse, "http://127.0.0.1").searchParams.get("bot") ?? undefined;
    expect(wert).toBe(botId);
    expect(gewaehlterBot(wert)).toBe(botId);
  });

  it("ohne Angabe bleibt der Standard-Bot die Vorgabe", () => {
    expect(neueUnterhaltungAdresse()).toBe("/");
    expect(gewaehlterBot(undefined)).toBeUndefined();
  });

  it("was keine Bot-Kennung ist, wird nicht zur Bot-Kennung", () => {
    for (const wert of ["", "pai", newId("team"), newId("conversation"), "../bot_1"]) {
      expect(gewaehlterBot(wert), wert).toBeUndefined();
    }
  });

  it("mehrfaches `?bot=` nimmt den ersten Wert, nie eine Liste", () => {
    expect(gewaehlterBot([botId, newId("bot")])).toBe(botId);
    expect(gewaehlterBot(["pai", botId])).toBeUndefined();
  });
});
