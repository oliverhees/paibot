/**
 * PaiBot – Test mit echtem Postgres und zwei Verbindungen (nur mit PAIBOT_TEST_DATABASE_URL):
 * Wer einen Zugriff setzt, hält die Zeile der App, bis seine Transaktion endet. Trennt eine andere
 * Verbindung die App gleichzeitig, wartet sie darauf, und eine Zugriffs-Zeile für eine schon
 * beendete Verbindung kann nicht mehr entstehen. Das Trennen wartet höchstens so lange, wie seine
 * Wartezeit auf Sperren reicht (3 Sekunden, wie in der Web-App) und endet dann mit 55P03.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { afterAll, describe, expect, it, vi } from "vitest";
import { BelegKette, tokenV2 } from "./apps-testhilfe";
import { createDb, type Database } from "./client";
import { apps, bots, settings, withTransaction } from "./repo";
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
  TEST_DATABASE_URL_ENV,
} from "./testing";

const BASE_URL = process.env[TEST_DATABASE_URL_ENV];
const WARTEZEIT_MS = 3000;

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const warte = (ms: number) => new Promise<void>((fertig) => setTimeout(fertig, ms));

/** Sagt nach `ms`, ob das Versprechen schon erledigt ist (ohne es abzuwarten). */
async function stand(versprechen: Promise<unknown>, ms: number): Promise<"wartet" | "fertig"> {
  return Promise.race([
    versprechen.then(
      () => "fertig" as const,
      () => "fertig" as const,
    ),
    warte(ms).then(() => "wartet" as const),
  ]);
}

describe.skipIf(BASE_URL === undefined)(
  "Zugriff setzen und gleichzeitig trennen (Postgres)",
  () => {
    const datenbanken: PostgresTestDatabase[] = [];
    const schliessen: Array<() => Promise<void>> = [];
    afterAll(async () => {
      for (const zu of schliessen) await zu();
      for (const d of datenbanken) await d.drop();
    });

    async function aufbau(kurz: string) {
      // Je Test eine eigene Datenbank: Die Beleg-Kette legt ihren Schlüssel an, und es darf nur einen geben.
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
      const botId = (
        await bots.create(dbA, { name: `Pai ${kurz}`, avatarShape: "blatt", color: "blau" })
      ).id;
      const kette = new BelegKette(dbA);
      const app = await apps.create(dbA, {
        shortName: kurz,
        name: kurz,
        url: `https://${kurz}.beispiel.test/mcp`,
        authKind: "token",
        tokenEnc: tokenV2(),
      });
      const actionId = await kette.zugriffSetzen({ appId: app.id, botId, access: "lesen" });
      return { dbA, dbB, botId, app, actionId };
    }

    /** Verbindung A setzt den Zugriff und hält die Transaktion offen, bis `freigeben` gerufen wird. */
    function halteZugriff(dbA: Database, eingabe: Parameters<typeof apps.setAccess>[1]) {
      let freigeben: () => void = () => undefined;
      const gehalten = new Promise<void>((fertig) => {
        freigeben = fertig;
      });
      let gesetzt: () => void = () => undefined;
      const istGesetzt = new Promise<void>((fertig) => {
        gesetzt = fertig;
      });
      const transaktion = withTransaction(dbA, async (tx) => {
        await apps.setAccess(tx, eingabe);
        gesetzt();
        await gehalten;
      });
      return { istGesetzt, freigeben, transaktion };
    }

    const trenneMitWartezeit = (dbB: Database, id: Parameters<typeof apps.disconnect>[1]) =>
      withTransaction(dbB, async (tx) => {
        await tx.execute(`set local lock_timeout = ${WARTEZEIT_MS}`);
        return apps.disconnect(tx, id);
      });

    it("das Trennen wartet auf den, der den Zugriff setzt; danach ist die Zeile für die alte Verbindung da und die App getrennt", async () => {
      const { dbA, dbB, botId, app, actionId } = await aufbau("sperre1");
      const halter = halteZugriff(dbA, { appId: app.id, botId, access: "lesen", actionId });
      await halter.istGesetzt;

      const trennen = trenneMitWartezeit(dbB, app.id);
      expect(await stand(trennen, 700)).toBe("wartet");

      halter.freigeben();
      await halter.transaktion;
      expect((await trennen)?.state).toBe("getrennt");
      // Die Zeile gehört zur Verbindung, die damals galt; nach dem Trennen gilt kein Zugriff mehr.
      expect(await apps.currentAccess(dbA, app.id, botId)).toBe("keiner");
    });

    it("das Trennen wartet höchstens die Wartezeit auf Sperren und endet dann mit 55P03; die App bleibt verbunden", async () => {
      const { dbA, dbB, botId, app, actionId } = await aufbau("sperre2");
      const halter = halteZugriff(dbA, { appId: app.id, botId, access: "lesen", actionId });
      await halter.istGesetzt;

      const start = Date.now();
      let code: string | undefined;
      try {
        await trenneMitWartezeit(dbB, app.id);
      } catch (fehler) {
        const e = fehler as { code?: string; cause?: { code?: string } };
        code = e.code ?? e.cause?.code;
      }
      const dauer = Date.now() - start;
      expect(code).toBe("55P03");
      expect(dauer).toBeGreaterThanOrEqual(WARTEZEIT_MS - 500);
      expect(dauer).toBeLessThan(WARTEZEIT_MS + 2000);

      halter.freigeben();
      await halter.transaktion;
      expect((await apps.get(dbA, app.id))?.state).toBe("verbunden");
      expect(await apps.currentAccess(dbA, app.id, botId)).toBe("lesen");
    });
  },
);
