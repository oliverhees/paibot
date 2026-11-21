/**
 * PaiBot – Render-Tests des Reiters „Selbsttest“: Liste mit Ergebnis als Wort, Ausweg, Ladezustand,
 * „Bitte selbst prüfen“; das Browser-Modul ruft nur `GET /api/selbsttest` und setzt keine Stile.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { readFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { API_ROUTEN } from "../../../../lib/routen";
import { pruefeNotAus, pruefeProxy, pruefeVersion } from "../../../../lib/selbsttest/pruefungen";
import { EINSTELLUNGEN_REITER } from "../EinstellungenRahmen";
import { PruefListe, SelbstPruefen, Selbsttest } from "./Selbsttest";

describe("Reiter Selbsttest", () => {
  it("ist ein Reiter der Einstellungen, kein eigener Eintrag der Seitenleiste", () => {
    expect(EINSTELLUNGEN_REITER.at(-1)).toMatchObject({
      id: "selbsttest",
      href: "/einstellungen/selbsttest",
    });
  });

  it("zeigt zuerst den Ladezustand und immer „Bitte selbst prüfen“", () => {
    const html = renderToStaticMarkup(h(Selbsttest, { zeitzone: "Europe/Berlin" }));
    expect(html).toContain("Ist meine Installation richtig eingestellt?");
    expect(html).toContain("PaiBot prüft deine Installation");
    expect(html).toContain("Bitte selbst prüfen");
  });

  it("jede Prüfung mit Titel, Ergebnis als Wort und Ausweg", () => {
    const html = renderToStaticMarkup(
      h(PruefListe, {
        pruefungen: [
          pruefeVersion("1.0.0"),
          pruefeNotAus(true),
          pruefeProxy({ vertraut: true, erkennbar: false }),
        ],
      }),
    );
    expect(html).toContain("In Ordnung");
    expect(html).toContain("Hinweis");
    expect(html).toContain("So behebst du es");
    expect(html.match(/<li/g)).toHaveLength(3);
  });

  it("„Bitte selbst prüfen“ nennt Proxy-Grenzen, Sicherung und Updates", () => {
    const html = renderToStaticMarkup(h(SelbstPruefen));
    expect(html).toContain("Grenzen im Reverse-Proxy");
    expect(html).toContain("zur Probe in eine frische Installation zurückgespielt");
    expect(html).toContain("Sicherung und Wiederherstellung");
    expect(html).toContain("Updates");
  });

  it("das Browser-Modul ruft nur GET /api/selbsttest, ohne Inline-Stile", () => {
    const quelltext = readFileSync(new URL("./Selbsttest.tsx", import.meta.url), "utf8");
    expect(API_ROUTEN.selbsttest).toMatchObject({ methode: "GET", pfad: "/api/selbsttest" });
    expect([...quelltext.matchAll(/fetch\(\s*"([^"]+)"/g)].map((m) => m[1])).toEqual([
      "/api/selbsttest",
    ]);
    expect(quelltext).not.toMatch(/style=|dangerouslySetInnerHTML|method:/);
  });
});
