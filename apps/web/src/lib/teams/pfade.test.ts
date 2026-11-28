/**
 * PaiBot – prüft die Pfade der Routen für Bots und Teams gegen den Routen-Vertrag.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import { newId } from "@paibot/shared/ids";
import { describe, expect, it } from "vitest";
import { routenPfad } from "../routen";
import { TEAM_PFADE } from "./pfade";

describe("TEAM_PFADE", () => {
  // Gegenprobe: einen Pfad in `TEAM_PFADE` verändern → dieser Test wird rot.
  it("entsprechen den Pfaden des Vertrags", () => {
    const id = newId("bot");
    const teamId = newId("team");
    expect(TEAM_PFADE.bots()).toBe(routenPfad("botsListe", {}));
    expect(TEAM_PFADE.bots()).toBe(routenPfad("botAnlegen", {}));
    expect(TEAM_PFADE.bot(id)).toBe(routenPfad("botLoeschen", { id }));
    expect(TEAM_PFADE.botPause(id)).toBe(routenPfad("botPausieren", { id }));
    expect(TEAM_PFADE.botTeam(id)).toBe(routenPfad("botTeamSetzen", { id }));
    expect(TEAM_PFADE.teams()).toBe(routenPfad("teamsListe", {}));
    expect(TEAM_PFADE.teams()).toBe(routenPfad("teamAnlegen", {}));
    expect(TEAM_PFADE.team(teamId)).toBe(routenPfad("teamAendern", { id: teamId }));
    expect(TEAM_PFADE.team(teamId)).toBe(routenPfad("teamLoeschen", { id: teamId }));
    const entwurfId = newId("entwurf");
    expect(TEAM_PFADE.teamVorlagen()).toBe(routenPfad("teamVorlagenListe", {}));
    expect(TEAM_PFADE.teamEntwuerfe()).toBe(routenPfad("teamEntwuerfeListe", {}));
    expect(TEAM_PFADE.teamEntwuerfe()).toBe(routenPfad("teamEntwurfErstellen", {}));
    expect(TEAM_PFADE.teamEntwurf(entwurfId)).toBe(
      routenPfad("teamEntwurfLesen", { id: entwurfId }),
    );
    expect(TEAM_PFADE.teamEntwurf(entwurfId)).toBe(
      routenPfad("teamEntwurfVerwerfen", { id: entwurfId }),
    );
    expect(TEAM_PFADE.teamEntwurfAnlegen(entwurfId)).toBe(
      routenPfad("teamEntwurfAnlegen", { id: entwurfId }),
    );
    expect(TEAM_PFADE.teamEntwurfZuruecknehmen(entwurfId)).toBe(
      routenPfad("teamEntwurfZuruecknehmen", { id: entwurfId }),
    );
  });
});
