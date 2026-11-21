/**
 * PaiBot – Tests für eigene und lokale Anbieter nach der Einrichtung: Anlegen mit ausdrücklicher
 * Region „lokal“, Sperren für Dienste der Installation und Vorlagen, Schlüssel entfernen, echte
 * Ausgangs-Liste mit Umleitungen und das Entfernen, während der Bot schreibt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { repo } from "@paibot/db";
import { testConnection } from "@paibot/llm";
import type { BotId, ModelId, ProviderId } from "@paibot/shared/ids";
import { t } from "@paibot/shared/texte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TEST_MODELLE, TEST_SCHLUESSEL } from "../zugang/testing";
import {
  belegeAlsText,
  belegeSeit,
  type Eingerichtet,
  eingerichtet,
  letzteNummer,
} from "./testing";

vi.setConfig({ testTimeout: 60_000 });

const LOKAL_SCHLUESSEL = "beispiel-lokal-schluessel-4417";

const server: Server[] = [];
afterEach(async () => {
  await Promise.all(
    server.splice(0).map((s) => new Promise<void>((fertig) => s.close(() => fertig()))),
  );
});

async function starte(
  behandeln: (anfrage: IncomingMessage, antwort: ServerResponse) => void,
): Promise<number> {
  const s = createServer(behandeln);
  server.push(s);
  await new Promise<void>((fertig) => s.listen(0, "127.0.0.1", () => fertig()));
  return (s.address() as AddressInfo).port;
}

function modelleAntwort(antwort: ServerResponse) {
  antwort.writeHead(200, { "content-type": "application/json" });
  antwort.end(
    JSON.stringify({ object: "list", data: [{ id: "beispiel/lokal", object: "model" }] }),
  );
}

/** Der Ersatz für den Anbieter nimmt nur Schlüssel an, die hier stehen ("" = ohne Schlüssel). */
function nimmtAn(e: Eingerichtet, ...schluessel: string[]) {
  e.u.dienste.verbindungTesten = async (_a, apiKey) => {
    e.u.anbieterAufrufe.push(apiKey);
    return schluessel.includes(apiKey)
      ? { ok: true, models: TEST_MODELLE }
      : { ok: false, code: "schluessel_ungueltig" };
  };
}

function eigener(name: string, baseUrl: string, region: string, apiKey?: string) {
  return {
    templateKey: "eigener",
    name,
    baseUrl,
    region,
    ...(apiKey === undefined ? {} : { apiKey }),
  };
}

async function anlegen(e: Eingerichtet, koerper: Record<string, unknown>) {
  return e.rufe(e.r.anbieterAnlegen, "POST", "/api/anbieter", { koerper });
}

async function lokalAngelegt(e: Eingerichtet, apiKey?: string) {
  nimmtAn(e, "", LOKAL_SCHLUESSEL);
  const r = await anlegen(
    e,
    eigener("Lokaler Anbieter", "http://192.168.1.20:8080/v1", "local", apiKey),
  );
  expect(r.status).toBe(201);
  return (r.body.daten as { anbieter: { id: ProviderId; baseUrl: string } }).anbieter;
}

async function ohneGeheimnis(e: Eingerichtet) {
  const belege = await belegeAlsText(e.u);
  for (const s of [TEST_SCHLUESSEL, LOKAL_SCHLUESSEL]) {
    for (const antwort of e.antworten) expect(antwort).not.toContain(s);
    expect(belege.text).not.toContain(s);
  }
  for (const zeile of e.u.log) {
    expect(zeile).not.toContain(LOKAL_SCHLUESSEL);
  }
}

