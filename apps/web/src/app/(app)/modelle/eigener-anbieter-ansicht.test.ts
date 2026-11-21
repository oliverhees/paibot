/**
 * PaiBot – Tests der Oberfläche für eigene Anbieter: Logik des Formulars ohne DOM und die
 * Darstellung über `react-dom/server` (Felder, Beschriftungen, kein Schlüssel im HTML).
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
import { describe, expect, it } from "vitest";
import {
  eigenFehlerAus,
  eigenKoerper,
  eigenPruefen,
  gezeigterAnbieter,
  neueWerte,
  schluesselEntfernbar,
  unverschluesselt,
  werteVon,
} from "../../../lib/modelle/eigen";
import { EigenerAnbieterForm } from "./EigenerAnbieterForm";

const LOKAL: Provider = {
  id: "prv_01JD0000000000000000000001",
  kind: "openai_compatible",
  templateKey: "eigener",
  name: "Lokaler Anbieter",
  baseUrl: "http://127.0.0.1:8080/v1",
  region: "local",
  keySet: true,
  enabled: true,
  createdAt: "2026-11-21T10:00:00.000Z",
  updatedAt: "2026-11-21T10:00:00.000Z",
} as Provider;

const nichts = () => undefined;

describe("Formular-Logik", () => {
  it("prüft Name und Adresse vorab, alles andere der Server", () => {
    expect(eigenPruefen(neueWerte())).toEqual({
      name: t("modelle.eigen.name.leer"),
      baseUrl: t("modelle.eigen.adresse.leer"),
    });
    expect(eigenPruefen({ ...neueWerte(), name: "A", baseUrl: "irgendwas" })).toEqual({});
    expect(eigenPruefen({ ...neueWerte(), name: "A", baseUrl: "http://127.0.0.1/v1" })).toEqual({
      baseUrl: t("anbieter.url.protokoll"),
    });
    expect(
      eigenPruefen({ ...neueWerte(), name: "A", baseUrl: "http://127.0.0.1/v1", region: "local" }),
    ).toEqual({});
  });

  it("Körper: immer Vorlage „eigener“, Schlüssel nur wenn eingegeben, Entfernen nur bei lokal", () => {
    const w = { ...werteVon(LOKAL), name: " Rechner ", baseUrl: " http://127.0.0.1:8080/v1 " };
    expect(eigenKoerper(w, LOKAL)).toEqual({
      templateKey: "eigener",
      name: "Rechner",
      baseUrl: "http://127.0.0.1:8080/v1",
      region: "local",
    });
    expect(eigenKoerper({ ...w, apiKey: " neu-1 " }, LOKAL)).toMatchObject({ apiKey: "neu-1" });
    expect(eigenKoerper({ ...w, schluesselEntfernen: true }, LOKAL)).toMatchObject({
      removeApiKey: true,
    });
    // Gegenprobe: ohne gespeicherten Schlüssel oder außerhalb von „lokal“ wird nichts entfernt.
    expect(eigenKoerper({ ...w, schluesselEntfernen: true }, { keySet: false })).not.toHaveProperty(
      "removeApiKey",
    );
    expect(
      eigenKoerper({ ...w, region: "eu", schluesselEntfernen: true }, LOKAL),
    ).not.toHaveProperty("removeApiKey");
    expect(schluesselEntfernbar(LOKAL, "local")).toBe(true);
    expect(schluesselEntfernbar(LOKAL, "eu")).toBe(false);
    expect(schluesselEntfernbar(undefined, "local")).toBe(false);
  });

  it("Warnung bei http:// nur bei lokal", () => {
    expect(unverschluesselt("http://127.0.0.1:8080/v1", "local")).toBe(true);
    expect(unverschluesselt("https://127.0.0.1/v1", "local")).toBe(false);
    expect(unverschluesselt("http://127.0.0.1/v1", "eu")).toBe(false);
  });

  it("Fehler des Servers landen am passenden Feld, sonst als Meldung", () => {
    expect(
      eigenFehlerAus({
        code: "eingabe_ungueltig",
        text: "Adresse falsch",
        felder: [{ feld: "baseUrl", code: "ungueltig" }],
      }),
    ).toEqual({ felder: { baseUrl: "Adresse falsch" }, rest: false });
    expect(
      eigenFehlerAus({
        code: "schluessel_ungueltig",
        text: "Nicht angenommen.",
        ausweg: "Trag einen neuen ein.",
        felder: [{ feld: "apiKey", code: "ungueltig" }],
      }),
    ).toEqual({ felder: { apiKey: "Nicht angenommen. Trag einen neuen ein." }, rest: false });
    expect(
      eigenFehlerAus({
        code: "eingabe_ungueltig",
        text: "Adresse falsch",
        ausweg: "Prüf die markierten Felder.",
        felder: [{ feld: "baseUrl", code: "ungueltig" }],
      }).felder,
    ).toEqual({ baseUrl: "Adresse falsch" });
    expect(eigenFehlerAus({ code: "anbieter_nicht_erreichbar", text: "weg" })).toEqual({
      felder: {},
      rest: true,
    });
    expect(
      eigenFehlerAus({
        code: "x" as never,
        text: "t",
        felder: [{ feld: "region", code: "ungueltig" }],
      }),
    ).toEqual({ felder: {}, rest: true });
  });

  it("angezeigter Anbieter: Wunsch, sonst der des Modells, sonst der erste", () => {
    const liste = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(gezeigterAnbieter(liste, "c", "b")?.id).toBe("c");
    expect(gezeigterAnbieter(liste, "weg", "b")?.id).toBe("b");
    expect(gezeigterAnbieter(liste, undefined, undefined)?.id).toBe("a");
    expect(gezeigterAnbieter([], undefined, "b")).toBeUndefined();
  });
});

describe("Formular im HTML", () => {
  it("neu: Name, Adresse, Ort mit „lokal“ als ausdrücklicher Wahl, Schlüssel als Passwort-Feld", () => {
    const html = renderToStaticMarkup(
      h(EigenerAnbieterForm, { onGespeichert: nichts, onAbbrechen: nichts }),
    );
    expect(html).toContain(t("modelle.eigen.form.neu"));
    expect(html).toContain(t("modelle.eigen.name"));
    expect(html).toContain(t("modelle.eigen.adresse"));
    expect(html).toContain(t("modelle.eigen.ort"));
    expect(html).toMatch(/<option value="eu" selected="">/);
    expect(html).toContain(`<option value="local">${t("modelle.eigen.ort.local")}</option>`);
    expect(html).toMatch(
      /type="password"[^>]*name="apiKey"[^>]*autoComplete="off"|type="password"/,
    );
    expect(html).not.toContain(t("modelle.eigen.schluessel.entfernen"));
    expect(html).toContain(t("modelle.eigen.speichern"));
  });

  it("ändern: Werte vorbelegt, Schlüssel-Feld leer, Entfernen des Schlüssels angeboten", () => {
    const html = renderToStaticMarkup(
      h(EigenerAnbieterForm, { anbieter: LOKAL, onGespeichert: nichts, onAbbrechen: nichts }),
    );
    expect(html).toContain(t("modelle.eigen.form.aendern", { anbieter: "Lokaler Anbieter" }));
    expect(html).toContain('value="http://127.0.0.1:8080/v1"');
    expect(html).toContain(t("modelle.eigen.warnung.unverschluesselt"));
    expect(html).toContain('role="switch"');
    expect(html).toContain(t("modelle.eigen.schluessel.entfernen"));
    const feld = html.match(/<input[^>]*name="apiKey"[^>]*>/)?.[0] ?? "";
    expect(feld).toContain('type="password"');
    expect(feld).toContain('value=""');
    expect(html).not.toMatch(/apiKeyEnc|v2:/);
  });
});
