/**
 * PaiBot – Tests der Info-Seite: geforderte Aussagen wörtlich, keine verbotenen Wörter, Links mit
 * `rel`, nichts von fremden Servern.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { ohneSteuerzeichen, t } from "@paibot/shared/texte";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InfoInhalt } from "./InfoInhalt";

const html = renderToStaticMarkup(
  h(InfoInhalt, {
    stand: "0.3.0+20261205.3f9c2ab",
    installation: "ins_06f8k2m9qz3w7x1c4b5n8p0r2t",
  }),
);
/** Sichtbarer Text ohne Tags, Entitäten aufgelöst. */
const text = ohneSteuerzeichen(
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " "),
);

describe("Info-Seite", () => {
  it("nennt Stand und Installations-ID", () => {
    expect(text).toContain("0.3.0+20261205.3f9c2ab");
    expect(text).toContain("ins_06f8k2m9qz3w7x1c4b5n8p0r2t");
  });

  it("nennt die Lizenz mit den zwei Sätzen in Nutzer-Sprache und verlinkt den Lizenztext", () => {
    expect(text).toContain("PaiBot Fair-Code-Lizenz 1.1, für eine Person");
    expect(text).toContain(
      "PaiBot ist für eine Person gedacht: privat und für deine eigene Arbeit.",
    );
    expect(text).toContain(
      "Für Teams und Unternehmen ist PaiBot Enterprise mit Support in Vorbereitung. Anfrage an hi@paibot.de.",
    );
    expect(html).toContain('href="https://github.com/oliverhees/paibot/blob/main/LICENSE"');
  });

  it("enthält den festen Lizenz-Absatz als <p> (Teil-Treffer)", () => {
    expect(html).toMatch(/<p[^>]*>PaiBot steht unter der PaiBot Fair-Code-Lizenz 1\.1\./);
    expect(html).toContain(`>${t("info.lizenz.text")}</p>`);
  });

  it("nennt HR CodeLabs mit Link, ohne Angebot, PaiBot einzurichten", () => {
    expect(text).toContain("Entwickelt von HR CodeLabs");
    expect(text).toContain("Powered by PaiBot · entwickelt von HR CodeLabs");
    expect(html).toContain('href="https://hr-codelabs.de"');
    expect(text).not.toMatch(/einricht|Einricht|beauftrag|Angebot|gegen Geld|Preis/);
  });

  it("nennt die Bestandteile Dritter mit den Schriften und ihrer Lizenz", () => {
    expect(text).toContain("Inter und Montserrat");
    expect(text).toContain("SIL Open Font License 1.1");
    expect(html).toContain(
      'href="https://github.com/oliverhees/paibot/blob/main/THIRD_PARTY_NOTICES.md"',
    );
  });

  it("führt zu Doku, Community und dem Meldeweg für Sicherheitslücken", () => {
    expect(html).toContain('href="https://paibot.de/doku"');
    expect(html).toContain('href="https://aiianer.de"');
    expect(html).toContain('href="https://github.com/oliverhees/paibot/blob/main/SECURITY.md"');
  });

  it("verbotene Wörter kommen nicht vor", () => {
    for (const wort of [
      /open[\s-]?source/i,
      /dsgvo/i,
      /gdpr/i,
      /zero[\s-]?knowledge/i,
      /kryptografisch bewiesen/i,
      /rechtssicher/i,
    ]) {
      expect(html).not.toMatch(wort);
    }
  });

  it("jeder Link nach außen öffnet in neuem Tab mit rel=noopener noreferrer und sagt das an", () => {
    const links = [...html.matchAll(/<a\b([^>]*)>/g)].map((m) => m[1] ?? "");
    expect(links.length).toBeGreaterThanOrEqual(10);
    for (const attribute of links) {
      expect(attribute).toMatch(/href="https:\/\//);
      expect(attribute).toContain('target="_blank"');
      expect(attribute).toContain('rel="noopener noreferrer"');
    }
    expect(html.split(t("info.neuer_tab")).length - 1).toBeGreaterThanOrEqual(links.length - 1);
  });

  it("lädt nichts von fremden Servern: keine Bilder, Skripte, Rahmen oder Stile von außen", () => {
    expect(html).not.toMatch(/<(img|script|iframe|link|style|object|embed)\b/);
    expect(html).not.toMatch(/\ssrc=/);
  });
});
