/**
 * PaiBot – Test-Umgebung für die Lauf-Steuerung: eine eingerichtete Installation in einer
 * Datenbank (Signaturschlüssel, Start-Beleg, Tor mit Regeln aus der Datenbank, Anbieter, Modell,
 * Bot, Unterhaltung) und das Senden einer Nachricht so, wie die Web-App es tut. Nur für Tests.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { randomBytes } from "node:crypto";
import {
  createSigningKeyHolder,
  decryptSecret,
  deriveKey,
  encryptSecret,
  fingerprint,
  generateSigningKey,
  loadMasterSecret,
  type SigningKeyHolder,
} from "@paibot/crypto";
import { type Database, repo } from "@paibot/db";
import { type Clock, createGate, type Gate, type ReceiptWriter, ruleSnapshot } from "@paibot/gate";
import type { SchleuseConnection, SchleuseStatus } from "@paibot/llm";
import type { ReceiptEntry } from "@paibot/shared/belege";
import { providerSecretBinding, secretAad, signingKeySecretBinding } from "@paibot/shared/bindung";
import type { ConversationEvent } from "@paibot/shared/ereignisse";
import {
  type BotId,
  type ConversationId,
  type InstallationId,
  type KeyId,
  type MessageId,
  type ModelId,
  newId,
  type ProviderId,
  type RunId,
} from "@paibot/shared/ids";
import type { Motor } from "@paibot/shared/motor";
import type { Region } from "@paibot/shared/objekte";
import { readStand } from "@paibot/shared/stand";
import type { RunDeps, RunTuning } from "../run/vertrag";

/** Signaturschlüssel im Speicher, wie ihn `createSigningKeyHolder` liefert. */
export type SigningKeys = SigningKeyHolder<KeyId>;

/** Schreiber der Beleg-Kette (aus `@paibot/receipts`, vom Test übergeben). */
export interface ChainWriter extends ReceiptWriter {
  appendStart(input: {
    installationId: InstallationId;
    key: { keyId: KeyId; publicKey: string; privateKey: string };
    software: string;
    time: Date;
  }): Promise<unknown>;
}

/** Was der Test aus dem Beleg-Paket mitgibt. */
export interface ReceiptTools<W extends ChainWriter> {
  createWriter(db: Database, keys: SigningKeys): W;
  verify(
    entries: ReceiptEntry[],
    options: { publicKeys: unknown[]; rules: unknown[] },
  ): Promise<{ ok: boolean }>;
}

export interface RunSetupOptions {
  /** Basis-URL des Anbieters (z. B. des Test-Anbieters), endet auf `/v1`. */
  providerBaseUrl: string;
  providerKey: string;
  motor: Motor;
  region?: Region;
  modelSlug?: string;
  /** Vorlage des Anbieters (Standard `eigener`); `eurouter` für Routing-Regeln. */
  templateKey?: "eurouter" | "mistral" | "eigener";
  schleuse?: SchleuseConnection;
  schleuseStatus?: () => Promise<SchleuseStatus>;
  tuning?: Partial<RunTuning>;
  clock?: Clock;
  /** Wurzel-Geheimnis (`PAIBOT_SECRET`); ohne Angabe ein zufälliges. */
  secret?: string;
}

export interface RunSetup<W extends ChainWriter = ChainWriter> {
  db: Database;
  deps: RunDeps;
  gate: Gate;
  writer: W;
  botId: BotId;
  providerId: ProviderId;
  modelId: ModelId;
  conversationId: ConversationId;
  /** Eine weitere Unterhaltung mit dem Bot. */
  newConversation(): Promise<ConversationId>;
  /**
   * Wie die Web-App beim Senden: in einer Transaktion Nachricht der Person, Lauf `queued`,
   * Ereignisse `message.created` und `run.queued`.
   */
  queueMessage(
    text: string,
    conversationId?: ConversationId,
  ): Promise<{
    runId: RunId;
    messageId: MessageId;
  }>;
  events(conversationId?: ConversationId): Promise<ConversationEvent[]>;
  receipts(): Promise<ReceiptEntry[]>;
  /**
   * Abhängigkeiten eines Laufs über eine andere Verbindung zur selben Datenbank (eigener
   * Beleg-Schreiber und eigenes Tor, gleiche Schlüssel), wie ein zweiter Worker.
   */
  depsFor(other: Database, motor?: Motor): RunDeps;
  /** Tor über eine andere Verbindung (wie die Web-App). */
  gateFor(other: Database): Gate;
  /** Prüft die ganze Kette mit den Schlüsseln aus der Datenbank. */
  verify(): Promise<{ ok: boolean }>;
}

