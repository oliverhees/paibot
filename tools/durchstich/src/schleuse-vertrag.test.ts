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
//   PAIBOT_TEST_SCHLEUSE_SCHLUESSEL_WEG     optional: "anfrage" (Standard) schickt diesen Schlüssel je
//                                           Anfrage mit; "umgebung", wenn die Datenschleuse ihn aus
//                                           SCHLEUSE_ANBIETER_SCHLUESSEL liest
//   PAIBOT_TEST_SCHLEUSE_OHNE_ANALYZER_URL  optional: zweite Datenschleuse, deren Erkennung nicht läuft
//
// Die Datenschleuse muss mit `pnpm schleuse:config` für den Test-Anbieter konfiguriert sein
// (SCHLEUSE_ANBIETER=eurouter=<url des Test-Anbieters>/v1, SCHLEUSE_ERLAUBE_HTTP=1): Der Test-Anbieter
// steht dort an der Stelle der Vorlage `eurouter`.

import { randomBytes } from "node:crypto";
import { inspect } from "node:util";
import { deriveKey, encryptSecret, loadMasterSecret } from "@paibot/crypto";
import { FAKE_CONTROL_KEY_HEADER, FAKE_CONTROL_PATHS } from "@paibot/fake-provider";
import type { GatePermit } from "@paibot/gate";
import { withTestPermit } from "@paibot/gate/testing";
import {
  checkSchleuseHealth,
  isRetryable,
  mapProviderError,
  probeSchleuse,
  providerFailure,
  providerTargetFacts,
  SCHLEUSE_SESSION_HEADER,
  type SchleuseKeyPath,
  schleuseFromEnv,
  schleuseModelName,
} from "@paibot/llm";
import { resolveModel } from "@paibot/llm/modell";
import type { Facts } from "@paibot/shared/aktionen";
import { providerSecretBinding, secretAad } from "@paibot/shared/bindung";
import { PaiBotError } from "@paibot/shared/fehler";
import { type ConversationId, type ModelId, newId, type ProviderId } from "@paibot/shared/ids";
import type { ResolvedModel } from "@paibot/shared/motor";
import { beforeEach, describe, expect, it } from "vitest";

const env = process.env;
const SCHLEUSE_URL = env.PAIBOT_TEST_SCHLEUSE_URL ?? "";
const SCHLEUSE_KEY = env.PAIBOT_TEST_SCHLEUSE_KEY ?? "";
const FAKE_URL = (env.PAIBOT_TEST_FAKE_PROVIDER_URL ?? "").replace(/\/+$/, "");
const FAKE_CONTROL_KEY = env.PAIBOT_TEST_FAKE_PROVIDER_CONTROL_KEY ?? "";
const ANBIETER_KEY = env.PAIBOT_TEST_FAKE_PROVIDER_KEY ?? "";
// Wie im Betrieb: Standard ist der Weg „anfrage“; „umgebung“ prüft den Rückfall.
const KEY_PRO_ANFRAGE = (env.PAIBOT_TEST_SCHLEUSE_SCHLUESSEL_WEG ?? "anfrage") !== "umgebung";
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

const secretsKey = deriveKey(
  loadMasterSecret({ PAIBOT_SECRET: randomBytes(32).toString("base64") }),
  "secrets-v1",
);
const ANBIETER_URL = "https://api.anbieter.example/v1";

/**
 * Ruft `run` mit einem echten Modell-Zugang über die Datenschleuse auf, wie im Betrieb: Berechtigung
 * des Tors, Anbieter-Schlüssel verschlüsselt, Weg `weg`. Der Zugang gilt nur, solange `run` läuft.
 */
