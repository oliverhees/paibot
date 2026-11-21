/**
 * PaiBot – Test: Reihenfolge der Migrationen. Drizzle wendet eine Migration nur an, wenn ihr
 * Zeitstempel (`when`) größer ist als der der zuletzt angewandten; eine Migration mit kleinerem
 * Zeitstempel würde auf bestehenden Installationen still übersprungen. Deshalb: `when` streng
 * steigend, Nummern lückenlos, Dateien und Snapshots passen zum Journal.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_FOLDER } from "./testing";

interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

function journal(): JournalEntry[] {
  const text = readFileSync(path.join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8");
  return (JSON.parse(text) as { entries: JournalEntry[] }).entries;
}

function snapshot(nummer: number): { id: string; prevId: string } {
  const datei = path.join(
    MIGRATIONS_FOLDER,
    "meta",
    `${String(nummer).padStart(4, "0")}_snapshot.json`,
  );
  return JSON.parse(readFileSync(datei, "utf8")) as { id: string; prevId: string };
}

describe("Journal der Migrationen", () => {
  it("Zeitstempel steigen streng", () => {
    const entries = journal();
    expect(entries.length).toBeGreaterThan(1);
    for (let i = 1; i < entries.length; i++) {
      const vorher = entries[i - 1] as JournalEntry;
      const jetzt = entries[i] as JournalEntry;
      expect(jetzt.when, `${jetzt.tag} nach ${vorher.tag}`).toBeGreaterThan(vorher.when);
    }
  });

  it("Nummern sind lückenlos, der Name beginnt mit der Nummer", () => {
    journal().forEach((entry, i) => {
      expect(entry.idx).toBe(i);
      expect(entry.tag.startsWith(`${String(i).padStart(4, "0")}_`), entry.tag).toBe(true);
    });
  });

  it("jeder Snapshot zeigt auf seinen Vorgänger", () => {
    const entries = journal();
    for (let n = 1; n < entries.length; n++) {
      expect(snapshot(n).prevId, `Snapshot ${n}`).toBe(snapshot(n - 1).id);
    }
  });

  it("die SQL-Dateien sind genau die Einträge des Journals", () => {
    const dateien = readdirSync(MIGRATIONS_FOLDER)
      .filter((name) => name.endsWith(".sql"))
      .sort();
    expect(dateien).toEqual(journal().map((entry) => `${entry.tag}.sql`));
  });
});
