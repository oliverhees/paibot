/**
 * PaiBot – Tests: Transaktionen, Fehlerübersetzung und Abbildung der Zeilen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { PaiBotError } from "@paibot/shared";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../client";
import { bots } from "../schema";
import { botRow } from "../testdaten";
import { createTestDb } from "../testing";
import { pgFehler } from "./fehler";
import { bots as botRepo, withTransaction } from "./index";

describe("withTransaction", () => {
  let db: Database;
  beforeAll(async () => {
    db = (await createTestDb()).db;
  });

  it("bestätigt, wenn die Arbeit gelingt", async () => {
    const name = `Bestätigt ${Math.random()}`;
    const bot = await withTransaction(db, (tx) =>
      botRepo.create(tx, { name, avatarShape: "blatt", color: "blau" }),
    );
    expect(await botRepo.get(db, bot.id)).toEqual(bot);
  });

  it("nimmt alles zurück, wenn die Arbeit wirft", async () => {
    const zeile = botRow();
    await expect(
      withTransaction(db, async (tx) => {
        await tx.insert(bots).values(zeile);
        throw new Error("Abbruch");
      }),
    ).rejects.toThrow("Abbruch");
    expect(await botRepo.get(db, zeile.id)).toBeUndefined();
  });

  it("verschachtelt über einen Sicherungspunkt: innen zurückgenommen, außen bestätigt", async () => {
    const aussen = botRow();
    const innen = botRow();
    await withTransaction(db, async (tx) => {
      await tx.insert(bots).values(aussen);
      await withTransaction(tx, async (tx2) => {
        await tx2.insert(bots).values(innen);
        throw new Error("innen");
      }).catch(() => undefined);
    });
    expect(await botRepo.get(db, aussen.id)).toBeDefined();
    expect(await botRepo.get(db, innen.id)).toBeUndefined();
  });
});

describe("Fehlerübersetzung", () => {
  it("liest SQLSTATE und Constraint aus dem Treiberfehler, auch eingepackt", async () => {
    const { db } = await createTestDb();
    const zeile = botRow();
    await db.insert(bots).values(zeile);
    const fehler = await db
      .insert(bots)
      .values({ ...botRow(), name: zeile.name })
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    expect(pgFehler(fehler)).toEqual({ code: "23505", constraint: "bots_name_eindeutig" });
  });

  it("Unbekanntes bleibt unverändert", () => {
    expect(pgFehler(new Error("x"))).toEqual({});
    expect(pgFehler(undefined)).toEqual({});
  });

  it("Fehler mit Code sind PaiBotError", async () => {
    const { db } = await createTestDb();
    const bot = await botRepo.create(db, { name: "Pai", avatarShape: "blatt", color: "blau" });
    const fehler = await botRepo
      .create(db, { name: bot.name, avatarShape: "blatt", color: "blau" })
      .catch((e: unknown) => e);
    expect(fehler).toBeInstanceOf(PaiBotError);
    expect(fehler).toMatchObject({ code: "eingabe_ungueltig", felder: [{ feld: "name" }] });
  });
});
