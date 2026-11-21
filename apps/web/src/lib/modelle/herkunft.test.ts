/**
 * PaiBot – Tests: ehrliche Herkunfts-Angabe (nie pauschal „EU“ aus einer Vorlage), Anbieter-Liste
 * von EUrouter bereinigt, Konto-Links aus einer Stelle und Vorlagen mit Testadresse.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { t } from "@paibot/shared/texte";
import { afterEach, describe, expect, it } from "vitest";
import { vorlageAnbieter } from "../umgebung";
import { anbieterHerkunft, antwortHerkunft, landName, unterAnbieterAus } from "./herkunft";
import { ANBIETER_REIHENFOLGE, KONTO_SEITEN, kontoLink } from "./konto-links";
import { _unterAnbieterVergessen, listenAdresse, unterAnbieterListe } from "./unter-anbieter";

const EUROUTER = { name: "EUrouter", templateKey: "eurouter", region: "eu" } as const;
const MISTRAL = { name: "Mistral AI", templateKey: "mistral", region: "eu" } as const;
const EIGEN = { name: "Mein Ollama", templateKey: "eigener", region: "local" } as const;
const LISTE = {
  abgerufen: "2026-11-21T10:00:00.000Z",
  eintraege: { tensorix: { name: "Tensorix", sitz: "IE" }, ohnesitz: { name: "Ohne Sitz" } },
};

describe("Herkunft ohne pauschales EU", () => {
  it("Vorlagen nennen nie „EU“; eigener Anbieter mit „laut deiner Einstellung“", () => {
    const eu = t("modelle.region.eu");
    expect(anbieterHerkunft(EUROUTER)).toBe("über EUrouter");
    expect(anbieterHerkunft(MISTRAL)).toBe("Mistral AI");
    for (const text of [anbieterHerkunft(EUROUTER), anbieterHerkunft(MISTRAL)]) {
      expect(text.split(/\W+/)).not.toContain(eu);
    }
    expect(anbieterHerkunft({ ...EIGEN, region: "eu" })).toBe(
      `Mein Ollama · ${eu} laut deiner Einstellung`,
    );
  });

  it("Antwort über EUrouter: Anbieter laut Antwort, Sitz laut EUrouter", () => {
    expect(antwortHerkunft(EUROUTER, { provider: "tensorix" }, LISTE)).toBe(
      `Antwort von Tensorix · Sitz ${landName("IE")} laut EUrouter`,
    );
    expect(antwortHerkunft(EUROUTER, { provider: "ohnesitz" }, LISTE)).toBe(
      "Antwort von Ohne Sitz (laut EUrouter)",
    );
    // Ohne Liste: nur die Kennung aus der Antwort, kein Sitz.
    expect(antwortHerkunft(EUROUTER, { provider: "nebul" }, undefined)).toBe(
      "Antwort von nebul (laut EUrouter)",
    );
    // Ohne Angabe in der Antwort (z. B. früherer Eintrag): kein Land, kein EU.
    expect(antwortHerkunft(EUROUTER, undefined, LISTE)).toBe("über EUrouter");
    // Gegenprobe: bei Mistral zählt ein provider-Feld nicht als Herkunft.
    expect(antwortHerkunft(MISTRAL, { provider: "tensorix" }, LISTE)).toBe("Mistral AI");
  });
});

describe("Anbieter-Liste von EUrouter", () => {
  it("nur Name und Sitz, bereinigt; andere Felder und falsche Formen fallen weg", () => {
    const liste = unterAnbieterAus(
      {
        data: [
          {
            slug: "nebul",
            name: "Nebul‮<b>",
            headquarters: "NL",
            data_policy: { gdpr_compliant: true },
          },
          { slug: "Kaputt Slug", name: "x" },
          { slug: "ohne", name: "Ohne", headquarters: "nl" },
        ],
      },
      new Date("2026-11-21T10:00:00.000Z"),
    );
    expect(liste).toEqual({
      abgerufen: "2026-11-21T10:00:00.000Z",
      eintraege: { nebul: { name: "Nebul<b>", sitz: "NL" }, ohne: { name: "Ohne" } },
    });
    expect(JSON.stringify(liste)).not.toContain("gdpr");
    expect(unterAnbieterAus({ data: "nein" }, new Date())).toBeUndefined();
  });

  afterEach(() => _unterAnbieterVergessen());

  it("holt höchstens einmal am Tag, ohne Schlüssel, und behält die letzte Liste bei Fehler", async () => {
    const aufrufe: { url: string; kopf: Headers }[] = [];
    let antwort: () => Response = () =>
      Response.json({ data: [{ slug: "nebul", name: "Nebul", headquarters: "NL" }] });
    const holen: typeof fetch = async (url, init) => {
      aufrufe.push({ url: String(url), kopf: new Headers(init?.headers) });
      return antwort();
    };
    const anbieter = {
      templateKey: "eurouter",
      baseUrl: "https://api.eurouter.ai/v1",
      region: "eu",
    } as const;
    const jetzt = new Date("2026-11-21T10:00:00.000Z");
    const erste = await unterAnbieterListe(anbieter, { jetzt, fetch: holen });
    expect(erste?.eintraege.nebul?.sitz).toBe("NL");
    expect(aufrufe.map((a) => a.url)).toEqual(["https://api.eurouter.ai/api/v1/providers"]);
    expect(aufrufe[0]?.kopf.has("authorization")).toBe(false);
    await unterAnbieterListe(anbieter, {
      jetzt: new Date(jetzt.getTime() + 3600_000),
      fetch: holen,
    });
    expect(aufrufe.length).toBe(1);
    antwort = () => new Response("kaputt", { status: 500 });
    const spaeter = new Date(jetzt.getTime() + 25 * 3600_000);
    expect((await unterAnbieterListe(anbieter, { jetzt: spaeter, fetch: holen }))?.abgerufen).toBe(
      erste?.abgerufen,
    );
    expect(aufrufe.length).toBe(2);
    // Andere Anbieter haben keine Liste.
    expect(
      await unterAnbieterListe({ ...anbieter, templateKey: "mistral" }, { fetch: holen }),
    ).toBeUndefined();
    expect(listenAdresse("http://127.0.0.1:18080/v1").href).toBe(
      "http://127.0.0.1:18080/api/v1/providers",
    );
  });
});

describe("Konto-Links aus einer Stelle", () => {
  it("ohne Empfehlungs-Link: normale Seite ohne Hinweis", () => {
    expect(kontoLink("eurouter")).toEqual({
      href: "https://www.eurouter.ai/sign-up",
      empfehlung: false,
    });
    expect(kontoLink("mistral")).toEqual({
      href: "https://console.mistral.ai/",
      empfehlung: false,
    });
    expect(kontoLink("eigener")).toBeUndefined();
    expect(KONTO_SEITEN.eurouter.empfehlung).toBeUndefined();
    expect(KONTO_SEITEN.mistral.empfehlung).toBeUndefined();
  });

  it("mit Empfehlungs-Link: dieser Link mit Hinweis; Reihenfolge bleibt", () => {
    const seiten = {
      ...KONTO_SEITEN,
      mistral: {
        ...KONTO_SEITEN.mistral,
        empfehlung: "https://beispiel.example/r/1",
      },
    };
    expect(kontoLink("mistral", seiten)).toEqual({
      href: "https://beispiel.example/r/1",
      empfehlung: true,
    });
    // Gegenprobe: ein Link ohne https gilt nicht.
    expect(
      kontoLink("mistral", {
        ...seiten,
        mistral: { ...KONTO_SEITEN.mistral, seite: "https://a.example", empfehlung: "x" },
      }),
    ).toEqual({ href: "https://a.example", empfehlung: false });
    expect(ANBIETER_REIHENFOLGE).toEqual(["eurouter", "mistral", "eigener"]);
  });
});

describe("Vorlagen mit Testadresse", () => {
  it("nur eine Adresse im eigenen Netz ersetzt die Vorlage", () => {
    expect(vorlageAnbieter("mistral", {})).toEqual({
      templateKey: "mistral",
      name: "Mistral AI",
      baseUrl: "https://api.eu.mistral.ai/v1",
      region: "eu",
    });
    expect(
      vorlageAnbieter("eurouter", { PAIBOT_VORLAGEN_TESTADRESSE: "http://127.0.0.1:18080/v1/" }),
    ).toMatchObject({ baseUrl: "http://127.0.0.1:18080/v1", region: "local" });
    expect(
      vorlageAnbieter("eurouter", { PAIBOT_VORLAGEN_TESTADRESSE: "http://8.8.8.8/v1" }),
    ).toMatchObject({ baseUrl: "https://api.eurouter.ai/v1", region: "eu" });
  });
});
