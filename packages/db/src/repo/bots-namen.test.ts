/**
 * PaiBot – Tests der Namensprüfung beim Anlegen und beim Umbenennen eines Bots. Gegenprobe zum
 * Befund „Namenskonfliktprüfung lässt sich durch Umbenennen umgehen“: Die Prüfung gehört in die
 * Datenbank, unter dieselbe Sperre wie das Anlegen – sonst steht neben „Mila“ ein „mila“.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import { LIMITS } from "@paibot/shared";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../client";
import { createTestDb } from "../testing";
import { bots } from "./index";

const VERWECHSELBAR = {
  felder: [{ feld: "name", code: "ungueltig" }],
  text: "Diesen Namen trägt schon ein Bot oder er sieht einem zu ähnlich.",
};

describe("Namen von Bots", () => {
  let db: Database;
  beforeEach(async () => {
    ({ db } = await createTestDb());
  });

  const anlegen = (name: string) =>
    bots.anlegenUnterGrenze(db, { name, avatarShape: "blatt", color: "blau" }, LIMITS.bots);

  it("legt zwei klar unterscheidbare Bots an", async () => {
    await anlegen("Pai");
    await anlegen("Mila");
    expect((await bots.list(db)).map((b) => b.name)).toEqual(["Pai", "Mila"]);
  });

  it("lehnt einen verwechselbaren Namen schon beim Anlegen ab und fügt nichts ein", async () => {
    await anlegen("Mila");
    await expect(anlegen("mila")).rejects.toMatchObject({
      code: "eingabe_ungueltig",
      ...VERWECHSELBAR,
    });
    expect(await bots.count(db)).toBe(1);
  });

  // Der Befund: ohne Prüfung beim Ändern gelingt dieses Umbenennen, und im Teamchat wüsste
  // niemand, wer gemeint ist. Mit Prüfung bleibt der alte Name stehen.
  it("lehnt das Umbenennen in einen verwechselbaren Namen ab und ändert nichts", async () => {
    const pai = await anlegen("Pai");
    await anlegen("Mila");
    await expect(
      bots.aendernUnterNamenspruefung(db, pai.id, { name: "mila" }),
    ).rejects.toMatchObject({ code: "eingabe_ungueltig", ...VERWECHSELBAR });
    expect((await bots.get(db, pai.id))?.name).toBe("Pai");
  });

  it("lehnt auch ähnlich aussehende Zeichen und unsichtbare Zeichen ab", async () => {
    const pai = await anlegen("Pai");
    await anlegen("Mila");
    // Kyrillisches „М“ und „і“, dazu ein Zeichen ohne Breite.
    for (const name of ["Міla", "Mi​la"]) {
      await expect(bots.aendernUnterNamenspruefung(db, pai.id, { name })).rejects.toMatchObject({
        code: "eingabe_ungueltig",
      });
    }
    expect((await bots.get(db, pai.id))?.name).toBe("Pai");
  });

  it("der eigene Name und seine Schreibweise bleiben erlaubt", async () => {
    const pai = await anlegen("Pai");
    await anlegen("Mila");
    expect((await bots.aendernUnterNamenspruefung(db, pai.id, { name: "Pai" }))?.name).toBe("Pai");
    expect((await bots.aendernUnterNamenspruefung(db, pai.id, { name: "PAI" }))?.name).toBe("PAI");
  });

  it("ein freier neuer Name geht, andere Felder gehen ohne Namensprüfung durch", async () => {
    const pai = await anlegen("Pai");
    await anlegen("Mila");
    expect((await bots.aendernUnterNamenspruefung(db, pai.id, { name: "Noa" }))?.name).toBe("Noa");
    const neu = await bots.aendernUnterNamenspruefung(db, pai.id, { role: "Schreibt Entwürfe" });
    expect(neu).toMatchObject({ name: "Noa", role: "Schreibt Entwürfe" });
  });

  it("einen Namen, der mit „Team “ beginnt, lehnt die Prüfung als reserviert ab", async () => {
    const pai = await anlegen("Pai");
    await expect(
      bots.aendernUnterNamenspruefung(db, pai.id, { name: "Team Content" }),
    ).rejects.toMatchObject({
      code: "eingabe_ungueltig",
      text: "Namen, die mit „Team “ beginnen, gehören einem Team.",
    });
  });

  it("einen Bot, den es nicht gibt, meldet die Änderung als undefined", async () => {
    await anlegen("Pai");
    const fremd = (await anlegen("Mila")).id;
    expect(await bots.remove(db, fremd)).toBe(true);
    expect(await bots.aendernUnterNamenspruefung(db, fremd, { name: "Noa" })).toBeUndefined();
  });
});
