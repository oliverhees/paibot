/**
 * PaiBot – Tests des Einrichtungs-Codes: Form, Zufall, Prüfung, Log-Zeile, Prüfwert in der
 * Datenbank, Neustart und mehrere Prozesse.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { repo } from "@paibot/db";
import { createTestDb } from "@paibot/db/testing";
import { SETUP_CODE_PATTERN } from "@paibot/shared/eingaben";
import { describe, expect, it, vi } from "vitest";
import {
  CODE_ALPHABET,
  codeLogZeile,
  codePruefwert,
  codeSicherstellen,
  erstelleCodeHalter,
  neuerEinrichtungsCode,
} from "./einrichtungs-code";

vi.setConfig({ testTimeout: 60_000 });

const JETZT = new Date("2026-11-20T10:00:00.000Z");
const LOG_MUSTER =
  /^Einrichtungs-Code: [0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4} \(gilt bis zum Ende der Einrichtung\)$/;

describe("Einrichtungs-Code", () => {
  it("hat die Form XXXX-XXXX-XXXX aus Crockford-Base32 in Großbuchstaben und ist zufällig", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      const code = neuerEinrichtungsCode();
      expect(code).toMatch(SETUP_CODE_PATTERN);
      for (const z of code.replaceAll("-", "")) expect(CODE_ALPHABET).toContain(z);
      codes.add(code);
    }
    expect(codes.size).toBe(500);
  });

  it("Log-Zeile genau im festen Wortlaut", () => {
    expect(codeLogZeile("K7QD-9M2F-XW4H")).toBe(
      "Einrichtungs-Code: K7QD-9M2F-XW4H (gilt bis zum Ende der Einrichtung)",
    );
  });

  it("prüft nur den aktuellen Code; nach Ersetzen oder Abschluss gilt der alte nicht", async () => {
    const { db } = await createTestDb();
    let naechster = "K7QD-9M2F-XW4H";
    const halter = erstelleCodeHalter(() => naechster);
    expect(await halter.pruefen(db, "K7QD-9M2F-XW4H")).toBe(false);
    expect(await halter.sicherstellen(db, JETZT)).toEqual({ art: "neu", code: "K7QD-9M2F-XW4H" });
    expect(await halter.pruefen(db, "K7QD-9M2F-XW4H")).toBe(true);
    expect(await halter.pruefen(db, "K7QD-9M2F-XW4J")).toBe(false);
    naechster = "AAAA-BBBB-CCCC";
    expect(await halter.ersetzen(db, JETZT)).toBe("AAAA-BBBB-CCCC");
    expect(await halter.pruefen(db, "K7QD-9M2F-XW4H")).toBe(false);
    expect(await halter.pruefen(db, "AAAA-BBBB-CCCC")).toBe(true);
    await repo.settings.completeSetup(db, {
      installationId: "ins_06f8k2m9qz3w7x1c4b5n8p0r2t" as never,
    });
    expect(await halter.aktiv(db)).toBe(false);
    expect(await halter.pruefen(db, "AAAA-BBBB-CCCC")).toBe(false);
    // Nach dem Abschluss entsteht keiner mehr.
    expect(await halter.sicherstellen(db, JETZT)).toEqual({ art: "fertig" });
    expect(await halter.ersetzen(db, JETZT)).toBeUndefined();
    expect(await repo.settings.getSetupCode(db)).toBeUndefined();
  });

  it("speichert nur den Prüfwert, nie den Code", async () => {
    const { db } = await createTestDb();
    const halter = erstelleCodeHalter(() => "K7QD-9M2F-XW4H");
    await halter.sicherstellen(db, JETZT);
    const gespeichert = await repo.settings.getSetupCode(db);
    expect(gespeichert).toEqual({ hash: codePruefwert("K7QD-9M2F-XW4H"), createdAt: JETZT });
    expect(gespeichert?.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(JSON.stringify(gespeichert)).not.toContain("K7QD");
    expect(JSON.stringify(await repo.settings.get(db))).not.toContain("K7QD");
    expect(JSON.stringify(halter)).not.toContain("K7QD");
  });

  it("codeSicherstellen schreibt genau einmal ins Log", async () => {
    const { db } = await createTestDb();
    const halter = erstelleCodeHalter();
    const log: string[] = [];
    await codeSicherstellen(halter, db, JETZT, (z) => log.push(z));
    const zweiter = await codeSicherstellen(halter, db, JETZT, (z) => log.push(z));
    expect(log).toHaveLength(1);
    expect(log[0]).toMatch(LOG_MUSTER);
    expect(zweiter).toEqual({ art: "vorhanden", seit: JETZT });
  });

  it("Neustart: ein neuer Halter (neuer Prozess) erzeugt keinen neuen Code, der alte gilt weiter", async () => {
    const { db } = await createTestDb();
    const log: string[] = [];
    await codeSicherstellen(
      erstelleCodeHalter(() => "K7QD-9M2F-XW4H"),
      db,
      JETZT,
      (z) => log.push(z),
    );
    const nachNeustart = erstelleCodeHalter(() => "AAAA-BBBB-CCCC");
    const stand = await codeSicherstellen(nachNeustart, db, new Date(), (z) => log.push(z));
    expect(stand).toEqual({ art: "vorhanden", seit: JETZT });
    expect(log).toEqual([codeLogZeile("K7QD-9M2F-XW4H")]);
    expect(await nachNeustart.pruefen(db, "K7QD-9M2F-XW4H")).toBe(true);
    expect(await nachNeustart.pruefen(db, "AAAA-BBBB-CCCC")).toBe(false);
  });

  it("zwei Prozesse gleichzeitig: genau ein Code, genau eine Log-Zeile", async () => {
    const { db } = await createTestDb();
    const log: string[] = [];
    const halter = Array.from({ length: 4 }, () => erstelleCodeHalter());
    const staende = await Promise.all(
      halter.map((h) => codeSicherstellen(h, db, JETZT, (z) => log.push(z))),
    );
    expect(staende.filter((s) => s.art === "neu")).toHaveLength(1);
    expect(staende.filter((s) => s.art === "vorhanden")).toHaveLength(3);
    expect(log).toHaveLength(1);
    const neu = staende.find((s) => s.art === "neu");
    if (neu?.art !== "neu") throw new Error("kein neuer Code");
    expect((await repo.settings.getSetupCode(db))?.hash).toBe(codePruefwert(neu.code));
    for (const h of halter) expect(await h.pruefen(db, neu.code)).toBe(true);
  });
});
