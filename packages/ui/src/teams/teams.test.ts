/**
 * PaiBot – Tests der Teams-Bausteine: Szenen, Seitenleiste, Bot-Seite, Verwaltung, Entwurf, Übersicht, Wortwahl.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-27
 */

import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { TeamsAnsicht } from "./Ansicht";
import { beispielDaten, SZENEN } from "./beispiel";
import { EntwurfVorschau } from "./Entwurf";
import { Steckbrief } from "./Steckbrief";
import type { TeamsSzene, Vorlage } from "./typen";
import { TeamsUebersicht } from "./Uebersicht";
import { TeamVerwaltung } from "./Verwaltung";

/** Kleine eigene Vorlage: die Tests hängen nicht an der Datei aus `vorlagen/teams/`. */
const vorlage: Vorlage = {
  titel: "Content-Team",
  beschreibung: "Vier Bots für Artikel.",
  team: {
    name: "Content",
    leitung: { name: "Redaktion" },
    zusammenarbeit: "leitung_fuehrt",
    abnahme: "leitung",
  },
  bots: [
    ["Redaktion", "Leitung: verteilt die Arbeit.", "pink", "wabe"],
    ["Ideen", "Sammelt Themen und Stichpunkte.", "gelb", "bluete"],
    ["Entwurf", "Schreibt einen ersten Artikel.", "blau", "bogen"],
    ["Lektorat", "Prüft den Text.", "tuerkis", "kiesel"],
  ].map(([name, aufgabe, farbe, form]) => ({
    name: name as string,
    aufgabe: aufgabe as string,
    anweisung: `Du bist ${name} & arbeitest <genau> so.\n\nZweite "Zeile".`,
    modell: "wie_pai",
    form: form as never,
    farbe: farbe as never,
  })),
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const zeige = (start: TeamsSzene, startBot?: string) =>
  renderToStaticMarkup(
    h(TeamsAnsicht, { daten: beispielDaten(vorlage), start, ...(startBot ? { startBot } : {}) }),
  );
const entwurf = (
  notAus: boolean,
  status: "offen" | "angelegt" = "offen",
  weiter: { sendet?: boolean; fehler?: string; vorlage?: Vorlage } = {},
) =>
  renderToStaticMarkup(
    h(EntwurfVorschau, {
      vorlage: weiter.vorlage ?? vorlage,
      status,
      notAus,
      onAnlegen: () => {},
      onRueckgaengig: () => {},
      onVerwerfen: () => {},
      onWiederOeffnen: () => {},
      ...(weiter.sendet === undefined ? {} : { sendet: weiter.sendet }),
      ...(weiter.fehler === undefined ? {} : { fehler: weiter.fehler }),
    }),
  );
const alle = SZENEN.map((s) => s.id);

describe("Teams-Bausteine: Szenen", () => {
  it("es gibt genau fünf Szenen", () => {
    expect(alle).toEqual(["seitenleiste", "bot", "team", "entwurf", "uebersicht"]);
  });
  it("jede Szene rendert im Rahmen mit Seitenleiste", () => {
    for (const id of alle) {
      const html = zeige(id);
      expect(html).toContain('data-baustein="teams-ansicht"');
      expect(html).toContain('data-baustein="seitenleiste"');
    }
  });
});

describe("Teams-Bausteine: Seitenleiste", () => {
  it("Bots stehen nach Teams gruppiert, die Leitung zuerst und gekennzeichnet", () => {
    const html = zeige("seitenleiste");
    for (const team of ["Content", "Recherche", "Ohne Team"]) expect(html).toContain(team);
    expect(html.indexOf("Redaktion")).toBeLessThan(html.indexOf("Ideen"));
    expect(html).toContain(">Leitung<");
    expect(html).toContain("Menü für Redaktion");
  });

  it("der Not-Aus ist da und steht zuerst auf „Alle Bots laufen“", () => {
    const html = zeige("seitenleiste");
    expect(html).toContain('data-baustein="notaus"');
    expect(html).toContain("Alle Bots laufen");
    expect(html).toContain("Anhalten");
  });

  it("Pai steht unter „Haupt-Assistent“, Bots ohne Team darunter, Fußzeile mit Belege · Regeln · Grenzen", () => {
    const html = zeige("seitenleiste");
    expect(html.indexOf("Haupt-Assistent")).toBeLessThan(html.indexOf("Teams</h2>"));
    expect(html.indexOf("Teams</h2>")).toBeLessThan(html.indexOf("Ohne Team"));
    expect(html).toContain("dein Haupt-Assistent");
    for (const wort of ["Belege", "Regeln", "Grenzen", "PaiBot"]) expect(html).toContain(wort);
    expect(html).toContain("pausiert");
  });

  it("das Team aus der Vorlage gibt es erst nach dem Anlegen", () => {
    const vorher = zeige("entwurf");
    expect(vorher).not.toContain("Menü für Redaktion");
    expect(zeige("seitenleiste")).toContain("Menü für Redaktion");
  });
});

describe("Teams-Bausteine: Bot-Seite", () => {
  const daten = () => beispielDaten(vorlage);
  const bot = (name: string) => {
    const b = daten().bots.find((x) => x.name === name);
    if (!b) throw new Error(`Bot ${name} fehlt`);
    return b;
  };

  it("zeigt Rolle, Team, Modell und die drei Listen „darf / fragt vorher / darf nie“", () => {
    const html = renderToStaticMarkup(
      h(Steckbrief, { bot: bot("Ideen"), team: daten().teams[0], notAus: false }),
    );
    for (const w of ["Rolle", "Team", "Modell", "Darf", "Fragt vorher", "Darf nie"]) {
      expect(html).toContain(w);
    }
    expect(html).toContain("Wie Pai");
  });

  it("der Hinweis „pausiert“ erscheint nur bei einem pausierten Bot", () => {
    const pausiert = renderToStaticMarkup(h(Steckbrief, { bot: bot("Zahlen"), notAus: false }));
    expect(pausiert).toContain('data-baustein="pausiert"');
    expect(pausiert).toContain("Zahlen ist pausiert und antwortet nicht");
    const aktiv = renderToStaticMarkup(h(Steckbrief, { bot: bot("Quelle"), notAus: false }));
    expect(aktiv).not.toContain('data-baustein="pausiert"');
    const notAus = renderToStaticMarkup(h(Steckbrief, { bot: bot("Quelle"), notAus: true }));
    expect(notAus).toContain('data-baustein="pausiert"');
  });
});

describe("Teams-Bausteine: Team-Verwaltung", () => {
  it("zeigt Name, Leitung, Zusammenarbeit, Abnahme-Standard, Mitglieder und den Budget-Hinweis", () => {
    const html = zeige("team");
    expect(html).toContain('data-baustein="team-verwaltung"');
    for (const w of ["Name", "Leitung", "Aus", "Leitung führt", "Abnahme-Standard", "Mitglieder"]) {
      expect(html).toContain(w);
    }
    expect(html).toContain("kein eigenes Tagesbudget");
    expect(html).toContain('data-baustein="budget-hinweis"');
  });

  // Gegenprobe zur Pflicht: Lässt man den Hinweis am Schalter „Zusammenarbeit“ weg (also
  // `ohneTagesbudget` nicht auswerten), wird der erste Fall dieses Tests rot.
  it("ohne Tagesgrenze steht der Hinweis am Schalter „Zusammenarbeit“, mit Grenze nicht", () => {
    const daten = beispielDaten(vorlage);
    const team = daten.teams[0];
    if (!team) throw new Error("kein Team");
    const zeigeTeam = (ohneTagesbudget: boolean) =>
      renderToStaticMarkup(
        h(TeamVerwaltung, {
          team,
          mitglieder: daten.bots.filter((b) => b.teamId === team.id),
          ohneTagesbudget,
        }),
      );
    const ohne = zeigeTeam(true);
    expect(ohne).toContain('data-baustein="zusammenarbeit-hinweis"');
    expect(ohne).toContain("Du hast keine Tagesgrenze gesetzt");
    expect(zeigeTeam(false)).not.toContain('data-baustein="zusammenarbeit-hinweis"');
  });

  it("die Wahl „Keine Leitung“ steht in der Liste der Leitung", () => {
    expect(zeige("team")).toContain("Keine Leitung");
  });
});

describe("Teams-Bausteine: Team-Entwurf", () => {
  it("zeigt die Anweisung jedes Bots im vollen Wortlaut aus der Vorlage", () => {
    const html = entwurf(false);
    expect(vorlage.bots).toHaveLength(4);
    for (const b of vorlage.bots) {
      expect(html, b.name).toContain(esc(b.anweisung));
    }
    expect(html).toContain("aus Vorlage");
  });

  it("Gegenprobe: ein gekürzter Wortlaut wird nicht als voll erkannt", () => {
    const b = vorlage.bots[0];
    if (!b) throw new Error("Vorlage leer");
    expect(entwurf(false)).not.toContain(esc(`${b.anweisung}x`));
  });

  it("nennt die Leitung, die Kosten, den Verfall nach 7 Tagen und „Team anlegen“", () => {
    const html = entwurf(false);
    expect(html).toContain("Leitung: Redaktion");
    expect(html).toContain("Was das kosten kann");
    expect(html).toContain("verfällt in 7 Tagen");
    expect(html).toContain("Team anlegen");
    expect(html).toContain("Anlegen: 4 Bots und 1 Team.");
  });

  it("Not-Aus sperrt „Team anlegen“ (Gegenprobe: ohne Not-Aus ist der Knopf frei)", () => {
    const gesperrt = entwurf(true);
    expect(gesperrt).toMatch(/<button[^>]*disabled=""[^>]*>(<svg.*?<\/svg>)?Team anlegen/);
    expect(gesperrt).toContain('data-baustein="entwurf-gesperrt"');
    const frei = entwurf(false);
    expect(frei).not.toMatch(/<button[^>]*disabled=""[^>]*>(<svg.*?<\/svg>)?Team anlegen/);
    expect(frei).not.toContain('data-baustein="entwurf-gesperrt"');
  });

  it("nicht Mögliches steht grau, nicht wählbar, mit „kommt mit …“", () => {
    const html = entwurf(false);
    const spaeter = html.split('data-baustein="entwurf-spaeter"').slice(1);
    expect(spaeter).toHaveLength(4);
    for (const teil of spaeter) {
      expect(teil).toContain("kommt mit");
      expect(teil.slice(0, teil.indexOf("</label>"))).toContain('disabled=""');
    }
  });

  it("nach dem Anlegen steht „Rückgängig“ da; vorher nicht", () => {
    const nachher = entwurf(false, "angelegt");
    expect(nachher).toContain("Rückgängig");
    expect(nachher).toContain("Team Content angelegt.");
    expect(nachher).not.toContain("Team anlegen");
    expect(entwurf(false, "offen")).not.toContain("Rückgängig");
  });

  it("Bots lassen sich abwählen, die Leitung nicht", () => {
    const html = entwurf(false);
    const teile = html.split('data-baustein="entwurf-bot"').slice(1);
    expect(teile).toHaveLength(4);
    const redaktion = teile.find((x) => x.includes("Redaktion"));
    const ideen = teile.find((x) => x.includes("Sammelt Themen"));
    expect(redaktion?.slice(0, 200)).toContain('disabled=""');
    expect(ideen?.slice(0, 200)).not.toContain('disabled=""');
  });

  it("die Anweisung ist vor dem Anlegen änderbar: je Bot ein Feld mit Beschriftung", () => {
    const html = entwurf(false);
    const felder = [...html.matchAll(/<textarea[^>]*aria-label="([^"]*)"/g)].map((m) => m[1]);
    expect(felder).toEqual([
      "Anweisung für Redaktion ändern",
      "Anweisung für Ideen ändern",
      "Anweisung für Entwurf ändern",
      "Anweisung für Lektorat ändern",
    ]);
    for (const b of vorlage.bots) expect(html, b.name).toContain(esc(b.anweisung));
  });

  it("Gegenprobe: nach dem Anlegen steht der Wortlaut fest, kein Feld mehr", () => {
    const html = entwurf(false, "angelegt");
    expect(html).not.toContain("<textarea");
    expect(html).toContain("<pre");
    for (const b of vorlage.bots) expect(html, b.name).toContain(esc(b.anweisung));
  });

  it("die Abnahme steht in der Vorschau, und zwar die der Vorlage", () => {
    expect(entwurf(false)).toContain("Abnahme durch die Leitung");
    const eigene: Vorlage = { ...vorlage, team: { ...vorlage.team, abnahme: "ich" } };
    const html = entwurf(false, "offen", { vorlage: eigene });
    expect(html).toContain("Abnahme durch dich");
    expect(html).not.toContain("Abnahme durch die Leitung");
  });

  it("eine Meldung des Servers steht als Fehler da, und die Knöpfe warten", () => {
    const html = entwurf(false, "offen", { fehler: "Entwurf veraltet." });
    expect(html).toContain('data-baustein="entwurf-fehler"');
    expect(html).toContain("Entwurf veraltet.");
    // Gegenprobe: ohne Meldung ist die Stelle leer, und ohne laufende Anfrage ist der Knopf frei.
    expect(entwurf(false)).not.toContain('data-baustein="entwurf-fehler"');
    expect(entwurf(false, "offen", { sendet: true })).toMatch(
      /<button[^>]*disabled=""[^>]*>(<svg.*?<\/svg>)?Team anlegen/,
    );
    expect(entwurf(false)).not.toMatch(
      /<button[^>]*disabled=""[^>]*>(<svg.*?<\/svg>)?Team anlegen/,
    );
  });
});

describe("Teams-Bausteine: Teams-Übersicht", () => {
  let html = "";
  beforeAll(() => {
    html = zeige("uebersicht");
  });

  it("gruppiert die Fäden nach laufend, wartet auf dich und fertig", () => {
    for (const w of ["Läuft", "Wartet auf dich", "Fertig"]) expect(html).toContain(w);
    expect(html.match(/data-baustein="uebersicht-faden"/g)).toHaveLength(5);
  });

  it("hat nur „Faden öffnen“ und „Stoppen“ als Knöpfe in den Fäden", () => {
    const karten = html.split('data-baustein="uebersicht-faden"').slice(1);
    for (const k of karten) {
      const knoepfe = [...k.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((m) => m[1]);
      for (const text of knoepfe) expect(["Faden öffnen", "Stoppen"]).toContain(text);
    }
    expect(html.match(/>Stoppen</g)).toHaveLength(4);
  });

  it("Fertige Fäden sind „abgenommen“, nie „freigegeben“", () => {
    expect(html).toContain("abgenommen von Redaktion");
    for (const id of alle) expect(zeige(id).toLowerCase()).not.toContain("freigegeben");
  });

  it("Fäden eines nicht vorhandenen Teams werden nicht gezeigt", () => {
    const d = beispielDaten(vorlage);
    const leer = renderToStaticMarkup(
      h(TeamsUebersicht, { faeden: d.faeden, teams: [], bots: d.bots }),
    );
    expect(leer).not.toContain('data-baustein="uebersicht-faden"');
  });
});

describe("Teams-Bausteine: Wortwahl", () => {
  it("‚Leitung‘ statt ‚Ansprechpartner‘, kein ‚EU‘ und kein ‚sicher‘", () => {
    for (const id of alle) {
      const html = zeige(id);
      expect(html).not.toContain("Ansprechpartner");
      // Der Wortlaut der Vorlage (<pre>) ist nicht unser Text und steht nicht in dieser Prüfung.
      const eigen = html.replace(/<pre[^>]*>[\s\S]*?<\/pre>/g, "");
      expect(eigen).not.toMatch(/\bEU\b/);
      expect(eigen.toLowerCase()).not.toContain("sicher");
    }
    expect(entwurf(false)).toContain("Leitung");
  });
});
