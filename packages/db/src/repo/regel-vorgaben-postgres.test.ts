/**
 * PaiBot – Tests gegen echtes Postgres (nur mit PAIBOT_TEST_DATABASE_URL): gelesene Vorgaben einer
 * Routing-Regel und der zweite Schlüssel eines Anbieters werden gespeichert, gelesen, entfernt;
 * die Prüfungen der Datenbank lehnen halbe oder fremde Angaben ab.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { type ProviderId, rulePolicySchema } from "@paibot/shared";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "../client";
import { runMigrations } from "../migrate";
import { MIGRATIONS_FOLDER } from "../testing";
import { models, providers } from "./index";

const URL_ENV = process.env.PAIBOT_TEST_DATABASE_URL;
const ZWEITER = `v2:${"A".repeat(16)}:${"B".repeat(22)}:Zm9v`;

function mitDatenbank(adresse: string, name: string): string {
  const url = new URL(adresse);
  url.pathname = `/${name}`;
  return url.toString();
}

describe.skipIf(URL_ENV === undefined)("Vorgaben einer Regel gegen echtes Postgres", () => {
  const name = `paibot_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  let verwaltung: postgres.Sql;
  let sql: postgres.Sql;
  let db: ReturnType<typeof createDb>["db"];
  let providerId: ProviderId;

  beforeAll(async () => {
    if (URL_ENV === undefined) return;
    verwaltung = postgres(URL_ENV, { max: 1 });
    await verwaltung.unsafe(`create database ${name}`);
    const adresse = mitDatenbank(URL_ENV, name);
    await runMigrations(adresse, MIGRATIONS_FOLDER);
    ({ db, sql } = createDb(adresse));
    const p = await providers.create(db, {
      templateKey: "eurouter",
      name: "EUrouter",
      baseUrl: "https://api.eurouter.ai/v1",
      region: "eu",
    });
    providerId = p.id as ProviderId;
  });

  afterAll(async () => {
    if (URL_ENV === undefined) return;
    await sql?.end({ timeout: 2 });
    await verwaltung?.unsafe(`drop database if exists ${name} with (force)`);
    await verwaltung?.end({ timeout: 2 });
  });

  it("speichert Vorgaben mit Herkunft und Zeit und liest sie geprüft zurück", async () => {
    const m = await models.create(db, {
      providerId,
      slug: "rule:Beispiel-Regel",
      displayName: "Beispiel-Regel",
    });
    const um = new Date("2026-11-21T10:00:00.000Z");
    const policy = { data_residency: "EU", eu_owned: true, models: ["glm-5.1"] };
    expect(
      await models.setRulePolicy(db, m.id, {
        policy,
        source: "verwaltungsschluessel",
        checkedAt: um,
      }),
    ).toBe(true);
    const gelesen = await models.rulePolicyOf(db, m.id);
    expect(gelesen?.policy).toEqual(policy);
    expect(gelesen?.source).toBe("verwaltungsschluessel");
    expect(gelesen?.checkedAt.toISOString()).toBe(um.toISOString());
    expect(Object.keys(await models.rulePolicies(db, providerId))).toEqual([m.id]);
    // Entfernen löscht alle drei Spalten zusammen.
    await models.setRulePolicy(db, m.id, null);
    expect(await models.rulePolicyOf(db, m.id)).toBeUndefined();
  });

  it("Gegenprobe: ein Wert in fremder Form wird nie gespeichert", async () => {
    const m = await models.create(db, {
      providerId,
      slug: "rule:Andere-Regel",
      displayName: "Andere-Regel",
    });
    await expect(
      models.setRulePolicy(db, m.id, {
        policy: { id: "x" } as never,
        source: "verwaltungsschluessel",
        checkedAt: new Date(),
      }),
    ).rejects.toThrow();
    expect(rulePolicySchema.safeParse({ user_id: "u" }).success).toBe(false);
    expect(await models.rulePolicyOf(db, m.id)).toBeUndefined();
  });

  it("die Datenbank lehnt halbe Angaben und fremde Herkunft ab", async () => {
    const m = await models.create(db, {
      providerId,
      slug: "rule:Dritte-Regel",
      displayName: "Dritte-Regel",
    });
    await expect(
      sql`update models set rule_policy = '{"data_residency":"EU"}'::jsonb where id = ${m.id}`,
    ).rejects.toThrow(/models_rule_policy_vollstaendig/);
    await expect(
      sql`update models set rule_policy = '{}'::jsonb, rule_policy_source = 'irgendwer', rule_policy_checked_at = now() where id = ${m.id}`,
    ).rejects.toThrow(/models_rule_policy_source_werte/);
  });

  it("zweiter Schlüssel: gespeichert, als „gesetzt“ gemeldet, entfernbar, Format geprüft", async () => {
    expect((await providers.get(db, providerId))?.managementKeySet).toBeUndefined();
    await providers.update(db, providerId, { managementKeyEnc: ZWEITER });
    const mitSchluessel = await providers.getWithKey(db, providerId);
    expect(mitSchluessel?.managementKeyEnc).toBe(ZWEITER);
    expect(mitSchluessel?.provider.managementKeySet).toBe(true);
    expect(JSON.stringify(mitSchluessel?.provider)).not.toContain(ZWEITER);
    await expect(
      providers.update(db, providerId, { managementKeyEnc: "klartext" }),
    ).rejects.toThrow();
    await providers.update(db, providerId, { managementKeyEnc: null });
    expect((await providers.getWithKey(db, providerId))?.managementKeyEnc).toBeUndefined();
  });
});
