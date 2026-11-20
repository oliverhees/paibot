/**
 * PaiBot – Vertragstest gegen eine laufende Datenschleuse mit dem Test-Anbieter dahinter.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

// Läuft nur, wenn PAIBOT_TEST_SCHLEUSE_URL gesetzt ist, sonst wird er übersprungen.
//
//   PAIBOT_TEST_SCHLEUSE_URL                Basis-URL der Datenschleuse, z. B. http://127.0.0.1:4000/v1
//   PAIBOT_TEST_SCHLEUSE_KEY                ihr Zugangsschlüssel (SCHLEUSE_KEY)
//   PAIBOT_TEST_FAKE_PROVIDER_URL           Wurzel des Test-Anbieters, z. B. http://127.0.0.1:4600
//   PAIBOT_TEST_FAKE_PROVIDER_CONTROL_KEY   Schlüssel für /_steuerung/ des Test-Anbieters
//   PAIBOT_TEST_FAKE_PROVIDER_KEY           optional: Schlüssel, den der Test-Anbieter verlangt
//   PAIBOT_TEST_SCHLEUSE_SCHLUESSEL_WEG     optional: "anfrage" schickt diesen Schlüssel je Anfrage mit
//   PAIBOT_TEST_SCHLEUSE_OHNE_ANALYZER_URL  optional: zweite Datenschleuse, deren Erkennung nicht läuft
//
// Die Datenschleuse muss mit `pnpm schleuse:config` für den Test-Anbieter konfiguriert sein
// (SCHLEUSE_ANBIETER=eurouter=<url des Test-Anbieters>/v1, SCHLEUSE_ERLAUBE_HTTP=1): Der Test-Anbieter
// steht dort an der Stelle der Vorlage `eurouter`.

import { FAKE_CONTROL_KEY_HEADER, FAKE_CONTROL_PATHS } from "@paibot/fake-provider";
import {
  checkSchleuseHealth,
  mapProviderError,
  SCHLEUSE_SESSION_HEADER,
  schleuseFromEnv,
  schleuseModelName,
} from "@paibot/llm";
import { beforeEach, describe, expect, it } from "vitest";

const env = process.env;
const SCHLEUSE_URL = env.PAIBOT_TEST_SCHLEUSE_URL ?? "";
const SCHLEUSE_KEY = env.PAIBOT_TEST_SCHLEUSE_KEY ?? "";
const FAKE_URL = (env.PAIBOT_TEST_FAKE_PROVIDER_URL ?? "").replace(/\/+$/, "");
const FAKE_CONTROL_KEY = env.PAIBOT_TEST_FAKE_PROVIDER_CONTROL_KEY ?? "";
const ANBIETER_KEY = env.PAIBOT_TEST_FAKE_PROVIDER_KEY ?? "";
const KEY_PRO_ANFRAGE = env.PAIBOT_TEST_SCHLEUSE_SCHLUESSEL_WEG === "anfrage";
const OHNE_ANALYZER_URL = env.PAIBOT_TEST_SCHLEUSE_OHNE_ANALYZER_URL ?? "";

const AKTIV = SCHLEUSE_URL !== "";

// Erfundene Person und erfundene Nummer.
const NAME = "Max Mustermann";
const TELEFON = "0151 23456789";
const TEXT = `Bitte ruf ${NAME} unter ${TELEFON} an und sag ihm, dass der Termin steht.`;
const KLARTEXT_TEILE = [NAME, "Mustermann", TELEFON, "23456789"];
const UNTERHALTUNG = "unt_06f8k2m9qz3w7x1c4b5n8p0r2t";
const PLATZHALTER = /<[A-Z][A-Z0-9_]*_\d+>/g;

interface Aufgezeichnet {
  path: string;
  headers: Record<string, string>;
  body: { model?: string; messages?: Array<{ role: string; content: unknown }> } & Record<
    string,
    unknown
  >;
}

async function steuerung(pfad: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`${FAKE_URL}${pfad}`, {
    method: body === undefined && pfad === FAKE_CONTROL_PATHS.anfragen ? "GET" : "POST",
    headers: { [FAKE_CONTROL_KEY_HEADER]: FAKE_CONTROL_KEY, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  expect(response.status, `Steuerung ${pfad}`).toBe(200);
  return response.json();
}

async function aufgezeichnet(): Promise<Aufgezeichnet[]> {
  const daten = (await steuerung(FAKE_CONTROL_PATHS.anfragen)) as { requests: Aufgezeichnet[] };
  return daten.requests.filter((r) => r.path.endsWith("/chat/completions"));
}

function anfrage(
  inhalt: unknown,
  extra: Record<string, unknown> = {},
  basis = SCHLEUSE_URL,
  schluessel = SCHLEUSE_KEY,
): Promise<Response> {
  const body: Record<string, unknown> = {
    model: schleuseModelName("eurouter", "test-modell"),
    messages: [{ role: "user", content: inhalt }],
    ...extra,
  };
  if (KEY_PRO_ANFRAGE && ANBIETER_KEY !== "") body.api_key = ANBIETER_KEY;
  return fetch(`${basis.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${schluessel}`,
      "content-type": "application/json",
      [SCHLEUSE_SESSION_HEADER]: UNTERHALTUNG,
    },
    body: JSON.stringify(body),
  });
}

/** Liest einen Strom im OpenAI-Format und setzt den Text zusammen. */
async function stromText(response: Response): Promise<string> {
  const roh = await response.text();
  let text = "";
  for (const zeile of roh.split("\n")) {
    const daten = zeile.trim();
    if (!daten.startsWith("data: ") || daten === "data: [DONE]") continue;
    const stueck = JSON.parse(daten.slice(6)) as {
      choices?: Array<{ delta?: { content?: string | null } }>;
    };
    for (const wahl of stueck.choices ?? []) text += wahl.delta?.content ?? "";
  }
  return text;
}

