/**
 * PaiBot – Tests der Routen für Anbieter und Modelle: Sitzung, Prüfzeichen, Eingaben, Tor und
 * Belege; der Schlüssel kommt in keiner Antwort und in keinem Beleg vor.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { decryptSecret } from "@paibot/crypto";
import { repo } from "@paibot/db";
import { BASE_URL_PROBLEMS, baseUrlProblemKey, testConnection } from "@paibot/llm";
import { providerSecretBinding, secretAad } from "@paibot/shared/bindung";
import { PaiBotError } from "@paibot/shared/fehler";
import { newId, type ProviderId } from "@paibot/shared/ids";
import { t } from "@paibot/shared/texte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { anfrage, Keksdose, TEST_MODELLE, TEST_SCHLUESSEL } from "../zugang/testing";
import { adresseGeaendert, pruefeAdresse } from "./anbieter";
import {
  belegeAlsText,
  belegeSeit,
  type Eingerichtet,
  eingerichtet,
  letzteNummer,
} from "./testing";

vi.setConfig({ testTimeout: 60_000 });

const NEUER_SCHLUESSEL = "beispiel-schluessel-neu-7731";
const FALSCHER_SCHLUESSEL = "beispiel-schluessel-falsch-0815";

async function anbieterVon(e: Eingerichtet) {
  const [anbieter] = await repo.providers.list(e.u.db);
  if (anbieter === undefined) throw new Error("kein Anbieter");
  return anbieter;
}

function koerperVon(anbieter: {
  templateKey: string;
  name: string;
  baseUrl: string;
  region: string;
}) {
  return {
    templateKey: anbieter.templateKey,
    name: anbieter.name,
    baseUrl: anbieter.baseUrl,
    region: anbieter.region,
  };
}

async function gespeicherterSchluessel(e: Eingerichtet, id: string, baseUrl: string) {
  const mit = await repo.providers.getWithKey(e.u.db, id as ProviderId);
  if (mit?.apiKeyEnc === undefined) return undefined;
  return decryptSecret(mit.apiKeyEnc, e.u.schluessel.geheimnisse, {
    aad: secretAad(providerSecretBinding(id as ProviderId, baseUrl)),
  });
}

/** Kein Schlüssel im Klartext: weder in Antworten noch in Belegen. */
async function ohneSchluessel(e: Eingerichtet, ...schluessel: string[]) {
  const belege = await belegeAlsText(e.u);
  for (const s of [TEST_SCHLUESSEL, ...schluessel]) {
    for (const antwort of e.antworten) expect(antwort).not.toContain(s);
    expect(belege.text).not.toContain(s);
  }
}

let server: Server | undefined;
afterEach(async () => {
  await new Promise<void>((fertig) => (server ? server.close(() => fertig()) : fertig()));
  server = undefined;
});

describe("GET /api/anbieter", () => {
  it("zeigt den Anbieter nur mit „Schlüssel gesetzt“ und die Vorlage", async () => {
    const e = await eingerichtet();
    const r = await e.rufe(e.r.anbieterListe, "GET", "/api/anbieter");
    expect(r.status).toBe(200);
    const daten = r.body.daten as { anbieter: { keySet: boolean }[]; vorlage: { name: string } };
    expect(daten.anbieter).toHaveLength(1);
    expect(daten.anbieter[0]?.keySet).toBe(true);
    expect(daten.vorlage.name).toBe("Beispiel-Anbieter");
    expect(r.antwort.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(daten)).not.toMatch(/apiKey|v2:/);
    await ohneSchluessel(e);
  });

  it("weist ohne Sitzung ab", async () => {
    const e = await eingerichtet();
    const r = await anfrage(e.u, e.r.anbieterListe, "GET", "/api/anbieter", {
      dose: new Keksdose(),
    });
    expect(r.status).toBe(401);
  });
});

