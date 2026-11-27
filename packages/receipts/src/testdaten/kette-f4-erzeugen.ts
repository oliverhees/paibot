/**
 * PaiBot – erzeugt die feste Beleg-Kette `kette-f4.jsonl` (nur Tests): echtes Tor (`gate.run`) mit
 * Tor-Fassung 4, echter Beleg-Schreiber gegen eine Datenbank im Speicher, Export wie in der App.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-27
 */

import { type Database, installationKeys, repo } from "@paibot/db";
import { createGate, type Execute, ruleSnapshot } from "@paibot/gate";
import { type ActionType, botActor } from "@paibot/shared/aktionen";
import { isPaiBotError, PaiBotError } from "@paibot/shared/fehler";
import { newId } from "@paibot/shared/ids";
import { exportHeader } from "../export";
import { exportJsonl } from "../jsonl";
import { testKey } from "../testhilfen";
import { createReceiptWriter } from "../writer";

/*
 * Erzeugt wurde die Datei mit dem Code auf Stand 96f706f (Tor-Fassung 4, `GATE_FORMAT = 4`), in
 * einem eigenen Arbeitsbaum genau auf diesem Stand:
 *
 *   git worktree add --detach <ordner> 96f706f
 *   cd <ordner> && pnpm install --frozen-lockfile
 *   cp <diese Datei> packages/receipts/src/testdaten/
 *   # vorübergehende Datei packages/receipts/src/erzeugen.tmp.test.ts (nicht im Repo):
 *   #   import { writeFileSync } from "node:fs";
 *   #   import { createTestDb } from "@paibot/db/testing";
 *   #   import { it } from "vitest";
 *   #   import { erzeugeKetteF4 } from "./testdaten/kette-f4-erzeugen";
 *   #   it("erzeugen", async () => {
 *   #     const { db, client } = await createTestDb();
 *   #     writeFileSync(process.env.KETTE_ZIEL as string, await erzeugeKetteF4(db));
 *   #     await client.close();
 *   #   });
 *   KETTE_ZIEL=/pfad/kette-f4.jsonl pnpm --filter @paibot/receipts exec vitest run \
 *     src/erzeugen.tmp.test.ts --maxWorkers=1
 *
 * Die Schlüssel entstehen bei jedem Lauf neu und werden nicht gespeichert; Kennungen sind
 * zufällig. Ein neuer Lauf ergibt deshalb eine andere Datei. Die Datei im Repo wird nie neu
 * erzeugt oder angepasst. Das Skript läuft nur auf dem genannten Stand: Spätere Fassungen des
 * Tors können mehr Fakten verlangen, und das Tor weist diese Anfragen dann ab. Die Fakten stammen
 * aus den festen Fällen der Fassungen 3 und 4 (`fassung-3.korpus.json`, `fassung-4.korpus.json`).
 */

const BOT = newId("bot");
const ids = {
  installationId: newId("installation"),
  ownerId: newId("owner"),
  providerId: newId("provider"),
  botId: BOT,
  modelId: newId("model"),
  conversationId: newId("conversation"),
  messageId: newId("message"),
  runId: newId("run"),
  deviceId: newId("device"),
  appId: newId("app"),
  toolId: newId("tool"),
  teamId: newId("team"),
  entwurfId: newId("entwurf"),
  fadenId: newId("conversation"),
};

const BOT_ACTIONS: readonly string[] = ["modell.anfragen", "werkzeug.aufrufen"];

const ZETTEL_DIGEST = `sha256:${"3d".repeat(32)}`;
const APP_TARGET_DIGEST = `sha256:${"1a".repeat(32)}`;
const APP_TOOL_DIGEST = `sha256:${"d1".repeat(32)}`;
const ENTWURF_DIGEST = `sha256:${"4e".repeat(32)}`;

