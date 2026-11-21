/**
 * PaiBot – Tests der Beleg- und Regel-Routen: nur mit Sitzung, Blättern, unbekannte Kennung 404,
 * Kette in Stücken, Server-Prüfung als gekennzeichneter Rückfall, Export durch das Tor mit eigenem
 * Beleg; die Datei lässt sich mit dem Prüfer und dem Befehl `belege:pruefen` prüfen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { repo } from "@paibot/db";
import { runCli } from "@paibot/receipts";
import { parseJsonl, verifyChain } from "@paibot/receipts/pruefen";
import { encodeAnchor, type ReceiptEntry } from "@paibot/shared/belege";
import { describe, expect, it, vi } from "vitest";
import { anfrage, Keksdose } from "../zugang/testing";
import type { BelegUmfeld, KettenStueck, SchluesselDaten } from "./lesen";
import type { EinzelErgebnis, KettenErgebnis, RegelDaten } from "./pruefung";
import { belegRouten, eingerichtet, ketteAus } from "./testing";

vi.setConfig({ testTimeout: 60_000 });

const UNBEKANNT = "blg_06f8k2m9qz3w7x1c4b5n8p0r2t";

async function cli(text: string, ...argumente: string[]) {
  const aus: string[] = [];
  const code = await runCli(["export.jsonl", ...argumente], {
    readFile: async () => text,
    out: (z) => aus.push(z),
    err: (z) => aus.push(z),
  });
  return { code, aus: aus.join("\n") };
}

describe("Lese-Routen", () => {
  it("ohne Sitzung: jede Route antwortet 401", async () => {
    const { u } = await eingerichtet(0);
    const h = belegRouten(u);
    const ohne = new Keksdose();
    for (const [handler, pfad, params] of [
      [h.belege, "/api/belege", {}],
      [h.beleg, `/api/belege/${UNBEKANNT}`, { id: UNBEKANNT }],
      [h.pruefung, `/api/belege/${UNBEKANNT}/pruefung`, { id: UNBEKANNT }],
      [h.kette, "/api/belege/kette", {}],
      [h.schluessel, "/api/belege/schluessel", {}],
      [h.regeln, "/api/regeln", {}],
    ] as const) {
      const r = await anfrage(u, handler, "GET", pfad, { dose: ohne, params });
      expect(r.status, pfad).toBe(401);
      expect(r.body.fehler?.code).toBe("nicht_angemeldet");
    }
    const e = await anfrage(u, h.export, "POST", "/api/belege/export", { dose: ohne });
    expect(e.status).toBe(401);
  });

  it("Liste: neueste zuerst, Blättern über nextBefore lückenlos, ungültige Abfrage 400", async () => {
    const { u, dose } = await eingerichtet(2);
    const h = belegRouten(u);
    const alle = await ketteAus(u);
    const erste = await anfrage(u, h.belege, "GET", "/api/belege?limit=3", { dose });
    expect(erste.status).toBe(200);
    const s1 = erste.body.daten as { items: ReceiptEntry[]; nextBefore?: number };
    expect(s1.items.map((e) => e.seq)).toEqual([alle.length, alle.length - 1, alle.length - 2]);
    expect(s1.nextBefore).toBe(alle.length - 2);
    const gesehen = [...s1.items];
    let before = s1.nextBefore;
    while (before !== undefined) {
      const r = await anfrage(u, h.belege, "GET", `/api/belege?limit=3&before=${before}`, { dose });
      const s = r.body.daten as { items: ReceiptEntry[]; nextBefore?: number };
      gesehen.push(...s.items);
      before = s.nextBefore;
    }
    expect(gesehen.map((e) => e.seq)).toEqual(alle.map((e) => e.seq).reverse());
    for (const pfad of ["/api/belege?limit=0", "/api/belege?limit=abc", "/api/belege?wer=x"]) {
      expect((await anfrage(u, h.belege, "GET", pfad, { dose })).status, pfad).toBe(400);
    }
  });

  it("Beleg: mit Vorgänger, Nachfolger und zugehörigem Ergebnis; unbekannt oder kaputt 404", async () => {
    const { u, dose } = await eingerichtet(1);
    const h = belegRouten(u);
    const alle = await ketteAus(u);
    const entscheidung = alle.find((e) => e.body.type === "decision") as ReceiptEntry;
    const r = await anfrage(u, h.beleg, "GET", `/api/belege/${entscheidung.id}`, {
      dose,
      params: { id: entscheidung.id },
    });
    expect(r.status).toBe(200);
    const umfeld = r.body.daten as BelegUmfeld;
    expect(umfeld.beleg.id).toBe(entscheidung.id);
    expect(umfeld.vorgaenger?.seq).toBe(entscheidung.seq - 1);
    expect(umfeld.nachfolger?.seq).toBe(entscheidung.seq + 1);
    expect(umfeld.partner?.art).toBe("result");
    const ergebnis = alle.find((e) => e.id === umfeld.partner?.id) as ReceiptEntry;
    expect(ergebnis.body.type).toBe("result");
    const zurueck = await anfrage(u, h.beleg, "GET", `/api/belege/${ergebnis.id}`, {
      dose,
      params: { id: ergebnis.id },
    });
    expect((zurueck.body.daten as BelegUmfeld).partner?.id).toBe(entscheidung.id);
    for (const id of [UNBEKANNT, "kaputt", "unt_06f8k2m9qz3w7x1c4b5n8p0r2t"]) {
      const n = await anfrage(u, h.beleg, "GET", `/api/belege/${id}`, { dose, params: { id } });
      expect(n.status, id).toBe(404);
      expect(n.body.fehler?.code).toBe("nicht_gefunden");
    }
  });

  it("Kette in Stücken im Format des Exports; Kopf nur im ersten Stück; strenge Abfrage", async () => {
    const { u, dose } = await eingerichtet(2);
    const h = belegRouten(u);
    const alle = await ketteAus(u);
    const s1 = (await anfrage(u, h.kette, "GET", "/api/belege/kette?ab=1&anzahl=4", { dose })).body
      .daten as KettenStueck;
    expect(s1.belege.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
    expect(s1.weiter).toBe(5);
    expect(s1.gesamt).toBe(alle.length);
    expect(s1.kopf).toMatchObject({ format: "pb-belege", v: 1, anchor: { seq: alle.length } });
    expect(Object.keys(s1.belege[0] as object)).toEqual([
      "seq",
      "id",
      "hash",
      "signature",
      "keyId",
      "body",
    ]);
    const geladen = [...s1.belege];
    let ab = s1.weiter;
    while (ab !== undefined) {
      const s = (await anfrage(u, h.kette, "GET", `/api/belege/kette?ab=${ab}&anzahl=4`, { dose }))
        .body.daten as KettenStueck;
      expect(s.kopf).toBeUndefined();
      geladen.push(...s.belege);
      ab = s.weiter;
    }
    expect(geladen).toEqual(alle);
    expect((await verifyChain(geladen)).verdict.level).toBe("vertrauenswuerdig");
    for (const pfad of [
      "/api/belege/kette?ab=0",
      "/api/belege/kette?anzahl=5000",
      "/api/belege/kette?ab=1.5",
      "/api/belege/kette?pruefung=browser",
      "/api/belege/kette?x=1",
    ]) {
      expect((await anfrage(u, h.kette, "GET", pfad, { dose })).status, pfad).toBe(400);
    }
  });

  it("Schlüssel-Belege und Regeln: Start-Beleg, Schlüssel, Regelstand mit Fassungen", async () => {
    const { u, dose } = await eingerichtet(0);
    const h = belegRouten(u);
    const s = (await anfrage(u, h.schluessel, "GET", "/api/belege/schluessel", { dose })).body
      .daten as SchluesselDaten;
    expect(s.belege.map((e) => e.body.type)).toEqual(["start"]);
    expect(s.schluessel).toHaveLength(1);
    expect(JSON.stringify(s)).not.toContain("privateKey");
    const r = (await anfrage(u, h.regeln, "GET", "/api/regeln", { dose })).body.daten as RegelDaten;
    expect(r.stand).toBeGreaterThan(0);
    expect(r.aktive.map((x) => x.id)).toContain("R-001");
    expect(r.fassungen.every((x) => typeof x.seq === "number")).toBe(true);
  });

  it("Prüfung auf dem Server: gleiches Ergebnis, gekennzeichnet als vom Server", async () => {
    const { u, dose } = await eingerichtet(1);
    const h = belegRouten(u);
    const [beleg] = await repo.belege.listFrom(u.db, { fromSeq: 3, limit: 1 });
    const r = await anfrage(u, h.pruefung, "GET", `/api/belege/${beleg?.id}/pruefung`, {
      dose,
      params: { id: String(beleg?.id) },
    });
    const e = r.body.daten as EinzelErgebnis;
    expect(e).toMatchObject({ stufe: "gueltig", quelle: "server" });
    expect(e.punkte.map((p) => p.text)).toContain("vom Server geprüft");
    const k = await anfrage(u, h.kette, "GET", "/api/belege/kette?pruefung=server", { dose });
    const ergebnis = (k.body.daten as { ergebnis: KettenErgebnis }).ergebnis;
    expect(ergebnis).toMatchObject({ stufe: "gueltig", quelle: "server" });
    expect(
      (
        await anfrage(u, h.pruefung, "GET", `/api/belege/${UNBEKANNT}/pruefung`, {
          dose,
          params: { id: UNBEKANNT },
        })
      ).status,
    ).toBe(404);
  });
});

describe("Export", () => {
  it("ohne Prüfzeichen oder mit fremder Herkunft abgewiesen, ohne Beleg", async () => {
    const { u, dose } = await eingerichtet(0);
    const h = belegRouten(u);
    const vorher = (await ketteAus(u)).length;
    const ohne = await anfrage(u, h.export, "POST", "/api/belege/export", {
      dose,
      pruefzeichen: null,
    });
    expect(ohne.status).toBe(403);
    const fremd = await anfrage(u, h.export, "POST", "/api/belege/export", {
      dose,
      origin: "https://fremd.example",
    });
    expect(fremd.status).toBe(403);
    expect((await ketteAus(u)).length).toBe(vorher);
  });

  it("läuft durch das Tor: Entscheidung und Ergebnis als Belege; Datei für Prüfer und Befehl", async () => {
    const { u, dose } = await eingerichtet(1);
    const h = belegRouten(u);
    const vorher = await ketteAus(u);
    const r = await anfrage(u, h.export, "POST", "/api/belege/export", { dose });
    expect(r.status).toBe(200);
    const daten = r.body.daten as {
      dateiname: string;
      inhalt: string;
      eintraege: number;
      belege: { entscheidung: { id: string; seq: number }; ergebnis: { id: string; seq: number } };
    };
    expect(daten.dateiname).toMatch(/^paibot-belege-\d{4}-\d{2}-\d{2}\.jsonl$/);
    const nachher = await ketteAus(u);
    expect(nachher.length).toBe(vorher.length + 2);
    const [entscheidung, ergebnis] = nachher.slice(-2) as [ReceiptEntry, ReceiptEntry];
    expect(entscheidung.body).toMatchObject({
      type: "decision",
      action: { type: "belege.exportieren", actor: "besitzer" },
      decision: { outcome: "allow" },
      facts: { entries: vorher.length, credential: "sitzung" },
    });
    expect(ergebnis.body).toMatchObject({ type: "result", result: { status: "ok" } });
    expect(daten.belege.entscheidung).toEqual({ id: entscheidung.id, seq: entscheidung.seq });
    expect(daten.belege.ergebnis).toEqual({ id: ergebnis.id, seq: ergebnis.seq });

    // Die Datei enthält alles bis einschließlich der eigenen Entscheidung, Anker im Kopf.
    const gelesen = parseJsonl(daten.inhalt);
    expect(daten.eintraege).toBe(vorher.length + 1);
    expect(gelesen.entries.map((e) => e.seq)).toEqual(nachher.slice(0, -1).map((e) => e.seq));
    expect(gelesen.header.anchor?.seq).toBe(entscheidung.seq);
    expect((await verifyChain(gelesen.entries, { anchor: gelesen.header.anchor })).ok).toBe(true);

    const ohneAnker = await cli(daten.inhalt);
    expect(ohneAnker.code).toBe(0);
    expect(ohneAnker.aus).toContain("gültig");
    const anker = encodeAnchor(gelesen.header.anchor as never);
    expect((await cli(daten.inhalt, "--anker", anker)).code).toBe(0);

    // Gekürzte Datei mit späterem Anker: der Befehl schlägt an.
    const zeilen = daten.inhalt.trimEnd().split("\n");
    const gekuerzt = `${zeilen.slice(0, -2).join("\n")}\n`;
    const k = await cli(gekuerzt, "--anker", anker);
    expect(k.code).toBe(1);
    expect(k.aus).toContain("kürzer als der Anker");
  });
});