describe("POST /api/anbieter/verbindungstest", () => {
  it("prüft den gespeicherten Schlüssel und meldet die Zahl der Modelle", async () => {
    const e = await eingerichtet();
    const a = await anbieterVon(e);
    const r = await e.rufe(e.r.verbindungstest, "POST", "/api/anbieter/verbindungstest", {
      koerper: { providerId: a.id },
    });
    expect(r.status).toBe(200);
    expect(r.body.daten).toEqual({ anzahl: TEST_MODELLE.length });
    expect(e.u.anbieterAufrufe.at(-1)).toBe(TEST_SCHLUESSEL);
    await ohneSchluessel(e);
  });

  it("falscher Schlüssel: in Worten mit Ausweg, am Feld Schlüssel, nichts gespeichert", async () => {
    const e = await eingerichtet();
    const a = await anbieterVon(e);
    const vorher = await letzteNummer(e.u);
    const r = await e.rufe(e.r.verbindungstest, "POST", "/api/anbieter/verbindungstest", {
      koerper: { providerId: a.id, apiKey: FALSCHER_SCHLUESSEL },
    });
    expect(r.status).toBe(502);
    expect(r.body.fehler).toMatchObject({
      code: "schluessel_ungueltig",
      text: t("modelle.test.schluessel_ungueltig", { anbieter: a.name }),
      ausweg: t("modelle.test.schluessel_ungueltig.ausweg", { anbieter: a.name }),
      felder: [{ feld: "apiKey", code: "ungueltig" }],
    });
    expect(await letzteNummer(e.u)).toBe(vorher);
    expect(await gespeicherterSchluessel(e, a.id, a.baseUrl)).toBe(TEST_SCHLUESSEL);
    await ohneSchluessel(e, FALSCHER_SCHLUESSEL);
  });

  it("nicht erreichbar: eigener Satz mit Ausweg, ohne Feld", async () => {
    const e = await eingerichtet();
    e.u.dienste.verbindungTesten = async () => ({ ok: false, code: "anbieter_nicht_erreichbar" });
    const r = await e.rufe(e.r.verbindungstest, "POST", "/api/anbieter/verbindungstest", {
      koerper: { apiKey: NEUER_SCHLUESSEL },
    });
    expect(r.status).toBe(502);
    expect(r.body.fehler).toMatchObject({
      code: "anbieter_nicht_erreichbar",
      text: t("modelle.test.anbieter_nicht_erreichbar", { anbieter: "Beispiel-Anbieter" }),
    });
    expect((r.body.fehler as { felder?: unknown }).felder).toBeUndefined();
  });

  it("Zeitgrenze: ein Anbieter, der nicht antwortet, gilt als nicht erreichbar", async () => {
    const e = await eingerichtet();
    server = createServer(() => {
      // antwortet absichtlich nie
    });
    await new Promise<void>((fertig) => server?.listen(0, "127.0.0.1", () => fertig()));
    const port = (server.address() as AddressInfo).port;
    e.u.dienste.verbindungTesten = (anbieter, schluessel) =>
      testConnection({ baseUrl: anbieter.baseUrl, region: anbieter.region }, schluessel, {
        timeoutMs: 300,
      });
    e.u.dienste.einrichtungsAnbieter = () => ({
      templateKey: "eigener",
      name: "Langsamer Anbieter",
      baseUrl: `http://127.0.0.1:${port}/v1`,
      region: "local",
    });
    const r = await e.rufe(e.r.verbindungstest, "POST", "/api/anbieter/verbindungstest", {
      koerper: { apiKey: NEUER_SCHLUESSEL },
    });
    expect(r.status).toBe(502);
    expect(r.body.fehler).toMatchObject({ code: "anbieter_nicht_erreichbar" });
  });

  it("verlangt Prüfzeichen und Herkunft und zählt das Limit", async () => {
    const e = await eingerichtet();
    const ohne = await e.rufe(e.r.verbindungstest, "POST", "/api/anbieter/verbindungstest", {
      koerper: { apiKey: NEUER_SCHLUESSEL },
      pruefzeichen: null,
    });
    expect(ohne.status).toBe(403);
    expect(ohne.body.fehler).toMatchObject({ code: "pruefzeichen_fehlt" });
    const fremd = await e.rufe(e.r.verbindungstest, "POST", "/api/anbieter/verbindungstest", {
      koerper: { apiKey: NEUER_SCHLUESSEL },
      origin: "https://fremd.example",
    });
    expect(fremd.body.fehler).toMatchObject({ code: "herkunft_falsch" });
    let letzte = 0;
    for (let i = 0; i < 11; i++) {
      const r = await e.rufe(e.r.verbindungstest, "POST", "/api/anbieter/verbindungstest", {
        koerper: { apiKey: TEST_SCHLUESSEL },
      });
      letzte = r.status;
    }
    expect(letzte).toBe(429);
  });

  it("ohne Schlüssel und ohne Anbieter ist die Eingabe ungültig", async () => {
    const e = await eingerichtet();
    const r = await e.rufe(e.r.verbindungstest, "POST", "/api/anbieter/verbindungstest", {
      koerper: {},
    });
    expect(r.status).toBe(400);
    expect(r.body.fehler).toMatchObject({ code: "eingabe_ungueltig" });
  });
});