/** Ziel je Aktion (alle Aktionen, die die Datenbank auf diesem Stand speichert). */
const TARGETS: Record<string, Record<string, string>> = {
  "einrichtung.abschliessen": { installationId: ids.installationId },
  "zugang.anmelden": { ownerId: ids.ownerId },
  "zugang.abmelden": { ownerId: ids.ownerId },
  "zugang.alle_abmelden": { ownerId: ids.ownerId },
  "zugang.passwort_aendern": { ownerId: ids.ownerId },
  "anbieter.speichern": { providerId: ids.providerId },
  "anbieter.loeschen": { providerId: ids.providerId },
  "modell.waehlen": { botId: ids.botId, modelId: ids.modelId },
  "bot.aendern": { botId: ids.botId },
  "schleuse.umschalten": { conversationId: ids.conversationId },
  "einstellung.aendern": { installationId: ids.installationId },
  "unterhaltung.anlegen": { conversationId: ids.conversationId, botId: ids.botId },
  "unterhaltung.umbenennen": { conversationId: ids.conversationId },
  "unterhaltung.loeschen": { conversationId: ids.conversationId },
  "nachricht.senden": { conversationId: ids.conversationId, messageId: ids.messageId },
  "modell.anfragen": {
    conversationId: ids.conversationId,
    runId: ids.runId,
    botId: ids.botId,
    modelId: ids.modelId,
  },
  "lauf.abbrechen": { conversationId: ids.conversationId, runId: ids.runId },
  "belege.exportieren": { installationId: ids.installationId },
  "werkzeug.aufrufen": { conversationId: ids.conversationId, runId: ids.runId, botId: ids.botId },
  "geraet.hinzufuegen": { deviceId: ids.deviceId },
  "geraet.entfernen": { deviceId: ids.deviceId },
  "geraet.bestaetigen": { deviceId: ids.deviceId },
  "notaus.umschalten": { installationId: ids.installationId },
  "unterhaltung.exportieren": { conversationId: ids.conversationId },
  "antwort.neu_erzeugen": { conversationId: ids.conversationId, messageId: ids.messageId },
  // Fassung 3: Apps.
  "app.verbinden": { appId: ids.appId },
  "app.werkzeuge_bestaetigen": { appId: ids.appId, toolId: ids.toolId },
  "app.zugriff_setzen": { appId: ids.appId, botId: ids.botId },
  "app.trennen": { appId: ids.appId },
  // Fassung 4: Bots, Teams, Entwürfe, Fäden.
  "bot.anlegen": { botId: ids.botId },
  "bot.loeschen": { botId: ids.botId },
  "bot.pausieren": { botId: ids.botId },
  "team.anlegen": { teamId: ids.teamId },
  "team.aendern": { teamId: ids.teamId },
  "team.loeschen": { teamId: ids.teamId },
  "bot.team_setzen": { botId: ids.botId, teamId: ids.teamId },
  "team.entwurf_erstellen": { entwurfId: ids.entwurfId },
  "team.entwurf_verwerfen": { entwurfId: ids.entwurfId },
  "team.entwurf_anlegen": { entwurfId: ids.entwurfId },
  "team.entwurf_zuruecknehmen": { entwurfId: ids.entwurfId },
  "faden.anlegen": {
    conversationId: ids.fadenId,
    teamId: ids.teamId,
    zettelDigest: ZETTEL_DIGEST,
  },
  "einstellung.stabschef_setzen": { installationId: ids.installationId },
};

const MODEL_FACTS = {
  botOfConversation: true,
  providerId: ids.providerId,
  providerEnabled: true,
  region: "eu",
  route: "schleuse",
  requestedMode: "on",
  schleuseReachable: true,
  inputChars: 812,
  maxInputChars: 32000,
  maxOutputTokens: 1024,
  botMaxOutputTokens: 2048,
  tokensToday: 5000,
  dailyTokenBudget: 100000,
  killSwitch: false,
  targetOrigin: "https://api.eurouter.ai",
  targetDigest: `sha256:${"5e".repeat(32)}`,
  step: 0,
  maxSteps: 1,
  runTokens: 0,
  maxRunTokens: 500000,
  toolCount: 0,
  untrustedInput: false,
  trigger: "chat",
  stepTokenEstimate: 1227,
  botPaused: false,
};

