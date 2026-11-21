/**
 * PaiBot – Tests: zweiter Schlüssel eines EUrouter-Eintrags und die Vorgaben der Routing-Regeln.
 * Die Kennzeichnung „EU“ gibt es nur bei `data_residency: "EU"` der Regel in der Liste des Kontos;
 * der Schlüssel taucht in keiner Antwort, keinem Beleg und keinem Protokoll auf; Kennungen des
 * Kontos werden nicht gespeichert; Seite öffnen schreibt nichts.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { decryptSecret } from "@paibot/crypto";
import { repo } from "@paibot/db";
import { createTestDb } from "@paibot/db/testing";
import { type RoutingRulesRead, readRoutingRules } from "@paibot/llm";
import {
  providerManagementKeyBinding,
  providerSecretBinding,
  secretAad,
} from "@paibot/shared/bindung";
import { newId, type ProviderId } from "@paibot/shared/ids";
import { t } from "@paibot/shared/texte";
import { describe, expect, it, vi } from "vitest";
import { ladeBereitschaft, modellInfo } from "../chat/laden";
import { TEST_SCHLUESSEL, TEST_VERWALTUNGSSCHLUESSEL, TEST_VORLAGEN_URL } from "../zugang/testing";
import { anbieterModelle, anbieterModelleLesen } from "./anbieter";
import { anbieterRegelHinzufuegen, regelnVon } from "./regeln";
import { modelleSeitenDaten } from "./seite";
import { belegeSeit, type Eingerichtet, eingerichtet, letzteNummer } from "./testing";
import {
  anbieterRegelListe,
  anbieterRegelNeuPruefen,
  anbieterVerwaltungsschluesselEntfernen,
  anbieterVerwaltungsschluesselSetzen,
} from "./verwaltung";
import { istEuBelegt } from "./vorgabe";

vi.setConfig({ testTimeout: 60_000 });

const EUROUTER = {
  templateKey: "eurouter",
  name: "EUrouter",
  baseUrl: TEST_VORLAGEN_URL,
  region: "local",
} as const;

async function mitEurouter() {
  const testDb = await createTestDb();
  const e = await eingerichtet({ db: testDb.db });
  const r = await e.rufe(e.r.anbieterAnlegen, "POST", "/api/anbieter", {
    koerper: { ...EUROUTER, apiKey: TEST_SCHLUESSEL },
  });
  expect(r.status).toBe(201);
  const id = (r.body as { daten: { anbieter: { id: string } } }).daten.anbieter.id;
  const h = {
    setzen: e.u.handler("anbieterVerwaltungsschluesselSetzen", anbieterVerwaltungsschluesselSetzen),
    weg: e.u.handler(
      "anbieterVerwaltungsschluesselEntfernen",
      anbieterVerwaltungsschluesselEntfernen,
    ),
    liste: e.u.handler("anbieterRegelListe", anbieterRegelListe),
    neu: e.u.handler("anbieterRegelNeuPruefen", anbieterRegelNeuPruefen),
    hinzu: e.u.handler("anbieterRegelHinzufuegen", anbieterRegelHinzufuegen),
    lesen: e.u.handler("anbieterModelleLesen", anbieterModelleLesen),
    abgleich: e.u.handler("anbieterModelle", anbieterModelle),
  };
  const pfad = `/api/anbieter/${id}`;
  return {
    ...e,
    id,
    h,
    client: testDb.client,
    setzen: (key = TEST_VERWALTUNGSSCHLUESSEL) =>
      e.rufe(h.setzen, "PUT", `${pfad}/verwaltungsschluessel`, {
        params: { id },
        koerper: { managementKey: key },
      }),
    hinzufuegen: (name: string) =>
      e.rufe(h.hinzu, "POST", `${pfad}/regeln`, { params: { id }, koerper: { name } }),
    neuPruefen: (modelId?: string) =>
      e.rufe(h.neu, "POST", `${pfad}/regeln/neu-pruefen`, {
        params: { id },
        koerper: modelId === undefined ? {} : { modelId },
      }),
  };
}
type Umgebung = Awaited<ReturnType<typeof mitEurouter>>;

async function anbieter(e: Umgebung) {
  const a = await repo.providers.get(e.u.db, e.id as ProviderId);
  if (a === undefined) throw new Error("kein Anbieter");
  return a;
}

/** Alle Tabellen der Datenbank als ein Text (zum Suchen nach Klartext). */
async function alleDaten(e: Umgebung, ohne: string[] = []): Promise<string> {
  const { rows } = await e.client.query<{ name: string }>(
    `select table_name as name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'`,
  );
  const teile: string[] = [];
  for (const { name } of rows) {
    if (ohne.includes(name)) continue;
    const r = await e.client.query<{ t: string }>(
      `select to_jsonb(x)::text as t from public."${name}" x`,
    );
    teile.push(...r.rows.map((z) => z.t));
  }
  return teile.join("\n");
}