describe("Eigener Anbieter: interne Adressen nur ausdrücklich mit „lokal“", () => {
  it("private Adresse mit „lokal“: angelegt (Beleg anbieter.speichern); mit „EU“: abgelehnt ohne Abruf", async () => {
    const e = await eingerichtet();
    nimmtAn(e, "");
    const aufrufe = e.u.anbieterAufrufe.length;
    const eu = await anlegen(e, eigener("Netz", "https://192.168.1.20/v1", "eu", "x-1"));
    expect(eu.status).toBe(400);
    expect(eu.body.fehler).toMatchObject({
      code: "eingabe_ungueltig",
      text: t("anbieter.url.private_adresse"),
      felder: [{ feld: "baseUrl", code: "ungueltig" }],
    });
    const name = await anlegen(e, eigener("Netz", "https://localhost/v1", "non_eu", "x-1"));
    expect(name.body.fehler).toMatchObject({ text: t("anbieter.url.private_adresse") });
    expect(e.u.anbieterAufrufe.length).toBe(aufrufe);

    const vorher = await letzteNummer(e.u);
    const lokal = await anlegen(e, eigener("Netz", "http://192.168.1.20:8080/v1", "local"));
    expect(lokal.status).toBe(201);
    expect(lokal.body.daten).toMatchObject({ anbieter: { region: "local", keySet: false } });
    const belege = await belegeSeit(e.u, vorher);
    expect(belege.map((b) => [b.typ, b.aktion])).toEqual([
      ["decision", "anbieter.speichern"],
      ["result", "anbieter.speichern"],
    ]);
    expect(JSON.stringify(belege[0]?.body)).toContain('"region":"local"');
  });

  it.each([
    ["http://postgres:5432/v1", "anbieter.url.interner_dienst"],
    ["http://datenschleuse:8080/v1", "anbieter.url.interner_dienst"],
    ["http://web:3000/v1", "anbieter.url.interner_dienst"],
    ["http://worker/v1", "anbieter.url.interner_dienst"],
    ["http://169.254.169.254/latest", "anbieter.url.link_local"],
    ["http://[fe80::1]/v1", "anbieter.url.link_local"],
    ["http://nutzer:geheim@127.0.0.1:8080/v1", "anbieter.url.zugangsdaten_in_url"],
    ["http://127.0.0.1:8080/v1?umleiten=1", "anbieter.url.keine_url"],
  ] as const)("%s bleibt auch mit „lokal“ gesperrt", async (adresse, text) => {
    const e = await eingerichtet();
    nimmtAn(e, "");
    const aufrufe = e.u.anbieterAufrufe.length;
    const vorher = await letzteNummer(e.u);
    const r = await anlegen(e, eigener("Intern", adresse, "local"));
    expect(r.status).toBe(400);
    expect((r.body.fehler as { text?: string }).text).toBe(t(text));
    expect(e.u.anbieterAufrufe.length).toBe(aufrufe);
    expect(await letzteNummer(e.u)).toBe(vorher);
  });

  it("Vorlage EUrouter bekommt keine Lockerung: lokale Adresse oder Region „lokal“ abgelehnt", async () => {
    const e = await eingerichtet();
    nimmtAn(e, "", TEST_SCHLUESSEL);
    for (const koerper of [
      {
        templateKey: "eurouter",
        name: "EUrouter",
        baseUrl: "http://127.0.0.1:8080/v1",
        region: "local",
      },
      {
        templateKey: "eurouter",
        name: "EUrouter",
        baseUrl: "https://api.eurouter.ai/v1",
        region: "local",
      },
    ]) {
      const r = await anlegen(e, { ...koerper, apiKey: TEST_SCHLUESSEL });
      expect(r.status).toBe(400);
      expect(r.body.fehler).toMatchObject({ text: t("modelle.schluessel.vorlage_fest") });
    }
  });

  it("aus einem Anbieter wird beim Ändern kein anderer Typ (Vorlage bleibt), kein Beleg", async () => {
    const e = await eingerichtet();
    const lokal = await lokalAngelegt(e);
    const [erster] = await repo.providers.list(e.u.db);
    const vorher = await letzteNummer(e.u);
    const zuVorlage = await e.rufe(e.r.anbieterAendern, "PUT", `/api/anbieter/${lokal.id}`, {
      params: { id: lokal.id },
      koerper: {
        templateKey: "eurouter",
        name: "EUrouter",
        baseUrl: "https://api.eurouter.ai/v1",
        region: "eu",
        apiKey: TEST_SCHLUESSEL,
      },
    });
    expect(zuVorlage.status).toBe(400);
    expect(zuVorlage.body.fehler).toMatchObject({ text: t("modelle.eigen.vorlage_bleibt") });
    expect(await letzteNummer(e.u)).toBe(vorher);
    expect(erster).toBeDefined();
  });

  it("Anlegen mit „Schlüssel entfernen“ ist keine gültige Eingabe", async () => {
    const e = await eingerichtet();
    nimmtAn(e, "");
    const r = await anlegen(e, {
      ...eigener("Netz", "http://192.168.1.20:8080/v1", "local"),
      removeApiKey: true,
    });
    expect(r.status).toBe(400);
    expect(r.body.fehler).toMatchObject({ felder: [{ feld: "removeApiKey" }] });
  });
});

