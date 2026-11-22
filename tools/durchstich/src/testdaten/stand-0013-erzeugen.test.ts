/**
 * PaiBot – erzeugt Bestandsdaten einer Installation im Stand der Migration 0013 (nur Tests): echte
 * Einrichtung, echtes Tor, echter Beleg-Schreiber und echte Zugriffs-Funktionen gegen Postgres,
 * danach `pg_dump` nur der Daten. Läuft nur, wenn `STAND_ZIEL` gesetzt ist.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import {
  decryptSecret,
  deriveKey,
  encryptSecret,
  fingerprint,
  generateSigningKey,
  hashPassword,
  loadMasterSecret,
} from "@paibot/crypto";
import { createDb, type Database, repo } from "@paibot/db";
import { createPostgresTestDatabase } from "@paibot/db/testing";
import { createGate, type Execute, ruleSnapshot } from "@paibot/gate";
import { providerTargetFacts } from "@paibot/llm";
import { createReceiptWriter, verifyChain } from "@paibot/receipts";
import * as aktionen from "@paibot/shared/aktionen";
import { secretAad, signingKeySecretBinding } from "@paibot/shared/bindung";
import { type ErrorCode, isPaiBotError, PaiBotError } from "@paibot/shared/fehler";
import { type KeyId, newId } from "@paibot/shared/ids";
import type { Bot, Conversation, Message, Run } from "@paibot/shared/objekte";
import { describe, expect, it } from "vitest";

/*
 * Erzeugt wurden die Dateien in einem eigenen Arbeitsbaum genau auf dem jeweiligen Stand, gegen ein
 * eigenes Postgres 16 (Benutzer mit Passwort, `pg_dump` aus PAIBOT_TEST_PG_BIN):
 *
 *   git worktree add --detach <ordner> <stand>
 *   cd <ordner> && pnpm install --frozen-lockfile
 *   mkdir -p tools/durchstich/src/testdaten && cp <diese Datei> tools/durchstich/src/testdaten/
 *   STAND_ZIEL=/pfad/stand-0013-<name>.sql PAIBOT_TEST_PG_BIN=/usr/lib/postgresql/16/bin \
 *     PAIBOT_TEST_DATABASE_URL=postgres://postgres:<passwort>@127.0.0.1:<port>/postgres \
 *     pnpm --filter @paibot/durchstich exec vitest run src/testdaten/stand-0013-erzeugen.test.ts \
 *     --maxWorkers=1
 *
 *   stand-0013-rc.sql: Stand a630006 (v0.3.0-rc.1, Migrationen bis 0013, Tor-Fassung 1)
 *   stand-0013-fassung-2.sql: Stand 734de70 (Migrationen bis 0013, Tor-Fassung 2)
 *
 * Schlüssel und Kennungen entstehen bei jedem Lauf neu (die privaten Schlüssel stehen nur
 * verschlüsselt in der Datei, mit dem öffentlichen Test-Geheimnis `STAND_TEST_GEHEIMNIS`; die
 * Tests des Aufstiegs leiten es genauso her). Ein neuer Lauf ergibt deshalb eine
 * andere Datei; die Dateien im Repo werden nicht angepasst. Das Skript passt seine Fakten an die
 * Tor-Fassung des Stands an (Fassung 2 verlangt mehr Fakten).
 *
 * In der Datei fehlen `rules` (legen die Migrationen an) und `rate_limits` (flüchtig).
 */

const ZIEL = process.env.STAND_ZIEL;
const BASIS = process.env.PAIBOT_TEST_DATABASE_URL;
const PG_BIN = process.env.PAIBOT_TEST_PG_BIN;

/** Tor-Fassung 2 kennt die Wirkung eines Werkzeugs (`TOOL_REACHES`). */
const FASSUNG_2 = "TOOL_REACHES" in aktionen;

/**
 * Wurzel-Geheimnis nur dieser Testdaten (öffentlich, schützt nichts Echtes): Damit können die Tests
 * nach dem Aufstieg mit dem gespeicherten Schlüssel weitere Belege an dieselbe Kette hängen.
 */
const STAND_TEST_GEHEIMNIS = createHash("sha256")
  .update("PaiBot Bestandsdaten nur für Tests")
  .digest("base64");

const CONTEXT = { digest: `hmac-sha256:${"7e".repeat(32)}` } as const;

/** Fakten nur der Tor-Fassung 2 für `modell.anfragen` (ein Schritt, ohne Werkzeuge). */
const MODELL_FASSUNG_2 = {
  step: 0,
  maxSteps: 1,
  runTokens: 0,
  stepTokenEstimate: 0,
  maxRunTokens: 500000,
  toolCount: 0,
  untrustedInput: false,
  trigger: "chat",
};

