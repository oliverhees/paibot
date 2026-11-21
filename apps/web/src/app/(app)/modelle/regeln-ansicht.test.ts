/**
 * PaiBot – Darstellungs-Tests über `react-dom/server`: Karte „Routing-Regeln“ (früherer Eintrag
 * mit Hinweis zum Umstellen, keine EU-Angabe), Anbieter-Auswahl (neutral sortiert, Konto-Link ohne
 * Provisions-Hinweis) und die Seite ohne pauschales „EU“.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { Provider } from "@paibot/shared/objekte";
import { t } from "@paibot/shared/texte";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AnbieterAuswahl } from "../../AnbieterAuswahl";
import { RegelnKarte } from "./RegelnKarte";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const EUROUTER: Provider = {
  id: "prv_01JD0000000000000000000002",
  kind: "openai_compatible",
  templateKey: "eurouter",
  name: "EUrouter",
  baseUrl: "https://api.eurouter.ai/v1",
  region: "eu",
  keySet: true,
  enabled: true,
  createdAt: "2026-11-21T10:00:00.000Z",
  updatedAt: "2026-11-21T10:00:00.000Z",
} as Provider;

const ALT = { id: "mod_01JD0000000000000000000009", slug: "nebul/glm-5.3", displayName: "GLM 5.3" };
const nichts = () => undefined;

/** Sichtbarer Text ohne Tags. */
const text = (html: string) => html.replace(/<[^>]+>/g, " ");

describe("Karte Routing-Regeln", () => {
  it("früherer Eintrag aus der Liste: benutzbar, mit Hinweis zum Umstellen, ohne EU", () => {
    const html = renderToStaticMarkup(
      h(RegelnKarte, {
        anbieter: EUROUTER,
        botName: "Pai",
        regeln: [],
        alte: [ALT],
        modell: {
          id: ALT.id as never,
          displayName: ALT.displayName,
          slug: ALT.slug,
          anbieter: "EUrouter",
          anbieterId: EUROUTER.id as never,
          region: "eu",
          herkunft: "über EUrouter",
        },
        onRegeln: nichts,
        onModell: nichts,
      }),
    );
    expect(html).toContain(t("regelkarte.alt.hinweis", { name: "Pai", anbieter: "EUrouter" }));
    expect(html).toContain(t("regelkarte.eintrag.alt"));
    expect(html).toContain(`value="${ALT.id}"`);
    expect(text(html).split(/\s+/)).not.toContain(t("modelle.region.eu"));
  });

  it("geprüfte Regeln zur Wahl, Feld für den Namen und ehrlicher Hinweis auf die Kosten", () => {
    const html = renderToStaticMarkup(
      h(RegelnKarte, {
        anbieter: EUROUTER,
        botName: "Pai",
        regeln: [{ id: "mod_01JD0000000000000000000010", name: "EU Beispiel" }],
        alte: [],
        onRegeln: nichts,
        onModell: nichts,
      }),
    );
    expect(html).toContain("EU Beispiel");
    expect(html).toContain(t("regelkarte.name.feld"));
    expect(html).toContain(t("anbieterwahl.regeln.kosten", { anbieter: "EUrouter" }));
    expect(html).not.toContain(t("regelkarte.alt.hinweis", { name: "Pai", anbieter: "EUrouter" }));
  });
});

describe("Anbieter-Auswahl", () => {
  it("drei Wege in fester Reihenfolge, Konto-Links ohne Provisions-Hinweis, Aussagen mit Stand", () => {
    const html = renderToStaticMarkup(h(AnbieterAuswahl, { wert: undefined, onWahl: nichts }));
    const reihenfolge = [
      t("anbieterwahl.eurouter.titel"),
      t("anbieterwahl.mistral.titel"),
      t("anbieterwahl.eigener.titel"),
    ].map((titel) => html.indexOf(titel));
    expect(reihenfolge.every((i) => i >= 0)).toBe(true);
    expect([...reihenfolge].sort((a, b) => a - b)).toEqual(reihenfolge);
    expect(html).toContain('href="https://www.eurouter.ai/sign-up"');
    expect(html).toContain('href="https://console.mistral.ai/"');
    expect(html.match(/rel="noopener noreferrer"/g)?.length).toBe(2);
    expect(html).not.toContain(t("anbieterwahl.empfehlung"));
    expect(html).toContain("Stand: 21.11.2026");
    expect(html.toLowerCase()).not.toContain("dsgvo");
  });
});