describe("PUT /api/anbieter/:id", () => {
  it("ersetzt den Schlüssel: erst falsch (abgelehnt, alter bleibt), dann richtig (zwei Belege)", async () => {
    const e = await eingerichtet();
    const a = await anbieterVon(e);
    const pfad = `/api/anbieter/${a.id}`;
    const vorher = await letzteNummer(e.u);
    const falsch = await e.rufe(e.r.anbieterAendern, "PUT", pfad, {
      params: { id: a.id },
      koerper: { ...koerperVon(a), apiKey: FALSCHER_SCHLUESSEL },
    });
    expect(falsch.status).toBe(502);
    expect(falsch.body.fehler).toMatchObject({ code: "schluessel_ungueltig" });
    expect(await letzteNummer(e.u)).toBe(vorher);
    expect(await gespeicherterSchluessel(e, a.id, a.baseUrl)).toBe(TEST_SCHLUESSEL);

    e.u.dienste.verbindungTesten = async (_a, s) =>
      s === NEUER_SCHLUESSEL
        ? { ok: true, models: TEST_MODELLE }
        : { ok: false, code: "schluessel_ungueltig" };
    const richtig = await e.rufe(e.r.anbieterAendern, "PUT", pfad, {
      params: { id: a.id },
      koerper: { ...koerperVon(a), apiKey: NEUER_SCHLUESSEL },
    });
    expect(richtig.status).toBe(200);
    expect(richtig.body.daten).toMatchObject({ anbieter: { keySet: true, lastCheckOk: true } });
    expect(await gespeicherterSchluessel(e, a.id, a.baseUrl)).toBe(NEUER_SCHLUESSEL);
    const belege = await belegeSeit(e.u, vorher);
    expect(belege.map((b) => [b.typ, b.aktion])).toEqual([
      ["decision", "anbieter.speichern"],
      ["result", "anbieter.speichern"],
    ]);
    expect(belege[0]?.body).toMatchObject({
      facts: { created: false, keySet: true, credential: "sitzung" },
    });
    await ohneSchluessel(e, NEUER_SCHLUESSEL, FALSCHER_SCHLUESSEL);
  });

  it("neue Adresse ohne neuen Schlüssel: abgelehnt mit Satz, kein Beleg, Schlüssel unverändert", async () => {
    const e = await eingerichtet();
    const a = await anbieterVon(e);
    const vorher = await letzteNummer(e.u);
    const r = await e.rufe(e.r.anbieterAendern, "PUT", `/api/anbieter/${a.id}`, {
      params: { id: a.id },
      koerper: { ...koerperVon(a), baseUrl: "http://127.0.0.1:10/v1" },
    });
    expect(r.status).toBe(400);
    expect(r.body.fehler).toMatchObject({
      code: "eingabe_ungueltig",
      text: t("modelle.schluessel.adresse_neu"),
      felder: [{ feld: "apiKey", code: "fehlt" }],
    });
    expect(await letzteNummer(e.u)).toBe(vorher);
    expect((await anbieterVon(e)).baseUrl).toBe(a.baseUrl);
    expect(await gespeicherterSchluessel(e, a.id, a.baseUrl)).toBe(TEST_SCHLUESSEL);
  });

  it("neue Adresse mit Schlüssel: der Schlüssel ist danach an die neue Adresse gebunden", async () => {
    const e = await eingerichtet();
    const a = await anbieterVon(e);
    const neu = "http://127.0.0.1:10/v1";
    const r = await e.rufe(e.r.anbieterAendern, "PUT", `/api/anbieter/${a.id}`, {
      params: { id: a.id },
      koerper: { ...koerperVon(a), baseUrl: neu, apiKey: TEST_SCHLUESSEL },
    });
    expect(r.status).toBe(200);
    expect(await gespeicherterSchluessel(e, a.id, neu)).toBe(TEST_SCHLUESSEL);
    await expect(gespeicherterSchluessel(e, a.id, a.baseUrl)).rejects.toThrow();
    await ohneSchluessel(e);
  });

  it("nur der Name ändert sich: Schlüssel bleibt, kein Verbindungstest", async () => {
    const e = await eingerichtet();
    const a = await anbieterVon(e);
    const aufrufe = e.u.anbieterAufrufe.length;
    const r = await e.rufe(e.r.anbieterAendern, "PUT", `/api/anbieter/${a.id}`, {
      params: { id: a.id },
      koerper: { ...koerperVon(a), name: "Mein Test-Anbieter" },
    });
    expect(r.status).toBe(200);
    expect(e.u.anbieterAufrufe.length).toBe(aufrufe);
    expect(await gespeicherterSchluessel(e, a.id, a.baseUrl)).toBe(TEST_SCHLUESSEL);
  });

  it.each([
    ["interner_dienst", "https://postgres/v1"],
    ["link_local", "https://169.254.169.254/v1"],
    ["private_adresse", "https://10.0.0.5/v1"],
    ["port", "https://api.example.com:8080/v1"],
    ["zugangsdaten_in_url", "https://nutzer:geheim@api.example.com/v1"],
  ] as const)("ungültige Adresse (%s) mit eigenem Satz", async (problem, baseUrl) => {
    const e = await eingerichtet();
    const a = await anbieterVon(e);
    const r = await e.rufe(e.r.anbieterAendern, "PUT", `/api/anbieter/${a.id}`, {
      params: { id: a.id },
      koerper: { templateKey: "eigener", name: "X", baseUrl, region: "eu", apiKey: "neu-123" },
    });
    expect(r.status).toBe(400);
    expect(r.body.fehler).toMatchObject({
      code: "eingabe_ungueltig",
      text: t(baseUrlProblemKey(problem)),
      felder: [{ feld: "baseUrl", code: "ungueltig" }],
    });
  });

  it("http außerhalb von „lokal“ weist schon die Eingabe-Prüfung ab", async () => {
    const e = await eingerichtet();
    const a = await anbieterVon(e);
    const r = await e.rufe(e.r.anbieterAendern, "PUT", `/api/anbieter/${a.id}`, {
      params: { id: a.id },
      koerper: {
        templateKey: "eigener",
        name: "X",
        baseUrl: "http://api.example.com/v1",
        region: "eu",
      },
    });
    expect(r.status).toBe(400);
    expect(r.body.fehler).toMatchObject({ felder: [{ feld: "baseUrl" }] });
  });

  it("Vorlage EUrouter: Adresse und Region sind fest", async () => {
    const e = await eingerichtet();
    const a = await anbieterVon(e);
    const r = await e.rufe(e.r.anbieterAendern, "PUT", `/api/anbieter/${a.id}`, {
      params: { id: a.id },
      koerper: {
        templateKey: "eurouter",
        name: "EUrouter",
        baseUrl: "https://api.example.com/v1",
        region: "eu",
        apiKey: "neu-123",
      },
    });
    expect(r.body.fehler).toMatchObject({ text: t("modelle.schluessel.vorlage_fest") });
  });

  it("unbekannter Anbieter: nicht gefunden", async () => {
    const e = await eingerichtet();
    const id = newId("provider");
    const r = await e.rufe(e.r.anbieterAendern, "PUT", `/api/anbieter/${id}`, {
      params: { id },
      koerper: {
        templateKey: "eigener",
        name: "X",
        baseUrl: "http://127.0.0.1:9/v1",
        region: "local",
      },
    });
    expect(r.status).toBe(404);
  });
});