function mitZugang<R>(
  run: (model: ResolvedModel) => Promise<R>,
  weg: SchleuseKeyPath = KEY_PRO_ANFRAGE ? "anfrage" : "umgebung",
  anbieterSchluessel = ANBIETER_KEY,
): Promise<R> {
  const providerId = newId("provider") as ProviderId;
  const modelId = newId("model") as ModelId;
  const conversationId = UNTERHALTUNG as ConversationId;
  const botId = newId("bot");
  const facts: Facts<"modell.anfragen"> = {
    ...providerTargetFacts(providerId, ANBIETER_URL),
    botOfConversation: true,
    providerId,
    providerEnabled: true,
    region: "eu",
    route: "schleuse",
    requestedMode: "on",
    schleuseReachable: true,
    inputChars: TEXT.length,
    maxInputChars: 32000,
    maxOutputTokens: 256,
    botMaxOutputTokens: 256,
    tokensToday: 0,
    killSwitch: false,
    // Übergangswerte, bis ein Lauf mehrere Schritte macht.
    step: 0,
    maxSteps: 1,
    runTokens: 0,
    stepTokenEstimate: 0,
    maxRunTokens: 500000,
    toolCount: 0,
    untrustedInput: false,
    trigger: "chat",
  };
  const schluessel =
    anbieterSchluessel === "" ? `sk-${randomBytes(8).toString("hex")}` : anbieterSchluessel;
  return withTestPermit(
    {
      actionId: newId("action"),
      type: "modell.anfragen",
      actor: `bot:${botId}`,
      target: { conversationId, runId: newId("run"), botId, modelId },
    },
    facts,
    (permit: GatePermit<"modell.anfragen">) =>
      run(
        resolveModel(
          permit,
          {
            provider: {
              id: providerId,
              templateKey: "eurouter",
              baseUrl: ANBIETER_URL,
              region: "eu",
              apiKeyEnc: encryptSecret(schluessel, secretsKey, {
                aad: secretAad(providerSecretBinding(providerId, ANBIETER_URL)),
              }),
            },
            model: { id: modelId, slug: "test-modell", displayName: "Test-Modell" },
            conversationId,
          },
          {
            secretsKey,
            schleuse: { baseUrl: SCHLEUSE_URL, apiKey: SCHLEUSE_KEY, providerKeyPath: weg },
          },
        ),
      ),
  );
}

