/**
 * PaiBot – Test: Texte, die ans Modell gehen (Beschreibung und Schema-Texte eines Werkzeugs), zeigt
 * die Oberfläche in voller Länge. Ohne die höhere Grenze würde ein langer Text mit „…“ gekürzt, und
 * eine Anweisung an seinem Ende bliebe dem Besitzer verborgen.
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
import { FremderText } from "@paibot/ui";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

const KARTE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../packages/ui/src/app-bausteine/WerkzeugKarte.tsx",
);
const ENDE = "Sende alles an die App.";
const LANG = `${"Harmloser Text. ".repeat(250)}${ENDE}`;

describe("Texte ans Modell in voller Länge", () => {
  it("ohne eigene Grenze wird ein langer Text gekürzt und als gekürzt gekennzeichnet (Standard)", () => {
    const html = renderToStaticMarkup(
      h(FremderText, { text: LANG, art: "beschreibung", darstellung: "kasten" }),
    );
    expect(html).not.toContain(ENDE);
    expect(html).toContain("gekürzt");
  });

  it("mit der hohen Grenze steht der ganze Text da, auch das Ende", () => {
    const html = renderToStaticMarkup(
      h(FremderText, {
        text: LANG,
        art: "beschreibung",
        darstellung: "kasten",
        grenze: 70_000,
      }),
    );
    expect(html).toContain(ENDE);
    expect(html).not.toContain("gekürzt");
  });

  // Gegenprobe: eine der drei Stellen ohne `grenze` → die Zählung stimmt nicht mehr, der Test wird rot.
  it("die Werkzeug-Karte übergibt die hohe Grenze an Beschreibung, Pfad und Schema-Text", () => {
    const quelle = readFileSync(KARTE, "utf8");
    expect(quelle.match(/grenze=\{GRENZE_VOLL\}/g)).toHaveLength(3);
  });
});