describe("Prüfung der Adresse (jede Problem-Art hat einen Satz)", () => {
  const faelle: Record<(typeof BASE_URL_PROBLEMS)[number], [string, "eu" | "local"]> = {
    keine_url: ["kein-url", "eu"],
    protokoll: ["ftp://api.example.com/v1", "eu"],
    interner_dienst: ["https://worker/v1", "local"],
    link_local: ["http://169.254.169.254/v1", "local"],
    private_adresse: ["https://192.168.1.10/v1", "eu"],
    port: ["https://api.example.com:9000/v1", "eu"],
    zugangsdaten_in_url: ["https://a:b@api.example.com/v1", "eu"],
  };
  it.each(BASE_URL_PROBLEMS)("%s", (problem) => {
    const [baseUrl, region] = faelle[problem];
    let fehler: unknown;
    try {
      pruefeAdresse({ templateKey: "eigener", baseUrl, region });
    } catch (e) {
      fehler = e;
    }
    expect(fehler).toBeInstanceOf(PaiBotError);
    expect((fehler as PaiBotError).text).toBe(t(baseUrlProblemKey(problem)));
    expect((fehler as PaiBotError).text?.length).toBeGreaterThan(10);
  });

  it("lokal mit http ist erlaubt, Schrägstriche am Ende zählen nicht als neue Adresse", () => {
    expect(
      pruefeAdresse({
        templateKey: "eigener",
        baseUrl: "http://localhost:11434/v1/",
        region: "local",
      }),
    ).toBe("http://localhost:11434/v1");
    expect(adresseGeaendert("https://api.example.com/v1/", "https://api.example.com/v1")).toBe(
      false,
    );
    expect(adresseGeaendert("https://api.example.com/v1", "https://api.example.com/v2")).toBe(true);
  });
});

