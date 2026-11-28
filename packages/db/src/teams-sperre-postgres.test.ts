/**
 * PaiBot – Test mit echtem Postgres und zwei Verbindungen (nur mit PAIBOT_TEST_DATABASE_URL):
 * Die Festlegung „die Leitung eines Teams ist ein Mitglied desselben Teams“ und die Namensprüfung
 * der Bots halten auch dann, wenn zwei Verbindungen gleichzeitig schreiben. Das zeigt PGlite
 * nicht, weil es nur eine Verbindung kennt: Erst über zwei echte Verbindungen ist zu sehen, dass
 * `pg_advisory_xact_lock` das Prüfen und das Schreiben zusammenhält – über Prozessgrenzen hinweg.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import { LIMITS } from "@paibot/shared";
import { aehnlichkeitsForm, vergleichsName } from "@paibot/shared/namen";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createDb, type Database } from "./client";
import { bots, settings, teams } from "./repo";
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
  TEST_DATABASE_URL_ENV,
} from "./testing";

const BASE_URL = process.env[TEST_DATABASE_URL_ENV];

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

describe.skipIf(BASE_URL === undefined)("Teams und Namen unter der Sperre (Postgres)", () => {
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

  // Gegenprobe: in `aendernUnterLeitungspruefung` und `setTeam` die Zeile mit
  // `pg_advisory_xact_lock` entfernen → beide Transaktionen laufen ineinander, und das Team behält
  // eine Leitung, die kein Mitglied mehr ist (rot).
  it("Leitung ernennen und Bot versetzen gleichzeitig: die Leitung bleibt ein Mitglied", async () => {
    const { dbA, dbB } = await aufbau();
    const team = await teams.create(dbA, { name: "Content" });
    const anderes = await teams.create(dbA, { name: "Recherche" });
    const mila = await bots.create(dbA, { name: "Mila", avatarShape: "blatt", color: "blau" });
    await bots.setTeam(dbA, mila.id, team.id);

    await Promise.allSettled([
      teams.aendernUnterLeitungspruefung(dbA, team.id, { leadBotId: mila.id }),
      bots.setTeam(dbB, mila.id, anderes.id),
    ]);

    // Welche der beiden zuerst dran war, entscheidet die Sperre – aber nie beides halb.
    const stand = await teams.get(dbA, team.id);
    const bot = await bots.get(dbA, mila.id);
    if (stand?.leadBotId !== undefined) expect(bot?.teamId).toBe(team.id);
    expect((await teams.get(dbA, anderes.id))?.leadBotId).toBeUndefined();
  });

  it("die Leitung eines Teams ist nach beliebiger Reihenfolge immer Mitglied dieses Teams", async () => {
    const { dbA, dbB } = await aufbau();
    const team = await teams.create(dbA, { name: "Content" });
    const mila = await bots.create(dbA, { name: "Mila", avatarShape: "blatt", color: "blau" });
    await bots.setTeam(dbA, mila.id, team.id);

    await Promise.allSettled([
      bots.setTeam(dbB, mila.id, null),
      teams.aendernUnterLeitungspruefung(dbA, team.id, { leadBotId: mila.id }),
    ]);

    const lead = (await teams.get(dbA, team.id))?.leadBotId;
    if (lead !== undefined) expect(await teams.istMitglied(dbA, team.id, lead)).toBe(true);
  });

  // Gegenprobe: die Namensprüfung aus `anlegenUnterGrenze` bzw. `aendernUnterNamenspruefung`
  // entfernen → beide Wege sehen den Namen als frei, am Ende stehen „Mila“ und „mila“ (rot).
  it("Anlegen und Umbenennen gleichzeitig: nur einer der beiden verwechselbaren Namen gelingt", async () => {
    const { dbA, dbB } = await aufbau();
    const pai = await bots.create(dbA, { name: "Pai", avatarShape: "blatt", color: "blau" });

    const ergebnisse = await Promise.allSettled([
      bots.anlegenUnterGrenze(
        dbA,
        { name: "Mila", avatarShape: "blatt", color: "blau" },
        LIMITS.bots,
      ),
      bots.aendernUnterNamenspruefung(dbB, pai.id, { name: "mila" }),
    ]);

    expect(ergebnisse.filter((e) => e.status === "fulfilled")).toHaveLength(1);
    const namen = (await bots.list(dbA)).map((b) => b.name);
    expect(new Set(namen.map(vergleichsName)).size).toBe(namen.length);
    expect(new Set(namen.map(aehnlichkeitsForm)).size).toBe(namen.length);
  });
});