const BOT_ANLEGEN_FACTS = { credential: "sitzung", botsAfter: 3, maxBots: 50 };
const BOT_LOESCHEN_FACTS = { credential: "sitzung", isDefaultBot: false, botRunActive: false };

/** Fakten, mit denen jede Vorbedingung und jede Grenze eingehalten ist. */
const FACTS: Record<string, Record<string, unknown>> = {
  "einrichtung.abschliessen": { credential: "einrichtungs_code", setupOpen: true },
  "zugang.anmelden": { credential: "passwort", remember: true },
  "zugang.abmelden": { credential: "sitzung" },
  "zugang.alle_abmelden": { credential: "sitzung", sessions: 3 },
  "zugang.passwort_aendern": { credential: "sitzung", currentPasswordVerified: true },
  "anbieter.speichern": { credential: "sitzung", created: true, region: "eu", keySet: true },
  "anbieter.loeschen": { credential: "sitzung" },
  "modell.waehlen": { credential: "sitzung" },
  "bot.aendern": { credential: "sitzung", fields: ["name"] },
  "schleuse.umschalten": {
    credential: "sitzung",
    scope: "unterhaltung",
    mode: "on",
    previousMode: "off",
    schleuseInstalled: true,
  },
  "einstellung.aendern": { credential: "sitzung", fields: ["timezone"] },
  "unterhaltung.anlegen": { credential: "sitzung" },
  "unterhaltung.umbenennen": { credential: "sitzung" },
  "unterhaltung.loeschen": { credential: "sitzung" },
  "nachricht.senden": {
    credential: "sitzung",
    inputChars: 120,
    maxInputChars: 32000,
    conversationExists: true,
    runActive: false,
    killSwitch: false,
    botPaused: false,
  },
  "modell.anfragen": MODEL_FACTS,
  "lauf.abbrechen": { credential: "sitzung", runActive: true },
  "belege.exportieren": { credential: "sitzung", entries: 42 },
  "werkzeug.aufrufen": {
    botOfConversation: true,
    runRunning: true,
    toolName: "doku_nachschlagen",
    toolSource: "eingebaut",
    toolKind: "lesen",
    argsDigest: `hmac-sha256:${"a7".repeat(32)}`,
    killSwitch: false,
    toolKey: "eingebaut/doku.nachschlagen",
    toolDigest: `sha256:${"d0".repeat(32)}`,
    toolReach: "intern",
    toolForeign: false,
    toolRegistered: true,
    toolOffered: true,
    inputValid: true,
    untrustedInput: false,
    step: 0,
    callIndexInStep: 0,
    maxCallsPerStep: 8,
    callsInRun: 0,
    maxCallsPerRun: 16,
    trigger: "chat",
    botPaused: false,
  },
  "geraet.hinzufuegen": { credential: "sitzung", kind: "browser" },
  "geraet.entfernen": { credential: "sitzung", deviceActive: true, thisDevice: false },
  "geraet.bestaetigen": { credential: "sitzung", newDevices: 1 },
  "notaus.umschalten": {
    credential: "sitzung",
    on: true,
    wasOn: false,
    currentPasswordVerified: false,
  },
  "unterhaltung.exportieren": { credential: "sitzung", conversationExists: true, messages: 4 },
  "antwort.neu_erzeugen": {
    credential: "sitzung",
    conversationExists: true,
    runActive: false,
    answerIsLatest: true,
    killSwitch: false,
  },
  "app.verbinden": {
    credential: "sitzung",
    created: true,
    authKind: "token",
    tokenSet: true,
    targetOrigin: "https://mcp.beispiel.invalid",
    targetDigest: APP_TARGET_DIGEST,
    addressHttps: true,
    addressPublic: true,
    addressPort443: true,
    addressUserinfo: false,
    addressQuery: false,
    addressFragment: false,
  },
  "app.werkzeuge_bestaetigen": {
    credential: "sitzung",
    toolClass: "lesen",
    toolVersion: 1,
    toolDigest: APP_TOOL_DIGEST,
    seenToolDigest: APP_TOOL_DIGEST,
    toolStatus: "neu",
    targetDigest: APP_TARGET_DIGEST,
  },
  "app.zugriff_setzen": { credential: "sitzung", access: "lesen", previousAccess: "keiner" },
  "app.trennen": { credential: "sitzung", tokenSet: true },
  "bot.anlegen": BOT_ANLEGEN_FACTS,
  "bot.loeschen": BOT_LOESCHEN_FACTS,
  "bot.pausieren": { credential: "sitzung", paused: true, wasPaused: false },
  "team.anlegen": { credential: "sitzung" },
  "team.aendern": {
    credential: "sitzung",
    fields: ["name", "lead"],
    teamExists: true,
    leadInTeam: true,
  },
  "team.loeschen": { credential: "sitzung", teamExists: true },
  "bot.team_setzen": { credential: "sitzung", teamExists: true },
  "team.entwurf_erstellen": {
    credential: "sitzung",
    herkunft: "vorlage",
    offeneEntwuerfe: 1,
    maxOffeneEntwuerfe: 5,
    entwuerfeHeute: 2,
    maxEntwuerfeProTag: 20,
    killSwitch: false,
  },
  "team.entwurf_verwerfen": { credential: "sitzung", entwurfOffen: true },
  "team.entwurf_anlegen": {
    credential: "sitzung",
    entwurfOffen: true,
    entwurfDigest: ENTWURF_DIGEST,
    seenEntwurfDigest: ENTWURF_DIGEST,
    namesFree: true,
    modelsAvailable: true,
    contactInDraft: true,
    draftBots: 3,
    maxDraftBots: 6,
    botsAfter: 4,
    maxBots: 50,
    killSwitch: false,
  },
  "team.entwurf_zuruecknehmen": { credential: "sitzung", allUnused: true, allUnchanged: true },
  "faden.anlegen": {
    credential: "sitzung",
    teamExists: true,
    zettelChars: 120,
    maxZettelChars: 4000,
  },
  "einstellung.stabschef_setzen": { credential: "sitzung", on: true, wasOn: false },
};