describe("DELETE und POST /api/anbieter", () => {
  it("entfernt Anbieter samt Schlüssel (zwei Belege), danach neu anlegen über die Vorlage", async () => {
    const e = await eingerichtet();
    const a = await anbieterVon(e);
    const vorher = await letzteNummer(e.u);
    const weg = await e.rufe(e.r.anbieterLoeschen, "DELETE", `/api/anbieter/${a.id}`, {
      params: { id: a.id },
    });
    expect(weg.status).toBe(200);
    expect(await repo.providers.list(e.u.db)).toHaveLength(0);
    expect((await repo.bots.getDefault(e.u.db))?.modelId).toBeUndefined();
    expect((await belegeSeit(e.u, vorher)).map((b) => [b.typ, b.aktion])).toEqual([
      ["decision", "anbieter.loeschen"],
      ["result", "anbieter.loeschen"],
    ]);

    const keinSchluessel = await e.rufe(e.r.anbieterAnlegen, "POST", "/api/anbieter", {
      koerper: {
        templateKey: "eigener",
        name: "Fern",
        baseUrl: "https://api.example.com/v1",
        region: "eu",
      },
    });
    expect(keinSchluessel.status).toBe(400);
    expect(keinSchluessel.body.fehler).toMatchObject({
      felder: [{ feld: "apiKey", code: "fehlt" }],
    });

    const vorlage = e.u.dienste.einrichtungsAnbieter();
    const neu = await e.rufe(e.r.anbieterAnlegen, "POST", "/api/anbieter", {
      koerper: { ...koerperVon(vorlage), apiKey: TEST_SCHLUESSEL },
    });
    expect(neu.status).toBe(201);
    const angelegt = await anbieterVon(e);
    expect(await gespeicherterSchluessel(e, angelegt.id, angelegt.baseUrl)).toBe(TEST_SCHLUESSEL);
    await ohneSchluessel(e);
  });

  it("lokaler Anbieter ohne Schlüssel ist erlaubt", async () => {
    const e = await eingerichtet();
    e.u.dienste.verbindungTesten = async () => ({ ok: true, models: TEST_MODELLE });
    const r = await e.rufe(e.r.anbieterAnlegen, "POST", "/api/anbieter", {
      koerper: {
        templateKey: "eigener",
        name: "Lokal",
        baseUrl: "http://localhost:11434/v1",
        region: "local",
      },
    });
    expect(r.status).toBe(201);
    expect(r.body.daten).toMatchObject({ anbieter: { keySet: false, region: "local" } });
  });
});

