/**
 * PaiBot – Tests: Anbieter-Wahl in der Einrichtung, Routing-Regeln von EUrouter (prüfen, speichern,
 * entfernen), keine Modell-Liste bei EUrouter, frühere Einträge aus der Liste bleiben benutzbar,
 * Ort „lokal“ nur im eigenen Netz und bereinigte Namen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { repo } from "@paibot/db";
import { newId, type ProviderId } from "@paibot/shared/ids";
import { t } from "@paibot/shared/texte";
import { describe, expect, it, vi } from "vitest";
import { einrichtungAbschliessen, einrichtungVerbindungstest } from "../zugang/einrichtung";
import {
  anfrage,
  TEST_CODE,
  TEST_PASSWORT,
  TEST_SCHLUESSEL,
  TEST_VERWALTUNGSSCHLUESSEL,
  TEST_VORLAGEN_URL,
  testUmgebung,
  vorabDose,
} from "../zugang/testing";
import { anbieterRegelEntfernen, anbieterRegelHinzufuegen, regelnVon } from "./regeln";
import { belegeSeit, type Eingerichtet, eingerichtet, letzteNummer } from "./testing";

vi.setConfig({ testTimeout: 60_000 });

const EUROUTER = {
  templateKey: "eurouter",
  name: "EUrouter",
  baseUrl: TEST_VORLAGEN_URL,
  region: "local",
} as const;

async function mitEurouter(): Promise<Eingerichtet & { id: string }> {
  const e = await eingerichtet();
  const r = await e.rufe(e.r.anbieterAnlegen, "POST", "/api/anbieter", {
    koerper: { ...EUROUTER, apiKey: TEST_SCHLUESSEL },
  });
  expect(r.status).toBe(201);
  const id = (r.body as { daten: { anbieter: { id: string } } }).daten.anbieter.id;
  return { ...e, id };
}

function regelRouten(e: Eingerichtet) {
  return {
    hinzu: e.u.handler("anbieterRegelHinzufuegen", anbieterRegelHinzufuegen),
    weg: e.u.handler("anbieterRegelEntfernen", anbieterRegelEntfernen),
  };
}

describe("POST /api/anbieter/:id/regeln", () => {
  it("prüft den Namen mit einer Anfrage, speichert ihn und nennt, wer geantwortet hat", async () => {
    const e = await mitEurouter();
    const { hinzu } = regelRouten(e);
    const vorher = await letzteNummer(e.u);
    const r = await e.rufe(hinzu, "POST", `/api/anbieter/${e.id}/regeln`, {
      params: { id: e.id },
      koerper: { name: "Beispiel-Regel" },
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      ok: true,
      daten: {
        regel: { name: "Beispiel-Regel" },
        servedBy: { provider: "beispiel-nord", model: "beispiel/modell-1" },
      },
    });
    expect(e.u.regelAufrufe).toEqual(["Beispiel-Regel"]);
    const anbieter = await repo.providers.get(e.u.db, e.id as ProviderId);
    if (anbieter === undefined) throw new Error("kein Anbieter");
    expect(await regelnVon(e.u.db, anbieter)).toMatchObject([{ name: "Beispiel-Regel" }]);
    const belege = await belegeSeit(e.u, vorher);
    expect(belege.map((b) => `${b.typ}:${b.aktion}`)).toEqual([
      "decision:anbieter.speichern",
      "result:anbieter.speichern",
    ]);
    for (const a of e.antworten) expect(a).not.toContain(TEST_SCHLUESSEL);
  });

  it("unbekannte Regel: 400 mit Satz und Ausweg, nichts gespeichert, kein Beleg", async () => {
    const e = await mitEurouter();
    const { hinzu } = regelRouten(e);
    const vorher = await letzteNummer(e.u);
    const r = await e.rufe(hinzu, "POST", `/api/anbieter/${e.id}/regeln`, {
      params: { id: e.id },
      koerper: { name: "Gibt es nicht" },
    });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      ok: false,
      fehler: {
        text: t("routingregel.fehler.regel_unbekannt", {
          name: "Gibt es nicht",
          anbieter: "EUrouter",
        }),
        ausweg: t("routingregel.fehler.regel_unbekannt.ausweg", { anbieter: "EUrouter" }),
        felder: [{ feld: "name" }],
      },
    });
    expect(await belegeSeit(e.u, vorher)).toEqual([]);
    const anbieter = await repo.providers.get(e.u.db, e.id as ProviderId);
    if (anbieter === undefined) throw new Error("kein Anbieter");
    expect(await regelnVon(e.u.db, anbieter)).toEqual([]);
  });

  it("Namen mit Steuerzeichen oder Leerraum am Rand: 400 ohne Anfrage beim Anbieter", async () => {
    const e = await mitEurouter();
    const { hinzu } = regelRouten(e);
    for (const name of ["EU‮Beispiel", " Beispiel-Regel", ""]) {
      const r = await e.rufe(hinzu, "POST", `/api/anbieter/${e.id}/regeln`, {
        params: { id: e.id },
        koerper: { name },
      });
      expect(r.status, name).toBe(400);
    }
    expect(e.u.regelAufrufe).toEqual([]);
  });

  it("bei einem Anbieter ohne Regeln: abgewiesen, ohne Anfrage", async () => {
    const e = await eingerichtet();
    const { hinzu } = regelRouten(e);
    const [anbieter] = await repo.providers.list(e.u.db);
    const r = await e.rufe(hinzu, "POST", `/api/anbieter/${anbieter?.id}/regeln`, {
      params: { id: anbieter?.id ?? "" },
      koerper: { name: "Beispiel-Regel" },
    });
    expect(r.status).toBe(400);
    expect(e.u.regelAufrufe).toEqual([]);
  });

  it("ohne Sitzung 401, ohne Prüfzeichen 403", async () => {
    const e = await mitEurouter();
    const { hinzu } = regelRouten(e);
    const ohne = await anfrage(e.u, hinzu, "POST", `/api/anbieter/${e.id}/regeln`, {
      params: { id: e.id },
      koerper: { name: "Beispiel-Regel" },
    });
    expect(ohne.status).toBe(401);
    const ohnePruef = await anfrage(e.u, hinzu, "POST", `/api/anbieter/${e.id}/regeln`, {
      dose: e.dose,
      params: { id: e.id },
      koerper: { name: "Beispiel-Regel" },
      pruefzeichen: null,
    });
    expect(ohnePruef.status).toBe(403);
  });
});

describe("DELETE /api/anbieter/:id/regeln/:modellId", () => {
  it("entfernt die Regel durch das Tor; ein Modell, das keine Regel ist, nicht", async () => {
    const e = await mitEurouter();
    const { hinzu, weg } = regelRouten(e);
    const r = await e.rufe(hinzu, "POST", `/api/anbieter/${e.id}/regeln`, {
      params: { id: e.id },
      koerper: { name: "Beispiel-Regel" },
    });
    const regelId = (r.body as { daten: { regel: { id: string } } }).daten.regel.id;
    const vorher = await letzteNummer(e.u);
    const ok = await e.rufe(weg, "DELETE", `/api/anbieter/${e.id}/regeln/${regelId}`, {
      params: { id: e.id, modellId: regelId },
    });
    expect(ok.status).toBe(200);
    expect((await belegeSeit(e.u, vorher)).map((b) => b.typ)).toEqual(["decision", "result"]);
    expect(await repo.models.get(e.u.db, regelId as never)).toBeUndefined();
    // Gegenprobe: ein gewöhnliches Modell lässt sich über diese Route nicht entfernen.
    const [modell] = await repo.models.list(e.u.db);
    const [ersterAnbieter] = await repo.providers.list(e.u.db);
    const nein = await e.rufe(weg, "DELETE", `/api/anbieter/${e.id}/regeln/${modell?.id}`, {
      params: { id: ersterAnbieter?.id ?? "", modellId: modell?.id ?? "" },
    });
    expect(nein.status).toBe(400);
  });
});

describe("EUrouter: keine Modell-Liste", () => {
  it("POST /api/anbieter/:id/modelle lehnt bei EUrouter ab und fragt nicht beim Anbieter", async () => {
    const e = await mitEurouter();
    const aufrufe = e.u.anbieterAufrufe.length;
    const r = await e.rufe(e.r.modelle, "POST", `/api/anbieter/${e.id}/modelle`, {
      params: { id: e.id },
    });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      fehler: { text: t("routingregel.liste_nicht", { anbieter: "EUrouter" }) },
    });
    expect(e.u.anbieterAufrufe.length).toBe(aufrufe);
  });

  it("früherer Eintrag aus der Liste bleibt gespeichert und wählbar (keine Regel)", async () => {
    const e = await mitEurouter();
    const alt = await repo.models.create(e.u.db, {
      providerId: e.id as ProviderId,
      slug: "nebul/glm-5.3",
      displayName: "GLM 5.3",
    });
    const r = await e.rufe(e.r.botModell, "PUT", "/api/bot/modell", {
      koerper: { modelId: alt.id },
    });
    expect(r.status).toBe(200);
    const anbieter = await repo.providers.get(e.u.db, e.id as ProviderId);
    if (anbieter === undefined) throw new Error("kein Anbieter");
    expect(await regelnVon(e.u.db, anbieter)).toEqual([]);
  });
});

describe("Einrichtung mit Anbieter-Wahl", () => {
  async function vorab() {
    const u = await testUmgebung();
    u.neuerCode(TEST_CODE);
    const test = u.handler("einrichtungVerbindungstest", async (k) => ({
      daten: await einrichtungVerbindungstest(k),
    }));
    const abschluss = u.handler("einrichtungAbschliessen", async (k) => ({
      daten: await einrichtungAbschliessen(k),
    }));
    return { u, test, abschluss, dose: vorabDose() };
  }

  const grund = {
    setupCode: TEST_CODE,
    password: TEST_PASSWORT,
    passwordRepeat: TEST_PASSWORT,
    schleuseModeDefault: "off",
    botName: "Pai",
  };

  it("EUrouter: Regeln einzeln geprüft, Ergebnis je Name; Liste des Anbieters nicht abgefragt", async () => {
    const { u, test, dose } = await vorab();
    const r = await anfrage(u, test, "POST", "/api/einrichtung/verbindungstest", {
      dose,
      koerper: {
        setupCode: TEST_CODE,
        apiKey: TEST_SCHLUESSEL,
        templateKey: "eurouter",
        ruleNames: ["Beispiel-Regel", "Falsch"],
      },
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      daten: {
        modelle: [],
        regeln: [
          { name: "Beispiel-Regel", ok: true, servedBy: { provider: "beispiel-nord" } },
          { name: "Falsch", ok: false },
        ],
      },
    });
    expect(u.anbieterAufrufe).toEqual([]);
  });

  it("EUrouter ohne Regel oder mit falschem Schlüssel: Fehler am Feld", async () => {
    const { u, test, dose } = await vorab();
    const ohne = await anfrage(u, test, "POST", "/api/einrichtung/verbindungstest", {
      dose,
      koerper: { setupCode: TEST_CODE, apiKey: TEST_SCHLUESSEL, templateKey: "eurouter" },
    });
    expect(ohne.body).toMatchObject({ fehler: { felder: [{ feld: "ruleNames" }] } });
    const falsch = await anfrage(u, test, "POST", "/api/einrichtung/verbindungstest", {
      dose,
      koerper: {
        setupCode: TEST_CODE,
        apiKey: "beispiel-falsch-1",
        templateKey: "eurouter",
        ruleNames: ["Beispiel-Regel"],
      },
    });
    expect(falsch.body).toMatchObject({ fehler: { felder: [{ feld: "apiKey" }] } });
  });

  it("Abschluss mit EUrouter: alle Regeln gespeichert, gewählte als Modell des Bots, ohne zweite Prüfung", async () => {
    const { u, test, abschluss, dose } = await vorab();
    await anfrage(u, test, "POST", "/api/einrichtung/verbindungstest", {
      dose,
      koerper: {
        setupCode: TEST_CODE,
        apiKey: TEST_SCHLUESSEL,
        templateKey: "eurouter",
        ruleNames: ["Beispiel-Regel", "Zweite Regel"],
      },
    });
    expect(u.regelAufrufe).toEqual(["Beispiel-Regel", "Zweite Regel"]);
    const r = await anfrage(u, abschluss, "POST", "/api/einrichtung", {
      dose,
      koerper: {
        ...grund,
        apiKey: TEST_SCHLUESSEL,
        templateKey: "eurouter",
        ruleNames: ["Beispiel-Regel", "Zweite Regel"],
        ruleName: "Zweite Regel",
      },
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      daten: { anbieter: true, anbieterName: "EUrouter", modell: "Zweite Regel" },
    });
    // Gemerkt: keine zweite Anfrage beim Anbieter.
    expect(u.regelAufrufe).toEqual(["Beispiel-Regel", "Zweite Regel"]);
    const [anbieter] = await repo.providers.list(u.db);
    expect(anbieter?.templateKey).toBe("eurouter");
    if (anbieter === undefined) throw new Error("kein Anbieter");
    expect((await regelnVon(u.db, anbieter)).map((r2) => r2.name)).toEqual([
      "Beispiel-Regel",
      "Zweite Regel",
    ]);
    const bot = await repo.bots.getDefault(u.db);
    const modell = await repo.models.get(u.db, bot?.modelId as never);
    expect(modell?.slug).toBe("rule:Zweite Regel");
  });

  it("Einrichtung mit zweitem Schlüssel: Test nennt je Regel die Angabe, Abschluss speichert Schlüssel und Vorgaben", async () => {
    const { u, test, abschluss, dose } = await vorab();
    u.zustand.kontoRegeln = [
      { name: "Beispiel-Regel", policy: { data_residency: "EU" } },
      { name: "Zweite Regel", policy: { data_residency: "US" } },
    ];
    const koerper = {
      setupCode: TEST_CODE,
      apiKey: TEST_SCHLUESSEL,
      templateKey: "eurouter",
      ruleNames: ["Beispiel-Regel", "Zweite Regel"],
      managementKey: TEST_VERWALTUNGSSCHLUESSEL,
    };
    const t1 = await anfrage(u, test, "POST", "/api/einrichtung/verbindungstest", {
      dose,
      koerper,
    });
    expect(t1.status).toBe(200);
    expect(t1.body).toMatchObject({
      daten: {
        regeln: [
          { name: "Beispiel-Regel", eu: true },
          { name: "Zweite Regel", eu: false },
        ],
      },
    });
    const r = await anfrage(u, abschluss, "POST", "/api/einrichtung", {
      dose,
      koerper: {
        ...grund,
        apiKey: TEST_SCHLUESSEL,
        templateKey: "eurouter",
        ruleNames: ["Beispiel-Regel", "Zweite Regel"],
        ruleName: "Zweite Regel",
        managementKey: TEST_VERWALTUNGSSCHLUESSEL,
      },
    });
    expect(r.status).toBe(200);
    const mitSchluessel = await repo.providers.getWithKey(
      u.db,
      (await repo.providers.list(u.db))[0]?.id as never,
    );
    expect(mitSchluessel?.managementKeyEnc).toMatch(/^v2:/);
    expect(JSON.stringify(r.body)).not.toContain(TEST_VERWALTUNGSSCHLUESSEL);
    const regeln = await regelnVon(u.db, mitSchluessel?.provider as never);
    expect(regeln.map((x) => [x.name, x.vorgabe?.policy.data_residency])).toEqual([
      ["Beispiel-Regel", "EU"],
      ["Zweite Regel", "US"],
    ]);
  });

  it("Einrichtung mit zweitem Schlüssel, der die Regeln nicht lesen darf: Fehler am Feld, nichts eingerichtet", async () => {
    const { u, test, abschluss, dose } = await vorab();
    u.zustand.listeErsatz = { ok: false, code: "nicht_erlaubt" };
    const grundKoerper = {
      apiKey: TEST_SCHLUESSEL,
      templateKey: "eurouter",
      ruleNames: ["Beispiel-Regel"],
      managementKey: TEST_VERWALTUNGSSCHLUESSEL,
    };
    const t1 = await anfrage(u, test, "POST", "/api/einrichtung/verbindungstest", {
      dose,
      koerper: { setupCode: TEST_CODE, ...grundKoerper },
    });
    expect(t1.body).toMatchObject({
      fehler: {
        text: "Dieser Schlüssel darf die Regeln nicht lesen.",
        felder: [{ feld: "managementKey" }],
      },
    });
    const r = await anfrage(u, abschluss, "POST", "/api/einrichtung", {
      dose,
      koerper: { ...grund, ...grundKoerper },
    });
    expect(r.status).toBe(502);
    expect(await repo.settings.isSetupComplete(u.db)).toBe(false);
  });

  it("ohne zweiten Schlüssel: keine Angabe je Regel und keine Kennzeichnung", async () => {
    const { u, test, dose } = await vorab();
    const r = await anfrage(u, test, "POST", "/api/einrichtung/verbindungstest", {
      dose,
      koerper: {
        setupCode: TEST_CODE,
        apiKey: TEST_SCHLUESSEL,
        templateKey: "eurouter",
        ruleNames: ["Beispiel-Regel"],
      },
    });
    const regeln = (r.body as unknown as { daten: { regeln: { eu?: boolean }[] } }).daten.regeln;
    expect(regeln[0]?.eu).toBeUndefined();
    expect(u.listeAufrufe).toEqual([]);
  });

  it("zweiter Schlüssel ohne Regeln oder bei Mistral: abgewiesen", async () => {
    const { u, test, dose } = await vorab();
    const r = await anfrage(u, test, "POST", "/api/einrichtung/verbindungstest", {
      dose,
      koerper: {
        setupCode: TEST_CODE,
        apiKey: TEST_SCHLUESSEL,
        templateKey: "mistral",
        managementKey: TEST_VERWALTUNGSSCHLUESSEL,
      },
    });
    expect(r.status).toBe(400);
  });

  it("Abschluss mit einer nicht geprüften, unbekannten Regel: 400, nichts eingerichtet", async () => {
    const { u, abschluss, dose } = await vorab();
    const r = await anfrage(u, abschluss, "POST", "/api/einrichtung", {
      dose,
      koerper: {
        ...grund,
        apiKey: TEST_SCHLUESSEL,
        templateKey: "eurouter",
        ruleNames: ["Unbekannt"],
      },
    });
    expect(r.status).toBe(400);
    expect(await repo.settings.isSetupComplete(u.db)).toBe(false);
  });

  it("Mistral: Modell-Liste wie bisher; Regeln bei Mistral abgewiesen", async () => {
    const { u, test, dose } = await vorab();
    const r = await anfrage(u, test, "POST", "/api/einrichtung/verbindungstest", {
      dose,
      koerper: { setupCode: TEST_CODE, apiKey: TEST_SCHLUESSEL, templateKey: "mistral" },
    });
    expect(r.body).toMatchObject({
      daten: {
        modelle: expect.arrayContaining([expect.objectContaining({ slug: "beispiel/modell-a" })]),
      },
    });
    expect(u.regelAufrufe).toEqual([]);
  });

  it("eigener Anbieter: geht nur, wenn der Server einen vorsieht; der Test hat einen", async () => {
    const { u, test, dose } = await vorab();
    const r = await anfrage(u, test, "POST", "/api/einrichtung/verbindungstest", {
      dose,
      koerper: { setupCode: TEST_CODE, apiKey: TEST_SCHLUESSEL, templateKey: "eigener" },
    });
    expect(r.status).toBe(200);
    u.dienste.einrichtungsAnbieter = () => u.dienste.vorlage("eurouter");
    const nein = await anfrage(u, test, "POST", "/api/einrichtung/verbindungstest", {
      dose,
      koerper: { setupCode: TEST_CODE, apiKey: TEST_SCHLUESSEL, templateKey: "eigener" },
    });
    expect(nein.body).toMatchObject({ fehler: { text: t("anbieterwahl.eigen.spaeter") } });
  });
});

describe("Namen und Ort", () => {
  it("Name eines eigenen Anbieters wird vor dem Speichern bereinigt", async () => {
    const e = await eingerichtet();
    const r = await e.rufe(e.r.anbieterAnlegen, "POST", "/api/anbieter", {
      koerper: {
        name: "Mein‮  Dienst\u0007",
        baseUrl: "https://dienst.example/v1",
        region: "eu",
        apiKey: TEST_SCHLUESSEL,
      },
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ daten: { anbieter: { name: "Mein Dienst" } } });
    const nurUnsichtbar = await e.rufe(e.r.anbieterAnlegen, "POST", "/api/anbieter", {
      koerper: {
        name: "​‮",
        baseUrl: "https://dienst2.example/v1",
        region: "eu",
        apiKey: TEST_SCHLUESSEL,
      },
    });
    expect(nurUnsichtbar.status).toBe(400);
  });

  it("lokal mit öffentlicher IP-Adresse: abgewiesen, mit Satz am Feld Adresse", async () => {
    const e = await eingerichtet();
    const r = await e.rufe(e.r.anbieterAnlegen, "POST", "/api/anbieter", {
      koerper: { name: "Fremd", baseUrl: "http://8.8.8.8:11434/v1", region: "local" },
    });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      fehler: { text: t("anbieter.url.nicht_lokal"), felder: [{ feld: "baseUrl" }] },
    });
    // Gegenprobe: im eigenen Netz geht es (Verbindungstest im Ersatz).
    const ok = await e.rufe(e.r.anbieterAnlegen, "POST", "/api/anbieter", {
      koerper: { name: "Im Netz", baseUrl: "http://192.168.7.7:11434/v1", region: "local" },
    });
    expect(ok.status).not.toBe(400);
    void newId;
  });
});
