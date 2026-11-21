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
import { runMigrations } from "@paibot/db/migrate";
import {
  createPostgresTestDatabase,
  MIGRATIONS_FOLDER,
  newPostgresTestRole,
  TEST_DATABASE_URL_ENV,
} from "@paibot/db/testing";
import { verifyChain } from "@paibot/receipts";
import { describe, expect, it, vi } from "vitest";
import { einstellungenAendern } from "../einstellungen/grenzen";
import { einrichtungAbschliessen } from "./einrichtung";
import { codeLogZeile, codeSicherstellen, erstelleCodeHalter } from "./einrichtungs-code";
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

  it("mit der App-Rolle: Code genau einmal über mehrere Prozesse, Einrichtung, Einstellung durchs Tor", async () => {
    const datenbank = await createPostgresTestDatabase(basis as string, { migrate: false });
    const rolle = newPostgresTestRole(datenbank.url);
    // Wie der Dienst migrate: Migrationen und App-Rolle mit der Migrations-Rolle.
    await runMigrations(datenbank.url, MIGRATIONS_FOLDER, { appUrl: rolle.url });
    const prozesse = [createDb(rolle.url), createDb(rolle.url), createDb(rolle.url)];
    try {
      // Drei Web-Prozesse starten gleichzeitig: genau ein Code, genau eine Log-Zeile.
      const log: string[] = [];
      const staende = await Promise.all(
        prozesse.map((p) =>
          codeSicherstellen(
            erstelleCodeHalter(() => TEST_CODE),
            p.db,
            new Date(),
            (z) => log.push(z),
          ),
        ),
      );
      expect(staende.filter((s) => s.art === "neu")).toHaveLength(1);
      expect(log).toEqual([codeLogZeile(TEST_CODE)]);

      const [eins] = prozesse;
      if (eins === undefined) throw new Error("kein Prozess");
      const u = await testUmgebung({ db: eins.db });
      // Kein `neuerCode`: Der Code aus dem „Log“ gilt.
      const dose = vorabDose();
      const abschluss = await anfrage(
        u,
        u.handler("einrichtungAbschliessen", async (k) => ({
          daten: await einrichtungAbschliessen(k),
        })),
        "POST",
        "/api/einrichtung",
        {
          dose,
          koerper: {
            setupCode: TEST_CODE,
            password: TEST_PASSWORT,
            passwordRepeat: TEST_PASSWORT,
            schleuseModeDefault: "off",
            botName: "Pai",
          },
        },
      );
      expect(abschluss.status).toBe(200);
      expect(await repo.settings.getSetupCode(eins.db)).toBeUndefined();
      expect(await u.dienste.code.pruefen(eins.db, TEST_CODE)).toBe(false);

      const aendern = await anfrage(
        u,
        u.handler("einstellungenAendern", async (k) => ({ daten: await einstellungenAendern(k) })),
        "PATCH",
        "/api/einstellungen",
        { dose, koerper: { dailyTokenBudget: 50_000 } },
      );
      expect(aendern.status).toBe(200);
      expect((await repo.settings.get(eins.db))?.dailyTokenBudget).toBe(50_000);

      const eintraege = await repo.belege.listFrom(eins.db);
      const aktionen = eintraege.flatMap((e) =>
        e.body.type === "decision" || e.body.type === "result"
          ? [`${e.body.type}:${e.body.action.actionId}`]
          : [],
      );
      expect(new Set(aktionen).size).toBe(aktionen.length);
      expect((await verifyChain(eintraege)).ok).toBe(true);
      // Die App-Rolle darf Regeln nicht schreiben.
      await expect(
        eins.sql`update "public"."rules" set title = 'x' where id = 'R-001'`,
      ).rejects.toThrow();
    } finally {
      for (const p of prozesse) await p.sql.end({ timeout: 2 });
      await datenbank.drop();
      await rolle.drop(basis as string);
    }
  });
});