/** Chat-Anfrage über den Modell-Zugang; Fehler kommen als Wert zurück. */
async function ueberZugang(model: ResolvedModel, inhalt: unknown): Promise<Response | unknown> {
  try {
    return await model.fetch(`${model.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...model.headers },
      body: JSON.stringify({ model: model.slug, messages: [{ role: "user", content: inhalt }] }),
    });
  } catch (error) {
    return error;
  }
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

  it("Health: mit Schlüssel bereit, mit falschem Schlüssel „Schlüssel falsch“", async () => {
    const verbindung = schleuseFromEnv({ SCHLEUSE_URL, SCHLEUSE_KEY });
    expect(await probeSchleuse(verbindung)).toEqual({ state: "bereit" });
    expect(await checkSchleuseHealth(verbindung)).toEqual({ installed: true, reachable: true });

    const falsch = schleuseFromEnv({ SCHLEUSE_URL, SCHLEUSE_KEY: "sk-falscher-schluessel" });
    expect(await probeSchleuse(falsch)).toEqual({ state: "schluessel_falsch" });
    expect(await checkSchleuseHealth(falsch)).toEqual({ installed: true, reachable: false });

    expect(await probeSchleuse(undefined)).toEqual({ state: "aus" });
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

  it("Block wird auf schleuse_blockiert abgebildet (nicht wiederholbar)", async () => {
    const response = await anfrage([
      { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgo=" } },
    ]);
    const roh = await response.text();
    const code = mapProviderError(alsApiFehler(response.status, roh), { route: "schleuse" });
    expect(code).toBe("schleuse_blockiert");
    const meldung = (JSON.parse(roh) as { error: { message: string } }).error.message;
    // Längere Wörter aus der Meldung der Datenschleuse; keins darf im Fehler von PaiBot stehen.
    // Ausgenommen sind Wörter, die auch im eigenen Standardtext von PaiBot stehen.
    const eigen = inspect(providerFailure("schleuse_blockiert"), { depth: 9, showHidden: true });
    const woerter = [...new Set(meldung.match(/[\p{L}-]{7,}/gu) ?? [])].filter(
      (wort) => !eigen.includes(wort),
    );
    expect(woerter.length).toBeGreaterThan(0);
    expect(isRetryable(code)).toBe(false);

    // Über den Modell-Zugang: fester Code, kein Wort aus der Meldung der Datenschleuse.
    const fehler = await mitZugang((model) =>
      ueberZugang(model, [
        { type: "text", text: TEXT },
        { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgo=" } },
      ]),
    );
    expect(fehler).toBeInstanceOf(PaiBotError);
    expect(fehler).toMatchObject({ code: "schleuse_blockiert" });
    expect(mapProviderError(fehler)).toBe("schleuse_blockiert");
    const alles = [inspect(fehler, { depth: 9, showHidden: true }), JSON.stringify(fehler)].join();
    for (const wort of woerter) expect(alles).not.toContain(wort);
    for (const teil of KLARTEXT_TEILE) expect(alles).not.toContain(teil);
    expect(await aufgezeichnet()).toHaveLength(0);
  });

  it("falscher Zugangsschlüssel: abgelehnt, beim Anbieter kommt nichts an", async () => {
    const response = await anfrage(TEXT, {}, SCHLEUSE_URL, "sk-falscher-schluessel");
    expect(response.ok).toBe(false);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    await response.text();
    expect(await aufgezeichnet()).toHaveLength(0);
  });

  it("falscher Zugangsschlüssel wird auf schluessel_ungueltig abgebildet", async () => {
    const response = await anfrage(TEXT, {}, SCHLEUSE_URL, "sk-falscher-schluessel");
    expect(
      mapProviderError(alsApiFehler(response.status, await response.text()), {
        route: "schleuse",
      }),
    ).toBe("schluessel_ungueltig");
    expect(await aufgezeichnet()).toHaveLength(0);
  });

  it.skipIf(!KEY_PRO_ANFRAGE || ANBIETER_KEY === "")(
    "Weg anfrage: der Anbieter bekommt den richtigen Schlüssel, obwohl die Datenschleuse keinen in der Umgebung hat",
    async () => {
      // Die Datenschleuse ist ohne SCHLEUSE_ANBIETER_SCHLUESSEL gestartet. Ein falscher Schlüssel im
      // Körper wird vom Test-Anbieter abgelehnt: Es zählt der Schlüssel aus der Anfrage.
      const falsch = await fetch(`${SCHLEUSE_URL.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${SCHLEUSE_KEY}`,
          "content-type": "application/json",
          [SCHLEUSE_SESSION_HEADER]: UNTERHALTUNG,
        },
        body: JSON.stringify({
          model: schleuseModelName("eurouter", "test-modell"),
          messages: [{ role: "user", content: "Hallo" }],
          api_key: `sk-falsch-${randomBytes(8).toString("hex")}`,
        }),
      });
      await falsch.text();
      expect(falsch.ok).toBe(false);

      // Ein neuer Schlüssel, den die Datenschleuse noch nie gesehen hat: Er kann nur aus der
      // Anfrage von PaiBot kommen (die Datenschleuse hält mitgeschickte Schlüssel im Speicher).
      const neu = `sk-neu-${randomBytes(12).toString("hex")}`;
      await steuerung(FAKE_CONTROL_PATHS.zuruecksetzen, {});
      await steuerung(FAKE_CONTROL_PATHS.verhalten, { apiKey: neu });

      // Über den Modell-Zugang (Weg anfrage): Schlüssel aus PaiBot, nur im Körper an die Datenschleuse.
      const antwort = await mitZugang(
        async (model) => {
          const response = await ueberZugang(model, TEXT);
          expect(response).toBeInstanceOf(Response);
          const r = response as Response;
          expect(r.status).toBe(200);
          return r.json();
        },
        "anfrage",
        neu,
      );
      expect(antwort).toHaveProperty("choices");
      const [record, ...rest] = await aufgezeichnet();
      expect(rest).toHaveLength(0);
      // Der Test-Anbieter zeigt den Schlüssel nie; angenommen hat er ihn (sonst kein HTTP 200).
      expect(record?.headers.authorization).toBe("Bearer ***");
      // Beim Anbieter kommt weder der Schlüssel im Körper noch der Schlüssel der Datenschleuse an.
      expect(JSON.stringify(record?.body)).not.toContain(neu);
      expect(JSON.stringify(record)).not.toContain(SCHLEUSE_KEY);
      for (const teil of KLARTEXT_TEILE) expect(JSON.stringify(record?.body)).not.toContain(teil);
    },
  );

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
