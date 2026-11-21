/**
 * PaiBot – Render-Tests des Not-Aus: Schalter in beiden Zuständen, Leiste „angehalten“,
 * Rückfragen; das Browser-Modul ruft nur die Route aus dem Vertrag und setzt keine Inline-Stile.
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
import { API_ROUTEN } from "../../lib/routen";
import { NotAusDialog, NotAusKnopf, NotAusLeiste } from "./NotAus";

const nichts = () => undefined;

describe("Not-Aus in der Oberfläche", () => {
  it("Schalter aus: „Alle Bots laufen“, Knopf „Anhalten“, nicht gedrückt", () => {
    const html = renderToStaticMarkup(h(NotAusKnopf, { an: false, onClick: nichts }));
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-label="Not-Aus: alle Bots anhalten"');
    expect(html).toContain("Alle Bots laufen");
    expect(html).toContain("Anhalten");
  });

  it("Schalter an: „Angehalten“, Knopf „Fortsetzen“, gedrückt", () => {
    const html = renderToStaticMarkup(h(NotAusKnopf, { an: true, onClick: nichts }));
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Angehalten");
    expect(html).toContain("Fortsetzen");
  });

  it("Leiste nennt den Zustand und den Ausweg", () => {
    const html = renderToStaticMarkup(h(NotAusLeiste, { onFortsetzen: nichts }));
    expect(html).toContain('role="status"');
    expect(html).toContain("Alle Bots sind angehalten.");
    expect(html).toContain("Fortsetzen");
  });

  it("Rückfrage beim Anhalten ohne Passwort-Feld, beim Fortsetzen mit", () => {
    const an = renderToStaticMarkup(
      h(NotAusDialog, { frage: "an", onSchliessen: nichts, onGeschaltet: nichts }),
    );
    expect(an).toContain('role="alertdialog"');
    expect(an).toContain("Alle Bots anhalten?");
    expect(an).not.toContain('type="password"');
    const aus = renderToStaticMarkup(
      h(NotAusDialog, { frage: "aus", onSchliessen: nichts, onGeschaltet: nichts }),
    );
    expect(aus).toContain("Not-Aus aufheben?");
    expect(aus).toContain('type="password"');
    expect(aus).toContain('autoComplete="current-password"');
    const zu = renderToStaticMarkup(
      h(NotAusDialog, { frage: undefined, onSchliessen: nichts, onGeschaltet: nichts }),
    );
    expect(zu).toBe("");
  });

  it("das Browser-Modul ruft nur PUT /api/notaus und setzt keine Stile", () => {
    const quelltext = readFileSync(new URL("./NotAus.tsx", import.meta.url), "utf8");
    expect(API_ROUTEN.notausUmschalten).toMatchObject({ methode: "PUT", pfad: "/api/notaus" });
    expect(
      [...quelltext.matchAll(/apiFetch[^(]*\(\s*"(\w+)",\s*"([^"]+)"/g)].map(
        (m) => `${m[1]} ${m[2]}`,
      ),
    ).toEqual(["PUT /api/notaus"]);
    expect(quelltext).not.toMatch(/style=|dangerouslySetInnerHTML/);
  });
});
