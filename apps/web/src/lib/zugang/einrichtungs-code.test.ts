/**
 * PaiBot – Tests des Einrichtungs-Codes: Form, Zufall, Prüfung, Verbrauch, Log-Zeile.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { SETUP_CODE_PATTERN } from "@paibot/shared/eingaben";
import { describe, expect, it } from "vitest";
import {
  CODE_ALPHABET,
  codeLogZeile,
  codeSicherstellen,
  erstelleCodeHalter,
  neuerEinrichtungsCode,
} from "./einrichtungs-code";

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

  it("prüft nur den aktuellen Code; nach Verbrauch oder Neu-Erzeugen gilt der alte nicht", () => {
    let naechster = "K7QD-9M2F-XW4H";
    const halter = erstelleCodeHalter(() => naechster);
    expect(halter.pruefen("K7QD-9M2F-XW4H")).toBe(false);
    halter.erzeugen();
    expect(halter.pruefen("K7QD-9M2F-XW4H")).toBe(true);
    expect(halter.pruefen("K7QD-9M2F-XW4J")).toBe(false);
    naechster = "AAAA-BBBB-CCCC";
    halter.erzeugen();
    expect(halter.pruefen("K7QD-9M2F-XW4H")).toBe(false);
    expect(halter.pruefen("AAAA-BBBB-CCCC")).toBe(true);
    halter.verbrauchen();
    expect(halter.aktiv()).toBe(false);
    expect(halter.pruefen("AAAA-BBBB-CCCC")).toBe(false);
  });

  it("hält den Code nicht im Klartext", () => {
    const halter = erstelleCodeHalter(() => "K7QD-9M2F-XW4H");
    halter.erzeugen();
    expect(JSON.stringify(halter)).not.toContain("K7QD");
  });

  it("codeSicherstellen schreibt genau einmal ins Log", () => {
    const halter = erstelleCodeHalter();
    const log: string[] = [];
    codeSicherstellen(halter, (z) => log.push(z));
    codeSicherstellen(halter, (z) => log.push(z));
    expect(log).toHaveLength(1);
    expect(log[0]).toMatch(
      /^Einrichtungs-Code: [0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4} \(gilt bis zum Ende der Einrichtung\)$/,
    );
  });
});
