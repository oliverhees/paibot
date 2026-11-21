/**
 * PaiBot – Darstellungs-Tests über `react-dom/server`: Karte der Routing-Regeln mit Vorgaben,
 * Karte „Zweiter Schlüssel“, Warnung beim Ort „außerhalb der EU“ und Chat (Kopf und Zeile unter
 * der Antwort). Die Kennzeichnung erscheint nur mit belegter Vorgabe.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { newId } from "@paibot/shared/ids";
import type { Message, Provider } from "@paibot/shared/objekte";
import { t } from "@paibot/shared/texte";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ChatBereitschaft, ChatVerlauf } from "../../../lib/chat/typen";
import { vorgabeAus } from "../../../lib/modelle/vorgabe";
import { ChatSeite } from "../chat/ChatSeite";
import { EigenerAnbieterForm } from "./EigenerAnbieterForm";
import { RegelnKarte } from "./RegelnKarte";
import { VerwaltungsKarte } from "./VerwaltungsKarte";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }),
  usePathname: () => "/",
}));

const EUROUTER = {
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
const MIT_SCHLUESSEL = { ...EUROUTER, managementKeySet: true } as Provider;
const nichts = () => undefined;
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const GEPRUEFT = new Date("2026-11-21T10:00:00.000Z");
const vorgabe = (policy: object, jetzt = GEPRUEFT) =>
  vorgabeAus(policy, GEPRUEFT, jetzt, "Europe/Berlin");

function karte(
  regeln: { id: string; name: string; vorgabe?: ReturnType<typeof vorgabe> }[],
  anbieter = MIT_SCHLUESSEL,
) {
  return renderToStaticMarkup(
    h(RegelnKarte, {
      anbieter,
      botName: "Pai",
      regeln,
      alte: [],
      onRegeln: nichts,
      onModell: nichts,
    }),
  );
}

describe("Karte der Regeln mit Vorgaben", () => {
  it("EU laut Regel mit Herkunft, Datum und dem Hinweis, dass es keine Rechtsaussage ist", () => {
    const html = karte([
      { id: "mod_a", name: "Beispiel-Regel", vorgabe: vorgabe({ data_residency: "EU" }) },
    ]);
    const sichtbar = text(html);
    expect(sichtbar).toContain(t("vorgabe.eu.marke"));
    expect(sichtbar).toContain("EU laut Regel in deinem EUrouter-Konto, geprüft am 21.11.2026.");
    expect(sichtbar).toContain(t("vorgabe.eu.hinweis"));
    expect(html).toContain('data-art="eu"');
  });

  it("andere Werte, fehlendes Feld und Regeln nur per Name: keine Marke", () => {
    const html = karte([
      { id: "mod_a", name: "Zweite Regel", vorgabe: vorgabe({ data_residency: "US" }) },
      { id: "mod_b", name: "Regel ohne Vorgabe", vorgabe: vorgabe({}) },
      { id: "mod_c", name: "Regel nur Name" },
    ]);
    expect(html).not.toContain('data-art="eu"');
    expect(text(html)).not.toContain(t("vorgabe.eu.marke"));
    expect(text(html)).toContain(t("vorgabe.nur_name"));
    expect(text(html)).toContain("„US“");
    expect(text(html)).toContain(t("vorgabe.residenz.keine"));
  });

  it("länger nicht geprüft: Marke bleibt, „zuletzt geprüft am“ steht dabei", () => {
    const spaeter = new Date(GEPRUEFT.getTime() + 20 * 24 * 60 * 60 * 1000);
    const v = vorgabe({ data_residency: "EU" }, spaeter);
    const sichtbar = text(karte([{ id: "mod_a", name: "Beispiel-Regel", vorgabe: v }]));
    expect(sichtbar).toContain(t("vorgabe.eu.marke"));
    expect(sichtbar).toContain("zuletzt geprüft am 21.11.2026");
    expect(sichtbar).toContain(t("vorgabe.alt"));
  });

  it("Ausweichen: nennt die Ausweich-Modelle bzw. dass die Regel es erlaubt", () => {
    expect(
      text(karte([{ id: "mod_a", name: "R", vorgabe: vorgabe({ models: ["glm-5.1", "glm-5"] }) }])),
    ).toContain("Kann auf glm-5.1, glm-5 ausweichen.");
    expect(
      text(karte([{ id: "mod_a", name: "R", vorgabe: vorgabe({ allow_fallbacks: true }) }])),
    ).toContain("Kann ausweichen");
    expect(
      text(karte([{ id: "mod_a", name: "R", vorgabe: vorgabe({ allow_fallbacks: false }) }])),
    ).not.toContain("ausweichen");
  });

  it("„Erneut prüfen“ je Regel, für alle und „Regeln aus meinem Konto zeigen“ nur mit zweitem Schlüssel", () => {
    const regeln = [{ id: "mod_a", name: "Beispiel-Regel", vorgabe: vorgabe({}) }];
    const mit = text(karte(regeln, MIT_SCHLUESSEL));
    expect(mit).toContain(t("verwaltung.neu.eine"));
    expect(mit).toContain(t("verwaltung.neu.alle"));
    expect(mit).toContain(t("verwaltung.holen"));
    const ohne = text(karte(regeln, EUROUTER));
    expect(ohne).not.toContain(t("verwaltung.neu.eine"));
    expect(ohne).not.toContain(t("verwaltung.neu.alle"));
    expect(ohne).not.toContain(t("verwaltung.holen"));
  });
});

describe("Karte „Zweiter Schlüssel“", () => {
  const rendern = (anbieter: Provider) =>
    renderToStaticMarkup(h(VerwaltungsKarte, { anbieter, onAnbieter: nichts, onRegeln: nichts }));

  it("ohne Schlüssel: sagt, dass Regeln nur per Name geprüft sind; nichts Verdecktes im HTML", () => {
    const html = rendern(EUROUTER);
    expect(text(html)).toContain(t("verwaltung.status.fehlt"));
    expect(text(html)).toContain(t("verwaltung.eintragen"));
    expect(text(html)).not.toContain(t("verwaltung.entfernen"));
    expect(html).not.toContain("<input");
  });

  it("mit Schlüssel: „hinterlegt“, ersetzen und entfernen; der Schlüssel selbst nie", () => {
    const html = rendern(MIT_SCHLUESSEL);
    expect(text(html)).toContain(t("verwaltung.status.gesetzt"));
    expect(text(html)).toContain(t("verwaltung.ersetzen"));
    expect(text(html)).toContain(t("verwaltung.entfernen"));
    expect(html).not.toContain("value=");
  });

  it("erklärt, wofür der Schlüssel dient, und dass er nie für Chat-Anfragen benutzt wird", () => {
    const sichtbar = text(rendern(EUROUTER));
    expect(sichtbar).toContain("nie für Chat-Anfragen");
  });
});

describe("Eigener Anbieter „außerhalb der EU“", () => {
  const form = (region: "eu" | "non_eu" | "local") =>
    renderToStaticMarkup(
      h(EigenerAnbieterForm, {
        anbieter: {
          ...EUROUTER,
          templateKey: "eigener",
          name: "Eigener Dienst",
          baseUrl: "https://dienst.example/v1",
          region,
        } as Provider,
        onGespeichert: nichts,
        onAbbrechen: nichts,
      }),
    );

  it("warnt deutlich, was die Wahl bewirkt und wie man es ändert", () => {
    const sichtbar = text(form("non_eu"));
    expect(sichtbar).toContain(t("modelle.eigen.warnung.non_eu"));
    expect(sichtbar).toContain("lehnt das Tor jede Antwort dieses Anbieters ab");
    expect(sichtbar).toContain("Du kannst den Ort später ändern");
    expect(sichtbar).toContain(t("modelle.eigen.ort.hilfe.non_eu"));
  });

  it("Gegenprobe: bei „EU“ und „lokal“ keine Warnung", () => {
    for (const region of ["eu", "local"] as const) {
      expect(text(form(region))).not.toContain(t("modelle.eigen.warnung.non_eu"));
    }
  });
});

describe("Chat: Kopf und Zeile unter der Antwort", () => {
  const BEREIT: ChatBereitschaft = {
    botName: "Pai",
    botFarbe: "limette",
    modell: {
      name: "Beispiel-Regel",
      herkunft: "über EUrouter",
      anbieter: { name: "EUrouter", templateKey: "eurouter", region: "eu" },
    },
    schluessel: true,
    schleuseInstalliert: false,
    schleuseStandard: "off",
    zeitzone: "Europe/Berlin",
    belegeGesamt: 23,
  };
  const conversationId = newId("conversation");

  function chat(modell: ChatBereitschaft["modell"], antwortModell?: ChatBereitschaft["modell"]) {
    const runId = newId("run");
    return renderToStaticMarkup(
      h(ChatSeite, {
        bereitschaft: { ...BEREIT, ...(modell === undefined ? {} : { modell }) },
        verlauf: {
          unterhaltung: { id: conversationId, titel: "Test", schleuse: "off" },
          nachrichten: [
            {
              id: newId("message"),
              conversationId,
              createdAt: "2026-11-21T13:31:00.000Z",
              role: "assistant",
              content: "Gern.",
              status: "complete",
              runId,
              route: "direkt",
              modelId: "mod_a",
              servedBy: { provider: "beispiel-nord" },
            } as unknown as Message,
          ],
          laeufe: [],
          ereignisse: [],
          letzteSeq: 0,
          belege: [],
          modelle: antwortModell === undefined ? {} : { mod_a: antwortModell },
        } as ChatVerlauf,
      }),
    );
  }

  const MIT_EU = {
    ...BEREIT.modell,
    name: "Beispiel-Regel",
    vorgabe: vorgabe({ data_residency: "EU", models: ["glm-5.1"] }),
  } as NonNullable<ChatBereitschaft["modell"]>;

  it("mit belegter Vorgabe: Marke im Kopf und Satz mit Datum in der Zeile; Ausweichen genannt", () => {
    const sichtbar = text(chat(MIT_EU, MIT_EU));
    expect(sichtbar).toContain(t("vorgabe.eu.marke"));
    expect(sichtbar).toContain("EU laut Regel in deinem Konto, geprüft am 21.11.2026");
    expect(sichtbar).toContain("kann auf glm-5.1 ausweichen");
  });

  it("ohne Vorgabe (nur per Name geprüft) oder mit anderem Wert: weder Marke noch „EU“-Satz", () => {
    const ohne = { ...BEREIT.modell, name: "Beispiel-Regel" } as NonNullable<
      ChatBereitschaft["modell"]
    >;
    const andere = { ...ohne, vorgabe: vorgabe({ data_residency: "US" }) };
    for (const m of [ohne, andere]) {
      const sichtbar = text(chat(m, m));
      expect(sichtbar).not.toContain("EU laut Regel");
      expect(sichtbar).not.toContain("geprüft am");
    }
  });
});
