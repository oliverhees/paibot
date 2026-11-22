/**
 * PaiBot – Tests der Umrechnung von Antworten der App-Routen in das, was die Bausteine der
 * Oberfläche anzeigen: Status und Einstufung, Hinweise der App nur als Anzeige, alle lesbaren
 * Schema-Texte, Zustand der App.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { describe, expect, it } from "vitest";
import {
  appFehlerArt,
  type WerkzeugAntwort,
  werkzeugEintrag,
  werkzeugSchemaTexte,
  zugriffZaehler,
} from "./ansicht";

const ABDRUCK = `sha256:${"a".repeat(64)}`;

function werkzeug(teil: Partial<WerkzeugAntwort> = {}): WerkzeugAntwort {
  return {
    id: "tool_01",
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

describe("werkzeugEintrag", () => {
  it("ein neues Werkzeug gilt als „schreibt“, auch wenn die App „nur lesend“ sagt", () => {
    const e = werkzeugEintrag(werkzeug({ hinweiseLautApp: { nurLesend: true, destruktiv: null } }));
    expect(e.status).toBe("neu");
    expect(e.serverHinweis).toBe("nur_lesend");
    // Der Hinweis der App ist nur Anzeige: Die Einstufung bleibt die des Besitzers.
    expect(e.art).toBe("schreibt");
    expect(e.id).toBe("tool_01");
    expect(e.fassung).toBe(ABDRUCK);
  });

  it("die Klasse des Besitzers bestimmt die Einstufung: lesen → liest, schreiben → schreibt", () => {
    expect(werkzeugEintrag(werkzeug({ stand: "bestaetigt", klasse: "lesen" })).art).toBe("liest");
    expect(werkzeugEintrag(werkzeug({ stand: "bestaetigt", klasse: "schreiben" })).art).toBe(
      "schreibt",
    );
  });

  it("vom Besitzer gesperrt: bestätigte Fassung mit Einstufung „gesperrt“", () => {
    const e = werkzeugEintrag(werkzeug({ stand: "gesperrt", klasse: "gesperrt" }));
    expect(e.status).toBe("bestaetigt");
    expect(e.art).toBe("gesperrt");
  });

  it("geändert und entfernt bleiben, wie sie sind", () => {
    expect(werkzeugEintrag(werkzeug({ stand: "geaendert" })).status).toBe("geaendert");
    expect(werkzeugEintrag(werkzeug({ stand: "entfernt" })).status).toBe("entfernt");
  });

  it("destruktiv laut App wird als „verändert“ angezeigt, sonst kein Hinweis", () => {
    expect(
      werkzeugEintrag(werkzeug({ hinweiseLautApp: { nurLesend: false, destruktiv: true } }))
        .serverHinweis,
    ).toBe("veraendert");
    expect(werkzeugEintrag(werkzeug()).serverHinweis).toBeUndefined();
  });

  it("der Text ans Modell kommt unverändert: Name und Beschreibung wie gespeichert", () => {
    const e = werkzeugEintrag(
      werkzeug({
        modellText: { name: "a__b", beschreibung: "<img src=x onerror=1> **fett**", schema: {} },
      }),
    );
    expect(e.name).toBe("a__b");
    expect(e.beschreibung).toBe("<img src=x onerror=1> **fett**");
  });
});

describe("werkzeugSchemaTexte", () => {
  it("nennt Feldnamen, Beschreibungen, Auswahlwerte, Vorgaben und Beispiele mit ihrem Pfad", () => {
    const texte = werkzeugSchemaTexte({
      type: "object",
      properties: {
        aufgabe: {
          type: "object",
          properties: {
            status: { type: "string", description: "Stand der Aufgabe", enum: ["offen", "fertig"] },
            anzahl: { type: "integer", default: 3, examples: [1, 2] },
          },
        },
      },
    });
    const art = (a: string) => texte.filter((x) => x.art === a);
    expect(art("feldname").map((x) => x.pfad)).toEqual([
      "aufgabe",
      "aufgabe.status",
      "aufgabe.anzahl",
    ]);
    expect(art("feldbeschreibung")).toEqual([
      { pfad: "aufgabe.status", art: "feldbeschreibung", text: "Stand der Aufgabe" },
    ]);
    expect(art("enum").map((x) => x.text)).toEqual(["offen", "fertig"]);
    expect(art("default").map((x) => x.text)).toEqual(["3"]);
    expect(art("beispiel").map((x) => x.text)).toEqual(["1", "2"]);
  });

  it("Texte bleiben Text: Markup und Adressen werden nicht verändert oder geladen", () => {
    const text = '<img src="https://boese.example/x.png"> [a](https://boese.example)';
    const texte = werkzeugSchemaTexte({
      type: "object",
      properties: { f: { type: "string", description: text } },
    });
    expect(texte.find((x) => x.art === "feldbeschreibung")?.text).toBe(text);
  });

  it("wirft nie und bleibt begrenzt: kaputte, zyklische und riesige Schemas", () => {
    expect(werkzeugSchemaTexte(undefined)).toEqual([]);
    expect(werkzeugSchemaTexte("kein Objekt")).toEqual([]);
    const kreis: Record<string, unknown> = { type: "object", properties: {} };
    (kreis.properties as Record<string, unknown>).selbst = kreis;
    expect(() => werkzeugSchemaTexte(kreis)).not.toThrow();
    const viele: Record<string, unknown> = {};
    for (let i = 0; i < 5000; i++) viele[`f${i}`] = { type: "string", description: `d${i}` };
    expect(werkzeugSchemaTexte({ type: "object", properties: viele }).length).toBeLessThanOrEqual(
      400,
    );
  });
});

describe("zugriffZaehler", () => {
  it("zählt die Bots mit Lese-Zugriff", () => {
    expect(
      zugriffZaehler([
        { botId: "bot_1", name: "Pai", zugriff: "lesen" },
        { botId: "bot_2", name: "Max", zugriff: "keiner" },
      ]),
    ).toBe(1);
  });
});

describe("appFehlerArt", () => {
  it("ordnet die Codes der Routen den Fehler-Texten der Oberfläche zu", () => {
    expect(appFehlerArt("app_nicht_erreichbar")).toBe("nicht_erreichbar");
    expect(appFehlerArt("app_zugang_ungueltig")).toBe("zugang_ungueltig");
    expect(appFehlerArt("app_adresse_unzulaessig")).toBe("adresse_unzulaessig");
    expect(appFehlerArt("app_kein_mcp")).toBe("kein_mcp");
    expect(appFehlerArt("app_befehl_nicht_erlaubt")).toBe("befehl_nicht_erlaubt");
    expect(appFehlerArt("app_version_unbekannt")).toBe("version_unbekannt");
    expect(appFehlerArt("app_braucht_eingabe")).toBe("braucht_eingabe");
  });

  it("unbekannte Codes gehören nicht zu den App-Fehlern", () => {
    expect(appFehlerArt("intern")).toBeUndefined();
    expect(appFehlerArt("limit_erreicht")).toBeUndefined();
  });
});