/** Namen der gespeicherten Regeln mit „EU laut Regel“. */
async function euRegeln(e: Umgebung): Promise<string[]> {
  const regeln = await regelnVon(e.u.db, await anbieter(e));
  return regeln.filter((r) => istEuBelegt(r.vorgabe)).map((r) => r.name);
}

const ALLE_REGELN = [
  "Beispiel-Regel",
  "Zweite Regel",
  "Regel ohne Vorgabe",
  "Regel mit anderem Wert",
  "Regel nur Name",
];

describe("zweiter Schlüssel", () => {
  it("wird nur gespeichert, wenn die Liste damit lesbar ist; getrennt und eigens gebunden verschlüsselt", async () => {
    const e = await mitEurouter();
    const r = await e.setzen();
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, daten: { anbieter: { managementKeySet: true } } });
    const mitSchluessel = await repo.providers.getWithKey(e.u.db, e.id as ProviderId);
    const enc = mitSchluessel?.managementKeyEnc ?? "";
    expect(enc).toMatch(/^v2:/);
    expect(enc).not.toBe(mitSchluessel?.apiKeyEnc);
    const a = await anbieter(e);
    const geheim = e.u.schluessel.geheimnisse;
    expect(
      decryptSecret(enc, geheim, {
        aad: secretAad(providerManagementKeyBinding(a.id as ProviderId, a.baseUrl)),
      }),
    ).toBe(TEST_VERWALTUNGSSCHLUESSEL);
    // Gegenprobe: mit der Bindung des normalen Schlüssels lässt er sich nicht lesen (und umgekehrt).
    expect(() =>
      decryptSecret(enc, geheim, {
        aad: secretAad(providerSecretBinding(a.id as ProviderId, a.baseUrl)),
      }),
    ).toThrow();
    expect(() =>
      decryptSecret(mitSchluessel?.apiKeyEnc ?? "", geheim, {
        aad: secretAad(providerManagementKeyBinding(a.id as ProviderId, a.baseUrl)),
      }),
    ).toThrow();
  });

  it("taucht in keiner Antwort, keinem Beleg, keinem Protokoll und keiner Tabelle im Klartext auf", async () => {
    const e = await mitEurouter();
    await e.setzen();
    await e.hinzufuegen("Beispiel-Regel");
    await e.rufe(e.h.liste, "POST", `/api/anbieter/${e.id}/regeln/liste`, { params: { id: e.id } });
    await e.neuPruefen();
    await e.rufe(e.r.anbieterListe, "GET", "/api/anbieter");
    await e.rufe(e.r.verbindungstest, "POST", "/api/anbieter/verbindungstest", {
      koerper: { providerId: e.id },
    });
    for (const a of e.antworten) expect(a).not.toContain(TEST_VERWALTUNGSSCHLUESSEL);
    expect(e.u.log.join("\n")).not.toContain(TEST_VERWALTUNGSSCHLUESSEL);
    expect(await belegeAlsTextLokal(e)).not.toContain(TEST_VERWALTUNGSSCHLUESSEL);
    const daten = await alleDaten(e);
    expect(daten).not.toContain(TEST_VERWALTUNGSSCHLUESSEL);
    // Gegenprobe: die Suche findet den normalen Schlüssel dort ebenfalls nicht, aber sie sähe Klartext.
    expect(daten).toContain("management_key_enc");
  });

  it("wird nur für die Regel-Liste benutzt, nie für Prüfung einer Regel oder den Verbindungstest", async () => {
    const e = await mitEurouter();
    await e.setzen();
    await e.hinzufuegen("Beispiel-Regel");
    await e.rufe(e.r.verbindungstest, "POST", "/api/anbieter/verbindungstest", {
      koerper: { providerId: e.id },
    });
    expect(e.u.listeAufrufe.every((k) => k === TEST_VERWALTUNGSSCHLUESSEL)).toBe(true);
    expect(e.u.anbieterAufrufe).not.toContain(TEST_VERWALTUNGSSCHLUESSEL);
    expect(e.u.regelAufrufe.length).toBeGreaterThan(0);
    for (const n of e.u.regelAufrufe) expect(n).toBe("Beispiel-Regel");
  });

  it("geht durchs Tor: Beleg „Entscheidung“ und „Ergebnis“, ohne Schlüssel; Fehler schreiben nichts", async () => {
    const e = await mitEurouter();
    const vorher = await letzteNummer(e.u);
    await e.setzen();
    const belege = await belegeSeit(e.u, vorher);
    expect(belege.map((b) => `${b.typ}:${b.aktion}`)).toEqual([
      "decision:anbieter.speichern",
      "result:anbieter.speichern",
    ]);
    expect(JSON.stringify(belege)).toContain("managementKeySet");
    const danach = await letzteNummer(e.u);
    const falsch = await e.setzen("falscher-schluessel-9");
    expect(falsch.status).toBe(502);
    expect(await letzteNummer(e.u)).toBe(danach);
  });

  it("Entfernen: Schlüssel weg, gelesene Vorgaben weg, Beleg", async () => {
    const e = await mitEurouter();
    await e.setzen();
    await e.hinzufuegen("Beispiel-Regel");
    expect(await euRegeln(e)).toEqual(["Beispiel-Regel"]);
    const vorher = await letzteNummer(e.u);
    const r = await e.rufe(e.h.weg, "DELETE", `/api/anbieter/${e.id}/verwaltungsschluessel`, {
      params: { id: e.id },
    });
    expect(r.status).toBe(200);
    const nachher = await repo.providers.getWithKey(e.u.db, e.id as ProviderId);
    expect(nachher?.managementKeyEnc).toBeUndefined();
    expect(nachher?.provider.managementKeySet).toBeUndefined();
    expect(await euRegeln(e)).toEqual([]);
    expect((await belegeSeit(e.u, vorher)).length).toBe(2);
    // Die Regel selbst bleibt benutzbar.
    expect((await regelnVon(e.u.db, await anbieter(e))).map((x) => x.name)).toEqual([
      "Beispiel-Regel",
    ]);
  });
});