describe("Eigener Anbieter ändern", () => {
  it("Name und Adresse ändern: ohne Schlüssel bei lokal ohne Schlüssel, mit Test und Beleg", async () => {
    const e = await eingerichtet();
    const lokal = await lokalAngelegt(e);
    const vorher = await letzteNummer(e.u);
    const aufrufe = e.u.anbieterAufrufe.length;
    const r = await e.rufe(e.r.anbieterAendern, "PUT", `/api/anbieter/${lokal.id}`, {
      params: { id: lokal.id },
      koerper: eigener("Rechner im Keller", "http://192.168.1.21:8080/v1", "local"),
    });
    expect(r.status).toBe(200);
    expect(r.body.daten).toMatchObject({
      anbieter: { name: "Rechner im Keller", baseUrl: "http://192.168.1.21:8080/v1" },
    });
    expect(e.u.anbieterAufrufe.slice(aufrufe)).toEqual([""]);
    expect((await belegeSeit(e.u, vorher)).map((b) => b.aktion)).toEqual([
      "anbieter.speichern",
      "anbieter.speichern",
    ]);
  });

  it("Schlüssel entfernen: nur bei lokal, getestet ohne Schlüssel, danach „kein Schlüssel“", async () => {
    const e = await eingerichtet();
    const lokal = await lokalAngelegt(e, LOKAL_SCHLUESSEL);
    expect((await repo.providers.getWithKey(e.u.db, lokal.id))?.apiKeyEnc).toBeDefined();

    // Gegenprobe 1: der Dienst verlangt einen Schlüssel → nichts geändert.
    nimmtAn(e, LOKAL_SCHLUESSEL);
    const abgelehnt = await e.rufe(e.r.anbieterAendern, "PUT", `/api/anbieter/${lokal.id}`, {
      params: { id: lokal.id },
      koerper: { ...eigener("Lokaler Anbieter", lokal.baseUrl, "local"), removeApiKey: true },
    });
    expect(abgelehnt.body.fehler).toMatchObject({ code: "schluessel_ungueltig" });
    expect((await repo.providers.getWithKey(e.u.db, lokal.id))?.apiKeyEnc).toBeDefined();

    // Gegenprobe 2: öffentliche Region ohne Schlüssel → abgelehnt, ohne Abruf.
    const aufrufe = e.u.anbieterAufrufe.length;
    const oeffentlich = await e.rufe(e.r.anbieterAendern, "PUT", `/api/anbieter/${lokal.id}`, {
      params: { id: lokal.id },
      koerper: { ...eigener("Fern", "https://api.example.com/v1", "eu"), removeApiKey: true },
    });
    expect(oeffentlich.status).toBe(400);
    expect(oeffentlich.body.fehler).toMatchObject({
      text: t("modelle.eigen.ohne_schluessel_nur_lokal"),
      felder: [{ feld: "apiKey", code: "fehlt" }],
    });
    expect(e.u.anbieterAufrufe.length).toBe(aufrufe);

    nimmtAn(e, "", LOKAL_SCHLUESSEL);
    const vorher = await letzteNummer(e.u);
    const ok = await e.rufe(e.r.anbieterAendern, "PUT", `/api/anbieter/${lokal.id}`, {
      params: { id: lokal.id },
      koerper: { ...eigener("Lokaler Anbieter", lokal.baseUrl, "local"), removeApiKey: true },
    });
    expect(ok.status).toBe(200);
    expect(ok.body.daten).toMatchObject({ anbieter: { keySet: false } });
    expect(e.u.anbieterAufrufe.at(-1)).toBe("");
    expect((await repo.providers.getWithKey(e.u.db, lokal.id))?.apiKeyEnc).toBeUndefined();
    const belege = await belegeSeit(e.u, vorher);
    expect(JSON.stringify(belege[0]?.body)).toContain('"keySet":false');
    await ohneGeheimnis(e);
  });

  it("Schlüssel ersetzen: neuer Schlüssel wird vor dem Speichern getestet, nie zurückgegeben", async () => {
    const e = await eingerichtet();
    const lokal = await lokalAngelegt(e);
    nimmtAn(e, LOKAL_SCHLUESSEL);
    const r = await e.rufe(e.r.anbieterAendern, "PUT", `/api/anbieter/${lokal.id}`, {
      params: { id: lokal.id },
      koerper: eigener("Lokaler Anbieter", lokal.baseUrl, "local", LOKAL_SCHLUESSEL),
    });
    expect(r.status).toBe(200);
    expect(r.body.daten).toMatchObject({ anbieter: { keySet: true } });
    expect(r.antwort.headers.get("cache-control")).toBe("no-store");
    await ohneGeheimnis(e);
  });
});

