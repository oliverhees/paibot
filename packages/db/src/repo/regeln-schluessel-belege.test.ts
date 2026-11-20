/**
 * PaiBot – Tests: Regeln, Installations-Schlüssel und Belege (nur lesen).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { newId, STANDARD_RULES, ZERO_PREV } from "@paibot/shared";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../client";
import {
  belege as belegeTabelle,
  rules as regelnTabelle,
  installationKeys as schluesselTabelle,
} from "../schema";
import { belegRow, encrypted, fingerprint, keyRow, publicKey } from "../testdaten";
import { createTestDb } from "../testing";
import { belege, installationKeys, rules } from "./index";
import { mitCode } from "./testhilfe";

describe("rules", () => {
  let db: Database;
  beforeEach(async () => {
    db = (await createTestDb()).db;
  });

  it("listActive liefert die Standard-Regeln nach Priorität", async () => {
    const aktiv = await rules.listActive(db);
    expect(aktiv.map((r) => r.id)).toEqual(["R-001", "R-002", "R-999"]);
    expect(aktiv.map((r) => r.priority)).toEqual(
      [...aktiv.map((r) => r.priority)].sort((a, b) => a - b),
    );
    for (const soll of STANDARD_RULES) {
      const ist = aktiv.find((r) => r.id === soll.id);
      expect({ ...ist, createdAt: undefined }).toEqual({ ...soll, createdAt: undefined });
    }
  });

  it("nimmt je Regel nur die höchste Fassung und blendet ausgeschaltete aus", async () => {
    const r1 = STANDARD_RULES[0];
    if (r1 === undefined) throw new Error("Regel fehlt");
    const neu = { ...r1, version: 2, priority: 150, title: "Neue Fassung", enabled: true };
    await db.insert(regelnTabelle).values({ ...neu, conditions: [...neu.conditions] });
    const aktiv = await rules.listActive(db);
    expect(aktiv.find((r) => r.id === "R-001")).toMatchObject({
      version: 2,
      title: "Neue Fassung",
    });
    expect(aktiv.filter((r) => r.id === "R-001")).toHaveLength(1);

    await db
      .insert(regelnTabelle)
      .values({ ...neu, conditions: [...neu.conditions], version: 3, enabled: false });
    expect((await rules.listActive(db)).map((r) => r.id)).toEqual(["R-002", "R-999"]);
    expect(await rules.listVersions(db, "R-001").then((v) => v.map((r) => r.version))).toEqual([
      1, 2, 3,
    ]);
    expect((await rules.get(db, "R-001", 2))?.title).toBe("Neue Fassung");
    expect(await rules.get(db, "R-001", 9)).toBeUndefined();
  });
});

describe("installationKeys", () => {
  let db: Database;
  beforeEach(async () => {
    db = (await createTestDb()).db;
  });
  const neu = () => ({
    publicKey: publicKey(),
    privateKeyEnc: encrypted(),
    fingerprint: fingerprint(),
  });

  it("legt einen Schlüssel an und findet den aktiven", async () => {
    expect(await installationKeys.getActive(db)).toBeUndefined();
    const k = await installationKeys.create(db, neu());
    expect(k).toMatchObject({ purpose: "receipts" });
    expect(k).not.toHaveProperty("retiredAt");
    expect(await installationKeys.getActive(db)).toEqual(k);
    expect(await installationKeys.get(db, k.id)).toEqual(k);
    expect(await installationKeys.get(db, newId("key"))).toBeUndefined();
  });

  it("weist einen zweiten aktiven Schlüssel und Klartext als Privatschlüssel ab", async () => {
    await installationKeys.create(db, neu());
    await expect(installationKeys.create(db, neu())).rejects.toThrow();
    await expect(
      installationKeys.create(db, { ...neu(), privateKeyEnc: "klartext" }),
    ).rejects.toEqual(mitCode("eingabe_ungueltig"));
  });

  it("rotate mustert den alten aus und aktiviert den neuen; alte bleiben für die Prüfung", async () => {
    const alt = await installationKeys.create(db, neu());
    const zeit = new Date("2026-11-20T10:00:00.000Z");
    const neuer = await installationKeys.rotate(db, neu(), { now: zeit });
    expect((await installationKeys.getActive(db))?.id).toBe(neuer.id);
    expect((await installationKeys.get(db, alt.id))?.retiredAt).toBe(zeit.toISOString());
    const oeffentlich = await installationKeys.listPublic(db);
    expect(oeffentlich.map((k) => k.keyId)).toEqual([alt.id, neuer.id]);
    expect(JSON.stringify(oeffentlich)).not.toContain("privateKeyEnc");
    expect(await installationKeys.list(db)).toHaveLength(2);
  });

  it("rotate ohne bisherigen Schlüssel legt nur den neuen an; Fehler lassen alles beim Alten", async () => {
    const erster = await installationKeys.rotate(db, neu());
    expect((await installationKeys.getActive(db))?.id).toBe(erster.id);
    await expect(
      installationKeys.rotate(db, { ...neu(), privateKeyEnc: "klartext" }),
    ).rejects.toEqual(mitCode("eingabe_ungueltig"));
    expect((await installationKeys.getActive(db))?.id).toBe(erster.id);
    expect((await installationKeys.get(db, erster.id))?.retiredAt).toBeUndefined();
  });
});

describe("belege (nur lesen)", () => {
  let db: Database;
  beforeEach(async () => {
    db = (await createTestDb()).db;
  });

  /** Legt eine Kette aus `n` Belegen an (Test-Aufbau, das Anhängen gehört dem Beleg-Paket). */
  async function kette(n: number) {
    const [schluessel] = await db.insert(schluesselTabelle).values(keyRow()).returning();
    if (schluessel === undefined) throw new Error("Schlüssel fehlt");
    let prev: string = ZERO_PREV;
    const zeilen = [];
    for (let seq = 1; seq <= n; seq++) {
      const zeile = belegRow(schluessel.id, { seq, prevHash: prev });
      await db.insert(belegeTabelle).values(zeile);
      prev = zeile.hash;
      zeilen.push(zeile);
    }
    return zeilen;
  }

  it("eine leere Kette hat keinen Kopf und keine Seiten", async () => {
    expect(await belege.head(db)).toBeUndefined();
    expect(await belege.listPage(db)).toEqual({ items: [] });
    expect(await belege.listFrom(db)).toEqual([]);
    expect(await belege.get(db, newId("receipt"))).toBeUndefined();
  });

  it("liefert Einträge in der Form des Exports", async () => {
    const [start] = await kette(1);
    if (start === undefined) throw new Error();
    const e = await belege.get(db, start.id);
    expect(e).toEqual({
      seq: 1,
      id: start.id,
      hash: start.hash,
      signature: start.signature,
      keyId: start.keyId,
      body: start.body,
    });
    expect(Object.keys(e ?? {})).toEqual(["seq", "id", "hash", "signature", "keyId", "body"]);
    expect(await belege.getBySeq(db, 1)).toEqual(e);
    expect(await belege.head(db)).toEqual(e);
  });

  it("blättert neueste zuerst und lückenlos", async () => {
    await kette(7);
    const s1 = await belege.listPage(db, { limit: 3 });
    expect(s1.items.map((b) => b.seq)).toEqual([7, 6, 5]);
    expect(s1.nextBefore).toBe(5);
    const s2 = await belege.listPage(db, { limit: 3, before: s1.nextBefore });
    expect(s2.items.map((b) => b.seq)).toEqual([4, 3, 2]);
    const s3 = await belege.listPage(db, { limit: 3, before: s2.nextBefore });
    expect(s3.items.map((b) => b.seq)).toEqual([1]);
    expect(s3).not.toHaveProperty("nextBefore");
    expect((await belege.listPage(db, { limit: 7 })).nextBefore).toBeUndefined();
    expect((await belege.head(db))?.seq).toBe(7);
  });

  it("filtert nach Aktion und Unterhaltung", async () => {
    const zeilen = await kette(4);
    const conv = newId("conversation");
    // Beleg 3 gehört zu einer Unterhaltung (Test-Aufbau über die Tabelle erlaubt kein UPDATE, daher neu).
    const [schluessel] = await db.select().from(schluesselTabelle);
    if (schluessel === undefined) throw new Error();
    const extra = belegRow(schluessel.id, { seq: 5, prevHash: zeilen[3]?.hash ?? "" });
    await db.insert(belegeTabelle).values({ ...extra, conversationId: conv });
    expect((await belege.listPage(db, { conversationId: conv })).items.map((b) => b.seq)).toEqual([
      5,
    ]);
    const nurLoeschen = await belege.listPage(db, { action: "unterhaltung.loeschen" });
    expect(nurLoeschen.items.map((b) => b.seq)).toEqual([5, 4, 3, 2]);
    expect((await belege.listPage(db, { action: "bot.aendern" })).items).toEqual([]);
  });

  it("liest ab einer Nummer aufsteigend", async () => {
    await kette(6);
    expect((await belege.listFrom(db, { fromSeq: 4 })).map((b) => b.seq)).toEqual([4, 5, 6]);
    expect((await belege.listFrom(db)).map((b) => b.seq)).toEqual([1, 2, 3, 4, 5, 6]);
    expect((await belege.listFrom(db, { fromSeq: 2, limit: 2 })).map((b) => b.seq)).toEqual([2, 3]);
  });

  it("die Kette lässt sich über dieses Paket nicht ändern: es gibt keine schreibenden Funktionen", () => {
    expect(Object.keys(belege).sort()).toEqual(["get", "getBySeq", "head", "listFrom", "listPage"]);
  });
});