describe("Fehler beim Lesen der Liste", () => {
  const faelle: [string, RoutingRulesRead, number, RegExp][] = [
    ["403", { ok: false, code: "nicht_erlaubt" }, 502, /darf die Regeln nicht lesen/],
    ["401", { ok: false, code: "schluessel_ungueltig" }, 502, /nicht angenommen/],
    ["Zeit", { ok: false, code: "zeitueberschreitung" }, 502, /nicht rechtzeitig/],
    ["Form", { ok: false, code: "form" }, 502, /Form, die PaiBot nicht kennt/],
  ];
  it.each(faelle)(
    "%s: eigener Satz mit Ausweg, nichts gespeichert, kein Beleg",
    async (_n, ersatz, status, text) => {
      const e = await mitEurouter();
      e.u.zustand.listeErsatz = ersatz;
      const vorher = await letzteNummer(e.u);
      const r = await e.setzen();
      expect(r.status).toBe(status);
      const fehler = (r.body as unknown as { fehler: { text: string; ausweg?: string } }).fehler;
      expect(fehler.text).toMatch(text);
      expect(fehler.ausweg ?? "").not.toBe("");
      expect((await anbieter(e)).managementKeySet).toBeUndefined();
      expect(await letzteNummer(e.u)).toBe(vorher);
    },
  );

  it("403: Satz wörtlich und Ausweg nennt, wo man den Schlüssel anlegt", async () => {
    const e = await mitEurouter();
    e.u.zustand.listeErsatz = { ok: false, code: "nicht_erlaubt" };
    const r = await e.setzen();
    expect(r.body).toMatchObject({
      fehler: { text: "Dieser Schlüssel darf die Regeln nicht lesen." },
    });
    expect((r.body as unknown as { fehler: { ausweg: string } }).fehler.ausweg).toContain(
      "Management keys",
    );
  });

  it("jeder Fall hat einen anderen Satz", async () => {
    const e = await mitEurouter();
    const texte = new Set<string>();
    for (const [, ersatz] of faelle) {
      e.u.zustand.listeErsatz = ersatz;
      const r = await e.setzen();
      texte.add((r.body as unknown as { fehler: { text: string } }).fehler.text);
    }
    expect(texte.size).toBe(faelle.length);
  });

  it("ohne zweiten Schlüssel: Liste und Erneut prüfen sagen es mit Ausweg", async () => {
    const e = await mitEurouter();
    const r = await e.rufe(e.h.liste, "POST", `/api/anbieter/${e.id}/regeln/liste`, {
      params: { id: e.id },
    });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ fehler: { text: t("verwaltung.fehler.kein_schluessel") } });
    expect((await e.neuPruefen()).status).toBe(400);
  });
});

