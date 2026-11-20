/**
 * PaiBot – Tests für die Schnittstelle des Beleg-Protokolls.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { readFileSync } from "node:fs";
import { isNotImplemented } from "@paibot/stub";
import { describe, expect, it } from "vitest";
import * as receipts from "./index";

describe("Schnittstelle", () => {
  it("exportiert Bauen, Prüfen, Export und Schreiber", async () => {
    const api: Record<string, unknown> = await import("./index");
    for (const name of [
      "buildReceipt",
      "canonicalize",
      "hashReceipt",
      "digestBytes",
      "signReceipt",
      "checkContext",
      "createReceiptWriter",
      "verifyReceipt",
      "verifyChain",
      "reevaluate",
      "keyChangeSigner",
      "exportJsonl",
      "parseJsonl",
      "runCli",
    ]) {
      expect(typeof api[name]).toBe("function");
    }
  });

  it("der Unterpfad für den Browser enthält den Prüfer, aber keinen Schreiber", async () => {
    const browser: Record<string, unknown> = await import("./verify");
    expect(typeof browser.verifyChain).toBe("function");
    expect(typeof browser.canonicalize).toBe("function");
    expect(browser.createReceiptWriter).toBeUndefined();
    expect(browser.signReceipt).toBeUndefined();
  });

  it("die Dateien des Prüfers nutzen weder Node noch Datenbank noch das Krypto-Paket", () => {
    for (const file of ["verify.ts", "build.ts", "canonical.ts", "hash.ts", "jsonl.ts"]) {
      const text = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      expect(text).not.toMatch(/from "node:|@paibot\/db|@paibot\/crypto/);
    }
  });

  it("feste Werte stehen fest", () => {
    expect(receipts.RECEIPT_HASH_PREFIX).toBe("pb-beleg/v1\n");
    expect(new TextEncoder().encode(receipts.RECEIPT_HASH_PREFIX).length).toBe(12);
    expect(receipts.RECEIPT_LOCK_ID).toBe(2026112001);
    expect(receipts.CHECK_NAMES).toEqual([
      "inhalt",
      "signatur",
      "kette",
      "entscheidung",
      "kontext",
    ]);
  });

  it("noch nicht umgesetzte Funktionen melden das", () => {
    let caught: unknown;
    try {
      receipts.canonicalize({ a: 1 });
    } catch (error) {
      caught = error;
    }
    expect(isNotImplemented(caught)).toBe(true);
  });
});
