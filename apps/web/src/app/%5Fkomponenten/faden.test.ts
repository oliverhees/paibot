/**
 * PaiBot – Render-Tests der Fäden: Bot-Text bleibt Text, Schwellen, Marken, Ergebnis-Karte, Grenzen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import {
  beispielSzene,
  FadenAnsicht,
  FadenKopf,
  type FadenKopfDaten,
  type FadenSzene,
  GEFAEHRLICHER_TEXT,
  GespraechsBeitrag,
  GrenzenKarte,
  SZENEN,
  type SzenenId,
} from "@paibot/ui";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

const RLO = String.fromCharCode(0x202e);

const zeige = (szene: FadenSzene) =>
  renderToStaticMarkup(h(FadenAnsicht, { szene, ohneMerken: true }));
const szenen = SZENEN.map((s) => s.id as SzenenId);

function mitGefahr(s: FadenSzene): FadenSzene {
  return {
    ...s,
    gespraech: s.gespraech.map((e) =>
      e.art === "beitrag" && e.von !== "du"
        ? { ...e, text: GEFAEHRLICHER_TEXT, untrusted: true }
        : e,
    ),
    ...(s.kopf?.fragen
      ? {
          kopf: {
            ...s.kopf,
            fragen: s.kopf.fragen.map((f) => ({ ...f, text: GEFAEHRLICHER_TEXT, untrusted: true })),
          },
        }
      : {}),
  };
}

describe("Fäden: jede Szene rendert", () => {
  for (const id of szenen) {
    it(id, () => {
      const html = zeige(beispielSzene(id));
      expect(html.length).toBeGreaterThan(500);
      expect(html).toContain('data-baustein="ansicht"');
    });
  }
});

describe("Fäden: Pflichten der Oberfläche", () => {
  it("‚Neu erzeugen‘ wird im Faden nirgends angeboten", () => {
    for (const id of szenen) {
      expect(zeige(beispielSzene(id)).toLowerCase()).not.toContain("neu erzeugen");
    }
  });

  it("nichts kennzeichnet ‚EU‘ oder ‚sicher‘", () => {
    for (const id of szenen) {
      const html = zeige(beispielSzene(id));
      expect(html).not.toMatch(/\bEU\b/);
      expect(html.toLowerCase()).not.toContain("sicher");
    }
  });

  it("Bot-Text mit <script>, Bild und Richtungszeichen bleibt Text", () => {
    for (const id of ["arbeitet", "wartet", "gross"] as const) {
      const html = zeige(mitGefahr(beispielSzene(id)));
      // Der Text steht maskiert da (Gegenprobe: ohne Maskierung stünde hier ein echtes Element).
      expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
      expect(html).not.toContain("<script");
      expect(html).not.toContain("<img");
      expect(html).not.toContain(RLO);
      // Die Adresse im Text wird nicht anklickbar und nicht geladen.
      expect(html).not.toMatch(/<a[\s>]/);
      expect(html).not.toMatch(/src="https:/);
    }
  });

  it("Bot-Namen werden bereinigt und gekürzt", () => {
    const s = beispielSzene("arbeitet");
    const ben = s.bots.ben;
    if (!ben) throw new Error("Beispiel fehlt");
    const lang: FadenSzene = {
      ...s,
      bots: { ...s.bots, ben: { ...ben, name: `Be${RLO}n ${"x".repeat(300)}` } },
    };
    const html = zeige(lang);
    expect(html).not.toContain(RLO);
    expect(html).not.toContain("x".repeat(60));
  });

  it("‚dran‘ ist nur Anzeige: zwei Marken aus den Daten, nicht aus dem Text ‚ihr seid dran‘", () => {
    const html = zeige(beispielSzene("arbeitet"));
    expect(html).toContain("ihr seid dran");
    expect(html.match(/data-marke="dran"/g)?.length).toBe(2);
    // Gegenprobe: ohne Marken in den Daten gibt es keine, auch wenn der Text es sagt.
    const s = beispielSzene("arbeitet");
    const ohne: FadenSzene = {
      ...s,
      ...(s.kopf
        ? { kopf: { ...s.kopf, stab: s.kopf.stab.map((p) => ({ ...p, dran: false })) } }
        : {}),
    };
    expect(zeige(ohne)).not.toContain('data-marke="dran"');
  });

  it("der Knopf ‚+10.000 Token‘ steht nur in der Grenzen-Karte", () => {
    for (const id of szenen) {
      const html = zeige(beispielSzene(id));
      if (id === "grenze") expect(html).toContain("+10.000 Token für diesen Auftrag");
      else expect(html).not.toContain("+10.000");
    }
    const html = zeige(beispielSzene("grenze"));
    expect(html).toContain("gilt für diesen Auftrag, Tagesbudget bleibt");
    expect(html).toContain("Zuschlag 1 von 5");
  });

  it("der sechste Zuschlag ist gesperrt", () => {
    const g = beispielSzene("grenze").gespraech.find((e) => e.art === "grenze");
    if (g?.art !== "grenze") throw new Error("Beispiel fehlt");
    const offen = renderToStaticMarkup(
      h(GrenzenKarte, { daten: { ...g, zuschlaege: { benutzt: 4, max: 5 } } }),
    );
    expect(offen).not.toMatch(/data-wahl="zuschlag"[^>]*disabled/);
    expect(offen).toContain("Zuschlag 5 von 5");
    const voll = renderToStaticMarkup(
      h(GrenzenKarte, { daten: { ...g, zuschlaege: { benutzt: 5, max: 5 } } }),
    );
    expect(voll).toMatch(
      /disabled=""[^>]*data-wahl="zuschlag"|data-wahl="zuschlag"[^>]*disabled=""/,
    );
    expect(voll).toContain("Alle 5 Zuschläge");
  });
});

describe("Fäden: Kopf, Schwellen, Ergebnis-Karte", () => {
  const klein = (): FadenKopfDaten => {
    const k = beispielSzene("arbeitet").kopf;
    if (!k) throw new Error("Beispiel fehlt");
    return k;
  };
  const bots = beispielSzene("arbeitet").bots;
  const kopf = (daten: FadenKopfDaten) => renderToStaticMarkup(h(FadenKopf, { daten, bots }));

  it("kleiner Faden startet offen, mit fünf Zielen als schmale Zeile", () => {
    expect(kopf(klein())).toContain('data-zu="false"');
    const k = klein();
    const fuenf: FadenKopfDaten = {
      ...k,
      etappen: [
        {
          id: "x",
          ziele: [...(k.etappen[0]?.ziele ?? []), { id: "z5", text: "Fünftes", stand: "offen" }],
        },
      ],
    };
    expect(kopf(fuenf)).toContain('data-zu="true"');
  });

  it("sechs Beteiligte starten als schmale Zeile, fünf nicht", () => {
    expect(kopf({ ...klein(), beteiligte: 5 })).toContain('data-zu="false"');
    expect(kopf({ ...klein(), beteiligte: 6 })).toContain('data-zu="true"');
  });

  it("die schmale Zeile ist ein Knopf mit aria-expanded=false, der offene Kopf hat einen Griff mit true", () => {
    const zu = kopf({ ...klein(), beteiligte: 6 });
    expect(zu).toMatch(/<button[^>]*aria-expanded="false"/);
    const offen = kopf(klein());
    expect(offen).toMatch(
      /<button[^>]*aria-expanded="true"[^>]*aria-label="Kopf einklappen"|aria-label="Kopf einklappen"[^>]*aria-expanded="true"/,
    );
  });

  it("die Leiste öffnet sich ab der Schwelle von selbst", () => {
    expect(zeige(beispielSzene("arbeitet"))).toContain('data-leiste="false"');
    expect(zeige(beispielSzene("gross"))).toContain('data-leiste="true"');
  });

  it("Ergebnis-Karte nur bei Stand ‚fertig‘ mit Ergebnis", () => {
    const fertig = beispielSzene("fertig").kopf;
    if (!fertig) throw new Error("Beispiel fehlt");
    expect(kopf(fertig)).toContain('data-stand="fertig"');
    expect(kopf(fertig)).toContain("Fertig: Plakat und Drehplan");
    // Gegenprobe: Ergebnis da, aber der Server sagt nicht ‚fertig‘ → keine Karte
    const laeuft = kopf({ ...fertig, stand: "laeuft" });
    expect(laeuft).not.toContain("Fertig: Plakat und Drehplan");
    expect(laeuft).not.toContain('data-stand="fertig"');
    // fertig ohne Ergebnis → ebenfalls keine Karte
    const { ergebnis: _weg, ...ohne } = fertig;
    expect(kopf(ohne)).not.toContain("Fertig: Plakat und Drehplan");
  });

  it("Stempel und Abnahme-Karte nur aus dem Stand des Servers, nicht aus dem Text", () => {
    const beitrag = (abnahme?: { text: string; fertig: boolean }, text = "Passt.") =>
      renderToStaticMarkup(
        h(GespraechsBeitrag, {
          bots,
          beitrag: {
            art: "beitrag",
            id: "b",
            von: "mila",
            zeit: "1",
            text,
            filter: "ergebnis",
            ...(abnahme ? { abnahme } : {}),
          },
        }),
      );
    expect(beitrag({ text: "alle Punkte", fertig: true })).toContain('data-baustein="stempel"');
    expect(beitrag({ text: "alle Punkte", fertig: false })).not.toContain(
      'data-baustein="stempel"',
    );
    const nurText = beitrag(undefined, "✔ Abgenommen");
    expect(nurText).not.toContain('data-baustein="stempel"');
    expect(nurText).not.toContain('data-baustein="abnahme"');
  });
});

describe("Fäden: Fragen und Vorschläge", () => {
  it("Vorschläge sind Knöpfe vom Typ button, nie submit, und zeigen feste Texte", () => {
    const html = zeige(beispielSzene("wartet"));
    const chips = html.match(/<button[^>]*aria-label="Antwort einsetzen:[^"]*"[^>]*>/g) ?? [];
    expect(chips.length).toBeGreaterThanOrEqual(4);
    for (const c of chips) {
      expect(c).toContain('type="button"');
      expect(c).not.toContain('type="submit"');
    }
  });

  it("Möglichkeit mit Link erzeugt keine Vorschläge (Szene mit unzulässiger Möglichkeit)", () => {
    const s = beispielSzene("wartet");
    const k = s.kopf;
    if (!k?.fragen) throw new Error("Beispiel fehlt");
    const ohne: FadenSzene = {
      ...s,
      kopf: { ...k, fragen: k.fragen.map((f) => ({ ...f, vorschlaege: [] })) },
    };
    const html = zeige(ohne);
    expect(html).not.toContain("Antwort einsetzen:");
    expect(html).toContain("Selbst antworten");
  });
});

describe("Fäden: erkannte Zeilen", () => {
  it("der erkannte Zettel steht als Text hinter einem Knopf und Bot-Zeilen sind nicht klickbar", () => {
    const html = zeige(beispielSzene("arbeitet"));
    expect(html).toContain("Übergabe an Juri erkannt");
    expect(html).toContain("vom Tor erlaubt");
    expect(html).toContain("Zettel zeigen");
  });
});
