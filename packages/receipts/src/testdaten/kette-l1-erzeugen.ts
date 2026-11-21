/**
 * PaiBot – erzeugt die feste Beleg-Kette `kette-l1.jsonl` (nur Tests): echtes Tor (`gate.run`),
 * echter Beleg-Schreiber gegen eine Datenbank im Speicher, Export wie in der App.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
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
 * Erzeugt wurde die Datei mit dem Code von `main` auf Stand 30826da (Tor-Fassung 1, mit Fassung im
 * Code), in einem eigenen Arbeitsbaum genau auf diesem Stand:
 *
 *   git worktree add --detach <ordner> 30826da
 *   cd <ordner> && pnpm install --frozen-lockfile
 *   cp <diese Datei> packages/receipts/src/testdaten/
 *   # vorübergehende Datei packages/receipts/src/erzeugen.tmp.test.ts (nicht im Repo):
 *   #   import { writeFileSync } from "node:fs";
 *   #   import { createTestDb } from "@paibot/db/testing";
 *   #   import { it } from "vitest";
 *   #   import { erzeugeKetteL1 } from "./testdaten/kette-l1-erzeugen";
 *   #   it("erzeugen", async () => {
 *   #     const { db, client } = await createTestDb();
 *   #     writeFileSync(process.env.KETTE_ZIEL as string, await erzeugeKetteL1(db));
 *   #     await client.close();
 *   #   });
 *   KETTE_ZIEL=/pfad/kette-l1.jsonl pnpm --filter @paibot/receipts exec vitest run \
 *     src/erzeugen.tmp.test.ts --maxWorkers=1
 *
 * Die Schlüssel entstehen bei jedem Lauf neu und werden nicht gespeichert; Kennungen sind
 * zufällig. Ein neuer Lauf ergibt deshalb eine andere Datei. Die Datei im Repo wird nie neu
 * erzeugt oder angepasst. Das Skript läuft nur auf dem genannten Stand: Spätere Verträge verlangen
 * mehr Fakten, und das Tor weist diese Anfragen dann ab.
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
};

const BOT_ACTIONS: readonly string[] = ["modell.anfragen", "werkzeug.aufrufen"];

/** Ziel je Aktion (alle Aktionen, die die Datenbank speichert). */
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
};

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
  },
  "modell.anfragen": MODEL_FACTS,
  "lauf.abbrechen": { credential: "sitzung", runActive: true },
  "belege.exportieren": { credential: "sitzung", entries: 42 },
  "werkzeug.aufrufen": {
    botOfConversation: true,
    runRunning: true,
    toolName: "notiz_lesen",
    toolSource: "eingebaut",
    toolKind: "lesen",
    argsDigest: `hmac-sha256:${"a7".repeat(32)}`,
    killSwitch: false,
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
};

/** Reihenfolge der Aktionen in der Kette: jede einmal, danach die Sonderfälle. */
export const KETTE_L1_AKTIONEN = Object.keys(TARGETS) as ActionType[];

/** Erzeugt die Kette in der leeren, migrierten Datenbank `db` und gibt den Export (JSON-Zeilen) zurück. */
export async function erzeugeKetteL1(db: Database): Promise<string> {
  let tick = 0;
  const clock = { now: () => new Date(Date.UTC(2026, 10, 21, 12, 0, 0) + tick++ * 1000) };
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
    software: "0.3.0+dev",
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

  // Jede Aktion, die die Datenbank speichert, einmal (Not-Aus hier: einschalten).
  for (const type of KETTE_L1_AKTIONEN) {
    await run(
      type,
      FACTS[type] as Record<string, unknown>,
      type === "modell.anfragen" ? modelOk : ok,
    );
  }
  // Not-Aus wieder aus (mit bestätigtem Passwort).
  await run("notaus.umschalten", {
    credential: "sitzung",
    on: false,
    wasOn: true,
    currentPasswordVerified: true,
  });
  // Modell-Anfrage abgelehnt durch jede Grenze G-01 bis G-05.
  await run("modell.anfragen", { ...MODEL_FACTS, route: "direct" });
  await run("modell.anfragen", { ...MODEL_FACTS, region: "non_eu" });
  await run("modell.anfragen", { ...MODEL_FACTS, inputChars: 32001 });
  await run("modell.anfragen", { ...MODEL_FACTS, tokensToday: 100000 });
  await run("modell.anfragen", { ...MODEL_FACTS, killSwitch: true });
  // Fehler beim Ausführen.
  await run("modell.anfragen", MODEL_FACTS, fails);
  // Vorbedingung verletzt (V-02) und Ablehnung durch eine Regel (R-006).
  await run("nachricht.senden", { ...FACTS["nachricht.senden"], runActive: true });
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