describe("Echte Ausgangs-Liste für einen lokalen Anbieter", () => {
  function echterTest(e: Eingerichtet) {
    e.u.dienste.verbindungTesten = (anbieter, schluessel) =>
      testConnection({ baseUrl: anbieter.baseUrl, region: anbieter.region }, schluessel, {
        timeoutMs: 2_000,
      });
  }

  it("Dienst auf dem eigenen Rechner: verbunden, Modelle abgeglichen", async () => {
    const e = await eingerichtet();
    echterTest(e);
    const port = await starte((anfrage, antwort) => {
      if (anfrage.url === "/v1/models") modelleAntwort(antwort);
      else antwort.writeHead(404).end();
    });
    const r = await anlegen(e, eigener("Lokal", `http://127.0.0.1:${port}/v1`, "local"));
    expect(r.status).toBe(201);
    const id = (r.body.daten as { anbieter: { id: string } }).anbieter.id;
    const liste = await e.rufe(e.r.modelle, "POST", `/api/anbieter/${id}/modelle`, {
      params: { id },
    });
    expect(liste.status).toBe(200);
    expect(liste.body.daten).toMatchObject({ modelle: [{ slug: "beispiel/lokal" }] });
  });

  it("Umleitung zu einem anderen Ziel wird nicht verfolgt: nichts gespeichert, Ziel nie erreicht", async () => {
    const e = await eingerichtet();
    echterTest(e);
    let ziel = 0;
    const anderer = await starte((_a, antwort) => {
      ziel += 1;
      modelleAntwort(antwort);
    });
    for (const nach of [
      `http://127.0.0.1:${anderer}/v1/models`,
      "http://169.254.169.254/latest/meta-data",
    ]) {
      const port = await starte((_a, antwort) => {
        antwort.writeHead(302, { location: nach }).end();
      });
      const vorher = await letzteNummer(e.u);
      const r = await anlegen(e, eigener("Lokal", `http://127.0.0.1:${port}/v1`, "local"));
      expect(r.status).toBe(502);
      expect(r.body.fehler).toMatchObject({ code: "anbieter_nicht_erreichbar" });
      expect(await letzteNummer(e.u)).toBe(vorher);
    }
    expect(ziel).toBe(0);
    // Gegenprobe: dasselbe Ziel direkt eingetragen ist erreichbar.
    const direkt = await anlegen(e, eigener("Lokal", `http://127.0.0.1:${anderer}/v1`, "local"));
    expect(direkt.status).toBe(201);
    expect(ziel).toBe(1);
  });

  it("Name, der auf den Rechner selbst zeigt, ist ohne „lokal“ gesperrt (Namens-Trick)", async () => {
    const e = await eingerichtet();
    echterTest(e);
    const port = await starte((_a, antwort) => modelleAntwort(antwort));
    const r = await anlegen(e, eigener("Trick", `https://localhost.:${port}/v1`, "eu", "x-1"));
    expect(r.status).toBe(400);
    expect(r.body.fehler).toMatchObject({ felder: [{ feld: "baseUrl" }] });
  });
});

