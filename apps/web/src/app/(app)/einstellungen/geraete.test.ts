/**
 * PaiBot – Tests der Ansicht „Bekannte Geräte“ und der Leiste „Neue Anmeldung“: Logik ohne DOM,
 * Render über `react-dom/server`, Browser-Module ohne Zod und nur mit Routen des Vertrags.
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
import { geraeteSortiert, hinweisTexte } from "../../../lib/einstellungen/geraete";
import type { GeraetZeile } from "../../../lib/einstellungen/typen";
import { API_ROUTEN } from "../../../lib/routen";
import { NeueAnmeldung } from "../NeueAnmeldung";
import { Geraete } from "./Geraete";
import { Zugang } from "./Zugang";

const FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0";
const SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

function zeile(teil: Partial<GeraetZeile> & { id: string }): GeraetZeile {
  return {
    art: "browser",
    angelegt: "2026-11-20T10:00:00.000Z",
    zuletzt: "2026-11-20T10:00:00.000Z",
    endet: "2027-02-18T10:00:00.000Z",
    aktuell: false,
    ...teil,
  };
}

describe("geraeteSortiert", () => {
  it("dieses Gerät zuerst, dann zuletzt gesehene zuerst", () => {
    const liste = [
      zeile({ id: "ger_a", zuletzt: "2026-11-20T09:00:00.000Z" }),
      zeile({ id: "ger_b", zuletzt: "2026-11-21T09:00:00.000Z" }),
      zeile({ id: "ger_c", zuletzt: "2026-11-01T09:00:00.000Z", aktuell: true }),
    ];
    expect(geraeteSortiert(liste).map((g) => g.id)).toEqual(["ger_c", "ger_b", "ger_a"]);
    expect(liste.map((g) => g.id)).toEqual(["ger_a", "ger_b", "ger_c"]);
  });
});

describe("hinweisTexte", () => {
  it("Entfernen, Verdrängen und „alle abgemeldet“: eigener Titel, je eine Zeile", () => {
    const t = hinweisTexte(
      [
        { id: "ger_a", art: "entfernt", name: FIREFOX, angelegt: "2026-11-21T13:05:00.000Z" },
        { id: "ger_b", art: "verdraengt", name: SAFARI, angelegt: "2026-11-21T12:00:00.000Z" },
        { id: "ger_c", art: "alle", angelegt: "2026-11-20T09:00:00.000Z", anzahl: 3 },
        { id: "ger_d", art: "neu", name: SAFARI, angelegt: "2026-11-20T08:00:00.000Z" },
      ],
      "Europe/Berlin",
    );
    expect(t.titel).toBe("Änderungen an deinen Geräten");
    expect(t.zeilen).toEqual([
      "Entfernt: Firefox auf Linux, am 21.11.2026, 14:05",
      "Abgemeldet, weil ein weiteres Gerät dazukam (höchstens zehn): Safari auf iPhone, am 21.11.2026, 13:00",
      "Alle Geräte abgemeldet (3), am 20.11.2026, 10:00",
      "Neu angemeldet: Safari auf iPhone, am 20.11.2026, 09:00",
    ]);
  });

  it("ein Gerät: Titel in der Einzahl, grobe Angabe und Zeit in der Zeitzone", () => {
    const t = hinweisTexte(
      [{ id: "ger_a", name: SAFARI, angelegt: "2026-11-21T13:05:00.000Z" }],
      "Europe/Berlin",
    );
    expect(t.titel).toBe("Neue Anmeldung von einem neuen Gerät");
    expect(t.zeilen).toEqual(["Safari auf iPhone, am 21.11.2026, 14:05"]);
  });

  it("mehrere Geräte und eines ohne Kennung", () => {
    const t = hinweisTexte(
      [
        { id: "ger_a", name: FIREFOX, angelegt: "2026-11-21T13:05:00.000Z" },
        { id: "ger_b", angelegt: "2026-11-21T12:00:00.000Z" },
      ],
      "UTC",
    );
    expect(t.titel).toBe("Neue Anmeldungen von 2 neuen Geräten");
    expect(t.zeilen).toEqual([
      "Firefox auf Linux, am 21.11.2026, 13:05",
      "Gerät ohne Angabe, am 21.11.2026, 12:00",
    ]);
  });
});

describe("Leiste „Neue Anmeldung“", () => {
  it("ohne neue Geräte: nichts", () => {
    expect(renderToStaticMarkup(h(NeueAnmeldung, { neue: [], zeitzone: "UTC" }))).toBe("");
  });

  it("mit neuem Gerät: Bereich mit Namen, Angabe, Zeit und beiden Antworten", () => {
    const html = renderToStaticMarkup(
      h(NeueAnmeldung, {
        neue: [{ id: "ger_a", name: SAFARI, angelegt: "2026-11-21T13:05:00.000Z" }],
        zeitzone: "Europe/Berlin",
      }),
    );
    expect(html).toContain('aria-label="Hinweis auf neue Anmeldung"');
    expect(html).toContain("Neue Anmeldung von einem neuen Gerät");
    expect(html).toContain("Safari auf iPhone, am 21.11.2026, 14:05");
    expect(html).toContain("<span>Das war ich</span>");
    expect(html).toMatch(/aria-expanded="false"[^>]*><span>Das war ich nicht<\/span>/);
    // Die Wege zum Sichern erscheinen erst nach „Das war ich nicht“.
    expect(html).not.toContain("Passwort ändern");
    // Keine Adresse, keine Kennung im Text.
    expect(html).not.toContain("ger_a");
  });
});

describe("Ansicht „Bekannte Geräte“", () => {
  const html = renderToStaticMarkup(h(Geraete, { zeitzone: "Europe/Berlin" }));

  it("hat eine Überschrift und lädt die Liste erst im Browser", () => {
    expect(html).toMatch(/<h2 id="geraete-titel"[^>]*>Bekannte Geräte<\/h2>/);
    expect(html).toContain("Lädt …");
    expect(html).toContain("ihre Sitzungen enden sofort");
  });

  it("steht im Reiter Zugang zwischen Passwort und Sitzungen; Sprungziele für den Hinweis", () => {
    const zugang = renderToStaticMarkup(
      h(Zugang, { zeitzone: "Europe/Berlin", passwortMin: 12, passwortGeaendert: false }),
    );
    const passwort = zugang.indexOf('id="passwort-titel"');
    const geraete = zugang.indexOf('id="geraete-titel"');
    const sitzungen = zugang.indexOf('id="sitzungen-titel"');
    expect(passwort).toBeGreaterThan(-1);
    expect(geraete).toBeGreaterThan(passwort);
    expect(sitzungen).toBeGreaterThan(geraete);
  });
});

const MODULE = [
  "./Geraete.tsx",
  "../NeueAnmeldung.tsx",
  "../../../lib/einstellungen/geraete.ts",
].map((datei) => ({ datei, text: readFileSync(new URL(datei, import.meta.url), "utf8") }));

describe("Browser-Module der Geräte", () => {
  it.each(MODULE)("$datei lädt weder Zod noch Verträge noch Server-Pakete", ({ text }) => {
    const importe = [...text.matchAll(/^import (?!type )[^;]*?from "([^"]+)";/gms)].map(
      (m) => m[1],
    );
    for (const modul of importe) {
      expect(modul).not.toBe("zod");
      expect(modul).not.toMatch(/^@paibot\/shared(\/(eingaben|api|aktionen|objekte|tor|belege))?$/);
      expect(modul).not.toMatch(/(^|\/)routen$/);
      expect(modul).not.toMatch(/^@paibot\/(db|gate|receipts|crypto)/);
    }
  });

  it.each(MODULE)("$datei ohne Inline-Stil, Inline-Skript oder HTML-Einfügen", ({ text }) => {
    expect(text).not.toMatch(/\sstyle=\{/);
    expect(text).not.toMatch(/<style|<script|dangerouslySetInnerHTML/);
  });

  it("jeder Aufruf von apiFetch nennt eine Route des Vertrags", () => {
    const aufrufe = MODULE.flatMap(({ text }) => [
      ...text.matchAll(
        /apiFetch(?:<[^>]*>)?\(\s*"(GET|POST|PUT|PATCH|DELETE)",\s*[`"]([^"`]+)[`"]/g,
      ),
    ]).map((a) => `${a[1]} ${(a[2] as string).replace(/\$\{[^}]+\}/g, ":id")}`);
    expect(aufrufe.sort()).toEqual([
      "GET /api/zugang/geraete",
      "POST /api/zugang/geraete/:id/entfernen",
      "POST /api/zugang/geraete/hinweis",
    ]);
    for (const aufruf of aufrufe) {
      const [methode, pfad] = aufruf.split(" ");
      const route = Object.values(API_ROUTEN).find((r) => r.methode === methode && r.pfad === pfad);
      expect(route, aufruf).toBeDefined();
    }
  });
});
