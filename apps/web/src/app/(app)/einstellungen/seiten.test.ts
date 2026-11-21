/**
 * PaiBot – Render-Tests der Reiter „Zugang“ und „Grenzen“ und Prüfungen der Browser-Module
 * (strenge Content-Security-Policy, nur Routen aus dem Vertrag).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { readFileSync } from "node:fs";
import { LIMITS } from "@paibot/shared/konstanten";
import { type FunctionComponent, createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { EinstellungenAnzeige } from "../../../lib/einstellungen/typen";
import { API_ROUTEN } from "../../../lib/routen";
import { Darstellung } from "./Darstellung";
import { EinstellungenRahmen } from "./EinstellungenRahmen";
import { Grenzen } from "./Grenzen";
import { Zugang } from "./Zugang";

const ANZEIGE: EinstellungenAnzeige = {
  zeitzone: "Europe/Berlin",
  tagesbudget: 50_000,
  verlaufsgrenze: null,
  heute: { token: 12_500, seit: "2026-11-20T23:00:00.000Z" },
  hoechstwerte: { tagesbudget: LIMITS.dailyTokenBudget, verlaufsgrenze: LIMITS.historyTokens },
};

describe("Rahmen der Einstellungen", () => {
  const rahmen = EinstellungenRahmen as FunctionComponent<{ aktiv: string }>;
  const html = renderToStaticMarkup(h(rahmen, { aktiv: "grenzen" }, "Inhalt"));

  it("hat eine Überschrift und Reiter als Links, der aktuelle mit aria-current", () => {
    expect(html).toMatch(/<h1[^>]*>.*Einstellungen.*<\/h1>/);
    expect(html).toContain('<nav aria-label="Bereiche der Einstellungen"');
    for (const ziel of ["/modelle", "/einstellungen", "/einstellungen/grenzen", "/info"]) {
      expect(html).toContain(`href="${ziel}"`);
    }
    expect(html).toMatch(
      /href="\/einstellungen\/grenzen"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/einstellungen\/grenzen"/,
    );
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });
});

describe("Reiter Zugang", () => {
  const html = renderToStaticMarkup(
    h(Zugang, { zeitzone: "Europe/Berlin", passwortMin: 12, passwortGeaendert: false }),
  );

  it("zeigt Passwort ändern mit Prüfliste und Hinweis zu den Geräten", () => {
    expect(html).toContain("Aktuelles Passwort");
    expect(html).toContain("Neues Passwort wiederholen");
    expect(html).toContain("mindestens 12 Zeichen");
    expect(html).toContain("beide Eingaben sind gleich");
    expect(html).toContain("Danach sind alle anderen Geräte abgemeldet.");
    expect(html).toContain('autoComplete="current-password"');
  });

  it("lädt die Sitzungen erst im Browser und zeigt bis dahin „Lädt …“", () => {
    expect(html).toContain("Sitzungen");
    expect(html).toContain('role="status"');
    expect(html).toContain("Lädt …");
  });

  it("sagt ehrlich, dass „Alle Sitzungen beenden“ auch dieses Gerät abmeldet", () => {
    expect(html).toContain("Alle Sitzungen beenden");
    expect(html).toContain("auch dieses");
    expect(html).toContain("Abmelden");
  });

  it("bietet nichts an, was es nicht gibt", () => {
    expect(html).not.toMatch(
      /Konto löschen|exportieren|Sicherung|PAIBOT_ALLOW_PRIVILEGED_DB|Not-Aus/,
    );
  });

  it("zeigt nach dem Wechsel den Erfolg", () => {
    const danach = renderToStaticMarkup(
      h(Zugang, { zeitzone: "Europe/Berlin", passwortMin: 12, passwortGeaendert: true }),
    );
    expect(danach).toContain("Dein Passwort ist geändert.");
  });
});

describe("Reiter Grenzen", () => {
  const html = renderToStaticMarkup(
    h(Grenzen, { anfang: ANZEIGE, zeitzonen: ["Europe/Berlin", "America/New_York"] }),
  );

  it("zeigt Tagesgrenze mit dem Verbrauch von heute, Verlaufsgrenze und Zeitzone", () => {
    expect(html).toContain("Tagesbudget (Token)");
    expect(html).toContain("12.500 von 50.000 Token seit 00:00 Uhr.");
    expect(html).toContain("<progress");
    expect(html).toContain('value="50000"');
    expect(html).toContain("Verlaufsgrenze (Token)");
    expect(html).toContain("Zeitzone");
    expect(html).toContain('value="Europe/Berlin"');
    expect(html).toContain("America/New York");
  });

  it("zeigt die erreichte Tagesgrenze als Warnung", () => {
    const voll = renderToStaticMarkup(
      h(Grenzen, {
        anfang: { ...ANZEIGE, heute: { ...ANZEIGE.heute, token: 50_000 } },
        zeitzonen: ["Europe/Berlin"],
      }),
    );
    expect(voll).toContain("Die Tagesgrenze ist erreicht.");
  });

  it("bietet keinen Not-Aus und keine Sprache an (nicht änderbar im Vertrag dieser Route)", () => {
    expect(html).not.toMatch(/Not-Aus|Alle Bots anhalten|Sprache/);
  });
});

const BROWSER_MODULE = [
  "./Zugang.tsx",
  "./Grenzen.tsx",
  "./AbmeldenKnopf.tsx",
  "./InfoInhalt.tsx",
  "./EinstellungenRahmen.tsx",
  "../../../lib/einstellungen/anzeige.ts",
  "../../../lib/einstellungen/info.ts",
  "../../../lib/einstellungen/typen.ts",
].map((datei) => ({ datei, text: readFileSync(new URL(datei, import.meta.url), "utf8") }));

describe("Browser-Module der Einstellungen", () => {
  it.each(BROWSER_MODULE)(
    "$datei lädt weder Zod noch Eingabe-Schemas noch den Routen-Vertrag",
    ({ text }) => {
      const importe = [...text.matchAll(/^import (?!type )[^;]*?from "([^"]+)";/gms)].map(
        (m) => m[1],
      );
      for (const modul of importe) {
        expect(modul).not.toBe("zod");
        expect(modul).not.toMatch(
          /^@paibot\/shared(\/(eingaben|api|aktionen|objekte|tor|belege))?$/,
        );
        expect(modul).not.toMatch(/(^|\/)routen$/);
        expect(modul).not.toMatch(/^@paibot\/(db|gate|receipts|crypto)/);
      }
    },
  );

  it.each(BROWSER_MODULE)("$datei braucht weder Inline-Stil noch Inline-Skript", ({ text }) => {
    expect(text).not.toMatch(/\sstyle=\{/);
    expect(text).not.toMatch(/<style|<script|dangerouslySetInnerHTML/);
  });

  it("jeder Aufruf von apiFetch nennt Methode und Pfad einer Route des Vertrags", () => {
    const aufrufe = BROWSER_MODULE.flatMap(({ text }) => [
      ...text.matchAll(/apiFetch(?:<[^>]*>)?\(\s*"(GET|POST|PUT|PATCH|DELETE)",\s*"([^"]+)"/g),
    ]);
    expect(aufrufe.map((a) => `${a[1]} ${a[2]}`).sort()).toEqual([
      "GET /api/zugang/sitzungen",
      "PATCH /api/einstellungen",
      "POST /api/zugang/abmelden",
      "POST /api/zugang/alle-abmelden",
      "POST /api/zugang/passwort",
    ]);
    for (const [, methode, pfad] of aufrufe) {
      const route = Object.values(API_ROUTEN).find((r) => r.methode === methode && r.pfad === pfad);
      expect(route, `${methode} ${pfad}`).toBeDefined();
    }
  });
});

describe("Reiter Darstellung", () => {
  const html = (anfang: "begruessung" | "startbrett" | "stille") =>
    renderToStaticMarkup(h(Darstellung, { anfang }));

  it("zeigt die drei Fassungen als Auswahl mit Vorschau, die gemerkte ist gewählt", () => {
    const aus = html("startbrett");
    expect(aus).toContain("Startbereich einer leeren Unterhaltung");
    expect(aus.match(/type="radio"/g)).toHaveLength(3);
    for (const name of ["Begrüßung", "Startbrett", "Stille"]) expect(aus).toContain(name);
    expect(aus.match(/data-skizze=/g)).toHaveLength(3);
    expect(aus.match(/checked=""/g)).toHaveLength(1);
    expect(aus).toMatch(/value="startbrett"[^>]*checked=""|checked=""[^>]*value="startbrett"/);
    expect(aus).toContain("Die Wahl gilt nur für diesen Browser.");
  });

  it("ohne gemerkte Wahl ist „Begrüßung“ gewählt, der Reiter steht in der Leiste", () => {
    expect(html("begruessung")).toMatch(
      /value="begruessung"[^>]*checked=""|checked=""[^>]*value="begruessung"/,
    );
    const rahmen = EinstellungenRahmen as FunctionComponent<{ aktiv: string }>;
    const aus = renderToStaticMarkup(h(rahmen, { aktiv: "darstellung" }, "x"));
    expect(aus).toContain('href="/einstellungen/darstellung"');
    expect(aus).toMatch(
      /href="\/einstellungen\/darstellung"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/einstellungen\/darstellung"/,
    );
  });
});