describe("Kennzeichnung „EU“ nur mit belegter Vorgabe", () => {
  it("genau bei data_residency EU; Feld fehlt, anderer Wert, Groß/klein, nur Name: keine", async () => {
    const e = await mitEurouter();
    e.u.zustand.kontoRegeln = [
      { name: "Beispiel-Regel", policy: { data_residency: "EU" } },
      { name: "Zweite Regel", policy: { data_residency: "US" } },
      { name: "Regel ohne Vorgabe", policy: {} },
      { name: "Regel mit anderem Wert", policy: { data_residency: "eu" } },
    ];
    await e.setzen();
    for (const name of ALLE_REGELN) expect((await e.hinzufuegen(name)).status).toBe(201);
    expect(await euRegeln(e)).toEqual(["Beispiel-Regel"]);
    const regeln = await regelnVon(e.u.db, await anbieter(e));
    const nach = (n: string) => regeln.find((r) => r.name === n);
    expect(nach("Regel nur Name")?.vorgabe).toBeUndefined();
    expect(nach("Zweite Regel")?.vorgabe?.policy.data_residency).toBe("US");
    expect(nach("Regel ohne Vorgabe")?.vorgabe?.policy.data_residency).toBeUndefined();
    expect(nach("Regel mit anderem Wert")?.vorgabe?.policy.data_residency).toBe("eu");
  });

  it("ohne zweiten Schlüssel gibt es nie eine Kennzeichnung, auch bei einer Regel, die EU wäre", async () => {
    const e = await mitEurouter();
    for (const name of ALLE_REGELN) await e.hinzufuegen(name);
    expect(await euRegeln(e)).toEqual([]);
    for (const r of await regelnVon(e.u.db, await anbieter(e))) expect(r.vorgabe).toBeUndefined();
  });

  it("der freie Text „Strict EU data residency“ zählt nie (Antwort in der belegten Form, Feld fehlt)", async () => {
    const e = await mitEurouter();
    const roh = {
      data: [
        regelRoh("Beispiel-Regel", { provider: { allow_fallbacks: true } }),
        regelRoh("Zweite Regel", { provider: { data_residency: "Germany" } }),
        regelRoh("Regel ohne Vorgabe", { provider: { data_residency: "EU" } }),
      ],
    };
    e.u.dienste.kontoRegelnLesen = (a, k) =>
      readRoutingRules(a, k, { fetch: (async () => Response.json(roh)) as typeof fetch });
    // Die Adresse der Vorlage im Test liegt auf dem eigenen Rechner; die Liste kommt vorgespielt.
    expect((await e.setzen("beliebiger-schluessel-1")).status).toBe(200);
    for (const name of ["Beispiel-Regel", "Zweite Regel", "Regel ohne Vorgabe"])
      await e.hinzufuegen(name);
    expect(await euRegeln(e)).toEqual(["Regel ohne Vorgabe"]);
  });

  it("Regeln, die zum Hinzufügen nicht in der Liste stehen: gespeichert mit Hinweis, ohne Kennzeichnung", async () => {
    const e = await mitEurouter();
    await e.setzen();
    e.u.zustand.kontoRegeln = [];
    const r = await e.hinzufuegen("Regel nur Name");
    expect(r.status).toBe(201);
    const daten = (r.body as { daten: { hinweis?: string; regel: { vorgabe?: unknown } } }).daten;
    expect(daten.hinweis).toContain("steht nicht in der Liste");
    expect(daten.regel.vorgabe).toBeUndefined();
    expect(await euRegeln(e)).toEqual([]);
    // unvollständige Liste: anderer Hinweis
    e.u.zustand.unvollstaendig = true;
    const r2 = await e.hinzufuegen("Zweite Regel");
    expect((r2.body as { daten: { hinweis?: string } }).daten.hinweis).toContain(
      "möglicherweise unvollständig",
    );
  });

  it("Liste im Konto: nur eingeschaltete, mit EU-Angabe und „gespeichert“; schreibt nichts", async () => {
    const e = await mitEurouter();
    await e.setzen();
    await e.hinzufuegen("Beispiel-Regel");
    e.u.zustand.unvollstaendig = true;
    const vorher = await letzteNummer(e.u);
    const r = await e.rufe(e.h.liste, "POST", `/api/anbieter/${e.id}/regeln/liste`, {
      params: { id: e.id },
    });
    expect(r.status).toBe(200);
    const daten = (
      r.body as {
        daten: {
          regeln: { name: string; eu: boolean; gespeichert: boolean }[];
          unvollstaendig: boolean;
        };
      }
    ).daten;
    expect(daten.unvollstaendig).toBe(true);
    expect(daten.regeln).toMatchObject([
      { name: "Beispiel-Regel", eu: true, gespeichert: true },
      { name: "Zweite Regel", eu: false, gespeichert: false },
    ]);
    expect(await letzteNummer(e.u)).toBe(vorher);
  });
});

