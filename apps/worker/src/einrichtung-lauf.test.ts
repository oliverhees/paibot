/**
 * PaiBot – Zusammenspiel Einrichtung und Worker: Die Datenbank wird so vorbereitet, wie die
 * Einrichtung der Web-App sie anlegt (Signaturschlüssel v2 mit Bindung, Start-Beleg, Besitzer, Bot,
 * Anbieter und Modell über das Tor in einer Transaktion). Danach lädt der Worker den Schlüssel mit
 * seinen echten Abhängigkeiten und führt einen Lauf bis zur gespeicherten Antwort aus; die ganze
 * Kette ist gültig.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { createHash, randomBytes } from "node:crypto";
import { executeRun } from "@paibot/agents";
import { createFakeMotor } from "@paibot/agents/testing";
import {
  deriveKey,
  encryptSecret,
  fingerprint,
  generateSigningKey,
  loadMasterSecret,
} from "@paibot/crypto";
import { type Database, repo } from "@paibot/db";
import { createTestDb } from "@paibot/db/testing";
import { createGate, ruleSnapshot } from "@paibot/gate";
import { createReceiptWriter, type ReceiptKeys, verifyChain } from "@paibot/receipts";
import { providerSecretBinding, secretAad, signingKeySecretBinding } from "@paibot/shared/bindung";
import { type BotId, type KeyId, newId, type OwnerId, type ProviderId } from "@paibot/shared/ids";
import { describe, expect, it } from "vitest";
import { buildRunDeps } from "./abhaengigkeiten";

const ANTWORT = "Hallo, hier antwortet der Bot aus der Einrichtung.";

/**
 * Bereitet die Datenbank vor wie der Abschluss der Einrichtung: dieselben Paket-Funktionen, derselbe
 * abgeleitete Schlüssel (`keys-v1` bzw. `secrets-v1`), dieselben Bindungen, dieselbe Reihenfolge
 * (Schlüssel, Start-Beleg, dann die Aktionen über das Tor), alles in einer Transaktion.
 */
async function wieDieEinrichtung(db: Database, secret: string) {
  const master = loadMasterSecret({ PAIBOT_SECRET: secret });
  const belege = deriveKey(master, "keys-v1");
  const geheimnisse = deriveKey(master, "secrets-v1");
  const uhr = { now: () => new Date() };

  return db.transaction(async (tx) => {
    await repo.settings.ensure(tx);
    const installationId = newId("installation");
    const paar = generateSigningKey();
    const keyId = newId("key") as KeyId;
    await repo.installationKeys.create(tx, {
      id: keyId,
      publicKey: paar.publicKey,
      privateKeyEnc: encryptSecret(paar.privateKey, belege, {
        aad: secretAad(signingKeySecretBinding(keyId, paar.publicKey)),
      }),
      fingerprint: fingerprint(paar.publicKey),
    });
    const schluessel: ReceiptKeys = {
      current: async () => ({ keyId, privateKey: paar.privateKey }),
    };
    const schreiber = createReceiptWriter(tx, schluessel);
    await schreiber.appendStart({
      installationId,
      key: { keyId, publicKey: paar.publicKey, privateKey: paar.privateKey },
      software: "0.0.0-test",
      time: uhr.now(),
    });
    const tor = createGate({
      rules: {
        load: async () => {
          const { stand, rules } = await repo.rules.loadSnapshot(tx);
          return ruleSnapshot(rules, stand);
        },
      },
      receipts: schreiber,
      clock: uhr,
    });

    await tor.run(
      {
        actionId: newId("action"),
        type: "einrichtung.abschliessen",
        actor: "besitzer",
        target: { installationId },
      },
      { setupOpen: true, credential: "einrichtungs_code" },
      async () => {
        const besitzer = await repo.owner.create(tx, { passwordHash: "test-hash-unbenutzt" });
        await repo.settings.completeSetup(tx, { installationId, now: uhr.now() });
        await repo.sessions.create(tx, {
          tokenHash: createHash("sha256").update(randomBytes(32)).digest("hex"),
          ownerId: besitzer.id as OwnerId,
          authLevel: "password",
          method: "password",
          now: uhr.now(),
        });
        return { value: undefined, result: { status: "ok" } };
      },
    );

    const botId = newId("bot") as BotId;
    await tor.run(
      { actionId: newId("action"), type: "bot.aendern", actor: "besitzer", target: { botId } },
      { credential: "sitzung", fields: ["name", "avatarShape", "color"] },
      async () => {
        await repo.bots.create(tx, {
          id: botId,
          name: "Pai",
          avatarShape: "blatt",
          color: "limette",
        });
        await repo.settings.update(tx, { defaultBotId: botId });
        return { value: undefined, result: { status: "ok" } };
      },
    );

    const providerId = newId("provider") as ProviderId;
    const baseUrl = "https://api.eurouter.ai/api/v1";
    await tor.run(
      {
        actionId: newId("action"),
        type: "anbieter.speichern",
        actor: "besitzer",
        target: { providerId },
      },
      { credential: "sitzung", created: true, region: "eu", keySet: true },
      async () => {
        await repo.providers.create(tx, {
          id: providerId,
          templateKey: "eurouter",
          name: "EUrouter",
          baseUrl,
          region: "eu",
          apiKeyEnc: encryptSecret("sk-test-unbenutzt-000000000000", geheimnisse, {
            aad: secretAad(providerSecretBinding(providerId, baseUrl)),
          }),
        });
        return { value: undefined, result: { status: "ok" } };
      },
    );

    const modelId = newId("model");
    await tor.run(
      {
        actionId: newId("action"),
        type: "modell.waehlen",
        actor: "besitzer",
        target: { botId, modelId },
      },
      { credential: "sitzung" },
      async () => {
        await repo.models.create(tx, {
          id: modelId,
          providerId,
          slug: "test/modell",
          displayName: "Test-Modell",
        });
        await repo.bots.setModel(tx, botId, modelId);
        return { value: undefined, result: { status: "ok" } };
      },
    );
    return { keyId, botId };
  });
}

