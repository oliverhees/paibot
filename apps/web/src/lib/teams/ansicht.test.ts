/**
 * PaiBot – Tests der Abbildung: Bots und Teams des Servers auf die Anzeige-Typen der Bausteine.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import type { repo } from "@paibot/db";
import type { BotId, TeamId } from "@paibot/shared/ids";
import type { Bot } from "@paibot/shared/objekte";
import { describe, expect, it } from "vitest";
import {
  abnahmeAnzeige,
  abnahmeGespeichert,
  ordne,
  type TeamDaten,
  teamsBot,
  teamsTeam,
} from "./ansicht";

const ZEIT = "2026-11-28T10:00:00.000Z";

function bot(id: string, zusatz: Partial<Bot> = {}): Bot {
  return {
    id: `bot_${id}` as BotId,
    name: id,
    instructions: "",
    avatarShape: "kiesel",
    color: "limette",
    maxOutputTokens: 1024,
    role: "",
    paused: false,
    createdAt: ZEIT,
    updatedAt: ZEIT,
    ...zusatz,
  };
}

function team(id: string, zusatz: Partial<TeamDaten> = {}): TeamDaten {
  return {
    id: `team_${id}` as TeamId,
    name: id,
    collaboration: "aus",
    acceptanceDefault: "leitung",
    ...zusatz,
  };
}

/**
 * Die Abbildung kommt ohne das Datenbank-Paket aus und schreibt `TeamDaten` selbst. Dieser Test
 * hält beide Formen zusammen: Ein Team aus der Zugriffsschicht passt immer in `TeamDaten`.
 * Gegenprobe: ein Feld in `TeamDaten` umbenennen → dieser Test wird rot.
 */
it("nimmt ein Team der Zugriffsschicht unverändert an", () => {
  const ausDerDatenbank: Awaited<ReturnType<typeof repo.teams.create>> = {
    id: "team_a" as TeamId,
    name: "a",
    leadBotId: "bot_leo" as BotId,
    collaboration: "leitung_fuehrt",
    acceptanceDefault: "besitzer",
    createdAt: ZEIT,
    updatedAt: ZEIT,
  };
  const daten: TeamDaten = ausDerDatenbank;
  expect(
    teamsTeam({
      ...daten,
      zusammenarbeit: daten.collaboration,
      abnahme: daten.acceptanceDefault,
      bots: [],
    }).abnahme,
  ).toBe("ich");
});

describe("ordne", () => {
  it("stellt den Standard-Bot als Haupt-Assistenten heraus", () => {
    const pai = bot("pai");
    const ergebnis = ordne([pai, bot("ida")], [], pai.id);
    expect(ergebnis.haupt?.id).toBe(pai.id);
    expect(ergebnis.haupt?.haupt).toBe(true);
    expect(ergebnis.ohneTeam.map((b) => b.id)).toEqual(["bot_ida"]);
  });

  it("gruppiert die Bots nach ihrem Team und stellt die Leitung voran", () => {
    const pai = bot("pai");
    const ida = bot("ida", { teamId: "team_a" as TeamId });
    const leo = bot("leo", { teamId: "team_a" as TeamId });
    const ergebnis = ordne([pai, ida, leo], [team("a", { leadBotId: leo.id })], pai.id);
    expect(ergebnis.teams).toHaveLength(1);
    expect(ergebnis.teams[0]?.bots.map((b) => b.id)).toEqual(["bot_leo", "bot_ida"]);
    expect(ergebnis.teams[0]?.bots[0]?.leitung).toBe(true);
    expect(ergebnis.teams[0]?.bots[1]?.leitung).toBe(false);
    expect(ergebnis.ohneTeam).toHaveLength(0);
  });

  // Gegenprobe: steht der Haupt-Assistent nicht mehr für sich (die Zeile mit `haupt` entfernt),
  // erscheint er zusätzlich in seinem Team und dieser Test wird rot.
  it("lässt den Haupt-Assistenten für sich stehen, auch wenn er ein Team hat", () => {
    const pai = bot("pai", { teamId: "team_a" as TeamId });
    const ergebnis = ordne([pai], [team("a")], pai.id);
    expect(ergebnis.haupt?.id).toBe(pai.id);
    expect(ergebnis.teams[0]?.bots).toHaveLength(0);
  });

  it("stellt einen Bot mit unbekanntem Team unter „Ohne Team“", () => {
    const ida = bot("ida", { teamId: "team_weg" as TeamId });
    const ergebnis = ordne([ida], [], undefined);
    expect(ergebnis.haupt).toBeUndefined();
    expect(ergebnis.ohneTeam.map((b) => b.id)).toEqual(["bot_ida"]);
  });

  it("übernimmt Pause und Aufgabe des Bots", () => {
    const ida = bot("ida", { paused: true, role: "schreibt Protokolle" });
    const ergebnis = ordne([ida], [], undefined);
    expect(ergebnis.ohneTeam[0]?.pausiert).toBe(true);
    expect(ergebnis.ohneTeam[0]?.rolle).toBe("schreibt Protokolle");
  });
});

describe("Abnahme-Standard", () => {
  it("bildet den gespeicherten Wert auf die Anzeige ab", () => {
    expect(abnahmeAnzeige("leitung")).toBe("leitung");
    expect(abnahmeAnzeige("besitzer")).toBe("ich");
    expect(abnahmeAnzeige("ohne")).toBe("ich");
  });

  it("bildet die Anzeige zurück auf den gespeicherten Wert", () => {
    expect(abnahmeGespeichert("leitung")).toBe("leitung");
    expect(abnahmeGespeichert("ich")).toBe("besitzer");
  });
});

describe("teamsBot und teamsTeam", () => {
  it("füllt den Steckbrief mit Modell und Rechten", () => {
    const pai = bot("pai", { role: "dein Assistent" });
    const { haupt } = ordne([pai], [], pai.id);
    if (haupt === undefined) throw new Error("kein Haupt-Assistent");
    const anzeige = teamsBot(haupt, "Beispiel-Modell A", {
      erlaubt: [{ id: "R-1", text: "lesen" }],
      fragt: [],
      nie: [{ id: "G-01", text: "nie" }],
    });
    expect(anzeige).toMatchObject({
      id: pai.id,
      name: "pai",
      rolle: "dein Assistent",
      modell: "Beispiel-Modell A",
      haupt: true,
      pausiert: false,
      darf: ["lesen"],
      fragt: [],
      nie: ["nie"],
    });
  });

  it("nennt das Team mit Leitung, Zusammenarbeit und Abnahme", () => {
    const leo = bot("leo", { teamId: "team_a" as TeamId });
    const { teams } = ordne(
      [leo],
      [
        team("a", {
          leadBotId: leo.id,
          collaboration: "leitung_fuehrt",
          acceptanceDefault: "besitzer",
        }),
      ],
      undefined,
    );
    if (teams[0] === undefined) throw new Error("kein Team");
    expect(teamsTeam(teams[0])).toEqual({
      id: "team_a",
      name: "a",
      leitungId: "bot_leo",
      zusammenarbeit: "leitung_fuehrt",
      abnahme: "ich",
    });
  });

  it("lässt die Leitung leer, wenn das Team keine hat", () => {
    const { teams } = ordne([], [team("a")], undefined);
    if (teams[0] === undefined) throw new Error("kein Team");
    expect(teamsTeam(teams[0]).leitungId).toBe("");
  });
});