describe("Chat bekommt die Vorgaben der Regel des Bots", () => {
  it("Kopf und Antwortzeile: Vorgaben nur bei einer Regel mit gelesenen Vorgaben", async () => {
    const e = await mitEurouter();
    await e.setzen();
    const hinzu = await e.hinzufuegen("Beispiel-Regel");
    const regelId = (hinzu.body as unknown as { daten: { regel: { id: string } } }).daten.regel.id;
    const wahl = await e.rufe(e.r.botModell, "PUT", "/api/bot/modell", {
      koerper: { modelId: regelId },
    });
    expect(wahl.status).toBe(200);
    const bereit = await ladeBereitschaft(e.u.db, false);
    expect(bereit.modell?.name).toBe("Beispiel-Regel");
    expect(istEuBelegt(bereit.modell?.vorgabe)).toBe(true);
    expect(bereit.modell?.vorgabe?.geprueftText).toBe("20.11.2026");
    const info = await modellInfo(e.u.db, regelId as never);
    expect(istEuBelegt(info?.vorgabe)).toBe(true);
    // Gegenprobe: ein gewöhnliches Modell eines anderen Anbieters hat nie Vorgaben.
    const gewoehnlich = (await repo.models.list(e.u.db)).find(
      (m) => m.slug === "beispiel/modell-a",
    );
    expect((await modellInfo(e.u.db, gewoehnlich?.id as never))?.vorgabe).toBeUndefined();
    // Gegenprobe: ohne zweiten Schlüssel verschwindet die Marke.
    await e.rufe(e.h.weg, "DELETE", `/api/anbieter/${e.id}/verwaltungsschluessel`, {
      params: { id: e.id },
    });
    expect((await ladeBereitschaft(e.u.db, false)).modell?.vorgabe).toBeUndefined();
  });
});

describe("Kennungen des Kontos", () => {
  it("werden weder gespeichert noch beantwortet noch protokolliert", async () => {
    const e = await mitEurouter();
    const IDS = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
    ];
    const roh = {
      data: [
        regelRoh("Beispiel-Regel", {
          id: IDS[0],
          user_id: IDS[1],
          org_id: IDS[2],
          workspace_id: IDS[3],
          description: "Strict EU data residency",
        }),
      ],
    };
    e.u.dienste.kontoRegelnLesen = (a, k) =>
      readRoutingRules(a, k, { fetch: (async () => Response.json(roh)) as typeof fetch });
    await e.setzen("beliebiger-schluessel-1");
    await e.hinzufuegen("Beispiel-Regel");
    await e.rufe(e.h.liste, "POST", `/api/anbieter/${e.id}/regeln/liste`, { params: { id: e.id } });
    await e.neuPruefen();
    const alles = [
      await alleDaten(e),
      e.antworten.join("\n"),
      e.u.log.join("\n"),
      await belegeAlsTextLokal(e),
    ].join("\n");
    for (const kennung of IDS) expect(alles).not.toContain(kennung);
    expect(alles).not.toContain("Strict EU data residency");
    // Gegenprobe: die gespeicherten Vorgaben selbst sind da.
    expect(alles).toContain("data_residency");
  });
});

