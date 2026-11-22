/**
 * PaiBot – Test: Der Umschalter für den Zugriff eines Bots behauptet nie, der Zugriff lasse sich
 * bei gesetztem Not-Aus nicht ändern (er lässt sich ändern; der Not-Aus hält nur die Aufrufe an).
 * Es gibt dafür weder eine Eigenschaft noch einen Text; nur der Hinweis zum Not-Aus bleibt.
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
import { isTextKey } from "@paibot/shared/texte";
import { ZugriffUmschalter } from "@paibot/ui";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

const QUELLE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../packages/ui/src/app-bausteine/ZugriffUmschalter.tsx",
);

describe("ZugriffUmschalter und Not-Aus", () => {
  it("der Baustein kennt keine Sperre durch den Not-Aus: weder Eigenschaft noch Text", () => {
    const quelle = readFileSync(QUELLE, "utf8");
    expect(quelle).not.toMatch(/gesperrt/);
    expect(isTextKey("apps.zugriff.notaus")).toBe(false);
  });

  it("die Knöpfe sind bedienbar und der Text sagt nichts von einer Sperre", () => {
    const html = renderToStaticMarkup(
      h(ZugriffUmschalter, {
        bot: { name: "Pai" },
        app: "Notizen",
        wert: "keiner",
        lesendeWerkzeuge: 1,
        onAendern: () => undefined,
      }),
    );
    expect(html).not.toContain("disabled");
    expect(html).not.toContain("nicht ändern");
    expect(html).toContain("Pai sieht keine Werkzeuge dieser App.");
  });
});
