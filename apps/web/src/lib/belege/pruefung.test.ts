/**
 * PaiBot – Tests der Prüf-Logik der Belege-Seite mit echten Ketten aus der Test-Datenbank: gültig,
 * ein Feld geändert, gekürzt (mit und ohne Anker), Schlüsselwechsel ohne Beglaubigung, Regel
 * nachträglich geändert, Ergebnis ohne Entscheidung, Einzelprüfung und Stand der Zeilen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import * as pruefer from "@paibot/receipts/pruefen";
import { createAnchor } from "@paibot/receipts/pruefen";
import type { ReceiptEntry } from "@paibot/shared/belege";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  type EinzelDaten,
  PaarPruefung,
  pruefeEinzeln,
  pruefeKette,
  type RegelDaten,
  zeilenStand,
} from "./pruefung";
import { eingerichtet, ketteAus, kopie, regelnAus, wechselOhneBeglaubigung } from "./testing";

vi.setConfig({ testTimeout: 60_000 });

let kette: ReceiptEntry[];
let regeln: RegelDaten;

beforeAll(async () => {
  const { u } = await eingerichtet(3);
  kette = await ketteAus(u);
  regeln = await regelnAus(u);
});

function einzelDaten(liste: readonly ReceiptEntry[], seq: number): EinzelDaten {
  const beleg = liste.find((e) => e.seq === seq) as ReceiptEntry;
  const vorgaenger = liste.find((e) => e.seq === seq - 1);
  const nachfolger = liste.find((e) => e.seq === seq + 1);
  return {
    beleg,
    ...(vorgaenger ? { vorgaenger } : {}),
    ...(nachfolger ? { nachfolger } : {}),
    schluesselBelege: liste.filter((e) => e.body.type === "start" || e.body.type === "key_change"),
    regeln,
  };
}

describe("Ganze Kette prüfen", () => {
  it("echte Kette: vertrauenswürdig, alles in Worten, ohne Anker der ehrliche Hinweis", async () => {
    expect(kette.length).toBeGreaterThan(8);
    const e = await pruefeKette(kette, { regeln }, pruefer);
    expect(e.stufe).toBe("gueltig");
    expect(e.titel).toContain("Vertrauenswürdig");
    expect(e.geprueft).toBe(kette.length);
    expect(e.kopfSeq).toBe(kette.length);
    expect(e.fehlerSeq).toBeUndefined();
    expect(e.punkte.every((p) => p.art !== "fehler")).toBe(true);
    const texte = e.punkte.map((p) => p.text).join("\n");
    expect(texte).toContain("damaligen Regelstand");
    expect(texte).toContain("vollständig ausgetauschter Datenbestand");
    expect(texte).toContain("Im Browser geprüft");
    expect(texte).not.toMatch(/kryptografisch|fälschungssicher/i);
  });

  it("ein Feld geändert: ungültig genau an dieser Stelle, Grund „Inhalt geändert“", async () => {
    const geaendert = kopie(kette);
    const ziel = geaendert[4] as ReceiptEntry;
    (ziel.body as unknown as { time: string }).time = "2026-01-01T00:00:00.000Z";
    const e = await pruefeKette(geaendert, { regeln }, pruefer);
    expect(e.stufe).toBe("ungueltig");
    expect(e.fehlerSeq).toBe(ziel.seq);
    expect(e.titel).toBe(
      `Ungültig an Stelle B-${String(ziel.seq).padStart(4, "0")}: Inhalt geändert`,
    );
    expect(zeilenStand(ziel.seq, e).text).toBe("Fehler hier");
    expect(zeilenStand(ziel.seq + 1, e).text).toBe("nicht bestätigt");
    expect(zeilenStand(ziel.seq - 1, e).text).toBe("geprüft");
  });

  it("Ende abgeschnitten: ohne Anker nicht erkennbar, mit Anker „kürzer als dein Anker“", async () => {
    const anker = createAnchor(kette[0] as ReceiptEntry, kette[kette.length - 1] as ReceiptEntry);
    const gekuerzt = kette.slice(0, -2);
    const ohne = await pruefeKette(gekuerzt, { regeln }, pruefer);
    expect(ohne.stufe).toBe("gueltig");
    expect(ohne.anker).toBe("fehlt");
    const mit = await pruefeKette(gekuerzt, { regeln, anker }, pruefer);
    expect(mit.stufe).toBe("ungueltig");
    expect(mit.anker).toBe("geprueft");
    expect(mit.titel).toContain("kürzer als der Anker");
    expect(mit.punkte.find((p) => p.text.includes("aufbewahrten Anker"))?.art).toBe("fehler");
  });

  it("Kopf an der Stelle des Ankers abweichend und anderer Anfang werden genannt", async () => {
    const anker = createAnchor(kette[0] as ReceiptEntry, kette[5] as ReceiptEntry);
    const anders = await pruefeKette(
      kette,
      { regeln, anker: { ...anker, hash: `sha256:${"1".repeat(64)}` } },
      pruefer,
    );
    expect(anders.stufe).toBe("ungueltig");
    expect(anders.punkte.map((p) => p.text).join("\n")).toContain("umgeschrieben");
    const anfang = await pruefeKette(
      kette,
      { regeln, anker: { ...anker, startPublicKey: "A".repeat(43) } },
      pruefer,
    );
    expect(anfang.punkte.map((p) => p.text).join("\n")).toContain("anderen Schlüssel");
    const passt = await pruefeKette(kette, { regeln, anker }, pruefer);
    expect(passt.stufe).toBe("gueltig");
  });

  it("Schlüsselwechsel ohne Beglaubigung: eigene Warnstufe ab genau diesem Beleg", async () => {
    const { u } = await eingerichtet(1);
    const seq = await wechselOhneBeglaubigung(u);
    const liste = await ketteAus(u);
    const e = await pruefeKette(liste, { regeln: await regelnAus(u) }, pruefer);
    expect(e.stufe).toBe("gebrochen");
    expect(e.nichtBeglaubigtAb).toBe(seq);
    expect(e.titel).toContain(`Vertrauen gebrochen ab Beleg B-${String(seq).padStart(4, "0")}`);
    expect(zeilenStand(seq, e).text).toBe("nicht beglaubigt");
    expect(zeilenStand(seq - 1, e).text).toBe("geprüft");
  });

  it("Regel nachträglich geändert: das Nachrechnen schlägt mit genau diesem Grund an", async () => {
    const geaendert: RegelDaten = kopie(regeln);
    for (const r of [...geaendert.fassungen, ...geaendert.aktive]) {
      if (r.id === "R-001") (r as { reason: string }).reason = "Alles erlaubt.";
    }
    const e = await pruefeKette(kette, { regeln: geaendert }, pruefer);
    expect(e.stufe).toBe("ungueltig");
    expect(e.titel).toContain("Regel nachträglich geändert");
    expect(e.punkte.find((p) => p.text.includes("Regelstand nachgerechnet"))?.art).toBe("fehler");
  });

  it("Ergebnis ohne Entscheidung, „fertig“ ohne Erlaubnis und doppelte Aktion fallen auf", () => {
    const p = new PaarPruefung();
    const beleg = (seq: number, body: object) => ({ seq, body }) as unknown as ReceiptEntry;
    p.aufnehmen(beleg(2, { type: "result", action: { actionId: "a1" }, result: { status: "ok" } }));
    p.aufnehmen(
      beleg(3, { type: "decision", action: { actionId: "a2" }, decision: { outcome: "deny" } }),
    );
    p.aufnehmen(beleg(4, { type: "result", action: { actionId: "a2" }, result: { status: "ok" } }));
    p.aufnehmen(
      beleg(5, { type: "decision", action: { actionId: "a3" }, decision: { outcome: "allow" } }),
    );
    p.aufnehmen(beleg(6, { type: "result", action: { actionId: "a3" }, result: { status: "ok" } }));
    p.aufnehmen(beleg(7, { type: "result", action: { actionId: "a3" }, result: { status: "ok" } }));
    expect(p.befunde).toEqual([
      { problem: "ergebnis_ohne_entscheidung", seq: 2 },
      { problem: "ok_ohne_erlaubnis", seq: 4 },
      { problem: "doppelte_aktion", seq: 7 },
    ]);
  });

  it("vor einer Prüfung: jede Zeile „noch nicht geprüft“", () => {
    expect(zeilenStand(1, undefined)).toEqual({
      text: "noch nicht geprüft",
      art: "neutral",
      geprueft: false,
    });
  });
});

describe("Einzelnen Beleg prüfen", () => {
  it("gültiger Beleg: Prüfsumme, Signatur, Schlüssel aus der Kette, Nachbarn, Nachrechnen", async () => {
    const entscheidung = kette.find((e) => e.body.type === "decision" && e.seq > 3) as ReceiptEntry;
    const e = await pruefeEinzeln(einzelDaten(kette, entscheidung.seq), pruefer);
    expect(e.stufe).toBe("gueltig");
    expect(e.titel).toBe("Beleg stimmt");
    expect(e.punkte.filter((p) => p.art === "fehler")).toEqual([]);
    const texte = e.punkte.map((p) => p.text);
    expect(texte).toContain("Inhalt unverändert");
    expect(texte.some((x) => x.startsWith("Signatur gültig (Schlüssel "))).toBe(true);
    expect(texte.some((x) => x.startsWith("Entscheidung folgt aus Regel R-0"))).toBe(true);
  });

  it("der Start-Beleg und der neueste Beleg lassen sich prüfen", async () => {
    expect((await pruefeEinzeln(einzelDaten(kette, 1), pruefer)).stufe).toBe("gueltig");
    const letzter = await pruefeEinzeln(einzelDaten(kette, kette.length), pruefer);
    expect(letzter.stufe).toBe("gueltig");
    expect(letzter.punkte.map((p) => p.text)).toContain("Neuester Beleg der Kette");
  });

  it("veränderter Inhalt und ein Nachfolger, der nicht passt, werden genannt", async () => {
    const geaendert = kopie(kette);
    (geaendert[3]?.body as unknown as { time: string }).time = "2026-01-01T00:00:00.000Z";
    const e = await pruefeEinzeln(einzelDaten(geaendert, 4), pruefer);
    expect(e.stufe).toBe("ungueltig");
    expect(e.titel).toBe("Beleg stimmt nicht: Inhalt geändert");
    const anders = kopie(kette);
    (anders[4]?.body as unknown as { prev: string }).prev = `sha256:${"2".repeat(64)}`;
    const n = await pruefeEinzeln(einzelDaten(anders, 4), pruefer);
    expect(n.stufe).toBe("ungueltig");
    expect(n.punkte.map((p) => p.text)).toContain(
      "Der nächste Beleg verweist nicht auf diesen Beleg",
    );
  });

  it("fremder Schlüssel im Start-Beleg: Signatur passt nicht zum Schlüssel aus der Kette", async () => {
    const geaendert = kopie(kette);
    const start = geaendert[0]?.body as unknown as { facts: { publicKey: string } };
    start.facts.publicKey = "A".repeat(43);
    const e = await pruefeEinzeln(einzelDaten(geaendert, 5), pruefer);
    expect(e.stufe).toBe("ungueltig");
  });
});
