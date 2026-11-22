/**
 * PaiBot – Test: Das Formular „Verbindung einfügen“ lädt den Passwort-Manager nicht zum Speichern
 * des Tokens ein und schreibt ihn nie in die Adresse, auch wenn der Browser es je selbst absendete.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { NeuVerbindenForm, VerbindungForm, WerkzeugKarte } from "@paibot/ui";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

describe("Formular „Verbindung einfügen“", () => {
  // Gegenprobe: `method="post"` weglassen oder dem Token wieder einen Namen und „new-password“ geben → rot.
  it("sendet nie per GET, kennt kein Feld mit Namen und schaltet die Vorschläge des Browsers aus", () => {
    const html = renderToStaticMarkup(h(VerbindungForm, { onVerbinden: () => undefined }));
    expect(html).toMatch(/<form[^>]*method="post"/);
    expect(html).not.toContain("new-password");
    expect(html).not.toMatch(/<input[^>]*\sname=/);
    expect(html).toMatch(
      /<input[^>]*type="password"[^>]*autoComplete="off"|<input[^>]*autoComplete="off"[^>]*type="password"/i,
    );
  });
});

describe("Formular „Neu verbinden“", () => {
  const form = (tokenNoetig: boolean) =>
    renderToStaticMarkup(
      h(NeuVerbindenForm, {
        name: "Aufgaben",
        adresse: "https://aufgaben.beispiel.example/mcp",
        tokenNoetig,
        onVerbinden: () => undefined,
      }),
    );

  // Gegenprobe: `method="post"` weglassen oder dem Token einen Namen geben → rot.
  it("sendet nie per GET, kein Feld mit Namen, Token nur als Passwortfeld ohne Vorschläge", () => {
    const html = form(true);
    expect(html).toMatch(/<form[^>]*method="post"/);
    expect(html).not.toMatch(/<input[^>]*\sname=/);
    expect(html).toMatch(
      /<input[^>]*type="password"[^>]*autoComplete="off"|<input[^>]*autoComplete="off"[^>]*type="password"/i,
    );
    expect(html).toContain("https://aufgaben.beispiel.example/mcp");
  });

  // Gegenprobe: das Feld immer zeigen → rot.
  it("ohne Anmeldung per Token gibt es kein Token-Feld", () => {
    expect(form(false)).not.toContain('type="password"');
  });
});

describe("Karte mit „Was sich geändert hat“", () => {
  const karte = (status: "neu" | "geaendert" | "bestaetigt") =>
    renderToStaticMarkup(
      h(WerkzeugKarte, {
        name: "notiz_suchen",
        status,
        aenderungen: [{ feld: "beschreibung", vorher: "Alt-Text", nachher: "Neu-Text" }],
        bisher: "liest",
      }),
    );

  // Gegenprobe: den Abschnitt nur bei „geändert“ zeigen → der Fall „neu“ wird rot.
  it("steht bei „geändert“ und bei „neu“ mit früherer Einstufung, bei „bestätigt“ nicht", () => {
    for (const status of ["geaendert", "neu"] as const) {
      const html = karte(status);
      expect(html, status).toContain("Alt-Text");
      expect(html, status).toContain("Neu-Text");
    }
    expect(karte("bestaetigt")).not.toContain("Alt-Text");
  });

  it("die Sperre „wird nicht angeboten, bis du neu bestätigst“ steht nur bei „geändert“", () => {
    expect(karte("geaendert")).toContain('data-status="geaendert"');
    expect(karte("neu")).not.toMatch(/data-status="geaendert"/);
  });
});
