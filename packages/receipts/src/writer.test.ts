/**
 * PaiBot – Tests des Schreibers: Anhängen unter Sperre an die Kette in der Datenbank.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { randomBytes } from "node:crypto";
import { contextDigest, deriveKey, loadMasterSecret } from "@paibot/crypto";
import {
  BELEGE_LOCK_KEY,
  belege,
  bots,
  conversationEvents,
  conversations,
  type Database,
  installationKeys,
  repo,
} from "@paibot/db";
import { createTestDb, type TestDb } from "@paibot/db/testing";
import { evaluate } from "@paibot/gate";
import type { ReceiptEntry } from "@paibot/shared/belege";
import { isPaiBotError } from "@paibot/shared/fehler";
import { newId } from "@paibot/shared/ids";
import { beforeEach, describe, expect, it } from "vitest";
import { buildReceipt } from "./build";
import { currentAnchor, exportHeader, ruleHistory } from "./export";
import { hashReceipt } from "./hash";
import { exportJsonl, parseJsonl } from "./jsonl";
import { checkContext, signReceipt } from "./server";
import {
  keyInfo,
  sendAction,
  sendFacts,
  TEST_INSTALLATION,
  TEST_RULE,
  type TestKey,
  testKey,
} from "./testhilfen";
import { verifyChain } from "./verify";
import {
  cachedReceiptKeys,
  createReceiptWriter,
  RECEIPT_LOCK_ID,
  type ReceiptChainWriter,
} from "./writer";

const TIME = new Date(Date.UTC(2026, 10, 20, 10, 0, 0));
const b64 = (bytes: number) => randomBytes(bytes).toString("base64url");

let ctx: TestDb;
let key: TestKey;
let current: TestKey;
let writer: ReceiptChainWriter;

async function storeKey(db: Database, k: TestKey, retired = false) {
  await db.insert(installationKeys).values({
    id: k.keyId,
    purpose: "receipts",
    publicKey: k.publicKey,
    privateKeyEnc: `v1:${b64(12)}:${b64(16)}:${b64(48)}`,
    fingerprint: k.fingerprint,
    ...(retired ? { retiredAt: TIME } : {}),
  });
}

async function allEntries(db: Database): Promise<ReceiptEntry[]> {
  const rows = await db.select().from(belege).orderBy(belege.seq);
  return rows.map((row) => ({
    seq: row.seq,
    id: row.id,
    hash: row.hash,
    signature: row.signature,
    keyId: row.keyId,
    body: row.body,
  }));
}

function decisionRecord(action = sendAction(), facts = sendFacts()) {
  return { action, facts, decision: evaluate(action, facts, [TEST_RULE]), time: TIME };
}

async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Der Aufruf hätte scheitern müssen.");
}

beforeEach(async () => {
  ctx = await createTestDb();
  key = testKey();
  current = key;
  await storeKey(ctx.db, key);
  writer = createReceiptWriter(ctx.db, {
    current: async () => ({ keyId: current.keyId, privateKey: current.privateKey }),
  });
});

async function start() {
  return writer.appendStart({
    installationId: TEST_INSTALLATION,
    key,
    software: "0.3.0+dev",
    time: TIME,
  });
}

describe("createReceiptWriter", () => {
  it("nutzt dieselbe Sperre wie die Datenbank", () => {
    expect(RECEIPT_LOCK_ID).toBe(BELEGE_LOCK_KEY);
  });

  it("Start, Entscheidung, Ergebnis ergeben eine gültige Kette", async () => {
    expect(await writer.head()).toBeUndefined();
    const ref = await start();
    expect(ref.seq).toBe(1);
    const record = decisionRecord();
    const decision = await writer.appendDecision(record);
    const result = await writer.appendResult({
      action: record.action,
      result: { status: "ok", tokens: { input: 12, output: 34 } },
      time: TIME,
    });
    expect([decision.seq, result.seq]).toEqual([2, 3]);

    const entries = await allEntries(ctx.db);
    expect(entries.map((e) => e.body.type)).toEqual(["start", "decision", "result"]);
    expect(entries[0]?.body).toMatchObject({
      prev: `sha256:${"0".repeat(64)}`,
      facts: { installationId: TEST_INSTALLATION, publicKey: key.publicKey, software: "0.3.0+dev" },
    });
    expect(entries[1]?.body.prev).toBe(entries[0]?.hash);
    const head = await writer.head();
    expect(head).toEqual(entries[2]);
    const report = await verifyChain(entries, [keyInfo(key)], { rules: [TEST_RULE] });
    expect(report.ok).toBe(true);
  });

  it("schreibt die Spalten passend zum Körper", async () => {
    await start();
    const record = decisionRecord();
    await writer.appendDecision(record);
    const rows = await ctx.db.select().from(belege).orderBy(belege.seq);
    expect(rows[0]).toMatchObject({
      entryType: "start",
      actionId: null,
      action: null,
      actor: null,
    });
    expect(rows[1]).toMatchObject({
      entryType: "decision",
      actionId: record.action.actionId,
      action: "nachricht.senden",
      actor: "besitzer",
      conversationId: record.action.target.conversationId,
    });
  });

  it("Belege enthalten keine Inhalte, nur Fakten", async () => {
    await start();
    await writer.appendDecision(decisionRecord());
    const text = JSON.stringify(await allEntries(ctx.db));
    expect(text).not.toContain(key.privateKey);
  });

  it("zwei Starts sind nicht möglich", async () => {
    await start();
    const error = await errorOf(start());
    expect(isPaiBotError(error) && error.code).toBe("einrichtung_fertig");
  });

  it("ohne Start werden keine Belege angehängt", async () => {
    const error = await errorOf(writer.appendDecision(decisionRecord()));
    expect(isPaiBotError(error) && error.code).toBe("einrichtung_offen");
    expect(await writer.head()).toBeUndefined();
  });

  it("ungültige Eingaben hängen nichts an", async () => {
    await start();
    const record = decisionRecord();
    const error = await errorOf(
      writer.appendDecision({ ...record, facts: { ...record.facts, inputChars: 1.5 } }),
    );
    expect(isPaiBotError(error) && error.code).toBe("eingabe_ungueltig");
    expect((await writer.head())?.seq).toBe(1);
  });

  it("gleichzeitige Anhänge-Versuche ergeben eine lückenlose Kette ohne Verzweigung", async () => {
    await start();
    // Zwei Schreiber (wie web und worker) auf derselben Datenbank.
    const other = createReceiptWriter(ctx.db, {
      current: async () => ({ keyId: key.keyId, privateKey: key.privateKey }),
    });
    const refs = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        (i % 2 === 0 ? writer : other).appendDecision(decisionRecord()),
      ),
    );
    expect(refs.map((r) => r.seq).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 2),
    );
    const entries = await allEntries(ctx.db);
    expect(entries.map((e) => e.seq)).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));
    expect(new Set(entries.map((e) => e.body.prev)).size).toBe(21);
    expect((await verifyChain(entries, [keyInfo(key)])).ok).toBe(true);
  });

  it("die Datenbank weist UPDATE und DELETE auf Belege ab", async () => {
    await start();
    await writer.appendDecision(decisionRecord());
    for (const statement of [
      "update belege set signature = signature where seq = 2",
      "update belege set body = jsonb_set(body, '{facts,inputChars}', '1') where seq = 2",
      "delete from belege where seq = 2",
    ]) {
      const error = (await errorOf(ctx.client.query(statement))) as { code?: string };
      expect(error.code).toBe("23001");
    }
    expect((await verifyChain(await allEntries(ctx.db), [keyInfo(key)])).ok).toBe(true);
  });

  it("schreibt beleg.created, wenn die Unterhaltung existiert", async () => {
    await start();
    const botId = newId("bot");
    await ctx.db
      .insert(bots)
      .values({ id: botId, name: "Pai", avatarShape: "blatt", color: "limette" });
    const action = sendAction();
    await ctx.db
      .insert(conversations)
      .values({ id: action.target.conversationId, botId, title: "Beispiel" });
    const ref = await writer.appendDecision(decisionRecord(action));
    await writer.appendResult({ action, result: { status: "ok" }, time: TIME });
    const events = await ctx.db.select().from(conversationEvents);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      conversationId: action.target.conversationId,
      seq: 1,
      type: "beleg.created",
      payload: {
        belegId: ref.receiptId,
        action: "nachricht.senden",
        messageId: action.target.messageId,
      },
    });
    expect(events[1]?.seq).toBe(2);
  });

  it("beleg.created teilt die Nummern mit den übrigen Ereignissen der Unterhaltung", async () => {
    await start();
    const botId = newId("bot");
    await ctx.db
      .insert(bots)
      .values({ id: botId, name: "Pai", avatarShape: "blatt", color: "limette" });
    const action = sendAction();
    const conversationId = action.target.conversationId;
    await ctx.db.insert(conversations).values({ id: conversationId, botId, title: "Beispiel" });
    const messageId = action.target.messageId;
    const first = await repo.events.append(ctx.db, {
      conversationId,
      type: "message.created",
      data: { messageId, role: "user", text: "Hallo" },
    });
    await writer.appendDecision(decisionRecord(action));
    const last = await repo.events.append(ctx.db, {
      conversationId,
      type: "message.created",
      data: { messageId: newId("message"), role: "assistant", text: "" },
    });
    const seqs = (await repo.events.listSince(ctx.db, conversationId)).map((e) => [e.seq, e.type]);
    expect(first.seq).toBe(1);
    expect(seqs).toEqual([
      [1, "message.created"],
      [2, "beleg.created"],
      [3, "message.created"],
    ]);
    expect(last.seq).toBe(3);
  });

  it("ohne Unterhaltung entsteht der Beleg ohne Ereignis", async () => {
    await start();
    const ref = await writer.appendDecision(decisionRecord());
    expect(ref.seq).toBe(2);
    expect(await ctx.db.select().from(conversationEvents)).toHaveLength(0);
  });

  it("weist einen Signaturschlüssel ab, der nicht der aktive ist", async () => {
    await start();
    current = testKey();
    const error = await errorOf(writer.appendDecision(decisionRecord()));
    expect(isPaiBotError(error) && error.code).toBe("intern");
  });

  it("lässt sich in einer offenen Transaktion benutzen (Schlüssel und Start zusammen)", async () => {
    const fresh = await createTestDb();
    const k = testKey();
    await fresh.db.transaction(async (tx) => {
      await storeKey(tx as unknown as Database, k);
      await createReceiptWriter(tx as unknown as Database, {
        current: async () => k,
      }).appendStart({
        installationId: TEST_INSTALLATION,
        key: k,
        software: "0.3.0+dev",
        time: TIME,
      });
    });
    const entries = await allEntries(fresh.db);
    expect(entries).toHaveLength(1);
    expect((await verifyChain(entries, [keyInfo(k)])).ok).toBe(true);
  });
});

describe("Schlüsselwechsel", () => {
  for (const signedBy of ["previous", "new"] as const) {
    it(`signiert ${signedBy === "previous" ? "mit dem bisherigen" : "mit dem neuen"} Schlüssel`, async () => {
      await start();
      await writer.appendDecision(decisionRecord());
      const next = testKey();
      // Wie bei der Rotation: alten Schlüssel zurückziehen, neuen speichern.
      await ctx.client.query("update installation_keys set retired_at = now() where id = $1", [
        key.keyId,
      ]);
      await storeKey(ctx.db, next);
      const ref = await writer.appendKeyChange({
        next,
        previous:
          signedBy === "previous"
            ? { keyId: key.keyId, privateKey: key.privateKey }
            : { keyId: key.keyId },
        time: TIME,
      });
      current = next;
      await writer.appendDecision(decisionRecord());

      const entries = await allEntries(ctx.db);
      const change = entries.find((e) => e.seq === ref.seq);
      expect(change?.body).toMatchObject({
        type: "key_change",
        keyId: signedBy === "previous" ? key.keyId : next.keyId,
        facts: {
          newKeyId: next.keyId,
          publicKey: next.publicKey,
          previousKeyId: key.keyId,
          signedBy,
        },
      });
      const keys = [keyInfo(key), keyInfo(next)];
      const report = await verifyChain(entries, keys);
      // Nur ein Wechsel, den der bisherige Schlüssel signiert, beglaubigt den neuen.
      expect(report.verdict.level).toBe(
        signedBy === "previous" ? "vertrauenswuerdig" : "vertrauen_gebrochen",
      );
      expect(report.firstFailure).toBeUndefined();
    });
  }

  it("ohne Angabe des bisherigen Schlüssels nennt der Beleg den aktiven", async () => {
    await start();
    const next = testKey();
    await ctx.client.query("update installation_keys set retired_at = now()");
    await storeKey(ctx.db, next);
    await writer.appendKeyChange({ next, time: TIME });
    const head = await writer.head();
    expect(head?.body).toMatchObject({
      keyId: next.keyId,
      facts: { previousKeyId: key.keyId, signedBy: "new" },
    });
  });

  it("weist einen neuen Schlüssel ab, der nicht gespeichert ist", async () => {
    await start();
    const error = await errorOf(writer.appendKeyChange({ next: testKey(), time: TIME }));
    expect(isPaiBotError(error) && error.code).toBe("intern");
  });

  it("weist einen falschen bisherigen Schlüssel ab", async () => {
    await start();
    const next = testKey();
    const error = await errorOf(
      writer.appendKeyChange({ next, previous: { keyId: next.keyId }, time: TIME }),
    );
    expect(isPaiBotError(error)).toBe(true);
  });
});

describe("Export aus der Datenbank", () => {
  it("lässt sich mit dem Prüfer ohne Datenbank prüfen", async () => {
    await start();
    for (let i = 0; i < 5; i++) await writer.appendDecision(decisionRecord());
    let text = "";
    for await (const line of exportJsonl(
      { format: "pb-belege", v: 1, installationId: TEST_INSTALLATION, publicKeys: [keyInfo(key)] },
      await allEntries(ctx.db),
    )) {
      text += line;
    }
    const parsed = parseJsonl(text);
    expect((await verifyChain(parsed.entries, parsed.header.publicKeys)).ok).toBe(true);
  });

  it("Kopfzeile mit aktuellem Anker, danach gekürzt: der Anker zeigt es", async () => {
    expect(await currentAnchor(ctx.db)).toBeUndefined();
    await expect(exportHeader(ctx.db)).rejects.toMatchObject({ code: "einrichtung_offen" });
    await start();
    for (let i = 0; i < 4; i++) await writer.appendDecision(decisionRecord());
    const header = await exportHeader(ctx.db, TIME);
    expect(header).toMatchObject({
      installationId: TEST_INSTALLATION,
      publicKeys: [keyInfo(key)],
      anchor: { seq: 5, keyId: key.keyId, startPublicKey: key.publicKey, time: TIME.toISOString() },
    });
    let text = "";
    for await (const line of exportJsonl(header, await allEntries(ctx.db))) text += line;
    const parsed = parseJsonl(text);
    expect(parsed.header.anchor).toEqual(header.anchor);
    const anchor = header.anchor;
    if (anchor === undefined) throw new Error("Anker fehlt");
    expect((await verifyChain(parsed.entries, { anchor })).ok).toBe(true);
    expect((await verifyChain(parsed.entries.slice(0, 3), { anchor })).verdict.findings).toEqual([
      { problem: "kette_kuerzer_als_anker", seq: 5 },
    ]);
  });

  it("Nachrechnen mit den Regeln aus der Datenbank (Standard-Regeln)", async () => {
    await start();
    const action = sendAction();
    const facts = sendFacts();
    const rules = await repo.rules.listActive(ctx.db);
    await writer.appendDecision({
      action,
      facts,
      decision: evaluate(action, facts, rules),
      time: TIME,
    });
    const report = await verifyChain(await allEntries(ctx.db), {
      ruleHistory: ruleHistory(ctx.db),
    });
    expect(report.ok).toBe(true);
    expect(report.firstFailure).toBeUndefined();
  });
});

describe("checkContext", () => {
  it("vergleicht die Kontext-Prüfsumme mit dem gespeicherten Inhalt", async () => {
    await start();
    const contextKey = deriveKey(
      loadMasterSecret({ PAIBOT_SECRET: randomBytes(32).toString("base64") }),
      "context-v1",
    );
    const record = decisionRecord();
    await writer.appendDecision({
      ...record,
      context: { digest: contextDigest(contextKey, "Hallo Max") },
    });
    const entry = (await writer.head()) as ReceiptEntry;
    expect(checkContext(entry, "Hallo Max", contextKey).status).toBe("ok");
    expect(checkContext(entry, "Hallo Moritz", contextKey).status).toBe("fehler");
    expect(checkContext(entry, undefined, contextKey).status).toBe("entfaellt");
    const [startEntry] = await allEntries(ctx.db);
    expect(checkContext(startEntry as ReceiptEntry, "x", contextKey)).toEqual({
      check: "kontext",
      status: "entfaellt",
      seq: 1,
    });
  });
});

describe("Signaturschlüssel im Speicher", () => {
  it("der Schlüssel wird vor der Transaktion geholt: Datenbank-Abfrage beim Laden verklemmt nicht", async () => {
    await start();
    // PGlite hat nur eine Verbindung: Ein Laden unter der Sperre der Transaktion bliebe hängen.
    const loading = createReceiptWriter(ctx.db, {
      current: async () => {
        const active = await repo.installationKeys.getActive(ctx.db);
        if (active?.id !== key.keyId) throw new Error("kein aktiver Schlüssel");
        return { keyId: key.keyId, privateKey: key.privateKey };
      },
    });
    const done = Promise.all([
      loading.appendDecision(decisionRecord()),
      loading.appendResult({ action: sendAction(), result: { status: "ok" }, time: TIME }),
    ]);
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("verklemmt")), 5000).unref(),
    );
    await expect(Promise.race([done, timeout])).resolves.toHaveLength(2);
  });

  it("cachedReceiptKeys lädt einmal und nach einem Schlüsselwechsel neu", async () => {
    let loads = 0;
    let stored = key;
    const keys = cachedReceiptKeys(async () => {
      loads++;
      return { keyId: stored.keyId, privateKey: stored.privateKey };
    });
    const cached = createReceiptWriter(ctx.db, keys);
    await cached.appendStart({
      installationId: TEST_INSTALLATION,
      key,
      software: "0.3.0+dev",
      time: TIME,
    });
    for (let i = 0; i < 3; i++) await cached.appendDecision(decisionRecord());
    expect(loads).toBe(1);

    const next = testKey();
    await ctx.client.query("update installation_keys set retired_at = now() where id = $1", [
      key.keyId,
    ]);
    await storeKey(ctx.db, next);
    stored = next;
    await cached.appendKeyChange({
      next,
      previous: { keyId: key.keyId, privateKey: key.privateKey },
      time: TIME,
    });
    expect(loads).toBe(2);
    await cached.appendDecision(decisionRecord());
    expect(loads).toBe(2);
    const report = await verifyChain(await allEntries(ctx.db));
    expect(report.ok).toBe(true);
  });

  it("hat ein anderer Prozess den Schlüssel gewechselt, lädt der Schreiber einmal neu", async () => {
    await start();
    let stored = key;
    let loads = 0;
    const keys = cachedReceiptKeys(async () => {
      loads++;
      return { keyId: stored.keyId, privateKey: stored.privateKey };
    });
    const stale = createReceiptWriter(ctx.db, keys);
    await stale.appendDecision(decisionRecord());

    // Wechsel über einen zweiten Schreiber (wie der andere Prozess).
    const next = testKey();
    await ctx.client.query("update installation_keys set retired_at = now() where id = $1", [
      key.keyId,
    ]);
    await storeKey(ctx.db, next);
    await writer.appendKeyChange({
      next,
      previous: { keyId: key.keyId, privateKey: key.privateKey },
      time: TIME,
    });
    stored = next;
    await stale.appendDecision(decisionRecord());
    expect(loads).toBe(2);
    expect((await writer.head())?.keyId).toBe(next.keyId);
  });

  it("ein Fehler beim Laden wird nicht festgehalten", async () => {
    let fail = true;
    const keys = cachedReceiptKeys(async () => {
      if (fail) throw new Error("noch nicht bereit");
      return { keyId: key.keyId, privateKey: key.privateKey };
    });
    await expect(keys.current()).rejects.toThrow("noch nicht bereit");
    fail = false;
    await expect(keys.current()).resolves.toMatchObject({ keyId: key.keyId });
  });
});

describe("Spalten der Belege sind an den signierten Körper gebunden", () => {
  async function nextRow(overrides: Record<string, unknown>) {
    const head = await writer.head();
    const action = sendAction();
    const facts = sendFacts();
    const body = buildReceipt(
      { type: "decision", action, decision: evaluate(action, facts, [TEST_RULE]), facts },
      {
        id: newId("receipt"),
        seq: (head?.seq ?? 0) + 1,
        time: TIME.toISOString(),
        prev: head?.hash ?? `sha256:${"0".repeat(64)}`,
        keyId: key.keyId,
      },
    );
    const hash = await hashReceipt(body);
    return {
      seq: body.seq,
      id: body.id,
      entryType: "decision" as const,
      actionId: action.actionId,
      action: action.type,
      actor: action.actor,
      conversationId: action.target.conversationId,
      body,
      prevHash: body.prev,
      hash,
      keyId: key.keyId,
      signature: signReceipt(hash, key.privateKey),
      ...overrides,
    };
  }

  async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
    try {
      await promise;
      return undefined;
    } catch (error) {
      const cause = (error as { cause?: { code?: string } }).cause;
      return cause?.code ?? (error as { code?: string }).code;
    }
  }

  it("der Schreiber erfüllt die Bindung, abweichende Spalten weist die Datenbank ab", async () => {
    await start();
    await writer.appendDecision(decisionRecord());
    for (const overrides of [
      { conversationId: newId("conversation") },
      { actionId: newId("action") },
      { action: "unterhaltung.loeschen" },
      { actor: "bot:bot_01m7xf782n7ttby4s2884bb892" },
      { conversationId: null },
    ]) {
      const row = await nextRow(overrides);
      expect(
        await codeOf(ctx.db.insert(belege).values(row as never)),
        JSON.stringify(overrides),
      ).toBe("23514");
    }
    // Eine andere Nummer im Körper als in der Spalte.
    const shifted = await nextRow({});
    expect(
      await codeOf(
        ctx.db
          .insert(belege)
          .values({ ...shifted, body: { ...shifted.body, seq: shifted.seq + 1 } } as never),
      ),
    ).toBe("23514");
    // Mit passenden Spalten geht derselbe Beleg.
    expect(
      await codeOf(ctx.db.insert(belege).values((await nextRow({})) as never)),
    ).toBeUndefined();
  });
});