describe("Einrichtung und Worker", () => {
  it("der Worker lädt den Schlüssel aus der Einrichtung; ein Lauf endet mit Antwort, die Kette ist gültig", async () => {
    const { db } = await createTestDb();
    const secret = randomBytes(32).toString("base64");
    const { keyId, botId } = await wieDieEinrichtung(db, secret);
    expect((await repo.installationKeys.getActive(db))?.privateKeyEnc.startsWith("v2:")).toBe(true);
    const vorher = await repo.belege.listFrom(db);
    expect(vorher[0]?.body.type).toBe("start");

    // Nachricht einreihen wie die Web-App beim Senden.
    const unterhaltung = await repo.conversations.create(db, { botId, title: "Beispiel" });
    const { runId } = await repo.withTransaction(db, async (tx) => {
      const nachricht = await repo.messages.insert(tx, {
        conversationId: unterhaltung.id,
        role: "user",
        content: "Hallo",
      });
      const lauf = await repo.runs.create(tx, {
        conversationId: unterhaltung.id,
        triggerMessageId: nachricht.id,
        botId,
      });
      await repo.events.append(tx, {
        conversationId: unterhaltung.id,
        type: "message.created",
        data: { messageId: nachricht.id, role: "user", text: "Hallo" },
      });
      await repo.events.append(tx, {
        conversationId: unterhaltung.id,
        type: "run.queued",
        data: { runId: lauf.id },
      });
      return { runId: lauf.id };
    });

    const deps = await buildRunDeps(db, { PAIBOT_SECRET: secret }).prepare();
    const motor = createFakeMotor([
      { type: "text-delta", text: ANTWORT },
      { type: "finish", finishReason: "stop", usage: { input: 3, output: 9 } },
    ]);
    const ergebnis = await executeRun(runId, { ...deps, motor }, new AbortController().signal);
    expect(ergebnis.status).toBe("succeeded");

    const nachrichten = await repo.messages.listForConversation(db, unterhaltung.id);
    expect(nachrichten.some((m) => m.role === "assistant" && m.content === ANTWORT)).toBe(true);

    const alle = await repo.belege.listFrom(db);
    const neu = alle.slice(vorher.length);
    expect(neu.map((r) => r.body.type)).toEqual(["decision", "result"]);
    expect(alle.every((r) => r.keyId === keyId)).toBe(true);
    const pruefung = await verifyChain(alle, {
      publicKeys: await repo.installationKeys.listPublic(db),
      rules: await repo.rules.listActive(db),
    } as never);
    expect(pruefung.ok).toBe(true);
  });

  it("ein anderes PAIBOT_SECRET als bei der Einrichtung: der Worker lädt den Schlüssel nicht", async () => {
    const { db } = await createTestDb();
    await wieDieEinrichtung(db, randomBytes(32).toString("base64"));
    await expect(
      buildRunDeps(db, { PAIBOT_SECRET: randomBytes(32).toString("base64") }).prepare(),
    ).rejects.toThrow();
  });
});
