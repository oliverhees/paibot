/**
 * PaiBot – Tests: Regeln, Installations-Schlüssel und Belege (nur lesen).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import {
  ACTIVE_STANDARD_RULES,
  newId,
  type RuleDefinition,
  ruleContent,
  STANDARD_RULE_VERSIONS,
  STANDARD_RULES,
  ZERO_PREV,
} from "@paibot/shared";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../client";
import {
  belege as belegeTabelle,
  rules as regelTabelle,
  installationKeys as schluesselTabelle,
} from "../schema";
import { belegRow, encrypted, fingerprint, keyRow, publicKey } from "../testdaten";
import { createTestDb, type TestDb } from "../testing";
import { belege, installationKeys, rules } from "./index";
import { mitCode } from "./testhilfe";

describe("rules", () => {
  let db: Database;
  let ctx: TestDb;
  beforeEach(async () => {
    ctx = await createTestDb();
    db = ctx.db;
  });

  it("listActive liefert die aktiven Standard-Regeln nach Priorität", async () => {
    const aktiv = await rules.listActive(db);
    expect(aktiv.map((r) => r.id)).toEqual([
      "R-003",
      "R-004",
      "R-006",
      "R-010",
      "R-014",
      "R-001",
      "R-002",
      "R-005",
      "R-999",
    ]);
    expect(aktiv.map((r) => r.priority)).toEqual(
      [...aktiv.map((r) => r.priority)].sort((a, b) => a - b),
    );
    for (const soll of ACTIVE_STANDARD_RULES) {
      const ist = aktiv.find((r) => r.id === soll.id);
      expect(ist === undefined ? undefined : ruleContent(ist)).toEqual(soll);
    }
  });

  /** Fügt eine Zeile direkt ein, wie es nur eine Migration darf. */
  async function zeile(rule: RuleDefinition): Promise<void> {
    await db
      .insert(regelTabelle)
      .values({ ...ruleContent(rule), conditions: [...rule.conditions] });
  }

  const eigene = (felder: Partial<RuleDefinition> = {}): RuleDefinition => ({
    ...ACTIVE_STANDARD_RULES[0],
    id: newId("rule"),
    version: 1,
    source: "owner",
    enabled: false,
    priority: 1000,
    title: "Eigene Regel",
    conditions: [],
    ...felder,
  });

  it("nimmt je Regel nur die höchste Fassung und blendet ausgeschaltete aus", async () => {
    const r005 = ACTIVE_STANDARD_RULES.find((r) => r.id === "R-005");
    if (r005 === undefined) throw new Error("R-005 fehlt");
    await zeile({ ...r005, version: 2, enabled: false });
    expect((await rules.listActive(db)).map((r) => r.id)).not.toContain("R-005");
    expect(await rules.listVersions(db, "R-005").then((v) => v.map((r) => r.version))).toEqual([
      1, 2,
    ]);
    expect((await rules.get(db, "R-005", 1))?.enabled).toBe(true);
    expect(await rules.get(db, "R-005", 9)).toBeUndefined();
  });

  it("eine abgeschaltete höhere Fassung einer Standard-Regel lässt den Regelstand scheitern", async () => {
    const r006 = ACTIVE_STANDARD_RULES.find((r) => r.id === "R-006");
    if (r006 === undefined) throw new Error("R-006 fehlt");
    await zeile({ ...r006, version: 2, enabled: false });
    await expect(rules.loadSnapshot(db)).rejects.toMatchObject({ code: "intern" });
  });

  it("eine Zeile mit Standard-Kennung, aber anderer Quelle verdeckt die Standard-Regel nie", async () => {
    const r006 = ACTIVE_STANDARD_RULES.find((r) => r.id === "R-006");
    if (r006 === undefined) throw new Error("R-006 fehlt");
    // Ohne die Prüfung der Datenbank: das Lesen schließt solche Zeilen selbst aus.
    await ctx.client.query("alter table rules drop constraint rules_kennung_passt_zur_quelle");
    await ctx.client.query("alter table rules drop constraint rules_prioritaet_je_quelle");
    await zeile({ ...r006, version: 2, source: "owner", enabled: false });
    await zeile({ ...r006, version: 3, source: "proposal", enabled: false });
    const aktiv = await rules.listActive(db);
    expect(aktiv.find((r) => r.id === "R-006")).toMatchObject({ version: 1, source: "standard" });
    await expect(rules.loadSnapshot(db)).resolves.toMatchObject({
      rules: expect.arrayContaining([expect.objectContaining({ id: "R-006", version: 1 })]),
    });
  });

  describe("der Regelstand passt zu den Standard-Regeln im Code, sonst Abbruch", () => {
    it("leere Regel-Tabelle", async () => {
      await ctx.client.query("alter table rules disable trigger user");
      await ctx.client.query("delete from rules");
      await expect(rules.loadSnapshot(db)).rejects.toMatchObject({ code: "intern" });
    });

    it("eine Standard-Regel fehlt (nur ihre Zeile ist weg)", async () => {
      await ctx.client.query("alter table rules disable trigger user");
      await ctx.client.query("delete from rules where id = 'R-999'");
      await expect(rules.loadSnapshot(db)).rejects.toMatchObject({ code: "intern" });
    });

    it("eine unbekannte Standard-Kennung", async () => {
      await zeile({ ...ACTIVE_STANDARD_RULES[0], id: "R-777" });
      await expect(rules.loadSnapshot(db)).rejects.toMatchObject({ code: "intern" });
    });

    it("eine Fassung, die nicht zum Code passt", async () => {
      await zeile({ ...ACTIVE_STANDARD_RULES[0], version: 2, effect: "allow", conditions: [] });
      await expect(rules.loadSnapshot(db)).rejects.toMatchObject({ code: "intern" });
    });

    it("eine eingeschaltete eigene Regel (ohne die Prüfung der Datenbank)", async () => {
      await ctx.client.query("alter table rules drop constraint rules_eigene_nur_aus");
      await zeile(eigene({ enabled: true }));
      await expect(rules.loadSnapshot(db)).rejects.toMatchObject({ code: "intern" });
    });

    it("eine eigene Regel vor den Standard-Regeln (ohne die Prüfung der Datenbank)", async () => {
      await ctx.client.query("alter table rules drop constraint rules_eigene_nur_aus");
      await ctx.client.query("alter table rules drop constraint rules_prioritaet_je_quelle");
      await zeile(eigene({ enabled: true, priority: 1 }));
      await expect(rules.loadSnapshot(db)).rejects.toMatchObject({ code: "intern" });
    });
  });

  it("liefert den Regelstand und die Regeln zu einem früheren Stand", async () => {
    const vorher = await rules.loadSnapshot(db);
    expect(vorher.stand).toBe(STANDARD_RULE_VERSIONS.length);
    expect(vorher.rules.map((r) => r.id)).toEqual((await rules.listActive(db)).map((r) => r.id));
    for (const r of vorher.rules) expect(r.seq).toBeLessThanOrEqual(vorher.stand);

    await zeile(eigene());
    const nachher = await rules.loadSnapshot(db);
    expect(nachher.stand).toBe(vorher.stand + 1);
    expect(nachher.rules).toEqual(vorher.rules);
    expect(await rules.listActiveAsOf(db, vorher.stand)).toEqual(vorher.rules);
    expect(await rules.currentStand(db)).toBe(nachher.stand);
  });

  it("die erste Fassung der Standard-Regeln bleibt für alte Belege lesbar", async () => {
    const ersteStand = await rules.listActiveAsOf(db, STANDARD_RULES.length);
    expect(ersteStand.map(ruleContent)).toEqual(
      [...STANDARD_RULES].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id)),
    );
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
    const extra = belegRow(schluessel.id, {
      seq: 5,
      prevHash: zeilen[3]?.hash ?? "",
      conversationId: conv,
    });
    await db.insert(belegeTabelle).values(extra);
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
