/**
 * PaiBot – Tests der echten Abhängigkeiten eines Laufs gegen eine Datenbank im Speicher: Der
 * Signaturschlüssel wird mit seiner Bindung geladen, ein Lauf erzeugt gültige Belege.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { randomBytes } from "node:crypto";
import { executeRun } from "@paibot/agents";
import { createFakeMotor, setupRun } from "@paibot/agents/testing";
import {
  deriveKey,
  encryptSecret,
  fingerprint,
  generateSigningKey,
  loadMasterSecret,
} from "@paibot/crypto";
import { repo } from "@paibot/db";
import { createTestDb } from "@paibot/db/testing";
import { createReceiptWriter, verifyChain } from "@paibot/receipts";
import { secretAad, signingKeySecretBinding } from "@paibot/shared/bindung";
import { type KeyId, newId } from "@paibot/shared/ids";
import { describe, expect, it } from "vitest";
import { buildRunDeps } from "./abhaengigkeiten";

const TOOLS = {
  createWriter: createReceiptWriter,
  verify: (entries: Parameters<typeof verifyChain>[0], options: object) =>
    verifyChain(entries, options as never),
};

const motor = () =>
  createFakeMotor([
    { type: "text-delta", text: "Antwort." },
    { type: "finish", finishReason: "stop", usage: { input: 3, output: 1 } },
  ]);

describe("buildRunDeps", () => {
  it("lädt den gespeicherten v2-Signaturschlüssel mit Bindung; ein Lauf erzeugt gültige Belege", async () => {
    const { db } = await createTestDb();
    const secret = randomBytes(32).toString("base64");
    const setup = await setupRun(db, TOOLS, {
      secret,
      providerBaseUrl: "http://127.0.0.1:9/v1",
      providerKey: "sk-test-unbenutzt-000000000000",
      motor: motor(),
    });
    const key = await repo.installationKeys.getActive(db);
    expect(key?.privateKeyEnc.startsWith("v2:")).toBe(true);

    const prepared = await buildRunDeps(db, { PAIBOT_SECRET: secret }).prepare();
    const before = (await setup.receipts()).length;
    const { runId } = await setup.queueMessage("Hallo");
    const outcome = await executeRun(
      runId,
      { ...prepared, motor: motor() },
      new AbortController().signal,
    );
    expect(outcome.status).toBe("succeeded");
    const added = (await setup.receipts()).slice(before);
    expect(added.map((r) => r.body.type)).toEqual(["decision", "result"]);
    expect(added.every((r) => r.keyId === key?.id)).toBe(true);
    expect((await setup.verify()).ok).toBe(true);
  });

  it("ein Schlüssel mit fremder Bindung wird nicht geladen (Fehler, kein stiller Ersatz)", async () => {
    const { db } = await createTestDb();
    const secret = randomBytes(32).toString("base64");
    const keysKey = deriveKey(loadMasterSecret({ PAIBOT_SECRET: secret }), "keys-v1");
    const pair = generateSigningKey();
    const id = newId("key") as KeyId;
    await repo.installationKeys.create(db, {
      id,
      publicKey: pair.publicKey,
      privateKeyEnc: encryptSecret(pair.privateKey, keysKey, {
        aad: secretAad(signingKeySecretBinding(newId("key") as KeyId, pair.publicKey)),
      }),
      fingerprint: fingerprint(pair.publicKey),
    });
    await expect(buildRunDeps(db, { PAIBOT_SECRET: secret }).prepare()).rejects.toThrow();
  });

  it("vor der Einrichtung ohne Schlüssel: prepare gelingt, ein Beleg scheitert mit einrichtung_offen", async () => {
    const { db } = await createTestDb();
    const prepared = await buildRunDeps(db, {
      PAIBOT_SECRET: randomBytes(32).toString("base64"),
    }).prepare();
    await expect(
      prepared.receipts?.appendResult({
        action: {
          actionId: newId("action"),
          type: "lauf.abbrechen",
          actor: "besitzer",
          target: { conversationId: newId("conversation"), runId: newId("run") },
        },
        result: { status: "ok" },
        time: new Date(),
      }),
    ).rejects.toMatchObject({ code: "einrichtung_offen" });
  });
});
