/**
 * PaiBot – Tests der Passwort-Prüfung: höchstens zwei gleichzeitig, gleiche Dauer ohne Besitzer.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { hashPassword } from "@paibot/crypto";
import { describe, expect, it, vi } from "vitest";
import { erstelleBegrenzer, passwortBegrenzer, pruefePasswort } from "./passwort";

// Passwort-Rechnungen (scrypt) und Migrationen brauchen unter Last länger als die Standard-Zeit.
vi.setConfig({ testTimeout: 60_000 });

describe("Passwort-Prüfung", () => {
  it("der Begrenzer lässt höchstens zwei Aufgaben gleichzeitig laufen", async () => {
    const b = erstelleBegrenzer(2);
    const aufgaben = Array.from({ length: 8 }, () =>
      b.ausfuehren(() => new Promise((fertig) => setTimeout(fertig, 15))),
    );
    await Promise.all(aufgaben);
    expect(b.statistik.hoechstens).toBe(2);
    expect(b.laufend()).toBe(0);
  });

  it("der Begrenzer des Prozesses erlaubt genau zwei parallele Hash-Läufe", async () => {
    const hash = await hashPassword("ein-passwort-1234");
    const b = passwortBegrenzer();
    b.statistik.hoechstens = 0;
    await Promise.all(Array.from({ length: 5 }, () => pruefePasswort("falsch-falsch-1", hash)));
    expect(b.statistik.hoechstens).toBe(2);
  });

  it("richtig, falsch, ohne Besitzer und ungültiger Hash", async () => {
    const hash = await hashPassword("ein-passwort-1234");
    expect(await pruefePasswort("ein-passwort-1234", hash)).toBe(true);
    expect(await pruefePasswort("ein-passwort-1235", hash)).toBe(false);
    expect(await pruefePasswort("ein-passwort-1234", undefined)).toBe(false);
    expect(await pruefePasswort("ein-passwort-1234", "kein-hash")).toBe(false);
  });

  it("ohne Besitzer dauert die Prüfung ähnlich lang wie mit falschem Passwort", async () => {
    const hash = await hashPassword("ein-passwort-1234");
    await pruefePasswort("aufwaermen-12345", undefined);
    const messen = async (gespeichert: string | undefined) => {
      const start = performance.now();
      for (let i = 0; i < 3; i += 1) await pruefePasswort("falsch-falsch-12", gespeichert);
      return performance.now() - start;
    };
    const mit = await messen(hash);
    const ohne = await messen(undefined);
    expect(ohne / mit).toBeGreaterThan(0.4);
    expect(ohne / mit).toBeLessThan(2.5);
  });
});