/** Fakten nur der Tor-Fassung 2 für `werkzeug.aufrufen`. */
const WERKZEUG_FASSUNG_2 = {
  toolKey: "eingebaut/notiz.lesen",
  toolDigest: `sha256:${"4d".repeat(32)}`,
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
};

async function erzeugen(db: Database): Promise<void> {
  let tick = 0;
  const clock = { now: () => new Date(Date.UTC(2026, 10, 21, 9, 0, 0) + tick++ * 1000) };
  const master = loadMasterSecret({ PAIBOT_SECRET: STAND_TEST_GEHEIMNIS });
  const keysKey = deriveKey(master, "keys-v1");

  /** Signaturschlüssel wie bei der Einrichtung: verschlüsselt, gebunden an Kennung und öffentlichen Teil. */
  const neuerSchluessel = () => {
    const paar = generateSigningKey();
    const keyId = newId("key") as KeyId;
    return {
      keyId,
      publicKey: paar.publicKey,
      privateKey: paar.privateKey,
      fingerprint: fingerprint(paar.publicKey),
      privateKeyEnc: encryptSecret(paar.privateKey, keysKey, {
        aad: secretAad(signingKeySecretBinding(keyId, paar.publicKey)),
      }),
    };
  };
  const speichern = (key: ReturnType<typeof neuerSchluessel>) =>
    repo.installationKeys.create(db, {
      id: key.keyId,
      publicKey: key.publicKey,
      privateKeyEnc: key.privateKeyEnc,
      fingerprint: key.fingerprint,
    });

  // Einrichtung: Schlüssel A, Beleg „Start“, Besitzer und Einstellungen über das Tor.
  const installationId = newId("installation");
  const keyA = neuerSchluessel();
  await speichern(keyA);
  let aktiv = keyA;
  const writer = createReceiptWriter(db, {
    current: async () => ({ keyId: aktiv.keyId, privateKey: aktiv.privateKey }),
  });
  await writer.appendStart({ installationId, key: keyA, software: "0.3.0", time: clock.now() });
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

  /** Eine Aktion durchs Tor. Abgelehnt oder gescheitert: der Fehler kommt zurück, Belege stehen. */
  const tor = async (
    type: string,
    actor: string,
    target: Record<string, string>,
    facts: Record<string, unknown>,
    execute: Execute<never, unknown> = async () => ({ value: undefined, result: { status: "ok" } }),
  ): Promise<PaiBotError | undefined> => {
    try {
      await gate.run(
        { actionId: newId("action"), type, actor, target } as never,
        facts as never,
        execute,
        { context: CONTEXT },
      );
      return undefined;
    } catch (error) {
      if (!isPaiBotError(error)) throw error;
      return error;
    }
  };
  const besitzer = (type: string, target: Record<string, string>, facts: Record<string, unknown>) =>
    tor(type, "besitzer", target, { credential: "sitzung", ...facts });

  const passwortHash = await hashPassword(randomBytes(12).toString("base64url"));
  const fertig = await tor(
    "einrichtung.abschliessen",
    "besitzer",
    { installationId },
    { credential: "einrichtungs_code", setupOpen: true },
    async () => {
      await repo.owner.create(db, { passwordHash: passwortHash });
      await repo.settings.completeSetup(db, { installationId, timezone: "Europe/Berlin" });
      return { value: undefined, result: { status: "ok" } };
    },
  );
  expect(fertig).toBeUndefined();

  // Schlüsselwechsel wie in der App: alten ausmustern, neuen speichern, Beleg vom alten signiert.
  const keyB = neuerSchluessel();
  await repo.installationKeys.retire(db, keyA.keyId, { now: clock.now() });
  await speichern(keyB);
  await writer.appendKeyChange({
    next: keyB,
    previous: { keyId: keyA.keyId, privateKey: keyA.privateKey },
    time: clock.now(),
  });
  aktiv = keyB;

  // Anbieter, Modell und zwei Bots (Ausgabegrenze 4 096 und 100 000).
  const provider = await repo.providers.create(db, {
    name: "Beispiel-Anbieter",
    baseUrl: "https://api.example.com/v1",
    region: "eu",
  });
  expect(
    await besitzer(
      "anbieter.speichern",
      { providerId: provider.id },
      { created: true, region: "eu", keySet: false },
    ),
  ).toBeUndefined();
  const model = await repo.models.create(db, {
    providerId: provider.id,
    slug: "beispiel-modell",
    displayName: "Beispiel-Modell",
    contextWindow: 128000,
  });
  const pai = await repo.bots.create(db, {
    name: "Pai",
    avatarShape: "blatt",
    color: "blau",
    modelId: model.id,
  });
  const lang = await repo.bots.create(db, {
    name: "Lang",
    avatarShape: "wabe",
    color: "gruen",
    modelId: model.id,
    maxOutputTokens: 100000,
  });
  await repo.settings.update(db, { defaultBotId: pai.id });

  const modellFakten = (bot: Bot, conversation: Conversation, inputChars: number) => ({
    botOfConversation: conversation.botId === bot.id,
    providerId: provider.id,
    providerEnabled: true,
    region: "eu",
    route: "direct",
    requestedMode: "off",
    schleuseReachable: false,
    inputChars,
    maxInputChars: 32000,
    maxOutputTokens: bot.maxOutputTokens,
    botMaxOutputTokens: bot.maxOutputTokens,
    tokensToday: 0,
    killSwitch: false,
    ...providerTargetFacts(provider.id, provider.baseUrl),
    ...(FASSUNG_2 ? MODELL_FASSUNG_2 : {}),
  });

  /** Nachricht der Person über das Tor `nachricht.senden`, wie die App sie anlegt. */
  const senden = async (conversation: Conversation, text: string): Promise<Message> => {
    const messageId = newId("message");
    const fehler = await besitzer(
      "nachricht.senden",
      { conversationId: conversation.id, messageId },
      {
        inputChars: text.length,
        maxInputChars: 32000,
        conversationExists: true,
        runActive: false,
        killSwitch: false,
      },
    );
    expect(fehler).toBeUndefined();
    const message = await repo.messages.insert(db, {
      id: messageId,
      conversationId: conversation.id,
      role: "user",
      content: text,
    });
    await repo.events.append(db, {
      conversationId: conversation.id,
      type: "message.created",
      data: { messageId: message.id, role: "user", text },
    });
    return message;
  };

  type Ende = "succeeded" | "failed" | "cancelled" | "denied";

  /** Ein Lauf zu `trigger`: Tor `modell.anfragen`, Antwort mit `text.delta`, Ende wie `ende`. */
  const lauf = async (
    conversation: Conversation,
    bot: Bot,
    trigger: Message,
    ende: Ende,
    antwort: string,
    mitWerkzeug = false,
  ): Promise<Run> => {
    const run = await repo.runs.create(db, {
      conversationId: conversation.id,
      triggerMessageId: trigger.id,
      botId: bot.id,
    });
    await repo.events.append(db, {
      conversationId: conversation.id,
      type: "run.queued",
      data: { runId: run.id },
    });
    await repo.runs.markRunning(db, run.id);
    await repo.events.append(db, {
      conversationId: conversation.id,
      type: "run.started",
      data: { runId: run.id },
    });
    const target = {
      conversationId: conversation.id,
      runId: run.id,
      botId: bot.id,
      modelId: model.id,
    };
    if (ende === "denied") {
      const fehler = await tor(
        "modell.anfragen",
        aktionen.botActor(bot.id),
        target,
        modellFakten(bot, conversation, 40000),
      );
      expect(fehler).toBeDefined();
      const code: ErrorCode = fehler?.code ?? "intern";
      await repo.runs.finish(db, run.id, { status: "denied", errorCode: code });
      await repo.events.append(db, {
        conversationId: conversation.id,
        type: "run.denied",
        data: { runId: run.id, code, text: "Die Nachricht ist zu lang." },
      });
      return run;
    }
    const message = await repo.messages.insert(db, {
      conversationId: conversation.id,
      role: "assistant",
      status: "streaming",
      runId: run.id,
      modelId: model.id,
      providerId: provider.id,
      route: "direct",
    });
    const fehler = await tor(
      "modell.anfragen",
      aktionen.botActor(bot.id),
      target,
      modellFakten(bot, conversation, trigger.content.length),
      async () => {
        for (const teil of antwort.split(" ")) {
          await repo.events.append(db, {
            conversationId: conversation.id,
            type: "text.delta",
            data: { runId: run.id, messageId: message.id, text: `${teil} ` },
          });
        }
        if (ende === "failed") throw new PaiBotError("anbieter_nicht_erreichbar");
        return {
          value: undefined,
          result: {
            status: "ok",
            digest: `hmac-sha256:${"3c".repeat(32)}`,
            tokens: { input: 40 + trigger.content.length, output: antwort.length },
            servedBy: { provider: "beispiel", model: "beispiel-modell" },
          },
        };
      },
    );
    if (mitWerkzeug) {
      // Das Modell wünscht ein Werkzeug; R-005 sagt „fragen“, das Tor schreibt „abgelehnt“.
      const werkzeug = await tor(
        "werkzeug.aufrufen",
        aktionen.botActor(bot.id),
        { conversationId: conversation.id, runId: run.id, botId: bot.id },
        {
          botOfConversation: true,
          runRunning: true,
          toolName: "notiz_lesen",
          toolSource: "eingebaut",
          toolKind: "lesen",
          argsDigest: `hmac-sha256:${"a7".repeat(32)}`,
          killSwitch: false,
          ...(FASSUNG_2 ? WERKZEUG_FASSUNG_2 : {}),
        },
      );
      expect(werkzeug?.code).toBe("regel_fehlt");
    }
    if (ende === "failed") {
      expect(fehler?.code).toBe("anbieter_nicht_erreichbar");
      await repo.messages.finalize(db, message.id, {
        status: "failed",
        content: antwort,
        errorCode: "anbieter_nicht_erreichbar",
      });
      await repo.runs.finish(db, run.id, {
        status: "failed",
        errorCode: "anbieter_nicht_erreichbar",
      });
      await repo.events.append(db, {
        conversationId: conversation.id,
        type: "run.failed",
        data: { runId: run.id, code: "anbieter_nicht_erreichbar", text: "Nicht erreichbar." },
      });
      return run;
    }
    expect(fehler).toBeUndefined();
    if (ende === "cancelled") {
      expect(
        await besitzer(
          "lauf.abbrechen",
          { conversationId: conversation.id, runId: run.id },
          { runActive: true },
        ),
      ).toBeUndefined();
      await repo.messages.finalize(db, message.id, {
        status: "cancelled",
        content: antwort,
        errorCode: "unterbrochen",
      });
      await repo.runs.finish(db, run.id, { status: "cancelled", errorCode: "unterbrochen" });
      await repo.events.append(db, {
        conversationId: conversation.id,
        type: "run.cancelled",
        data: { runId: run.id, code: "unterbrochen", text: "Abgebrochen." },
      });
      return run;
    }
    const tokens = { input: 40 + trigger.content.length, output: antwort.length };
    await repo.messages.finalize(db, message.id, {
      status: "complete",
      content: antwort,
      tokensIn: tokens.input,
      tokensOut: tokens.output,
      servedBy: { provider: "beispiel", model: "beispiel-modell" },
    });
    await repo.events.append(db, {
      conversationId: conversation.id,
      type: "message.completed",
      data: {
        messageId: message.id,
        route: "direct",
        modelLabel: "Beispiel-Modell",
        tokens,
        servedBy: { provider: "beispiel", model: "beispiel-modell" },
      },
    });
    await repo.runs.finish(db, run.id, { status: "succeeded" });
    return run;
  };

  // Erste Unterhaltung (Pai): beantwortet, gescheitert, „neu erzeugen“ der ersten Antwort.
  const erste = await repo.conversations.create(db, { botId: pai.id, title: "Wochenplan" });
  expect(
    await besitzer("unterhaltung.anlegen", { conversationId: erste.id, botId: pai.id }, {}),
  ).toBeUndefined();
  const frage1 = await senden(erste, "Was steht diese Woche an?");
  await lauf(erste, pai, frage1, "succeeded", "Montag Einkauf, Mittwoch Sport.", true);
  const frage2 = await senden(erste, "Und am Wochenende?");
  await lauf(erste, pai, frage2, "failed", "Am Samstag");
  expect(
    await besitzer(
      "antwort.neu_erzeugen",
      { conversationId: erste.id, messageId: frage1.id },
      { conversationExists: true, runActive: false, answerIsLatest: true, killSwitch: false },
    ),
  ).toBeUndefined();
  await lauf(erste, pai, frage1, "succeeded", "Montag Einkauf, Mittwoch Sport, Freitag frei.");

  // Not-Aus an und wieder aus.
  expect(
    await besitzer(
      "notaus.umschalten",
      { installationId },
      { on: true, wasOn: false, currentPasswordVerified: false },
    ),
  ).toBeUndefined();
  await repo.settings.update(db, { killSwitch: true });
  expect(
    await besitzer(
      "notaus.umschalten",
      { installationId },
      { on: false, wasOn: true, currentPasswordVerified: true },
    ),
  ).toBeUndefined();
  await repo.settings.update(db, { killSwitch: false });

  // Zweite Unterhaltung (Bot mit 100 000): abgebrochen, abgelehnt (G-03), beantwortet.
  const zweite = await repo.conversations.create(db, { botId: lang.id, title: "Langer Text" });
  expect(
    await besitzer("unterhaltung.anlegen", { conversationId: zweite.id, botId: lang.id }, {}),
  ).toBeUndefined();
  const frage3 = await senden(zweite, "Schreib mir eine lange Geschichte.");
  await lauf(zweite, lang, frage3, "cancelled", "Es war einmal");
  const frage4 = await senden(zweite, "Bitte kürzer.");
  await lauf(zweite, lang, frage4, "denied", "");
  const frage5 = await senden(zweite, "Dann nur einen Satz.");
  await lauf(zweite, lang, frage5, "succeeded", "Es war einmal ein kurzer Satz.");

  // Die Kette ist vertrauenswürdig, bevor sie gesichert wird.
  const report = await verifyChain(await repo.belege.listFrom(db), {
    publicKeys: await repo.installationKeys.listPublic(db),
    rules: await repo.rules.listActive(db),
  });
  expect(report.firstFailure).toBeUndefined();
  expect(report.ok).toBe(true);
  // Der verschlüsselte Schlüssel lässt sich mit dem (nicht gespeicherten) Geheimnis öffnen.
  const gespeichert = await repo.installationKeys.getActive(db);
  expect(
    gespeichert === undefined
      ? undefined
      : decryptSecret(gespeichert.privateKeyEnc, keysKey, {
          aad: secretAad(signingKeySecretBinding(gespeichert.id, gespeichert.publicKey)),
        }),
  ).toBe(keyB.privateKey);
}

