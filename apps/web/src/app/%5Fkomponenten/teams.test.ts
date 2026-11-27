/**
 * PaiBot – Render-Tests der Teams-Vorschau: fünf Szenen, kein Abruf, Wortwahl, Entwurf, Übersicht.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-27
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  beispielDaten,
  EntwurfVorschau,
  Steckbrief,
  TEAMS_SZENEN,
  TeamsAnsicht,
  type TeamsSzene,
  TeamsUebersicht,
  type Vorlage,
} from "@paibot/ui";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ladeVorlage } from "./teams/vorlage";

let vorlage: Vorlage;
beforeAll(async () => {
  vorlage = await ladeVorlage();
});
afterEach(() => vi.unstubAllGlobals());

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const zeige = (start: TeamsSzene, startBot?: string) =>
  renderToStaticMarkup(
    h(TeamsAnsicht, { daten: beispielDaten(vorlage), start, ...(startBot ? { startBot } : {}) }),
  );
const entwurf = (notAus: boolean, status: "offen" | "angelegt" = "offen") =>
  renderToStaticMarkup(
    h(EntwurfVorschau, {
      vorlage,
      status,
      notAus,
      onAnlegen: () => {},
      onRueckgaengig: () => {},
      onVerwerfen: () => {},
      onWiederOeffnen: () => {},
    }),
  );
const alle = TEAMS_SZENEN.map((s) => s.id);

describe("Teams-Vorschau: fünf Szenen, nur Beispiel-Daten", () => {
  it("es gibt genau fünf Szenen", () => {
    expect(alle).toEqual(["seitenleiste", "bot", "team", "entwurf", "uebersicht"]);
  });

  for (const id of alle) {
    it(`Szene „${id}“ rendert, auch wenn jeder Abruf wirft`, () => {
      const fetchWirft = vi.fn(() => {
        throw new Error("kein Server in der Vorschau");
      });
      vi.stubGlobal("fetch", fetchWirft);
      const html = zeige(id);
      expect(html).toContain('data-baustein="teams-ansicht"');
      expect(html).toContain('data-baustein="seitenleiste"');
      expect(fetchWirft).not.toHaveBeenCalled();
    });
  }

  it("Gegenprobe: ein Baustein, der abrufen würde, wäre rot", () => {
    const quelle = 'await fetch("/api/teams")';
    expect(/\bfetch\s*\(/.test(quelle)).toBe(true);
  });

  it("der Quelltext der Bausteine ruft nichts ab und importiert nichts vom Server", () => {
    const ordner = join(__dirname, "../../../../../packages/ui/src/teams");
    const dateien = readdirSync(ordner).filter((f) => /\.(tsx?|css)$/.test(f));
    expect(dateien.length).toBeGreaterThan(8);
    for (const d of dateien) {
      const text = readFileSync(join(ordner, d), "utf8");
      expect(text, d).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource/);
      expect(text, d).not.toMatch(/from "(next|@paibot\/(db|jobs|agents|gate))/);
      expect(text, d).not.toMatch(/\b[SQ]-\d{3}\b|PAIBOT-\d|P-TZ/);
    }
  });
});

describe("Teams-Vorschau: Seitenleiste", () => {
  it("Bots stehen nach Teams gruppiert, die Leitung zuerst und gekennzeichnet", () => {
    const html = zeige("seitenleiste");
    for (const team of ["Content", "Recherche", "Ohne Team"]) expect(html).toContain(team);
    expect(html.indexOf("Redaktion")).toBeLessThan(html.indexOf("Ideen"));
    expect(html).toContain(">Leitung<");
    expect(html).toContain("Menü für Redaktion");
  });

  it("der Not-Aus ist da und steht zuerst auf „Alles läuft“", () => {
    const html = zeige("seitenleiste");
    expect(html).toContain('data-baustein="notaus"');
    expect(html).toContain("Alles läuft");
    expect(html).toContain("Alles anhalten");
  });

  it("das Team aus der Vorlage gibt es erst nach dem Anlegen", () => {
    const vorher = zeige("entwurf");
    expect(vorher).not.toContain("Menü für Redaktion");
    expect(zeige("seitenleiste")).toContain("Menü für Redaktion");
  });
});

describe("Teams-Vorschau: Bot-Seite", () => {
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

describe("Teams-Vorschau: Team-Verwaltung", () => {
  it("zeigt Name, Leitung, Zusammenarbeit, Abnahme-Standard, Mitglieder und den Budget-Hinweis", () => {
    const html = zeige("team");
    expect(html).toContain('data-baustein="team-verwaltung"');
    for (const w of ["Name", "Leitung", "Aus", "Leitung führt", "Abnahme-Standard", "Mitglieder"]) {
      expect(html).toContain(w);
    }
    expect(html).toContain("kein eigenes Tagesbudget");
    expect(html).toContain('data-baustein="budget-hinweis"');
  });
});

describe("Teams-Vorschau: Team-Entwurf", () => {
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
});

describe("Teams-Vorschau: Teams-Übersicht", () => {
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

describe("Teams-Vorschau: Wortwahl", () => {
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

describe("Vorlage laden", () => {
  it("liest das Content-Team aus dem Repository", () => {
    expect(vorlage.team.name).toBe("Content");
    expect(vorlage.team.leitung.name).toBe("Redaktion");
    expect(vorlage.bots.map((b) => b.name)).toEqual(["Redaktion", "Ideen", "Entwurf", "Lektorat"]);
  });

  it("eine Datei in falscher Form wird abgelehnt", async () => {
    await expect(ladeVorlage(join(__dirname, "../../../package.json"))).rejects.toThrow(
      "nicht die erwartete Form",
    );
  });
});