function letzterNutzerText(record: Aufgezeichnet): string {
  const nachrichten = record.body.messages ?? [];
  const nutzer = nachrichten.filter((n) => n.role === "user").at(-1);
  expect(typeof nutzer?.content).toBe("string");
  return nutzer?.content as string;
}

/** So erreicht ein Fehler der Datenschleuse die Fehler-Abbildung (Form eines API-Fehlers). */
function alsApiFehler(status: number, responseBody: string) {
  return {
    name: "AI_APICallError",
    message: "Fehler der Gegenstelle",
    statusCode: status,
    responseBody,
  };
}

describe.skipIf(!AKTIV)("Vertrag PaiBot ↔ Datenschleuse", () => {
  beforeEach(async () => {
    expect(SCHLEUSE_KEY, "PAIBOT_TEST_SCHLEUSE_KEY fehlt").not.toBe("");
    expect(FAKE_URL, "PAIBOT_TEST_FAKE_PROVIDER_URL fehlt").not.toBe("");
    await steuerung(FAKE_CONTROL_PATHS.zuruecksetzen, {});
    if (ANBIETER_KEY !== "")
      await steuerung(FAKE_CONTROL_PATHS.verhalten, { apiKey: ANBIETER_KEY });
  });

  it("Health: mit Schlüssel erreichbar, mit falschem Schlüssel nicht", async () => {
    const verbindung = schleuseFromEnv({ SCHLEUSE_URL, SCHLEUSE_KEY });
    expect(await checkSchleuseHealth(verbindung)).toEqual({ installed: true, reachable: true });

    const falsch = schleuseFromEnv({ SCHLEUSE_URL, SCHLEUSE_KEY: "sk-falscher-schluessel" });
    expect(await checkSchleuseHealth(falsch)).toEqual({ installed: true, reachable: false });

    expect(await checkSchleuseHealth(undefined)).toEqual({ installed: false, reachable: false });
  });

  it("beim Anbieter kommt kein Klartext an, sondern Platzhalter; der Modellname passt", async () => {
    const response = await anfrage(TEXT);
    expect(response.status).toBe(200);
    await response.json();

    const [record, ...rest] = await aufgezeichnet();
    expect(rest).toHaveLength(0);
    expect(record?.body.model).toBe("test-modell");
    const gesendet = JSON.stringify(record?.body);
    for (const teil of KLARTEXT_TEILE) expect(gesendet).not.toContain(teil);
    const nutzerText = letzterNutzerText(record as Aufgezeichnet);
    expect(nutzerText.match(PLATZHALTER)?.length ?? 0).toBeGreaterThanOrEqual(2);
    // Die ID der Unterhaltung bleibt bei der Datenschleuse.
    expect(Object.keys(record?.headers ?? {})).not.toContain(SCHLEUSE_SESSION_HEADER);
    expect(JSON.stringify(record?.headers)).not.toContain(UNTERHALTUNG);
  });

  it("die Antwort an PaiBot ist zurückgetauscht (ohne und mit Strom)", async () => {
    await (await anfrage(TEXT)).json();
    const maskiert = letzterNutzerText((await aufgezeichnet())[0] as Aufgezeichnet);

    // Der Test-Anbieter antwortet mit genau dem, was er bekommen hat (also mit Platzhaltern).
    await steuerung(FAKE_CONTROL_PATHS.verhalten, { reply: maskiert, chunkChars: 3 });

    const ganz = await anfrage(TEXT);
    expect(ganz.status).toBe(200);
    const daten = (await ganz.json()) as { choices: Array<{ message: { content: string } }> };
    expect(daten.choices[0]?.message.content).toBe(TEXT);

    const strom = await anfrage(TEXT, { stream: true, stream_options: { include_usage: true } });
    expect(strom.status).toBe(200);
    expect(await stromText(strom)).toBe(TEXT);

    for (const record of await aufgezeichnet()) {
      for (const teil of KLARTEXT_TEILE) expect(JSON.stringify(record.body)).not.toContain(teil);
    }
  });

  it("Block (Bild-Anhang): Fehlerform der Datenschleuse, beim Anbieter kommt nichts an", async () => {
    const response = await anfrage([
      { type: "text", text: TEXT },
      { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgo=" } },
    ]);
    const body = await response.text();
    expect(response.status).toBe(500);
    const fehler = (JSON.parse(body) as { error?: { message?: string } }).error;
    expect(fehler?.message ?? "").toMatch(/blockiert|fail-closed/i);
    for (const teil of KLARTEXT_TEILE) expect(body).not.toContain(teil);
    expect(await aufgezeichnet()).toHaveLength(0);
  });

  // Bekannte Lücke in @paibot/llm: Die Datenschleuse meldet einen Block als HTTP 500 ohne feste
  // Kennung. Heute wird daraus `anbieter_nicht_erreichbar` (mit neuem Versuch). Sobald die
  // Fehler-Abbildung den Block erkennt, schlägt dieser Fall fehl: dann `.fails` entfernen.
  it.fails("Block wird auf schleuse_blockiert abgebildet", async () => {
    const response = await anfrage([
      { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgo=" } },
    ]);
    expect(mapProviderError(alsApiFehler(response.status, await response.text()))).toBe(
      "schleuse_blockiert",
    );
  });

  it("falscher Zugangsschlüssel: abgelehnt, beim Anbieter kommt nichts an", async () => {
    const response = await anfrage(TEXT, {}, SCHLEUSE_URL, "sk-falscher-schluessel");
    expect(response.ok).toBe(false);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    await response.text();
    expect(await aufgezeichnet()).toHaveLength(0);
  });

  // Bekannte Lücke in @paibot/llm: Ohne eigene Datenbank antwortet die Datenschleuse auf einen
  // falschen Schlüssel mit HTTP 400 (`no_db_connection`); daraus wird heute `intern`.
  it.fails("falscher Zugangsschlüssel wird auf schluessel_ungueltig abgebildet", async () => {
    const response = await anfrage(TEXT, {}, SCHLEUSE_URL, "sk-falscher-schluessel");
    expect(mapProviderError(alsApiFehler(response.status, await response.text()))).toBe(
      "schluessel_ungueltig",
    );
  });

  it.skipIf(OHNE_ANALYZER_URL === "")(
    "Erkennung aus: blockiert, kein Rückfall, beim Anbieter kommt nichts an",
    async () => {
      for (const extra of [{}, { stream: true }]) {
        const response = await anfrage(TEXT, extra, OHNE_ANALYZER_URL);
        const body = await response.text();
        expect(response.status).toBe(500);
        expect(body).toMatch(/blockiert|fail-closed/i);
        for (const teil of KLARTEXT_TEILE) expect(body).not.toContain(teil);
      }
      expect(await aufgezeichnet()).toHaveLength(0);
    },
  );
});
