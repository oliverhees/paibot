/**
 * PaiBot – Tests der Belege-Seite: Filter nach Aktion und Unterhaltung (Auswahl, Adresse, Liste
 * vom Server) und Anzeige des öffentlichen Schlüssels mit Kurzform, ohne privaten Teil.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { repo } from "@paibot/db";
import type { ReceiptEntry } from "@paibot/shared/belege";
import { receiptListQuery } from "@paibot/shared/eingaben";
import { newId } from "@paibot/shared/ids";
import { describe, expect, it, vi } from "vitest";
import { unterhaltungAnlegen } from "../chat/aktionen";
import { anfrage } from "../zugang/testing";
import { aktionsWahl, filterAusAdresse, unterhaltungsWahl } from "./filter";
import type { KettenStueck } from "./lesen";
import { belegeListePfad, belegeSeitenPfad } from "./pfade";
import type { EinzelErgebnis } from "./pruefung";
import { schluesselAnzeige } from "./schluessel";
import { belegRouten, eingerichtet } from "./testing";

vi.setConfig({ testTimeout: 60_000 });

/** Kurzform wie beim Prüfen: erste 8 Byte von SHA-256 über die Rohbyte des Schlüssels. */
function kurzformVon(publicKey: string): string {
  const roh = Buffer.from(publicKey, "base64url");
  const hex = createHash("sha256").update(roh).digest().subarray(0, 8).toString("hex");
  return hex.replace(/(.{4})(?=.)/g, "$1-");
}

function aktionVon(e: ReceiptEntry): string | undefined {
  const body = e.body as { action?: { type?: string } };
  return body.action?.type;
}

describe("Filter nach Aktion", () => {
  it("bietet die Aktionen dieser Version in Worten an, alle für den Server gültig", () => {
    const wahl = aktionsWahl();
    expect(wahl).toContainEqual({ wert: "nachricht.senden", text: "Nachricht gesendet" });
    expect(wahl).toContainEqual({ wert: "zugang.anmelden", text: "Angemeldet" });
    expect(wahl.some((w) => w.wert.startsWith("werkzeug."))).toBe(false);
    for (const w of wahl) {
      expect(receiptListQuery.safeParse({ action: w.wert }).success, w.wert).toBe(true);
      expect(w.text).not.toBe(w.wert);
    }
  });

  it("die Liste vom Server enthält nur Belege der gewählten Aktion, auch beim Blättern", async () => {
    const { u, dose } = await eingerichtet(3);
    const r = belegRouten(u);
    const alle = await anfrage(u, r.belege, "GET", belegeListePfad({ limit: 200 }), { dose });
    const typen = new Set((alle.body.daten as { items: ReceiptEntry[] }).items.map(aktionVon));
    expect(typen.size).toBeGreaterThan(2);

    const erste = await anfrage(
      u,
      r.belege,
      "GET",
      belegeListePfad({ action: "zugang.anmelden", limit: 2 }),
      { dose },
    );
    const seite = erste.body.daten as { items: ReceiptEntry[]; nextBefore?: number };
    expect(seite.items).toHaveLength(2);
    expect(seite.nextBefore).toBeDefined();
    const weiter = await anfrage(
      u,
      r.belege,
      "GET",
      belegeListePfad({ action: "zugang.anmelden", before: seite.nextBefore, limit: 50 }),
      { dose },
    );
    const alleAnmelden = [
      ...seite.items,
      ...(weiter.body.daten as { items: ReceiptEntry[] }).items,
    ];
    // Drei Anmeldungen: je Entscheidung und Ergebnis.
    expect(alleAnmelden).toHaveLength(6);
    expect(new Set(alleAnmelden.map(aktionVon))).toEqual(new Set(["zugang.anmelden"]));
  });
});

describe("Filter nach Unterhaltung", () => {
  it("bietet die Unterhaltungen mit Titel an; die Liste zeigt nur deren Belege", async () => {
    const { u, dose } = await eingerichtet(1);
    const anlegen = u.handler("unterhaltungAnlegen", unterhaltungAnlegen);
    const ids: string[] = [];
    for (const titel of ["Wochenplan", "Einkauf"]) {
      const a = await anfrage(u, anlegen, "POST", "/api/unterhaltungen", {
        dose,
        koerper: { title: titel },
      });
      ids.push((a.body.daten as { unterhaltung: { id: string } }).unterhaltung.id);
    }
    const wahl = await unterhaltungsWahl(u.db);
    expect(wahl).toEqual(
      expect.arrayContaining([
        { wert: ids[0], text: "Wochenplan" },
        { wert: ids[1], text: "Einkauf" },
      ]),
    );
    const r = belegRouten(u);
    const liste = await anfrage(
      u,
      r.belege,
      "GET",
      belegeListePfad({ conversationId: ids[1], limit: 50 }),
      { dose },
    );
    const items = (liste.body.daten as { items: ReceiptEntry[] }).items;
    expect(items.length).toBeGreaterThan(0);
    for (const e of items) {
      const ziel = (e.body as { action?: { target?: { conversationId?: string } } }).action?.target;
      expect(ziel?.conversationId).toBe(ids[1]);
    }
  });
});

