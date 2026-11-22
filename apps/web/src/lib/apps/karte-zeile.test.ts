/**
 * PaiBot – Tests zu zwei Bausteinen, die fremden Text oder eine gesehene Fassung tragen: Die Karte
 * schickt beim Einstufen die Fassung vom Öffnen des Felds, und die Chat-Zeile „Werkzeug aus der
 * App“ bereinigt und kürzt App- und Werkzeug-Namen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WerkzeugZeile } from "@paibot/ui";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

const KARTE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../packages/ui/src/app-bausteine/WerkzeugKarte.tsx",
);

describe("WerkzeugKarte: gesehene Fassung", () => {
  const quelle = readFileSync(KARTE, "utf8");

  // Gegenprobe: `onEinstufen?.(wahl, fassung)` statt `gesehen` oder `setGesehen` weglassen → rot.
  // Das Schließen bei einer neuen Fassung allein deckte den Fehler im Browser zu; deshalb prüft
  // dieser Test die Zuordnung selbst.
  it("merkt sich die Fassung beim Öffnen und schickt beim Bestätigen genau diese, nie die aus den Eigenschaften", () => {
    expect(quelle).toMatch(/setGesehen\(fassung\)/);
    expect(quelle).toMatch(/onEinstufen\?\.\(wahl, gesehen\)/);
    expect(quelle).not.toMatch(/onEinstufen\?\.\(wahl, fassung\)/);
  });

  it("schließt das Feld, wenn sich die Fassung ändert", () => {
    expect(quelle).toMatch(/offen && gesehen !== fassung/);
  });
});

describe("WerkzeugZeile: Name der App und des Werkzeugs", () => {
  const zeile = (app: { kurzname: string; name?: string; werkzeug: string }) =>
    renderToStaticMarkup(
      h(WerkzeugZeile, {
        titel: "Werkzeug aus der App",
        app,
        status: "fertig",
        offen: false,
        onUmschalten: () => undefined,
      }),
    );

  // Gegenprobe: in `WerkzeugZeile` statt `FremderText` den Rohtext einsetzen → rot.
  it("entfernt Steuer-, Richtungs- und unsichtbare Zeichen aus App-Name und Werkzeug", () => {
    const verboten = ["\u202e", "\u200b", "\u2066", "\u0007"];
    const html = zeile({
      kurzname: "x",
      name: `Aufgaben${verboten[0]}${verboten[1]}${verboten[3]}Ende`,
      werkzeug: `liste${verboten[2]}${verboten[1]}.heute`,
    });
    for (const zeichen of verboten)
      expect(html.includes(zeichen), JSON.stringify(zeichen)).toBe(false);
    expect(html).toContain("AufgabenEnde");
    expect(html).toContain("liste.heute");
  });

  it("kürzt einen langen Namen mit „…“", () => {
    const html = zeile({ kurzname: "x", name: "a".repeat(500), werkzeug: "w" });
    expect(html).not.toContain("a".repeat(100));
    expect(html).toContain("…");
  });

  it("Markup und Markdown im Namen bleiben Text", () => {
    const html = zeile({
      kurzname: "x",
      name: "<script>x()</script> [a](https://boese.example)",
      werkzeug: "w",
    });
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toMatch(/<a [^>]*boese/);
  });
});