/** Reihenfolge der Aktionen in der Kette: jede einmal, danach die Sonderfälle. */
export const KETTE_F4_AKTIONEN = Object.keys(TARGETS) as ActionType[];

/** Erzeugt die Kette in der leeren, migrierten Datenbank `db` und gibt den Export (JSON-Zeilen) zurück. */
export async function erzeugeKetteF4(db: Database): Promise<string> {
  let tick = 0;
  const clock = { now: () => new Date(Date.UTC(2026, 10, 27, 12, 0, 0) + tick++ * 1000) };
  const keyA = testKey();
  const keyB = testKey();
  const store = async (key: typeof keyA) =>
    db.insert(installationKeys).values({
      id: key.keyId,
      purpose: "receipts",
      publicKey: key.publicKey,
      privateKeyEnc: "v1:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA:AA",
      fingerprint: key.fingerprint,
    });
  await store(keyA);
  let active = keyA;
  const writer = createReceiptWriter(db, {
    current: async () => ({ keyId: active.keyId, privateKey: active.privateKey }),
  });
  await writer.appendStart({
    installationId: ids.installationId,
    key: keyA,
    software: "0.3.0-dev",
    time: clock.now(),
  });
  // Schlüsselwechsel wie in der App: alten Schlüssel ausmustern, neuen speichern, Beleg schreiben.
  await repo.installationKeys.retire(db, keyA.keyId, { now: clock.now() });
  await store(keyB);
  await writer.appendKeyChange({
    next: keyB,
    previous: { keyId: keyA.keyId, privateKey: keyA.privateKey },
    time: clock.now(),
  });
  active = keyB;

  const gate = createGate({
    rules: {
      load: async () => {
        const { stand, rules } = await repo.rules.loadSnapshot(db);
        return ruleSnapshot(rules, stand);
      },
    },
    receipts: writer,
    clock,
  });

  const ok: Execute<never, string> = async () => ({
    value: "fertig",
    result: { status: "ok" },
  });
  const modelOk: Execute<never, string> = async () => ({
    value: "fertig",
    result: {
      status: "ok",
      digest: `hmac-sha256:${"3c".repeat(32)}`,
      tokens: { input: 812, output: 120 },
      servedBy: { provider: "tensorix", model: "mistral-small-3.2" },
      modelReported: "mistral-small-3.2-2506",
    },
  });
  const werkzeugOk: Execute<never, string> = async () => ({
    value: "fertig",
    result: {
      status: "ok",
      digest: `hmac-sha256:${"4d".repeat(32)}`,
      docStand: "0.3.0",
      found: 3,
    },
  });
  const fails: Execute<never, string> = async () => {
    throw new PaiBotError("anbieter_nicht_erreichbar");
  };

  const run = async (
    type: ActionType,
    facts: Record<string, unknown>,
    execute: Execute<never, string> = ok,
  ) => {
    const action = {
      actionId: newId("action"),
      type,
      actor: BOT_ACTIONS.includes(type) ? botActor(BOT) : "besitzer",
      target: structuredClone(TARGETS[type]),
    };
    try {
      await gate.run(action as never, facts as never, execute, {
        context: { digest: `hmac-sha256:${"7e".repeat(32)}` },
      });
    } catch (error) {
      // Abgelehnt oder beim Ausführen gescheitert: beide Belege stehen trotzdem.
      if (!isPaiBotError(error)) throw error;
    }
  };

  // Jede Aktion, die die Datenbank speichert, einmal (Not-Aus, Pause und Stabschef hier: ein).
  for (const type of KETTE_F4_AKTIONEN) {
    const execute =
      type === "modell.anfragen" ? modelOk : type === "werkzeug.aufrufen" ? werkzeugOk : ok;
    await run(type, FACTS[type] as Record<string, unknown>, execute);
  }
  // Not-Aus wieder aus (mit bestätigtem Passwort), Pause und Stabschef wieder aus.
  await run("notaus.umschalten", {
    credential: "sitzung",
    on: false,
    wasOn: true,
    currentPasswordVerified: true,
  });
  await run("bot.pausieren", { credential: "sitzung", paused: false, wasPaused: true });
  await run("einstellung.stabschef_setzen", { credential: "sitzung", on: false, wasOn: true });
  // Modell-Anfrage abgelehnt durch die Grenzen G-01 bis G-05 und G-15 (Bot pausiert).
  await run("modell.anfragen", { ...MODEL_FACTS, route: "direct" });
  await run("modell.anfragen", { ...MODEL_FACTS, region: "non_eu" });
  await run("modell.anfragen", { ...MODEL_FACTS, inputChars: 32001 });
  await run("modell.anfragen", { ...MODEL_FACTS, tokensToday: 100000 });
  await run("modell.anfragen", { ...MODEL_FACTS, killSwitch: true });
  await run("modell.anfragen", { ...MODEL_FACTS, botPaused: true });
  // Bot anlegen über der Höchstzahl der Bots (Grenze der Fassung 4).
  await run("bot.anlegen", { ...BOT_ANLEGEN_FACTS, botsAfter: 51 });
  // Fehler beim Ausführen.
  await run("modell.anfragen", MODEL_FACTS, fails);
  // Vorbedingungen verletzt (V-02; V-37 Standard-Bot) und Ablehnung durch eine Regel (R-006).
  await run("nachricht.senden", { ...FACTS["nachricht.senden"], runActive: true });
  await run("bot.loeschen", { ...BOT_LOESCHEN_FACTS, isDefaultBot: true });
  await run("bot.aendern", { credential: "passwort", fields: ["name"] });

  let text = "";
  for await (const line of exportJsonl(
    await exportHeader(db, clock.now()),
    await repo.belege.listFrom(db),
  )) {
    text += line;
  }
  return text;
}
