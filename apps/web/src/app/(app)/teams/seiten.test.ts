/**
 * PaiBot – Render-Tests der Seiten „Bots und Teams“, „Team verwalten“ und des Steckbriefs eines
 * Bots: Listen und Formulare, der Hinweis am Schalter „Zusammenarbeit“ ohne Tagesgrenze, und dass
 * der Haupt-Assistent keinen Knopf zum Löschen hat.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import { newId } from "@paibot/shared/ids";
import type { TeamsBot, TeamsTeam } from "@paibot/ui";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { BotSeiteDaten, TeamsSeiteDaten } from "../../../lib/teams/seite";
import { BotSteckbrief } from "../bot/[id]/BotSteckbrief";
import { TeamSeite } from "./[id]/TeamSeite";
import { TeamsSeite } from "./TeamsSeite";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }),
  usePathname: () => "/teams",
}));

const teamId = newId("team");
const milaId = newId("bot");

const mila: TeamsBot = {
  id: milaId,
  name: "Mila",
  rolle: "Schreibt Entwürfe",
  farbe: "blau",
  form: "blatt",
  modell: "Beispiel-Modell A",
  pausiert: false,
  haupt: false,
  teamId,
  darf: ["Entwürfe schreiben"],
  fragt: [],
  nie: [],
};

const team: TeamsTeam = {
  id: teamId,
  name: "Content",
  leitungId: milaId,
  zusammenarbeit: "leitung_fuehrt",
  abnahme: "leitung",
};

const uebersicht = (teil: Partial<TeamsSeiteDaten> = {}): TeamsSeiteDaten => ({
  teams: [{ team, mitglieder: [mila] }],
  ohneTeam: [],
  ohneTagesbudget: false,
  ...teil,
});

const botDaten = (teil: Partial<BotSeiteDaten> = {}): BotSeiteDaten => ({
  bot: mila,
  team,
  teams: [{ id: teamId, name: "Content" }],
  haupt: false,
  ...teil,
});

describe("Seite „Bots und Teams“", () => {
  it("zeigt jedes Team mit Mitgliederzahl und Leitung, dazu die Formulare zum Anlegen", () => {
    const aus = renderToStaticMarkup(h(TeamsSeite, { daten: uebersicht() }));
    expect(aus).toContain("Content");
    expect(aus).toContain("Mila");
    expect(aus).toContain(`href="/teams/${teamId}"`);
    expect(aus).toContain("Team anlegen");
    expect(aus).toContain("Bot anlegen");
  });

  it("ohne Teams und ohne Bots ohne Team stehen die leeren Sätze", () => {
    const aus = renderToStaticMarkup(
      h(TeamsSeite, { daten: uebersicht({ teams: [], ohneTeam: [] }) }),
    );
    expect(aus).not.toContain(`href="/teams/${teamId}"`);
    expect(aus).toContain("Team anlegen");
  });

  it("ein Bot ohne Team führt auf seinen Steckbrief", () => {
    const aus = renderToStaticMarkup(
      h(TeamsSeite, {
        daten: uebersicht({ teams: [], ohneTeam: [{ ...mila, teamId: undefined }] }),
      }),
    );
    expect(aus).toContain(`href="/bot/${milaId}"`);
  });
});

describe("Seite eines Teams", () => {
  // Gegenprobe zur Pflicht: Gibt `TeamSeite` `ohneTagesbudget` nicht weiter, wird dieser Test rot.
  it("ohne Tagesgrenze steht der Hinweis am Schalter „Zusammenarbeit“, mit Grenze nicht", () => {
    const zeige = (ohneTagesbudget: boolean) =>
      renderToStaticMarkup(h(TeamSeite, { daten: { team, mitglieder: [mila], ohneTagesbudget } }));
    expect(zeige(true)).toContain('data-baustein="zusammenarbeit-hinweis"');
    expect(zeige(false)).not.toContain('data-baustein="zusammenarbeit-hinweis"');
  });

  it("hat einen Knopf zum Löschen des Teams", () => {
    const aus = renderToStaticMarkup(
      h(TeamSeite, { daten: { team, mitglieder: [mila], ohneTagesbudget: false } }),
    );
    expect(aus).toContain("Content");
    expect(aus).toContain("Team löschen …");
  });
});

describe("Steckbrief eines Bots in der App", () => {
  it("zeigt den Bot, die Wahl des Teams und die Knöpfe für Pause und Löschen", () => {
    const aus = renderToStaticMarkup(h(BotSteckbrief, { daten: botDaten(), notAus: false }));
    expect(aus).toContain("Mila");
    expect(aus).toContain("Content");
    expect(aus).toContain("Kein Team");
    expect(aus).toContain("Pausieren");
    expect(aus).toContain("Löschen …");
  });

  it("ein pausierter Bot bekommt den Hinweis und den Knopf zum Fortsetzen", () => {
    const aus = renderToStaticMarkup(
      h(BotSteckbrief, { daten: botDaten({ bot: { ...mila, pausiert: true } }), notAus: false }),
    );
    expect(aus).toContain('data-baustein="pausiert"');
    expect(aus).toContain("Fortsetzen");
  });

  // Gegenprobe zur Vorbedingung „Standard-Bot bleibt“: Zeigt die Seite den Knopf auch für den
  // Haupt-Assistenten, wird dieser Test rot.
  it("den Haupt-Assistenten löscht niemand: kein Knopf, sondern der Satz dazu", () => {
    const aus = renderToStaticMarkup(
      h(BotSteckbrief, {
        daten: botDaten({ bot: { ...mila, haupt: true, teamId: undefined }, haupt: true }),
        notAus: false,
      }),
    );
    expect(aus).not.toContain("Löschen …");
    expect(aus).toContain("Er bleibt und lässt sich nicht löschen");
  });
});