describe("Modelle und Modellwahl", () => {
  it("liefert die Liste mit Kennungen; gewählt werden kann nur daraus (mit Belegen)", async () => {
    const e = await eingerichtet();
    const a = await anbieterVon(e);
    const r = await e.rufe(e.r.modelle, "GET", `/api/anbieter/${a.id}/modelle`, {
      params: { id: a.id },
    });
    expect(r.status).toBe(200);
    const modelle = (r.body.daten as { modelle: { id: string; slug: string }[] }).modelle;
    expect(modelle.map((m) => m.slug)).toEqual(TEST_MODELLE.map((m) => m.slug));
    const b = modelle[1];
    if (b === undefined) throw new Error("Modell B fehlt");

    const vorher = await letzteNummer(e.u);
    const wahl = await e.rufe(e.r.botModell, "PUT", "/api/bot/modell", {
      koerper: { modelId: b.id },
    });
    expect(wahl.status).toBe(200);
    expect((await repo.bots.getDefault(e.u.db))?.modelId).toBe(b.id);
    expect((await belegeSeit(e.u, vorher)).map((x) => [x.typ, x.aktion])).toEqual([
      ["decision", "modell.waehlen"],
      ["result", "modell.waehlen"],
    ]);

    const fremd = await e.rufe(e.r.botModell, "PUT", "/api/bot/modell", {
      koerper: { modelId: newId("model") },
    });
    expect(fremd.status).toBe(400);
    expect(fremd.body.fehler).toMatchObject({
      text: t("modelle.nicht_in_liste"),
      felder: [{ feld: "modelId", code: "ungueltig" }],
    });

    // Meldet der Anbieter Modell B nicht mehr, ist es nicht mehr wählbar.
    e.u.dienste.verbindungTesten = async () => ({ ok: true, models: [TEST_MODELLE[0] as never] });
    await e.rufe(e.r.modelle, "GET", `/api/anbieter/${a.id}/modelle`, { params: { id: a.id } });
    const veraltet = await e.rufe(e.r.botModell, "PUT", "/api/bot/modell", {
      koerper: { modelId: b.id },
    });
    expect(veraltet.status).toBe(400);
    await ohneSchluessel(e);
  });

  it("Modell-Liste mit falschem gespeicherten Schlüssel: Fehler in Worten", async () => {
    const e = await eingerichtet();
    const a = await anbieterVon(e);
    e.u.dienste.verbindungTesten = async () => ({ ok: false, code: "schluessel_ungueltig" });
    const r = await e.rufe(e.r.modelle, "GET", `/api/anbieter/${a.id}/modelle`, {
      params: { id: a.id },
    });
    expect(r.status).toBe(502);
    expect(r.body.fehler).toMatchObject({ code: "schluessel_ungueltig" });
  });

  it("ungültige Modell-Kennung weist die Eingabe-Prüfung ab", async () => {
    const e = await eingerichtet();
    const r = await e.rufe(e.r.botModell, "PUT", "/api/bot/modell", { koerper: { modelId: "x" } });
    expect(r.status).toBe(400);
  });
});