/** Richtet eine Installation in `db` ein (Datenbank mit allen Migrationen). */
export async function setupRun<W extends ChainWriter>(
  db: Database,
  tools: ReceiptTools<W>,
  options: RunSetupOptions,
): Promise<RunSetup<W>> {
  const master = loadMasterSecret({
    PAIBOT_SECRET: options.secret ?? randomBytes(32).toString("base64"),
  });
  const secretsKey = deriveKey(master, "secrets-v1");
  const keysKey = deriveKey(master, "keys-v1");
  const contextKey = deriveKey(master, "context-v1");
  const clock = options.clock ?? { now: () => new Date() };

  const installationId = newId("installation");
  await repo.settings.completeSetup(db, { installationId, now: clock.now() });
  const pair = generateSigningKey();
  const keyId = newId("key") as KeyId;
  await repo.installationKeys.create(db, {
    id: keyId,
    publicKey: pair.publicKey,
    privateKeyEnc: encryptSecret(pair.privateKey, keysKey, {
      aad: secretAad(signingKeySecretBinding(keyId, pair.publicKey)),
    }),
    fingerprint: fingerprint(pair.publicKey),
  });
  const holder = createSigningKeyHolder(async () => {
    const active = await repo.installationKeys.getActive(db);
    if (active === undefined) throw new Error("kein aktiver Schlüssel");
    return {
      keyId: active.id,
      publicKey: active.publicKey,
      privateKey: decryptSecret(active.privateKeyEnc, keysKey, {
        aad: secretAad(signingKeySecretBinding(active.id, active.publicKey)),
      }),
    };
  });
  await holder.load();
  const writer = tools.createWriter(db, holder);
  const clockOf = options.clock ?? { now: () => new Date() };
  const gateOn = (target: Database, receipts: ReceiptWriter) =>
    createGate({
      rules: {
        load: async () => {
          const snapshot = await repo.rules.loadSnapshot(target);
          return ruleSnapshot(snapshot.rules, snapshot.stand);
        },
      },
      receipts,
      clock: clockOf,
    });
  await writer.appendStart({
    installationId,
    key: { keyId, publicKey: pair.publicKey, privateKey: pair.privateKey },
    software: readStand({}),
    time: clock.now(),
  });
  const gate = gateOn(db, writer);

  const providerId = newId("provider") as ProviderId;
  await repo.providers.create(db, {
    id: providerId,
    name: "Test-Anbieter",
    ...(options.templateKey === undefined ? {} : { templateKey: options.templateKey }),
    baseUrl: options.providerBaseUrl,
    apiKeyEnc: encryptSecret(options.providerKey, secretsKey, {
      aad: secretAad(providerSecretBinding(providerId, options.providerBaseUrl)),
    }),
    region: options.region ?? "local",
  });
  const model = await repo.models.create(db, {
    providerId,
    slug: options.modelSlug ?? "fake/test-modell",
    displayName: "Test-Modell",
  });
  const bot = await repo.bots.create(db, {
    name: "Pai",
    modelId: model.id,
    avatarShape: "blatt",
    color: "limette",
  });
  const newConversation = async () =>
    (await repo.conversations.create(db, { botId: bot.id, title: "Beispiel" })).id;
  const conversationId = await newConversation();

  const deps: RunDeps = {
    db,
    gate,
    motor: options.motor,
    clock,
    keys: { secrets: secretsKey, context: contextKey },
    ...(options.schleuse === undefined ? {} : { schleuse: options.schleuse }),
    schleuseStatus:
      options.schleuseStatus ??
      (async () => ({ installed: options.schleuse !== undefined, reachable: false })),
    receipts: writer,
    ...(options.tuning === undefined ? {} : { tuning: options.tuning }),
  };

  return {
    db,
    deps,
    gate,
    writer,
    botId: bot.id,
    providerId,
    modelId: model.id,
    conversationId,
    newConversation,
    queueMessage: (text, target = conversationId) =>
      repo.withTransaction(db, async (tx) => {
        const message = await repo.messages.insert(tx, {
          conversationId: target,
          role: "user",
          content: text,
        });
        const run = await repo.runs.create(tx, {
          conversationId: target,
          triggerMessageId: message.id,
          botId: bot.id,
        });
        await repo.events.append(tx, {
          conversationId: target,
          type: "message.created",
          data: { messageId: message.id, role: "user", text },
        });
        await repo.events.append(tx, {
          conversationId: target,
          type: "run.queued",
          data: { runId: run.id },
        });
        return { runId: run.id, messageId: message.id };
      }),
    depsFor: (other, motor = options.motor) => {
      const otherWriter = tools.createWriter(other, holder);
      return {
        ...deps,
        db: other,
        motor,
        gate: gateOn(other, otherWriter),
        receipts: otherWriter,
      };
    },
    gateFor: (other) => gateOn(other, tools.createWriter(other, holder)),
    events: (target = conversationId) => repo.events.listSince(db, target),
    receipts: () => repo.belege.listFrom(db),
    verify: async () =>
      tools.verify(await repo.belege.listFrom(db), {
        publicKeys: await repo.installationKeys.listPublic(db),
        rules: await repo.rules.listActive(db),
      }),
  };
}
