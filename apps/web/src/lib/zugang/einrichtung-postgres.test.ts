/**
 * PaiBot – Einrichtung gegen echtes Postgres: zwei gleichzeitige Abschlüsse über zwei Verbindungen,
 * genau einer gewinnt; die Kette ist danach gültig. Läuft nur mit `PAIBOT_TEST_DATABASE_URL`.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { createDb, owner, repo } from "@paibot/db";
import { createPostgresTestDatabase, TEST_DATABASE_URL_ENV } from "@paibot/db/testing";
import { verifyChain } from "@paibot/receipts";
import { describe, expect, it, vi } from "vitest";
import { einrichtungAbschliessen } from "./einrichtung";
import { anfrage, TEST_CODE, TEST_PASSWORT, testUmgebung, vorabDose } from "./testing";

// Passwort-Rechnungen (scrypt) und Migrationen brauchen unter Last länger als die Standard-Zeit.
vi.setConfig({ testTimeout: 60_000 });

const basis = process.env[TEST_DATABASE_URL_ENV];

describe.skipIf(!basis)("Einrichtung gegen Postgres", () => {
  it("zwei gleichzeitige Abschlüsse: genau einer gewinnt, der andere bekommt 409", async () => {
    const datenbank = await createPostgresTestDatabase(basis as string);
    const eins = createDb(datenbank.url);
    const zwei = createDb(datenbank.url);
    try {
      const umgebungen = await Promise.all(
        [eins.db, zwei.db].map(async (db) => {
          const u = await testUmgebung({ db });
          u.neuerCode(TEST_CODE);
          return u;
        }),
      );
      const ergebnisse = await Promise.all(
        umgebungen.map((u, i) =>
          anfrage(
            u,
            u.handler("einrichtungAbschliessen", async (k) => ({
              daten: await einrichtungAbschliessen(k),
            })),
            "POST",
            "/api/einrichtung",
            {
              dose: vorabDose(),
              koerper: {
                setupCode: TEST_CODE,
                password: TEST_PASSWORT,
                passwordRepeat: TEST_PASSWORT,
                schleuseModeDefault: "off",
                botName: `Bot ${i}`,
              },
            },
          ),
        ),
      );
      expect(ergebnisse.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(ergebnisse.find((r) => r.status === 409)?.body.fehler?.code).toBe(
        "einrichtung_fertig",
      );
      expect(await eins.db.select().from(owner)).toHaveLength(1);
      const eintraege = await repo.belege.listFrom(eins.db);
      expect(eintraege.filter((e) => e.body.type === "start")).toHaveLength(1);
      expect((await verifyChain(eintraege)).ok).toBe(true);
    } finally {
      await eins.sql.end({ timeout: 2 });
      await zwei.sql.end({ timeout: 2 });
      await datenbank.drop();
    }
  });
});
