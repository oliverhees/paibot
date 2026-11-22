/**
 * PaiBot – die Belege-Seite prüft Bestandsdaten im Stand der Migration 0013 vor und nach dem
 * Aufstieg (Dateien und Herkunft in `tools/durchstich/src/testdaten/`), dazu eine neue Entscheidung
 * über die gespeicherte Regel R-010 an derselben Kette: Urteil gültig, jede Entscheidung
 * nachgerechnet.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { decryptSecret, deriveKey, loadMasterSecret } from "@paibot/crypto";
import { repo } from "@paibot/db";
import { createTestDbFrom, migrateTestDb, migrationsUpTo, type TestDb } from "@paibot/db/testing";
import { createGate, ruleSnapshot } from "@paibot/gate";
import { createReceiptWriter } from "@paibot/receipts";
import * as pruefer from "@paibot/receipts/pruefen";
import { botActor } from "@paibot/shared/aktionen";
import { secretAad, signingKeySecretBinding } from "@paibot/shared/bindung";
import { type BotId, type ConversationId, type KeyId, newId } from "@paibot/shared/ids";
import { describe, expect, it } from "vitest";
import { ganzeKette, regelDaten } from "./lesen";
import { pruefeKette } from "./pruefung";

/** Öffentliches Wurzel-Geheimnis der Testdaten (so hergeleitet wie im Erzeuger-Skript). */
const STAND_TEST_GEHEIMNIS = createHash("sha256")
  .update("PaiBot Bestandsdaten nur für Tests")
  .digest("base64");

function bestand(datei: string): string {
  return readFileSync(
    new URL(`../../../../../tools/durchstich/src/testdaten/${datei}`, import.meta.url),
    "utf8",
  );
}

async function stand0013(datei: string): Promise<TestDb> {
  const test = await createTestDbFrom(migrationsUpTo(14));
  await test.client.exec(
    `set session_replication_role = replica;\n${bestand(datei)}\nset session_replication_role = origin;\nselect pg_catalog.set_config('search_path', '"$user", public', false);`,
  );
  return test;
}

async function seite(test: TestDb) {
  return pruefeKette(ganzeKette(test.db), { regeln: await regelDaten(test.db) }, pruefer);
}

/** Neue Entscheidung `werkzeug.aufrufen` über R-010 mit dem gespeicherten Schlüssel. */
async function nachschlagen(test: TestDb): Promise<string> {
  const aktiv = await repo.installationKeys.getActive(test.db);
  if (aktiv === undefined) throw new Error("kein aktiver Schlüssel");
  const keysKey = deriveKey(loadMasterSecret({ PAIBOT_SECRET: STAND_TEST_GEHEIMNIS }), "keys-v1");
  const privateKey = decryptSecret(aktiv.privateKeyEnc, keysKey, {
    aad: secretAad(signingKeySecretBinding(aktiv.id as KeyId, aktiv.publicKey)),
  });
  const gate = createGate({
    rules: {
      load: async () => {
        const { stand, rules } = await repo.rules.loadSnapshot(test.db);
        return ruleSnapshot(rules, stand);
      },
    },
    receipts: createReceiptWriter(test.db, {
      current: async () => ({ keyId: aktiv.id as KeyId, privateKey }),
    }),
    clock: { now: () => new Date() },
  });
  const [zeile] = (
    await test.client.query<{ bot: BotId; unterhaltung: ConversationId }>(
      "select b.id as bot, c.id as unterhaltung from bots b join conversations c on c.bot_id = b.id limit 1",
    )
  ).rows;
  const botId = zeile?.bot as BotId;
  const r = await gate.run(
    {
      actionId: newId("action"),
      type: "werkzeug.aufrufen",
      actor: botActor(botId),
      target: { conversationId: zeile?.unterhaltung as ConversationId, runId: newId("run"), botId },
    } as never,
    {
      botOfConversation: true,
      runRunning: true,
      toolName: "doku_nachschlagen",
      toolSource: "eingebaut",
      toolKind: "lesen",
      argsDigest: `hmac-sha256:${"a7".repeat(32)}`,
      killSwitch: false,
      toolKey: "eingebaut/doku.nachschlagen",
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
    } as never,
    async () => ({ value: undefined, result: { status: "ok" } }),
  );
  return r.decision.matchedRules.map((rule) => rule.id).join();
}

describe.each([
  ["veröffentlichter Stand (Tor-Fassung 1)", "stand-0013-rc.sql"],
  ["Stand mit Tor-Fassung 2", "stand-0013-fassung-2.sql"],
])("Belege-Seite mit Bestandsdaten: %s", (_name, datei) => {
  it("vor und nach dem Aufstieg gültig, auch mit einer neuen Entscheidung über R-010", async () => {
    const test = await stand0013(datei);
    const vorher = await seite(test);
    expect(vorher.stufe).toBe("gueltig");
    expect(vorher.punkte.filter((p) => p.art === "fehler")).toEqual([]);

    await migrateTestDb(test);
    const nachher = await seite(test);
    expect(nachher.stufe).toBe("gueltig");
    expect(nachher.geprueft).toBe(vorher.geprueft);
    expect(nachher.punkte.filter((p) => p.art === "fehler")).toEqual([]);

    expect(await nachschlagen(test)).toBe("R-010");
    const mitNeuem = await seite(test);
    expect(mitNeuem.stufe).toBe("gueltig");
    expect(mitNeuem.geprueft).toBe(vorher.geprueft + 2);
    expect(mitNeuem.punkte.filter((p) => p.art === "fehler")).toEqual([]);
    // Die neue Entscheidung rechnet die Seite mit den Regeln aus der Datenbank nach.
    const letzte = (await repo.belege.listFrom(test.db)).at(-2);
    expect(letzte?.body.type).toBe("decision");
    const nachgerechnet = await pruefer.reevaluate(
      letzte as NonNullable<typeof letzte>,
      (await regelDaten(test.db)).fassungen,
    );
    expect(nachgerechnet.status).toBe("ok");
  });
});