describe.skipIf(ZIEL === undefined || BASIS === undefined)("Bestandsdaten im Stand 0013", () => {
  it("erzeugt die Datei", { timeout: 120_000 }, async () => {
    const datenbank = await createPostgresTestDatabase(BASIS ?? "");
    const { db, sql } = createDb(datenbank.url);
    try {
      await erzeugen(db as unknown as Database);
      const adresse = new URL(datenbank.url);
      const lauf = spawnSync(
        PG_BIN === undefined ? "pg_dump" : path.join(PG_BIN, "pg_dump"),
        [
          "--data-only",
          "--column-inserts",
          "--schema=public",
          "--exclude-table=public.rules",
          "--exclude-table=public.rate_limits",
          "--exclude-table=public.__drizzle_migrations",
          "--no-owner",
          "--no-privileges",
        ],
        {
          env: {
            PATH: process.env.PATH ?? "",
            PGHOST: adresse.hostname,
            PGPORT: adresse.port || "5432",
            PGUSER: decodeURIComponent(adresse.username),
            PGPASSWORD: decodeURIComponent(adresse.password),
            PGDATABASE: adresse.pathname.slice(1),
          },
          maxBuffer: 64 * 1024 * 1024,
        },
      );
      // Erwartet ist nur der Hinweis auf den Fremdschlüssel von `runs` auf sich selbst; beim
      // Einspielen sind die Trigger aus (`session_replication_role = replica`).
      const meldungen = lauf.stderr
        .toString("utf8")
        .split("\n")
        .filter((z) => z !== "" && !/^pg_dump: (?:detail: runs|hint: )/.test(z));
      expect(meldungen).toEqual([
        "pg_dump: warning: there are circular foreign-key constraints on this table:",
      ]);
      expect(lauf.status).toBe(0);
      // Nur Anweisungen: Kommentare, Leerzeilen und Befehle von psql (`\restrict`) fallen weg.
      const zeilen = lauf.stdout
        .toString("utf8")
        .split("\n")
        .filter((z) => z !== "" && !z.startsWith("--") && !z.startsWith("\\"));
      const kopf = [
        "-- PaiBot – Bestandsdaten einer Installation im Stand der Migration 0013 (nur Tests).",
        "-- Erzeugt mit tools/durchstich/src/testdaten/stand-0013-erzeugen.test.ts (Stand und",
        "-- Befehl dort). Nur Beispiel-Daten; private Schlüssel nur verschlüsselt.",
        "--",
        "-- Autor:     Oliver Hees",
        "-- Website:   https://paibot.de",
        "-- Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.",
        "-- Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm",
        "-- Seit:      2026-11-21",
        "",
      ];
      writeFileSync(ZIEL ?? "", `${[...kopf, ...zeilen].join("\n")}\n`);
    } finally {
      await sql.end({ timeout: 2 });
      await datenbank.drop();
    }
  });
});