describe("Filter in der Adresse", () => {
  it("übernimmt gültige Werte und lässt ungültige weg", () => {
    const unterhaltung = newId("conversation");
    expect(filterAusAdresse({ aktion: "nachricht.senden", unterhaltung })).toEqual({
      aktion: "nachricht.senden",
      unterhaltung,
    });
    expect(filterAusAdresse({})).toEqual({});
    expect(filterAusAdresse({ aktion: "gibt.es.nicht", unterhaltung: "kaputt" })).toEqual({});
    expect(filterAusAdresse({ aktion: ["nachricht.senden", "zugang.anmelden"] })).toEqual({});
    expect(filterAusAdresse({ unterhaltung: newId("run") })).toEqual({});
  });

  it("Adresse der Seite zum Filter", () => {
    expect(belegeSeitenPfad({})).toBe("/belege");
    expect(belegeSeitenPfad({ aktion: "zugang.anmelden" })).toBe("/belege?aktion=zugang.anmelden");
    expect(belegeSeitenPfad({ aktion: "nachricht.senden", unterhaltung: "unt_1" })).toBe(
      "/belege?aktion=nachricht.senden&unterhaltung=unt_1",
    );
  });
});

describe("Schlüssel dieser Installation", () => {
  it("zeigt den aktiven Schlüssel mit Kurzform und Datum, nie den privaten Teil", async () => {
    const { u } = await eingerichtet(0);
    const anzeige = await schluesselAnzeige(u.db, "Europe/Berlin");
    const aktiv = anzeige.aktiv;
    if (aktiv === undefined) throw new Error("kein Schlüssel");
    const gespeichert = await repo.installationKeys.getActive(u.db);
    expect(aktiv.keyId).toBe(gespeichert?.id);
    expect(aktiv.publicKey).toBe(gespeichert?.publicKey);
    expect(aktiv.kurzform).toMatch(/^[0-9a-f]{4}(-[0-9a-f]{4}){3}$/);
    // Dieselbe Kurzform rechnet der Prüfer aus dem öffentlichen Schlüssel.
    expect(aktiv.kurzform).toBe(kurzformVon(aktiv.publicKey));
    expect(aktiv.seit).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
    expect(anzeige.frueher).toEqual([]);
    const text = JSON.stringify(anzeige);
    expect(text).not.toContain("privateKey");
    expect(text).not.toContain(gespeichert?.privateKeyEnc ?? "-");
    expect(Object.keys(aktiv).sort()).toEqual(["keyId", "kurzform", "publicKey", "seit"]);
  });

  it("dieselbe Kurzform nennt „Beleg prüfen“ und der Kopf der Kette (wie im Export)", async () => {
    const { u, dose } = await eingerichtet(1);
    const kurzform = (await schluesselAnzeige(u.db, "UTC")).aktiv?.kurzform;
    const r = belegRouten(u);
    const [beleg] = await repo.belege.listFrom(u.db, { fromSeq: 3, limit: 1 });
    const pruefung = await anfrage(u, r.pruefung, "GET", `/api/belege/${beleg?.id}/pruefung`, {
      dose,
      params: { id: String(beleg?.id) },
    });
    const punkte = (pruefung.body.daten as EinzelErgebnis).punkte.map((p) => p.text);
    expect(punkte).toContain(`Signatur gültig (Schlüssel ${kurzform})`);
    const kette = await anfrage(u, r.kette, "GET", "/api/belege/kette?ab=1", { dose });
    const kopf = (kette.body.daten as KettenStueck).kopf;
    expect(kopf?.publicKeys.map((k) => k.fingerprint)).toEqual([kurzform]);
  });

  it("nach einem Wechsel: neuer Schlüssel aktiv, der alte unter „früher“ mit Zeitraum", async () => {
    const { u } = await eingerichtet(0);
    const alt = await repo.installationKeys.getActive(u.db);
    if (alt === undefined) throw new Error("kein Schlüssel");
    const neuerSchluessel = Buffer.alloc(32, 7).toString("base64url");
    await repo.installationKeys.rotate(u.db, {
      publicKey: neuerSchluessel,
      privateKeyEnc: alt.privateKeyEnc,
      fingerprint: kurzformVon(neuerSchluessel),
    });
    const anzeige = await schluesselAnzeige(u.db, "UTC");
    expect(anzeige.aktiv?.publicKey).toBe(neuerSchluessel);
    expect(anzeige.aktiv?.kurzform).toBe(kurzformVon(neuerSchluessel));
    expect(anzeige.frueher.map((k) => k.keyId)).toEqual([alt.id]);
    expect(anzeige.frueher[0]?.kurzform).toBe(alt.fingerprint);
    expect(anzeige.frueher[0]?.bis).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
    expect(JSON.stringify(anzeige)).not.toContain(alt.privateKeyEnc);
  });
});

describe("Seite „Belege“ (Quelltext)", () => {
  const seite = readFileSync(new URL("../../app/(app)/belege/page.tsx", import.meta.url), "utf8");
  const ansicht = readFileSync(
    new URL("../../app/(app)/belege/BelegeAnsicht.tsx", import.meta.url),
    "utf8",
  );

  it("lädt die erste Seite mit dem Filter aus der Adresse und gibt den Schlüssel weiter", () => {
    expect(seite).toContain("filterAusAdresse(await searchParams)");
    expect(seite).toMatch(/action: filter\.aktion/);
    expect(seite).toMatch(/conversationId: filter\.unterhaltung/);
    expect(seite).toContain("schluesselAnzeige(db, zeitzone)");
  });

  it("die Ansicht filtert Aktion und Unterhaltung über den Server und zeigt die Kurzform", () => {
    expect(ansicht).toContain('aria-label={t("belege.filter.aktion")}');
    expect(ansicht).toContain('aria-label={t("belege.filter.unterhaltung")}');
    expect(ansicht).toMatch(/action: f\.aktion/);
    expect(ansicht).toMatch(/conversationId: f\.unterhaltung/);
    expect(ansicht).toContain("props.schluessel.aktiv.kurzform");
    expect(ansicht).not.toMatch(/privateKey/);
  });
});
