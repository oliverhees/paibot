/**
 * PaiBot – Tests der Markdown-Anzeige: Links, Bilder und Texte aus fremden Quellen (Antworten, die
 * sich auf Inhalte aus einer App stützen) sind nicht anklickbar und zeigen ihr volles Ziel samt
 * Abfrage-Teil; sonst bleibt alles wie bisher.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { Markdown } from "@paibot/ui";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

const TEXTE = { etikett: "Entwurf", kopieren: "Kopieren", kopiert: "Kopiert" };
const ZIEL = "https://sammler.example/pfad?zeile=ein+geheimer+text&id=7";

function zeige(text: string, fremd?: boolean) {
  return renderToStaticMarkup(
    h(Markdown, { text, blockTexte: TEXTE, ...(fremd === undefined ? {} : { fremd }) }),
  );
}

describe("Markdown ohne fremde Quelle (wie bisher)", () => {
  it("ein Link ist anklickbar, das Ziel steht gekürzt ohne Abfrage-Teil daneben", () => {
    const html = zeige(`[hier](${ZIEL})`);
    expect(html).toContain(`<a href="${ZIEL.replaceAll("&", "&amp;")}"`);
    expect(html).toContain("sammler.example/pfad…");
    expect(html).not.toContain("ein+geheimer+text</");
  });
});

describe("Markdown mit fremder Quelle", () => {
  it("ein Link ist nicht anklickbar und zeigt das volle Ziel samt Abfrage-Teil", () => {
    const html = zeige(`[hier](${ZIEL})`, true);
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("href=");
    expect(html).toContain("hier");
    expect(html).toContain("zeile=ein+geheimer+text&amp;id=7");
    expect(html).toContain("nicht anklickbar");
  });

  it("ein Bild wird nie geladen: nur Beschriftung und volles Ziel als Text", () => {
    const html = zeige(`![Ein Bild](${ZIEL})`, true);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<a ");
    expect(html).toContain("Ein Bild");
    expect(html).toContain("zeile=ein+geheimer+text&amp;id=7");
  });

  it("ein Link mit anderem Schema als http und https bleibt Text ohne Ziel", () => {
    const html = zeige("[x](javascript:alert(1))", true);
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("javascript:");
  });

  it("rohes HTML bleibt Text, auch hier", () => {
    const html = zeige('<a href="https://boese.example">klick</a>', true);
    expect(html).not.toContain("<a ");
  });
});
