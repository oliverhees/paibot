/**
 * PaiBot – Tests der Seite „Apps“ im Server-Rendering: leerer Zustand, Liste mit Werkzeugen, Texte
 * aus der App nur als Text, Not-Aus-Hinweis, getrennte Apps ohne Aktionen, Seiten für Laden und
 * Fehler. Das Verhalten im Browser (Klicks, Netzwerk, mobile Breite) prüft `pnpm apps:browser`.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { WerkzeugAntwort } from "../../../lib/apps/ansicht";
import { AppsAnsicht, type AppsAnsichtEintrag } from "./AppsAnsicht";
import Fehler from "./error";
import Laedt from "./loading";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const ABDRUCK = `sha256:${"b".repeat(64)}`;

function werkzeug(teil: Partial<WerkzeugAntwort> = {}): WerkzeugAntwort {
  return {
    id: "wzg_01",
    version: 1,
    stand: "neu",
    klasse: "schreiben",
    abdruck: ABDRUCK,
    modellText: {
      name: "notizen__suche",
      beschreibung: "Sucht Notizen.",
      schema: { type: "object", properties: { frage: { type: "string" } } },
    },
    hinweiseLautApp: { nurLesend: null, destruktiv: null },
    ...teil,
  };
}

function app(teil: Partial<AppsAnsichtEintrag> = {}): AppsAnsichtEintrag {
  return {
    id: "app_01",
    kurzname: "notizen",
    name: "Notizen",
    adresse: "https://mcp.beispiel.de/mcp",
    anmeldung: "token",
    tokenGesetzt: true,
    zustand: "verbunden",
    verbindungsNummer: 1,
    verbundenAm: "2026-11-22T10:00:00.000Z",
    getrenntAm: null,
    zugriff: [{ botId: "bot_01", name: "Pai", zugriff: "keiner" }],
    werkzeuge: [werkzeug()],
    ...teil,
  } as AppsAnsichtEintrag;
}

const zeige = (apps: AppsAnsichtEintrag[], notAus = false) =>
  renderToStaticMarkup(h(AppsAnsicht, { apps, notAus }));

describe("Seite „Apps“", () => {
  it("ohne App: leerer Zustand mit dem Weg zum Verbinden, ohne Liste", () => {
    const html = zeige([]);
    expect(html).toContain("Noch keine App verbunden");
    expect(html).toContain("Verbindung einfügen");
    expect(html).not.toContain("<form");
  });

  it("mit App: Name, Adresse ohne Abfrage-Teil, Kennzahlen, Knopf zum Verbinden einer weiteren", () => {
    const html = zeige([app({ adresse: "https://mcp.beispiel.de/mcp?schluessel=geheim" })]);
    expect(html).toContain("Notizen");
    expect(html).toContain("mcp.beispiel.de/mcp");
    expect(html).not.toContain("geheim");
    expect(html).toContain("App verbinden");
    expect(html).toContain("1 Werkzeug");
  });

  it("Text aus der App erscheint nur als Text: kein Bild, kein Link, kein Markdown, keine Adresse geladen", () => {
    const html = zeige([
      app({
        name: '<img src="https://boese.example/x.png"> **Notizen**',
        werkzeuge: [
          werkzeug({
            modellText: {
              name: "a__b",
              beschreibung:
                '<img src="https://boese.example/y.png"> [Klick](https://boese.example)',
              schema: {},
            },
          }),
        ],
      }),
    ]);
    // Offen ist nur die Zeile; die Werkzeuge klappen erst nach dem Öffnen auf.
    expect(html).not.toContain("<img");
    expect(html).not.toContain('href="https://boese.example');
    // Als Text darf `src=` vorkommen (maskiert: `&lt;img src=&quot;…`), als Attribut nie.
    expect(html).not.toMatch(/\ssrc="/);
    expect(html).toContain("&lt;img src=&quot;https://boese.example/x.png&quot;");
    expect(html).not.toContain("<strong>Notizen");
  });

  it("Not-Aus: Hinweis oben, Zeile „angehalten“, Zugriff bleibt änderbar", () => {
    const html = zeige([app()], true);
    expect(html).toContain("Not-Aus aktiv");
    expect(html).toContain("angehalten");
  });

  it("getrennte App: eigener Abschnitt ohne Werkzeuge und ohne Aktionen, mit der Zeit der Trennung", () => {
    const html = zeige([
      app({
        id: "app_02" as AppsAnsichtEintrag["id"],
        name: "Alt",
        zustand: "getrennt",
        getrenntAm: "2026-11-21T09:00:00.000Z",
        getrenntText: "21.11.2026, 10:00",
        werkzeuge: [],
      }),
    ]);
    expect(html).toContain("Getrennte Apps");
    expect(html).toContain("Alt");
    expect(html).toContain("getrennt am 21.11.2026, 10:00");
    expect(html).not.toContain("Erneut testen");
    expect(html).not.toContain("Trennen");
    // Ohne verbundene App steht oben der leere Zustand.
    expect(html).toContain("Noch keine App verbunden");
  });

  it("der Token steht in keiner Seite: weder die Adresse noch ein Feld enthält ihn", () => {
    const html = zeige([app({ tokenGesetzt: true })]);
    expect(html).not.toContain("tok-");
    expect(html).not.toContain('type="password"');
  });
});

describe("Laden und Fehler der Seite", () => {
  it("Laden: eine Zeile mit Status, kein Inhalt der Seite", () => {
    const html = renderToStaticMarkup(h(Laedt));
    expect(html).toContain('role="status"');
    expect(html).toContain("Apps werden geladen");
  });

  it("Fehler: fester Satz mit Ausweg und Knopf, nie der Text des Fehlers", () => {
    const html = renderToStaticMarkup(
      h(Fehler, {
        error: new Error("Datenbank: Failing row contains tok-geheim"),
        reset: () => undefined,
      }),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Die Apps lassen sich gerade nicht laden");
    expect(html).toContain("Seite neu laden");
    expect(html).not.toContain("geheim");
  });
});
