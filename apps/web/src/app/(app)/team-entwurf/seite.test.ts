/**
 * PaiBot – Render-Tests der Seite „Team aus Vorlage“: ohne Entwurf stehen die Vorlagen da, mit
 * offenem Entwurf die Vorschau, nach dem Anlegen „Rückgängig“, und der Not-Aus sperrt das Anlegen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import { newId } from "@paibot/shared/ids";
import { t } from "@paibot/shared/texte";
import type { Vorlage } from "@paibot/ui";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TeamEntwurf } from "../../../lib/team/entwurf/format";
import type { EntwurfSeiteDaten, EntwurfSeiteEintrag } from "../../../lib/team/entwurf/seite";
import { TeamEntwurfSeite } from "./TeamEntwurfSeite";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }),
  usePathname: () => "/team-entwurf",
}));

const VORLAGE: Vorlage = {
  titel: "Content-Team",
  beschreibung: "Vier Bots für Texte.",
  team: {
    name: "Content",
    leitung: { name: "Redaktion" },
    zusammenarbeit: "leitung_fuehrt",
    abnahme: "leitung",
  },
  bots: [
    {
      name: "Redaktion",
      aufgabe: "Leitet",
      anweisung: "Wortlaut der Redaktion.",
      modell: "Wie Pai",
      form: "blatt",
      farbe: "blau",
    },
    {
      name: "Ideen",
      aufgabe: "Sammelt",
      anweisung: "Wortlaut der Ideen.",
      modell: "Wie Pai",
      form: "wabe",
      farbe: "gruen",
    },
  ],
};

const INHALT = {
  format: "pb-teamentwurf/v2",
  titel: VORLAGE.titel,
  team: VORLAGE.team,
  bots: VORLAGE.bots,
} as unknown as TeamEntwurf;

function eintrag(teil: Partial<EntwurfSeiteEintrag> = {}): EntwurfSeiteEintrag {
  return {
    id: newId("entwurf"),
    stand: "offen",
    abdruck: "a".repeat(64),
    vorlage: VORLAGE,
    inhalt: INHALT,
    ...teil,
  };
}

const seite = (teil: Partial<EntwurfSeiteDaten> = {}) =>
  renderToStaticMarkup(
    h(TeamEntwurfSeite, {
      daten: {
        vorlagen: [{ kennung: "content-team", titel: VORLAGE.titel, vorlage: VORLAGE }],
        entwuerfe: [],
        notAus: false,
        ...teil,
      },
    }),
  );

describe("Seite „Team aus Vorlage“", () => {
  it("ohne Entwurf stehen die Vorlagen aus dem Image da", () => {
    const html = seite();
    expect(html).toContain('data-baustein="vorlage"');
    expect(html).toContain("Content-Team");
    expect(html).toContain(t("teams.entwurf.vorlage_oeffnen"));
    // Ohne Entwurf gibt es nichts anzulegen.
    expect(html).not.toContain(t("teams.entwurf.anlegen"));
  });

  it("die Seite hat genau eine Hauptüberschrift – mit und ohne Entwurf", () => {
    // Die Vorschau bringt ihre eigene („Entwurf: Team …“). Stünde der Seitentitel immer da,
    // hätte die Seite zwei, und der Vorspann erklärte etwas, das schon auf dem Schirm liegt.
    const zaehle = (html: string) => (html.match(/<h1\b/gu) ?? []).length;
    const liste = seite();
    expect(zaehle(liste)).toBe(1);
    expect(liste).toContain(t("teams.entwurf.seite_titel"));
    const vorschau = seite({ entwuerfe: [eintrag()] });
    expect(zaehle(vorschau)).toBe(1);
    expect(vorschau).not.toContain(t("teams.entwurf.seite_vorspann"));
  });

  it("ohne Vorlagen sagt die Seite das, statt einen leeren Kasten zu zeigen", () => {
    expect(seite({ vorlagen: [] })).toContain(t("teams.entwurf.keine_vorlagen"));
  });

  it("mit offenem Entwurf steht die Vorschau da: voller Wortlaut, änderbar, Kosten-Hinweis", () => {
    const html = seite({ entwuerfe: [eintrag()] });
    expect(html).toContain(t("teams.entwurf.anlegen"));
    for (const b of VORLAGE.bots) expect(html, b.name).toContain(b.anweisung);
    expect(html).toContain("<textarea");
    expect(html).toContain(t("teams.entwurf.verwerfen"));
    // Die Vorlagen-Liste weicht, solange ein Entwurf offen ist.
    expect(html).not.toContain('data-baustein="vorlage"');
  });

  it("nach dem Anlegen steht „Rückgängig“ da und kein Feld mehr", () => {
    const html = seite({ entwuerfe: [eintrag({ stand: "angelegt", rueckgaengig: true })] });
    expect(html).toContain(t("teams.entwurf.rueckgaengig"));
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain(t("teams.entwurf.anlegen"));
  });

  it("der Not-Aus sperrt den Knopf zum Anlegen und sagt, warum", () => {
    const html = seite({ entwuerfe: [eintrag()], notAus: true });
    expect(html).toContain(t("teams.entwurf.gesperrt"));
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>(<svg.*?<\/svg>)?Team anlegen/);
    // Gegenprobe: ohne Not-Aus ist der Knopf frei und der Hinweis weg.
    const frei = seite({ entwuerfe: [eintrag()] });
    expect(frei).not.toContain(t("teams.entwurf.gesperrt"));
    expect(frei).not.toMatch(/<button[^>]*disabled=""[^>]*>(<svg.*?<\/svg>)?Team anlegen/);
  });

  it("der offene Entwurf gewinnt gegen einen älteren, auch wenn der neuer in der Liste steht", () => {
    const html = seite({
      entwuerfe: [eintrag({ stand: "verworfen" }), eintrag({ stand: "offen" })],
    });
    expect(html).toContain(t("teams.entwurf.anlegen"));
  });
});