describe("Erneut prüfen und Alter", () => {
  it("eine Regel oder alle: neuer Zeitpunkt; Angaben älter als der Zeitraum bleiben sichtbar, aber als alt", async () => {
    const e = await mitEurouter();
    await e.setzen();
    await e.hinzufuegen("Beispiel-Regel");
    await e.hinzufuegen("Zweite Regel");
    const [a1] = await regelnVon(e.u.db, await anbieter(e));
    expect(a1?.vorgabe?.veraltet).toBe(false);
    e.u.spaeter(15 * 24 * 60 * 60 * 1000);
    const alt = await regelnVon(e.u.db, await anbieter(e), {
      jetzt: e.u.zeit(),
      zeitzone: "Europe/Berlin",
    });
    expect(alt.map((r) => r.vorgabe?.veraltet)).toEqual([true, true]);
    expect(alt.filter((r) => istEuBelegt(r.vorgabe)).map((r) => r.name)).toEqual([
      "Beispiel-Regel",
    ]);
    // Erneut prüfen für eine Regel: nur diese bekommt einen neuen Zeitpunkt.
    const eins = alt.find((r) => r.name === "Beispiel-Regel");
    const r = await e.neuPruefen(eins?.id);
    expect(r.status).toBe(200);
    const nachher = await regelnVon(e.u.db, await anbieter(e), {
      jetzt: e.u.zeit(),
      zeitzone: "Europe/Berlin",
    });
    expect(nachher.map((x) => [x.name, x.vorgabe?.veraltet])).toEqual([
      ["Beispiel-Regel", false],
      ["Zweite Regel", true],
    ]);
    await e.neuPruefen();
    const alle = await regelnVon(e.u.db, await anbieter(e), {
      jetzt: e.u.zeit(),
      zeitzone: "Europe/Berlin",
    });
    expect(alle.map((x) => x.vorgabe?.veraltet)).toEqual([false, false]);
  });

  it("Regel nicht mehr in der vollständigen Liste: Kennzeichnung entfällt; bei unvollständiger Liste bleibt sie", async () => {
    const e = await mitEurouter();
    await e.setzen();
    await e.hinzufuegen("Beispiel-Regel");
    expect(await euRegeln(e)).toEqual(["Beispiel-Regel"]);
    e.u.zustand.kontoRegeln = [];
    e.u.zustand.unvollstaendig = true;
    const r1 = await e.neuPruefen();
    expect(
      (r1.body as { daten: { vorgaben: { unveraendert: string[] } } }).daten.vorgaben.unveraendert,
    ).toEqual(["Beispiel-Regel"]);
    expect(await euRegeln(e)).toEqual(["Beispiel-Regel"]);
    e.u.zustand.unvollstaendig = false;
    const r2 = await e.neuPruefen();
    expect(
      (r2.body as { daten: { vorgaben: { entfernt: string[] } } }).daten.vorgaben.entfernt,
    ).toEqual(["Beispiel-Regel"]);
    expect(await euRegeln(e)).toEqual([]);
  });

  it("die Regel ändert ihre Vorgabe im Konto: nach dem Erneut-Prüfen gilt die neue", async () => {
    const e = await mitEurouter();
    await e.setzen();
    await e.hinzufuegen("Beispiel-Regel");
    e.u.zustand.kontoRegeln = [{ name: "Beispiel-Regel", policy: { data_residency: "US" } }];
    await e.neuPruefen();
    expect(await euRegeln(e)).toEqual([]);
  });

  it("eine fremde oder erfundene Kennung wird abgelehnt", async () => {
    const e = await mitEurouter();
    await e.setzen();
    const r = await e.neuPruefen(newId("model"));
    expect(r.status).toBe(404);
    expect((await e.neuPruefen("kein-modell")).status).toBe(400);
    // Auch ein Modell, das keine Regel ist, wird abgelehnt.
    const modell = (await repo.models.list(e.u.db)).find((m) => !m.slug.startsWith("rule:"));
    expect((await e.neuPruefen(modell?.id)).status).toBe(404);
  });

  it("Fehler beim erneuten Lesen: Satz, nichts verändert", async () => {
    const e = await mitEurouter();
    await e.setzen();
    await e.hinzufuegen("Beispiel-Regel");
    e.u.zustand.listeErsatz = { ok: false, code: "nicht_erlaubt" };
    const r = await e.neuPruefen();
    expect(r.status).toBe(502);
    expect(await euRegeln(e)).toEqual(["Beispiel-Regel"]);
  });
});

