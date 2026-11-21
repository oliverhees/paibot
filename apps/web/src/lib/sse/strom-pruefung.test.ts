/**
 * PaiBot – Test des Stroms: eine Sitzungsprüfung, die beim Herzschlag wirft, schließt den Strom.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { createTestDb } from "@paibot/db/testing";
import { describe, expect, it } from "vitest";
import { oeffneStrom, type StromEnde } from "./strom";
import { beispielUnterhaltung, sseLeser, stilleQuelle, warten, zaehlUhr } from "./testhilfe";
import { createVerteiler } from "./verteiler";

describe("Strom und Sitzungsprüfung", () => {
  it("eine Ausnahme der Prüfung beim Herzschlag beendet den Strom (Grund „sitzung“)", async () => {
    const { db } = await createTestDb();
    const cid = await beispielUnterhaltung(db);
    const verteiler = createVerteiler(stilleQuelle().quelle);
    const uhr = zaehlUhr();
    const enden: StromEnde[] = [];
    let aufrufe = 0;
    const strom = await oeffneStrom({
      db,
      verteiler,
      conversationId: cid,
      nachSeq: 0,
      herzschlagMs: 20,
      uhr,
      pruefen: async () => {
        aufrufe += 1;
        throw new Error("Datenbank weg");
      },
      beiEnde: (grund) => enden.push(grund),
    });
    const leser = sseLeser(strom);
    await leser.bisEnde();
    expect(aufrufe).toBeGreaterThanOrEqual(1);
    expect(enden).toEqual(["sitzung"]);
    await warten(() => verteiler.anzahl === 0 && uhr.offen === 0);
  });
});
