/**
 * PaiBot – Test mit echtem Postgres und zwei Verbindungen (nur mit PAIBOT_TEST_DATABASE_URL):
 * Die Grenze „Bots insgesamt“ hält auch dann, wenn zwei Verbindungen gleichzeitig anlegen. Das
 * zeigt PGlite nicht, weil es nur eine Verbindung kennt: Erst über zwei echte Verbindungen ist zu
 * sehen, dass `pg_advisory_xact_lock` in `anlegenUnterGrenze` Zählen, Entscheiden und Einfügen
 * zusammenhält – und zwar für jeden Anlege-Weg, nicht nur für den einen Prozess der Web-App.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import { LIMITS, PaiBotError } from "@paibot/shared";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createDb, type Database } from "./client";
import { bots, settings } from "./repo";
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
  TEST_DATABASE_URL_ENV,
} from "./testing";

const BASE_URL = process.env[TEST_DATABASE_URL_ENV];

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

describe.skipIf(BASE_URL === undefined)("Grenze „Bots insgesamt“ (Postgres)", () => {
  const datenbanken: PostgresTestDatabase[] = [];
  const schliessen: Array<() => Promise<void>> = [];
  afterAll(async () => {
    for (const zu of schliessen) await zu();
    for (const d of datenbanken) await d.drop();
  });

  /** Eigene Datenbank je Test, dazu zwei getrennte Verbindungen darauf. */
  async function aufbau(): Promise<{ dbA: Database; dbB: Database }> {
    const datenbank = await createPostgresTestDatabase(BASE_URL ?? "");
    datenbanken.push(datenbank);
    const a = createDb(datenbank.url);
    const b = createDb(datenbank.url);
    schliessen.push(
      () => a.sql.end({ timeout: 2 }),
      () => b.sql.end({ timeout: 2 }),
    );
    const dbA = a.db as unknown as Database;
    const dbB = b.db as unknown as Database;
    await settings.ensure(dbA);
    return { dbA, dbB };
  }

  /** Füllt bis einer unter der Grenze fehlt. */
  async function fuelleBisKurzVorDerGrenze(db: Database): Promise<void> {
    for (let i = await bots.count(db); i < LIMITS.bots - 1; i++) {
      await bots.create(db, { name: `Bot ${i}`, avatarShape: "blatt", color: "blau" });
    }
    expect(await bots.count(db)).toBe(LIMITS.bots - 1);
  }

  // Gegenprobe: in `anlegenUnterGrenze` die Zeile mit `pg_advisory_xact_lock` entfernen → beide
  // Verbindungen lesen 49, beide fügen ein, am Ende stehen 51 Bots und dieser Test wird rot.
  it("zwei Verbindungen legen gleichzeitig an: genau einer gelingt, am Ende steht die Grenze", async () => {
    const { dbA, dbB } = await aufbau();
    await fuelleBisKurzVorDerGrenze(dbA);

    const ergebnisse = await Promise.allSettled([
      bots.anlegenUnterGrenze(
        dbA,
        { name: "Mila", avatarShape: "blatt", color: "blau" },
        LIMITS.bots,
      ),
      bots.anlegenUnterGrenze(
        dbB,
        { name: "Nora", avatarShape: "blatt", color: "blau" },
        LIMITS.bots,
      ),
    ]);

    const gelungen = ergebnisse.filter((e) => e.status === "fulfilled");
    const gescheitert = ergebnisse.filter(
      (e): e is PromiseRejectedResult => e.status === "rejected",
    );
    expect(gelungen).toHaveLength(1);
    expect(gescheitert).toHaveLength(1);
    const fehler = gescheitert[0]?.reason;
    expect(fehler).toBeInstanceOf(PaiBotError);
    expect((fehler as PaiBotError).code).toBe("limit_erreicht");
    expect(await bots.count(dbA)).toBe(LIMITS.bots);
  });

  it("über der Grenze fügt keine der beiden Verbindungen etwas ein", async () => {
    const { dbA, dbB } = await aufbau();
    await fuelleBisKurzVorDerGrenze(dbA);
    await bots.create(dbA, { name: "Der letzte", avatarShape: "blatt", color: "blau" });
    expect(await bots.count(dbA)).toBe(LIMITS.bots);

    const ergebnisse = await Promise.allSettled([
      bots.anlegenUnterGrenze(
        dbA,
        { name: "Mila", avatarShape: "blatt", color: "blau" },
        LIMITS.bots,
      ),
      bots.anlegenUnterGrenze(
        dbB,
        { name: "Nora", avatarShape: "blatt", color: "blau" },
        LIMITS.bots,
      ),
    ]);

    expect(ergebnisse.map((e) => e.status)).toEqual(["rejected", "rejected"]);
    expect(await bots.count(dbA)).toBe(LIMITS.bots);
  });
});
