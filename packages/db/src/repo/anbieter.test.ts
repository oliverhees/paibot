/**
 * PaiBot – Tests: Anbieter, Modelle und Bots.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { newId } from "@paibot/shared";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../client";
import { encrypted } from "../testdaten";
import { createTestDb } from "../testing";
import { bots, models, providers } from "./index";
import { mitCode } from "./testhilfe";

const anbieter = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  baseUrl: `https://${name.toLowerCase()}.beispiel.test/v1`,
  region: "eu" as const,
  ...extra,
});

describe("providers", () => {
  let db: Database;
  beforeEach(async () => {
    db = (await createTestDb()).db;
  });

  it("legt an; der verschlüsselte Schlüssel erscheint nur als keySet", async () => {
    const enc = encrypted();
    const p = await providers.create(db, {
      ...anbieter("EUrouter"),
      apiKeyEnc: enc,
      country: "DE",
    });
    expect(p).toMatchObject({
      kind: "openai_compatible",
      keySet: true,
      country: "DE",
      enabled: true,
    });
    expect(JSON.stringify(p)).not.toContain(enc);
    expect(await providers.getWithKey(db, p.id)).toEqual({ provider: p, apiKeyEnc: enc });
    const ohne = await providers.create(db, anbieter("Lokal", { region: "local" }));
    expect(ohne.keySet).toBe(false);
    expect(ohne).not.toHaveProperty("country");
    expect((await providers.getWithKey(db, ohne.id))?.apiKeyEnc).toBeUndefined();
  });

  it("weist doppelte Adresse und Klartext-Schlüssel ab", async () => {
    await providers.create(db, anbieter("Eins"));
    await expect(providers.create(db, anbieter("Eins"))).rejects.toMatchObject({
      code: "eingabe_ungueltig",
      felder: [{ feld: "baseUrl" }],
    });
    await expect(
      providers.create(db, { ...anbieter("Zwei"), apiKeyEnc: "sk-klartext" }),
    ).rejects.toEqual(mitCode("eingabe_ungueltig"));
  });

  it("ändert, entfernt den Schlüssel mit null und merkt den Verbindungstest", async () => {
    const p = await providers.create(db, { ...anbieter("A"), apiKeyEnc: encrypted() });
    const u = await providers.update(db, p.id, { name: "Neu", apiKeyEnc: null, enabled: false });
    expect(u).toMatchObject({ name: "Neu", keySet: false, enabled: false });
    const at = new Date("2026-11-20T10:00:00.000Z");
    expect(await providers.setCheckResult(db, p.id, { ok: true, at })).toMatchObject({
      lastCheckOk: true,
      lastCheckedAt: at.toISOString(),
    });
    expect(await providers.update(db, newId("provider"), { name: "x" })).toBeUndefined();
    expect((await providers.list(db)).map((x) => x.id)).toEqual([p.id]);
  });

  it("Löschen nimmt die Modelle mit", async () => {
    const p = await providers.create(db, anbieter("A"));
    const m = await models.create(db, { providerId: p.id, slug: "m1", displayName: "M1" });
    expect(await providers.remove(db, p.id)).toBe(true);
    expect(await providers.remove(db, p.id)).toBe(false);
    expect(await models.get(db, m.id)).toBeUndefined();
  });
});

describe("models", () => {
  let db: Database;
  let providerId: ReturnType<typeof newId<"provider">>;
  beforeEach(async () => {
    db = (await createTestDb()).db;
    providerId = (await providers.create(db, anbieter("A"))).id;
  });

  it("legt an, findet per Slug und listet", async () => {
    const m = await models.create(db, {
      providerId,
      slug: "gross",
      displayName: "Groß",
      contextWindow: 128000,
    });
    expect(m).toMatchObject({ contextWindow: 128000, enabled: true });
    expect(await models.findBySlug(db, providerId, "gross")).toEqual(m);
    expect(await models.findBySlug(db, providerId, "klein")).toBeUndefined();
    const klein = await models.create(db, { providerId, slug: "klein", displayName: "Alpha" });
    expect(klein).not.toHaveProperty("contextWindow");
    expect((await models.list(db)).map((x) => x.slug)).toEqual(["klein", "gross"]);
    await models.setEnabled(db, m.id, false);
    expect((await models.list(db, { enabledOnly: true })).map((x) => x.slug)).toEqual(["klein"]);
    expect(await models.list(db, { providerId: newId("provider") })).toEqual([]);
  });

  it("doppelter Slug beim selben Anbieter und unbekannter Anbieter werden abgewiesen", async () => {
    await models.create(db, { providerId, slug: "x", displayName: "X" });
    await expect(
      models.create(db, { providerId, slug: "x", displayName: "Y" }),
    ).rejects.toMatchObject({
      code: "eingabe_ungueltig",
      felder: [{ feld: "slug" }],
    });
    await expect(
      models.create(db, { providerId: newId("provider"), slug: "z", displayName: "Z" }),
    ).rejects.toEqual(mitCode("nicht_gefunden"));
  });

  it("upsert aktualisiert Anzeigename und Kontextfenster, behält ID und Schalter", async () => {
    const m = await models.create(db, {
      providerId,
      slug: "x",
      displayName: "Alt",
      enabled: false,
    });
    const u = await models.upsert(db, {
      providerId,
      slug: "x",
      displayName: "Neu",
      contextWindow: 8000,
    });
    expect(u).toMatchObject({ id: m.id, displayName: "Neu", contextWindow: 8000, enabled: false });
    expect(await models.list(db)).toHaveLength(1);
  });
});

describe("bots", () => {
  let db: Database;
  beforeEach(async () => {
    db = (await createTestDb()).db;
  });

  it("legt mit Standardwerten an, ändert und listet", async () => {
    const b = await bots.create(db, { name: "Pai", avatarShape: "blatt", color: "limette" });
    expect(b).toMatchObject({ instructions: "", maxOutputTokens: 4096 });
    expect(b).not.toHaveProperty("modelId");
    const u = await bots.update(db, b.id, { instructions: "Sei kurz.", color: "blau" });
    expect(u).toMatchObject({ name: "Pai", instructions: "Sei kurz.", color: "blau" });
    expect(await bots.update(db, newId("bot"), { name: "x" })).toBeUndefined();
    expect((await bots.list(db)).map((x) => x.id)).toEqual([b.id]);
  });

  it("doppelter Name und zu lange Anweisung werden abgewiesen", async () => {
    await bots.create(db, { name: "Pai", avatarShape: "blatt", color: "blau" });
    await expect(
      bots.create(db, { name: "Pai", avatarShape: "bogen", color: "gelb" }),
    ).rejects.toMatchObject({ code: "eingabe_ungueltig", felder: [{ feld: "name" }] });
    await expect(
      bots.create(db, {
        name: "Lang",
        instructions: "x".repeat(8001),
        avatarShape: "blatt",
        color: "blau",
      }),
    ).rejects.toEqual(mitCode("eingabe_ungueltig"));
  });

  it("setModel verknüpft; ohne Modell fällt die Verknüpfung weg, wenn das Modell gelöscht wird", async () => {
    const p = await providers.create(db, anbieter("A"));
    const m = await models.create(db, { providerId: p.id, slug: "m", displayName: "M" });
    const b = await bots.create(db, { name: "Pai", avatarShape: "blatt", color: "blau" });
    expect((await bots.setModel(db, b.id, m.id))?.modelId).toBe(m.id);
    await expect(bots.setModel(db, b.id, newId("model"))).rejects.toEqual(
      mitCode("nicht_gefunden"),
    );
    await models.remove(db, m.id);
    expect(await bots.get(db, b.id)).not.toHaveProperty("modelId");
    expect((await bots.setModel(db, b.id, null))?.modelId).toBeUndefined();
  });
});