describe("Eigener Anbieter entfernen", () => {
  async function modellWaehlen(e: Eingerichtet, providerId: ProviderId) {
    const liste = await e.rufe(e.r.modelle, "POST", `/api/anbieter/${providerId}/modelle`, {
      params: { id: providerId },
    });
    expect(liste.status).toBe(200);
    const [m] = (liste.body.daten as { modelle: { id: ModelId }[] }).modelle;
    if (m === undefined) throw new Error("kein Modell");
    const r = await e.rufe(e.r.botModell, "PUT", "/api/bot/modell", {
      koerper: { modelId: m.id },
    });
    expect(r.status).toBe(200);
    return m.id;
  }

  async function laufAnlegen(e: Eingerichtet) {
    const bot = await repo.bots.getDefault(e.u.db);
    if (bot === undefined) throw new Error("kein Bot");
    const u = await repo.conversations.create(e.u.db, { botId: bot.id as BotId, title: "Test" });
    const n = await repo.messages.insert(e.u.db, {
      conversationId: u.id,
      role: "user",
      content: "Hallo",
    });
    return repo.runs.create(e.u.db, {
      conversationId: u.id,
      triggerMessageId: n.id,
      botId: bot.id as BotId,
    });
  }

  it("während der Bot mit einem Modell des Anbieters schreibt: abgelehnt mit Ausweg; danach entfernt", async () => {
    const e = await eingerichtet();
    const lokal = await lokalAngelegt(e);
    await modellWaehlen(e, lokal.id);
    const lauf = await laufAnlegen(e);
    const vorher = await letzteNummer(e.u);
    const besetzt = await e.rufe(e.r.anbieterLoeschen, "DELETE", `/api/anbieter/${lokal.id}`, {
      params: { id: lokal.id },
    });
    expect(besetzt.status).toBe(409);
    expect(besetzt.body.fehler).toMatchObject({
      code: "lauf_aktiv",
      text: t("modelle.eigen.lauf_aktiv", { name: "Pai", anbieter: "Lokaler Anbieter" }),
      ausweg: t("modelle.eigen.lauf_aktiv.ausweg"),
    });
    expect(await letzteNummer(e.u)).toBe(vorher);
    expect(await repo.providers.get(e.u.db, lokal.id)).toBeDefined();

    await repo.runs.markRunning(e.u.db, lauf.id);
    const laeuft = await e.rufe(e.r.anbieterLoeschen, "DELETE", `/api/anbieter/${lokal.id}`, {
      params: { id: lokal.id },
    });
    expect(laeuft.status).toBe(409);

    await repo.runs.finish(e.u.db, lauf.id, { status: "succeeded" });
    const weg = await e.rufe(e.r.anbieterLoeschen, "DELETE", `/api/anbieter/${lokal.id}`, {
      params: { id: lokal.id },
    });
    expect(weg.status).toBe(200);
    expect(await repo.providers.get(e.u.db, lokal.id)).toBeUndefined();
    expect((await repo.bots.getDefault(e.u.db))?.modelId).toBeUndefined();
    // Frühere Nachrichten bleiben; die übrigen Anbieter auch.
    expect(await repo.messages.listForConversation(e.u.db, lauf.conversationId, {})).toHaveLength(
      1,
    );
    expect(await repo.providers.list(e.u.db)).toHaveLength(1);
    expect((await belegeSeit(e.u, vorher)).map((b) => [b.typ, b.aktion])).toEqual([
      ["decision", "anbieter.loeschen"],
      ["result", "anbieter.loeschen"],
    ]);
  });

  it("schreibt der Bot mit einem anderen Anbieter, geht das Entfernen; sein Modell bleibt", async () => {
    const e = await eingerichtet();
    const lokal = await lokalAngelegt(e);
    const modellVorher = (await repo.bots.getDefault(e.u.db))?.modelId;
    expect(modellVorher).toBeDefined();
    await laufAnlegen(e);
    const weg = await e.rufe(e.r.anbieterLoeschen, "DELETE", `/api/anbieter/${lokal.id}`, {
      params: { id: lokal.id },
    });
    expect(weg.status).toBe(200);
    expect((await repo.bots.getDefault(e.u.db))?.modelId).toBe(modellVorher);
  });
});
