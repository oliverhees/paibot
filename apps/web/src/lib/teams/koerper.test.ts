/**
 * PaiBot – prüft jeden Körper der Verwaltungs-Routen gegen die Eingabe seiner Route. Ohne diese
 * Prüfung fiel erst im Browser auf, dass die Seiten Felder schickten, die der Vertrag nicht kennt
 * (`leadBotId` statt `lead`, `teamId: null`, Bot ohne Farbe und Form): die Routen antworteten mit
 * 400, obwohl jeder Render-Test grün war.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import {
  botCreateInput,
  botPauseInput,
  botTeamInput,
  teamCreateInput,
  teamPatchInput,
} from "@paibot/shared/eingaben";
import { newId } from "@paibot/shared/ids";
import { BOT_COLORS } from "@paibot/shared/objekte";
import { describe, expect, it } from "vitest";
import {
  botAnlegenKoerper,
  botPauseKoerper,
  botTeamKoerper,
  naechstesAussehen,
  teamAendernKoerper,
  teamAnlegenKoerper,
} from "./koerper";

/** Was die Eingabe beanstandet, als lesbare Liste – damit ein Fehlschlag sofort sagt, warum. */
function fehler(
  schema: { safeParse: (w: unknown) => { success: boolean; error?: unknown } },
  wert: unknown,
) {
  const e = schema.safeParse(wert);
  return e.success
    ? []
    : ((e.error as { issues: { path: unknown[]; message: string }[] }).issues ?? []).map(
        (i) => `${i.path.join(".")}: ${i.message}`,
      );
}

const botId = newId("bot");
const teamId = newId("team");

describe("Die Körper der Verwaltungs-Routen passen zu ihren Eingaben", () => {
  // Gegenprobe: ein Feld in `koerper.ts` umbenennen (z. B. `lead` zurück auf `leadBotId`) → der
  // zugehörige Fall wird rot, weil die Eingaben `strictObject` sind.
  it("Team anlegen", () => {
    expect(fehler(teamCreateInput, teamAnlegenKoerper("Content"))).toEqual([]);
  });

  it("Bot anlegen – mit Aufgabe, ohne Aufgabe, und für jede Farbe", () => {
    expect(fehler(botCreateInput, botAnlegenKoerper("Mila", "Sammelt Themen.", 1))).toEqual([]);
    expect(fehler(botCreateInput, botAnlegenKoerper("Mila", "", 0))).toEqual([]);
    for (let i = 0; i < BOT_COLORS.length + 2; i += 1) {
      expect(fehler(botCreateInput, botAnlegenKoerper(`Bot ${i}`, "", i)), String(i)).toEqual([]);
    }
  });

  it("Bot pausieren und fortsetzen", () => {
    expect(fehler(botPauseInput, botPauseKoerper(true))).toEqual([]);
    expect(fehler(botPauseInput, botPauseKoerper(false))).toEqual([]);
  });

  it("Bot einem Team zuordnen und wieder herausnehmen", () => {
    expect(fehler(botTeamInput, botTeamKoerper(teamId))).toEqual([]);
    expect(fehler(botTeamInput, botTeamKoerper(""))).toEqual([]);
    expect(fehler(botTeamInput, botTeamKoerper(undefined))).toEqual([]);
  });

  it("Team ändern – mit Leitung und ohne", () => {
    const basis = {
      name: "Content",
      zusammenarbeit: "leitung_fuehrt",
      abnahme: "leitung",
    } as const;
    expect(fehler(teamPatchInput, teamAendernKoerper({ ...basis, leitungId: botId }))).toEqual([]);
    expect(fehler(teamPatchInput, teamAendernKoerper({ ...basis, leitungId: "" }))).toEqual([]);
    expect(
      fehler(
        teamPatchInput,
        teamAendernKoerper({
          name: "Content",
          leitungId: "",
          zusammenarbeit: "aus",
          abnahme: "ich",
        }),
      ),
    ).toEqual([]);
  });
});

describe("Aussehen des nächsten Bots", () => {
  it("nimmt die Farben der Reihe nach und fängt danach wieder vorn an", () => {
    const farben = BOT_COLORS.map((_, i) => naechstesAussehen(i).color);
    expect(new Set(farben).size).toBe(BOT_COLORS.length);
    expect(naechstesAussehen(BOT_COLORS.length).color).toBe(naechstesAussehen(0).color);
  });

  it("die Form gehört fest zur Farbe", () => {
    for (let i = 0; i < BOT_COLORS.length; i += 1) {
      const { color, avatarShape } = naechstesAussehen(i);
      expect(naechstesAussehen(i).avatarShape, color).toBe(avatarShape);
    }
  });
});