describe("Seite öffnen schreibt nichts", () => {
  it("Seitendaten, Modell-Liste lesen und Regel-Liste ändern weder Belege noch Daten", async () => {
    const e = await mitEurouter();
    await e.setzen();
    const einrichtungAnbieter = (await repo.providers.list(e.u.db)).find(
      (a) => a.templateKey === "eigener",
    );
    if (einrichtungAnbieter === undefined) throw new Error("kein Anbieter");
    const vorherBelege = await letzteNummer(e.u);
    // Nur der Zähler der Begrenzung darf sich bewegen (die Regel-Liste zählt auf „Verbindungstest“).
    const vorherDaten = await alleDaten(e, ["rate_limits"]);
    await modelleSeitenDaten(e.u.db, e.u.dienste);
    const lesen = await e.rufe(
      e.h.lesen,
      "POST",
      `/api/anbieter/${einrichtungAnbieter.id}/modelle/lesen`,
      { params: { id: einrichtungAnbieter.id } },
    );
    expect(lesen.status).toBe(200);
    expect(
      (lesen.body as { daten: { modelle: { slug: string; id?: string }[] } }).daten.modelle.length,
    ).toBeGreaterThan(0);
    await e.rufe(e.h.liste, "POST", `/api/anbieter/${e.id}/regeln/liste`, { params: { id: e.id } });
    expect(await letzteNummer(e.u)).toBe(vorherBelege);
    expect(await alleDaten(e, ["rate_limits"])).toBe(vorherDaten);
  });

  it("Gegenprobe: das Abgleichen der Liste schreibt einen Beleg (so war es beim Öffnen)", async () => {
    const e = await mitEurouter();
    const a = (await repo.providers.list(e.u.db)).find((x) => x.templateKey === "eigener");
    if (a === undefined) throw new Error("kein Anbieter");
    const vorher = await letzteNummer(e.u);
    const r = await e.rufe(e.h.abgleich, "POST", `/api/anbieter/${a.id}/modelle`, {
      params: { id: a.id },
    });
    expect(r.status).toBe(200);
    expect(await letzteNummer(e.u)).toBeGreaterThan(vorher);
  });

  it("Modelle, die schon gespeichert sind, tragen ihre Kennung; neue keine", async () => {
    const e = await mitEurouter();
    const a = (await repo.providers.list(e.u.db)).find((x) => x.templateKey === "eigener");
    if (a === undefined) throw new Error("kein Anbieter");
    const r = await e.rufe(e.h.lesen, "POST", `/api/anbieter/${a.id}/modelle/lesen`, {
      params: { id: a.id },
    });
    const modelle = (r.body as { daten: { modelle: { slug: string; id?: string }[] } }).daten
      .modelle;
    expect(modelle.find((m) => m.slug === "beispiel/modell-a")?.id).toMatch(/^mod_/);
    expect(modelle.find((m) => m.slug === "beispiel/modell-b")?.id).toBeUndefined();
  });
});

async function belegeAlsTextLokal(e: Eingerichtet): Promise<string> {
  const seite = await repo.belege.listPage(e.u.db, { limit: 500 });
  return JSON.stringify(seite.items);
}

/** Eine Regel in der belegten Form der Antwort (Kennungen als Platzhalter). */
function regelRoh(name: string, uebrig: Record<string, unknown>) {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    name,
    description: "Strict EU data residency",
    user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    org_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    workspace_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    api_key_id: null,
    model: "glm-5.2",
    models: ["glm-5.1", "glm-5"],
    provider: {
      allow_fallbacks: true,
      data_collection: "deny",
      data_residency: "EU",
      max_retention_days: 0,
      eu_owned: true,
    },
    enabled: true,
    created_at: "2026-11-01T10:00:00Z",
    updated_at: "2026-11-02T10:00:00Z",
    ...uebrig,
  };
}
